import { v4 as uuidv4 } from "uuid";
import {
    get as getStackTrace,
    getSync as getStackTraceSync,
    StackFrame,
    deinstrument,
} from "stacktrace-js";

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
    timestamp?: Date;
    started?: boolean;
    operation: string;

    requestId: string;
    parentId?: string;

    // Callback to run when the span is finished
    onStop?: () => Promise<void>;

    ignored?: boolean;
}

const TRACE_LIMIT = 50;

export default class ScoutSpan implements ChildSpannable, Taggable, Stoppable, Startable {
    public readonly requestId: string;
    public readonly parentId?: string;
    public readonly id: string;
    public readonly operation: string;

    private timestamp: Date;
    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private stopped: boolean = false;
    private sending: Promise<this>;
    private sent: boolean = false;
    private endTime: Date;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: JSONValue | JSONValue[] } = {};

    private traceFrames: ScoutStackFrame[] = [];

    private onStop: () => Promise<void>;

    private ignored: boolean = false;

    constructor(opts: ScoutSpanOptions) {
        this.requestId = opts.requestId;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_SPAN_PREFIX}${uuidv4()}`;
        this.operation = opts.operation;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout span has already been started
            // ex. when startSpan is used by a Scout instance
            if (opts.started) { this.started = opts.started; }

            if (opts.parentId)  { this.parentId = opts.parentId; }

            if (opts.onStop)  { this.onStop = opts.onStop; }

            if ("ignored" in opts)  { this.ignored = opts.ignored || false; }
        }

    }

    public pushTraceFrames(frames: StackFrame[]) {
        this.traceFrames = this.traceFrames.concat(this.processStackFrames(frames));
    }

    public prependTraceFrames(frames: StackFrame[]) {
        this.traceFrames = this.processStackFrames(frames).concat(this.traceFrames);
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
    public addContext(name: string, value: JSONValue | JSONValue[]): Promise<this> {
        return new Promise((resolve) => resolve(this.addContextSync(name, value)));
    }

    /** @see Taggable */
    public addContextSync(name: string, value: JSONValue | JSONValue[]): this {
        this.tags[name] = value;
        return this;
    }

    /** @see Taggable */
    public addContexts(tags: ScoutTag[]): Promise<this> {
        return new Promise((resolve) => resolve(this.addContextsSync(tags)));
    }

    /** @see Taggable */
    public addContextsSync(tags: ScoutTag[]): this {
        tags.forEach(t => this.addContextSync(t.name, t.value));
        return this;
    }

    /** @see Taggable */
    public getContextValue(name: string): JSONValue | JSONValue[] | undefined {
        return this.tags[name];
    }

    public getTags(): ScoutTag[] {
        return Object.entries(this.tags)
            .map(([name, value]) => {
                return {name, value} as ScoutTag;
            });
    }

    public isIgnored(): boolean {
        return this.ignored;
    }

    // Set a request as ignored
    public ignore(): this {
        this.ignored = true;

        // Ignore all child spans if present
        this.childSpans.forEach(s => s.ignore());

        return this;
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
                `[scout/request/${this.requestId}/span/${this.id}] Cannot add span to stopped span [${this.id}]`,
                LogLevel.Error,
            );

            throw new Errors.FinishedRequest("Cannot add a child span to a finished span");
        }

        const span = new ScoutSpan({
            operation,
            requestId: this.requestId,
            parentId: this.id,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
            ignored: this.ignored,
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

    public getEndTime(): Date {
        return new Date(this.endTime);
    }

    public setOnStop(fn: () => Promise<void>) {
        this.onStop = fn;
    }

    public stop(): Promise<this> {
        if (this.stopped) { return Promise.resolve(this); }

        // Stop all child spans
        return Promise.all(
            this.childSpans.map(s =>  s.stop()),
        )
            .then(() => {
                if (!this.scoutInstance) { return this; }

                // Update the endtime of the span
                this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
                this.stopped = true;

                // If the span request is still under the threshold then don't save the traceback
                if (this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
                    return Promise.resolve(this);
                }

                // Add stack trace to the span
                return this.addContext(ScoutContextName.Traceback, this.traceFrames.slice(0, TRACE_LIMIT));
            })
        // Call the async stop function if there is one
            .then(() => {
                if (this.onStop) { return this.onStop(); }
            })
            .then(() => this);
    }

    public stopSync(): this {
        if (this.stopped) { return this; }

        // Update the endtime of the span
        this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
        this.stopped = true;

        // Stop all the child spans
        this.childSpans.map(s => s.stopSync());

        // If the span request is still under the threshold then don't save the traceback
        if (this.scoutInstance && this.scoutInstance.getSlowRequestThresholdMs() > this.getDurationMs()) {
            return this;
        }

        // Add the pre-processed list of stack frames to the context
        this.addContextSync(ScoutContextName.Traceback, this.traceFrames.slice(0, TRACE_LIMIT));

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
                this.logFn(`[scout/request/${this.requestId}/span/${this.id}}] Failed to send span`);
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
            .filter(f => !f.fileName || !f.fileName.includes("node_modules/@scout_apm/scout-apm"))
        // Filter out node internals
            .filter(f => !f.fileName || !f.fileName.startsWith("internal/modules/"))
        // Simplify the traces
            .map(f => ({
                line: f.lineNumber,
                file: f.fileName,
                function: f.functionName || "<anonymous>",
            }));
    }

    private logFn: LogFn = () => undefined;
}
