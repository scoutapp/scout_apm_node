"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const types_1 = require("../types");
const index_1 = require("./index");
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
        }
    }
    getTimestamp() {
        return new Date(this.timestamp);
    }
    /** @see Taggable */
    addContext(tags) {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }
    /** @see ChildSpannable */
    startChildSpan(operation) {
        if (this.stopped) {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`, types_1.LogLevel.Error);
            return Promise.reject(new Errors.FinishedRequest("Cannot add a child span to a finished span"));
        }
        const span = new ScoutSpan({
            operation,
            request: this.request,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
            parent: this,
        });
        this.childSpans.push(span);
        return span.start();
    }
    /** @see ChildSpannable */
    getChildSpans() {
        return Promise.resolve(this.childSpans);
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
    stop() {
        if (this.stopped) {
            return Promise.resolve(this);
        }
        this.stopped = true;
        // Stop all child spans
        this.childSpans.forEach(s => s.stop());
        return Promise.resolve(this);
    }
    isStarted() {
        return this.started;
    }
    start() {
        if (this.started) {
            return Promise.resolve(this);
        }
        this.timestamp = new Date();
        this.started = true;
        return Promise.resolve(this);
    }
    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    send(scoutInstance) {
        const inst = scoutInstance || this.scoutInstance;
        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }
        // Start Span
        return index_1.sendStartSpan(inst, this)
            // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
            // Send tags
            .then(() => Promise.all(Object.entries(this.tags).map(([name, value]) => index_1.sendTagSpan(inst, this, name, value))))
            // End the span
            .then(() => index_1.sendStopSpan(inst, this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
            return this;
        });
    }
}
exports.default = ScoutSpan;
