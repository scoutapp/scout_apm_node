import { v4 as uuidv4 } from "uuid";

import {
    LogFn,
    LogLevel,
    Taggable,
    Stoppable,
    Startable,
    ScoutTag,
} from "../types";

import ScoutSpan from "./span";
import { ChildSpannable } from "./span";

import { Scout } from "./index";

import * as Constants from "../constants";
import * as Errors from "../errors";

export interface ScoutRequestOptions {
    id?: string;
    logFn?: LogFn;
    scoutInstance?: Scout;
    timestamp?: Date;
    started?: boolean;
}

export default class ScoutRequest implements ChildSpannable, Taggable, Stoppable, Startable {
    public readonly id: string;

    private timestamp: Date;

    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private finished: boolean = false;
    private sent: boolean = false;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

    constructor(opts?: ScoutRequestOptions) {
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_REQUEST_PREFIX}${uuidv4()}`;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout request has already been started
            // ex. when startRequest is used by a Scout instance
            if (opts.started) { this.started = opts.started; }
        }
    }

    public span(operation: string): Promise<ScoutSpan> {
        return this.startChildSpan(operation);
    }

    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.finished) {
            this.logFn(
                `[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`,
                LogLevel.Error,
            );

            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished request",
            ));
        }

        // Create a new child span
        const span = new ScoutSpan({
            operation,
            request: this,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
        });

        // Add the child span to the list
        this.childSpans.push(span);

        return span.start();
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    /** @see Taggable */
    public addTags(tags: ScoutTag[]): Promise<this> {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }

    public getTags(): ScoutTag[] {
        return Object.entries(this.tags)
            .map(([name, value]) => {
                return {name, value} as ScoutTag;
            });
    }

    public finish(): Promise<this> {
        return this.stop();
    }

    public finishAndSend(): Promise<this> {
        return this.finish()
            .then(() => this.send());
    }

    public isStopped(): boolean {
        return this.finished;
    }

    public stop(): Promise<this> {
        if (this.finished) { return Promise.resolve(this); }

        // Stop all child spans
        this.childSpans.forEach(s => s.stop());

        // Finish the request
        this.finished = true;

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
     * Send this request and internal spans to the scoutInstance
     *
     * @returns this request
     */
    public send(scoutInstance?: Scout): Promise<this> {
        const inst = scoutInstance || this.scoutInstance;

        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        return inst.sendStartRequest(this)
        // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => inst.sendTagRequest(this, name, value)),
            ))
        // End the span
            .then(() => inst.sendStopRequest(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.id}]Failed to send request`);
                return this;
            });
    }

    private logFn: LogFn = () => undefined;
}
