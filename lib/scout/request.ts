import { v4 as uuidv4 } from "uuid";

import {
    LogFn,
    LogLevel,
    Taggable,
    Stoppable,
    Startable,
    ScoutTag,
    JSONValue,
    BaseAgentRequest,
} from "../types";

import * as Requests from "../protocol/v1/requests";

import ScoutSpan from "./span";
import { ChildSpannable } from "./span";

import {
    Scout,
    ScoutEventRequestSentData,
    sendThroughAgent,
} from "./index";

import { ScoutContextName, ScoutEvent, isScoutTag } from "../types";
import * as Constants from "../constants";
import * as Errors from "../errors";

export interface ScoutRequestOptions {
    id?: string;
    logFn?: LogFn;
    scoutInstance?: Scout;
    timestamp?: Date;
    started?: boolean;
    ignored?: boolean;

    onStop?: () => Promise<void>;
}

export default class ScoutRequest implements ChildSpannable, Taggable, Stoppable, Startable {
    public readonly id: string;

    private timestamp: Date;

    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private finished: boolean = false;
    private sent: boolean = false;
    private sending: Promise<this>;
    private endTime: Date;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: JSONValue | JSONValue[] } = {};

    private ignored: boolean = false;

    private onStop?: () => Promise<void>;

    constructor(opts?: ScoutRequestOptions) {
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_REQUEST_PREFIX}${uuidv4()}`;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout request has already been started
            // ex. when startRequest is used by a Scout instance
            if (opts.started) { this.started = opts.started; }

            if (typeof opts.ignored === "boolean") { this.ignored = opts.ignored; }

            if (opts.onStop) { this.onStop = opts.onStop; }

        }

        if (this.ignored) { this.addContext(ScoutContextName.IgnoreTransaction, true); }
    }

    public span(operation: string): Promise<ScoutSpan> {
        return this.startChildSpan(operation);
    }

    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    // Get the amount of time this span has been running in milliseconds
    public getDurationMs(): number {
        return new Date().getTime() - this.getTimestamp().getTime();
    }

    public isIgnored(): boolean {
        return this.ignored;
    }

    // Set a request as ignored
    public ignore(): this {
        this.addContextSync(ScoutContextName.IgnoreTransaction, true);
        this.ignored = true;

        // Ignore all the child spans
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
        if (this.finished) {
            this.logFn(
                `[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`,
                LogLevel.Error,
            );

            throw new Errors.FinishedRequest("Cannot add a child span to a finished request");
        }

        // Create a new child span
        const span = new ScoutSpan({
            operation,
            requestId: this.id,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
        });

        // Add the child span to the list
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

    public getEndTime(): Date {
        return new Date(this.endTime);
    }

    public setOnStop(fn: () => Promise<void>) {
        this.onStop = fn;
    }

    public clearOnStop() {
        delete this.onStop;
    }

    public stop(): Promise<this> {
        if (this.finished) { return Promise.resolve(this); }

        // Stop all child spans
        return Promise.all(
            this.childSpans.map(s => s.stop()),
        ).then(() => {
            this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
            this.finished = true;
        })
        // Call the stop function if there is one
            .then(() => {
                if (this.onStop) { return this.onStop(); }
            })
            .then(() => this);
    }

    public stopSync(): this {
        if (this.finished) { return this; }

        // Stop all child spans
        this.childSpans.forEach(s => s.stopSync());

        // Finish the request
        this.endTime = new Date(this.timestamp.getTime() + this.getDurationMs());
        this.finished = true;

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
     * Send this request and all its spans to the scout instance as a single BatchCommand.
     *
     * @returns this request
     */
    public send(scoutInstance?: Scout): Promise<this> {
        if (this.sending) { return this.sending; }
        if (this.sent) { return Promise.resolve(this); }

        const inst = scoutInstance || this.scoutInstance;

        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        if (this.ignored) {
            this.logFn(`[scout/request/${this.id}] skipping ignored request send`, LogLevel.Warn);
            inst.emit(ScoutEvent.IgnoredRequestProcessingSkipped, this);
            return Promise.resolve(this);
        }

        // Assemble all commands for this request into a single BatchCommand
        const commands: BaseAgentRequest[] = [];

        commands.push(new Requests.V1StartRequest({
            requestId: this.id,
            timestamp: this.timestamp,
        }));

        for (const [name, value] of Object.entries(this.tags)) {
            commands.push(new Requests.V1TagRequest(name, value, this.id));
        }

        for (const span of this.childSpans) {
            commands.push(...span.buildCommands());
        }

        commands.push(new Requests.V1FinishRequest(this.id, {timestamp: this.endTime}));

        const batch = new Requests.V1BatchCommand(commands);

        this.sending = sendThroughAgent(inst, batch)
            .then(() => inst.emit(ScoutEvent.RequestSent, {request: this} as ScoutEventRequestSentData))
            .then(() => { this.sent = true; })
            .then(() => this)
            .catch(() => {
                this.logFn(`[scout/request/${this.id}] Failed to send request batch`);
                return this;
            });

        return this.sending;
    }

    private logFn: LogFn = () => undefined;
}
