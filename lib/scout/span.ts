import { v4 as uuidv4 } from "uuid";

import {
    LogFn,
    LogLevel,
    Taggable,
    Stoppable,
    Startable,
    ScoutTag,
} from "../types";

import ScoutRequest from "./request";

import {
    Scout,
    sendStartSpan,
    sendStopSpan,
    sendTagSpan,
} from "./index";

import * as Constants from "../constants";
import * as Errors from "../errors";

// A class that represents objects that can have/contain child spans
export interface ChildSpannable {
    /**
     * Create a child span inside the request
     * @abstract
     */
    startChildSpan(operation: string): Promise<ScoutSpan>;

    /**
     * Get all active child spans
     */
    getChildSpans(): Promise<ScoutSpan[]>;
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
    private sent: boolean = false;
    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

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
        }
    }

    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    /** @see Taggable */
    public addContext(tags: ScoutTag[]): Promise<this> {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }

    /** @see Taggable */
    public getContextValue(name: string): string | undefined {
        return this.tags[name];
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.stopped) {
            this.logFn(
                `[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`,
                LogLevel.Error,
            );

            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished span",
            ));
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
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
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

        return Promise.resolve(this);
    }

    public isStarted(): boolean {
        return this.started;
    }

    public start(): Promise<this> {
        if (this.started) { return Promise.resolve(this); }

        this.timestamp = new Date();
        this.started = true;

        return Promise.resolve(this);
    }

    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    public send(scoutInstance?: Scout): Promise<this> {
        const inst = scoutInstance || this.scoutInstance;

        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        // Start Span
        return sendStartSpan(inst, this)
        // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => sendTagSpan(inst, this, name, value)),
            ))
        // End the span
            .then(() => sendStopSpan(inst, this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
                return this;
            });
    }

    private logFn: LogFn = () => undefined;
}
