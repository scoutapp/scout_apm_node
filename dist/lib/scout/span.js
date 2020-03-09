"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const stacktrace_js_1 = require("stacktrace-js");
const types_1 = require("../types");
const index_1 = require("./index");
const enum_1 = require("../types/enum");
const Constants = require("../constants");
const Errors = require("../errors");
class ScoutSpan {
    constructor(opts) {
        this.started = false;
        this.stopped = false;
        this.sent = false;
        this.childSpans = [];
        this.tags = {};
        this.logFn = () => undefined;
        this.request = opts.request;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_SPAN_PREFIX}${uuid_1.v4()}`;
        this.operation = opts.operation;
        if (opts) {
            if (opts.logFn) {
                this.logFn = opts.logFn;
            }
            if (opts.scoutInstance) {
                this.scoutInstance = opts.scoutInstance;
            }
            if (opts.timestamp) {
                this.timestamp = opts.timestamp;
            }
            // It's possible that the scout span has already been started
            // ex. when startSpan is used by a Scout instance
            if (opts.started) {
                this.started = opts.started;
            }
            if (opts.parent) {
                this.parent = opts.parent;
            }
        }
    }
    // Get the start of this span
    getTimestamp() {
        return new Date(this.timestamp);
    }
    // Get the amount of time this span has been running in milliseconds
    getDurationMs() {
        return new Date().getTime() - this.getTimestamp().getTime();
    }
    /** @see Taggable */
    addContext(name, value) {
        return new Promise((resolve) => resolve(this.addContextSync(name, value)));
    }
    /** @see Taggable */
    addContextSync(name, value) {
        this.tags[name] = value;
        return this;
    }
    /** @see Taggable */
    addContexts(tags) {
        return new Promise((resolve) => resolve(this.addContextsSync(tags)));
    }
    /** @see Taggable */
    addContextsSync(tags) {
        tags.forEach(t => this.addContextSync(t.name, t.value));
        return this;
    }
    /** @see Taggable */
    getContextValue(name) {
        return this.tags[name];
    }
    getTags() {
        return Object.entries(this.tags)
            .map(([name, value]) => {
            return { name, value };
        });
    }
    /** @see ChildSpannable */
    startChildSpan(operation) {
        return new Promise((resolve, reject) => {
            try {
                resolve(this.startChildSpanSync(operation));
            }
            catch (err) {
                reject(err);
            }
        });
    }
    /** @see ChildSpannable */
    startChildSpanSync(operation) {
        if (this.stopped) {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`, types_1.LogLevel.Error);
            throw new Errors.FinishedRequest("Cannot add a child span to a finished span");
        }
        const span = new ScoutSpan({
            operation,
            request: this.request,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
            parent: this,
        });
        this.childSpans.push(span);
        return span.startSync();
    }
    /** @see ChildSpannable */
    getChildSpans() {
        return new Promise((resolve) => resolve(this.getChildSpansSync()));
    }
    /** @see ChildSpannable */
    getChildSpansSync() {
        return this.childSpans.slice();
    }
    finish() {
        return this.stop();
    }
    finishAndSend() {
        return this.finish()
            .then(() => this.send());
    }
    isStopped() {
        return this.stopped;
    }
    getEndTime() {
        return new Date(this.endTime);
    }
    stop() {
        if (this.stopped) {
            return Promise.resolve(this);
        }
        // Stop all child spans
        return Promise.all(this.childSpans.map(s => s.stop()))
            .then(() => {
            if (!this.scoutInstance) {
                return this;
            }
            // Update the endtime of the span
            this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
            this.stopped = true;
            // If the span request is still under the threshold then don't save the traceback
            if (this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
                return Promise.resolve(this);
            }
            // Add stack trace to the span
            return stacktrace_js_1.get()
                .then(this.processStackFrames)
                .then(scoutFrames => this.addContext(enum_1.ScoutContextName.Traceback, scoutFrames))
                .then(() => this);
        });
    }
    stopSync() {
        if (this.stopped) {
            return this;
        }
        // Update the endtime of the span
        this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
        this.stopped = true;
        // Stop all the child spans
        this.childSpans.map(s => s.stopSync());
        // If the span request is still under the threshold then don't save the traceback
        if (this.scoutInstance && this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
            return this;
        }
        // Process the frames and add the context
        const scoutFrames = this.processStackFrames(stacktrace_js_1.getSync());
        this.addContextSync(enum_1.ScoutContextName.Traceback, scoutFrames);
        return this;
    }
    isStarted() {
        return this.started;
    }
    start() {
        return new Promise((resolve) => resolve(this.startSync()));
    }
    startSync() {
        if (this.started) {
            return this;
        }
        this.timestamp = new Date();
        this.started = true;
        return this;
    }
    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    send(scoutInstance) {
        if (this.sending) {
            return this.sending;
        }
        if (this.sent) {
            return Promise.resolve(this);
        }
        const inst = scoutInstance || this.scoutInstance;
        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }
        // Start Span
        this.sending = index_1.sendStartSpan(inst, this)
            // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
            // Send tags
            .then(() => Promise.all(Object.entries(this.tags)
            .map(([name, value]) => index_1.sendTagSpan(inst, this, name, value))))
            // End the span
            .then(() => index_1.sendStopSpan(inst, this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
            return this;
        });
        return this.sending;
    }
    /**
     * Convert StackTraces as generated by stacktrace-js into Scout's expected format
     *
     * @param {StackFrame[]} frames - stack frames from stacktrace-js
     * @returns {ScoutStackTrace[]} the scout format for stack frames
     */
    processStackFrames(frames) {
        if (!frames || !(frames instanceof Array) || frames.length === 0) {
            return [];
        }
        return frames
            // Filter out scout_apm_node related traces
            .filter(f => !f.fileName || !f.fileName.includes("scout_apm_node"))
            // Simplify the traces
            .map(f => ({
            line: f.lineNumber,
            file: f.fileName,
            function: f.functionName || "<anonymous>",
        }));
    }
}
exports.default = ScoutSpan;
