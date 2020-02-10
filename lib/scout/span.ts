import { v4 as uuidv4 } from "uuid";
import { get as getStackTrace, getSync as getStackTraceSync, StackFrame } from "stacktrace-js";

import {
    LogFn,
    LogLevel,
    Taggable,
    Stoppable,
    Startable,
    ScoutTag,
    JSONValue,
    ScoutStackFrame,
} from "../types";

import ScoutRequest from "./request";

import {
    Scout,
    sendStartSpan,
    sendStopSpan,
    sendTagSpan,
} from "./index";

import { ScoutContextName } from "../types/enum";

import * as Constants from "../constants";
import * as Errors from "../errors";

// A class that represents objects that can have/contain child spans
export interface ChildSpannable {
    /**
     * Create a child span inside the request
     * @abstract
     */
    startChildSpan(operation: string): Promise<ScoutSpan>;
    startChildSpanSync(operation: string): ScoutSpan;

    /**
     * Get all active child spans
     */
    getChildSpans(): Promise<ScoutSpan[]>;
    getChildSpansSync(): ScoutSpan[];
}

export interface ScoutSpanOptions {
    id?: string;
    scoutInstance?: Scout;
    logFn?: LogFn;
    parent?: ScoutSpan;
    timestamp?: Date;
    started?: boolean;
    operation: string;
    request: ScoutRequest;
}

export default class ScoutSpan implements ChildSpannable, Taggable, Stoppable, Startable {
    public readonly request: ScoutRequest;
    public readonly parent?: ScoutSpan;
    public readonly id: string;
    public readonly operation: string;

    private timestamp: Date;
    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private stopped: boolean = false;
    private sending: Promise<this>;
    private sent: boolean = false;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: JSONValue | JSONValue[] } = {};

    constructor(opts: ScoutSpanOptions) {
        this.request = opts.request;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_SPAN_PREFIX}${uuidv4()}`;
        this.operation = opts.operation;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout span has already been started
            // ex. when startSpan is used by a Scout instance
            if (opts.started) { this.started = opts.started; }

            if (opts.parent)  { this.parent = opts.parent; }
        }
    }

    // Get the start of this span
    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    // Get the amount of time this span has been running in milliseconds
    public getDurationMs(): number {
        return new Date().getTime() - this.getTimestamp().getTime();
    }

    /** @see Taggable */
    public addContext(tags: ScoutTag[]): Promise<this> {
        return new Promise((resolve) => resolve(this.addContextSync(tags)));
    }

    /** @see Taggable */
    public addContextSync(tags: ScoutTag[]): this {
        tags.forEach(t => this.tags[t.name] = t.value);
        return this;
    }

    /** @see Taggable */
    public getContextValue(name: string): JSONValue | JSONValue[] | undefined {
        return this.tags[name];
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        return new Promise((resolve, reject) => {
            try {
                resolve(this.startChildSpanSync(operation));
            } catch (err) {
                reject(err);
            }
        });
    }

    /** @see ChildSpannable */
    public startChildSpanSync(operation: string): ScoutSpan {
        if (this.stopped) {
            this.logFn(
                `[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`,
                LogLevel.Error,
            );

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
    public getChildSpans(): Promise<ScoutSpan[]> {
        return new Promise((resolve) => resolve(this.getChildSpansSync()));
    }

    /** @see ChildSpannable */
    public getChildSpansSync(): ScoutSpan[] {
        return this.childSpans.slice();
    }

    public finish(): Promise<this> {
        return this.stop();
    }

    public finishAndSend(): Promise<this> {
        return this.finish()
            .then(() => this.send());
    }

    public isStopped(): boolean {
        return this.stopped;
    }

    public stop(): Promise<this> {
        if (this.stopped) { return Promise.resolve(this); }

        this.stopped = true;

        // Stop all child spans
        this.childSpans.forEach(s => s.stop());

        if (!this.scoutInstance) { return Promise.resolve(this); }

        // If the span request is still under the threshold then don't save the traceback
        if (this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
            return Promise.resolve(this);
        }

        // Add stack trace to the span
        return getStackTrace()
            .then(this.processStackFrames)
            .then(scoutFrames => ({
                name: ScoutContextName.Traceback,
                value: scoutFrames,
            }))
            .then(tracebackTag => this.addContext([tracebackTag]))
            .then(() => this);
    }

    public stopSync(): this {
        if (this.stopped) { return this; }

        this.stopped = true;

        // If the span request is still under the threshold then don't save the traceback
        if (this.scoutInstance && this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
            return this;
        }

        // Process the frames and add the context
        const scoutFrames = this.processStackFrames(getStackTraceSync());
        const tracebackTag: ScoutTag = {name: ScoutContextName.Traceback, value: scoutFrames};
        this.addContextSync([tracebackTag]);

        return this;
    }

    public isStarted(): boolean {
        return this.started;
    }

    public start(): Promise<this> {
        return new Promise((resolve) => resolve(this.startSync()));
    }

    public startSync(): this {
        if (this.started) { return this; }

        this.timestamp = new Date();
        this.started = true;

        return this;
    }

    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    public send(scoutInstance?: Scout): Promise<this> {
        if (this.sending) { return this.sending; }
        if (this.sent) { return Promise.resolve(this); }

        const inst = scoutInstance || this.scoutInstance;

        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        // Start Span
        this.sending = sendStartSpan(inst, this)
        // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags)
                    .map(([name, value]) => sendTagSpan(inst, this, name, value)),
            ))
        // End the span
            .then(() => sendStopSpan(inst, this))
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
    private processStackFrames(frames: StackFrame[]): ScoutStackFrame[] {
        if (!frames || !(frames instanceof Array) || frames.length === 0) { return []; }

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

    private logFn: LogFn = () => undefined;
}
