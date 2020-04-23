"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const types_1 = require("../types");
const span_1 = require("./span");
const index_1 = require("./index");
const types_2 = require("../types");
const Constants = require("../constants");
const Errors = require("../errors");
class ScoutRequest {
    constructor(opts) {
        this.started = false;
        this.finished = false;
        this.sent = false;
        this.childSpans = [];
        this.tags = {};
        this.ignored = false;
        this.logFn = () => undefined;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_REQUEST_PREFIX}${uuid_1.v4()}`;
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
            // It's possible that the scout request has already been started
            // ex. when startRequest is used by a Scout instance
            if (opts.started) {
                this.started = opts.started;
            }
            if (typeof opts.ignored === "boolean") {
                this.ignored = opts.ignored;
            }
            if (opts.onStop) {
                this.onStop = opts.onStop;
            }
        }
        if (this.ignored) {
            this.addContext(types_2.ScoutContextName.IgnoreTransaction, true);
        }
    }
    span(operation) {
        return this.startChildSpan(operation);
    }
    getTimestamp() {
        return new Date(this.timestamp);
    }
    // Get the amount of time this span has been running in milliseconds
    getDurationMs() {
        return new Date().getTime() - this.getTimestamp().getTime();
    }
    isIgnored() {
        return this.ignored;
    }
    // Set a request as ignored
    ignore() {
        this.addContextSync(types_2.ScoutContextName.IgnoreTransaction, true);
        this.ignored = true;
        return this;
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
        if (this.finished) {
            this.logFn(`[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`, types_1.LogLevel.Error);
            throw new Errors.FinishedRequest("Cannot add a child span to a finished request");
        }
        // Create a new child span
        const span = new span_1.default({
            operation,
            request: this,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
        });
        // Add the child span to the list
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
    finish() {
        return this.stop();
    }
    finishAndSend() {
        return this.finish()
            .then(() => this.send());
    }
    isStopped() {
        return this.finished;
    }
    getEndTime() {
        return new Date(this.endTime);
    }
    setOnStop(fn) {
        this.onStop = fn;
    }
    stop() {
        if (this.finished) {
            return Promise.resolve(this);
        }
        // Stop all child spans
        return Promise.all(this.childSpans.map(s => s.stop())).then(() => {
            this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
            this.finished = true;
        })
            // Call the stop function if there is one
            .then(() => {
            if (this.onStop) {
                return this.onStop();
            }
        })
            .then(() => this);
    }
    stopSync() {
        if (this.finished) {
            return this;
        }
        // Stop all child spans
        this.childSpans.forEach(s => s.stopSync());
        // Finish the request
        this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
        this.finished = true;
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
     * Send this request and internal spans to the scoutInstance
     *
     * @returns this request
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
        // If request is ignored don't send it
        if (this.ignored) {
            this.logFn(`[scout/request/${this.id}] skipping ignored request send`, types_1.LogLevel.Warn);
            inst.emit(types_2.ScoutEvent.IgnoredRequestProcessingSkipped, this);
            return Promise.resolve(this);
        }
        this.sending = index_1.sendStartRequest(inst, this)
            // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
            // Send tags
            .then(() => Promise.all(Object.entries(this.tags)
            .map(([name, value]) => index_1.sendTagRequest(inst, this, name, value))))
            // End the span
            .then(() => index_1.sendStopRequest(inst, this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
            this.logFn(`[scout/request/${this.id}]Failed to send request`);
            return this;
        });
        return this.sending;
    }
}
exports.default = ScoutRequest;
