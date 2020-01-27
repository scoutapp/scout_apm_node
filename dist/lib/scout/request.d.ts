import { LogFn, Taggable, Stoppable, Startable, ScoutTag, JSONValue } from "../types";
import ScoutSpan from "./span";
import { ChildSpannable } from "./span";
import { Scout } from "./index";
export interface ScoutRequestOptions {
    id?: string;
    logFn?: LogFn;
    scoutInstance?: Scout;
    timestamp?: Date;
    started?: boolean;
}
export default class ScoutRequest implements ChildSpannable, Taggable, Stoppable, Startable {
    readonly id: string;
    private timestamp;
    private readonly scoutInstance?;
    private started;
    private finished;
    private sent;
    private sending;
    private childSpans;
    private tags;
    constructor(opts?: ScoutRequestOptions);
    span(operation: string): Promise<ScoutSpan>;
    getTimestamp(): Date;
    /** @see ChildSpannable */
    startChildSpan(operation: string): Promise<ScoutSpan>;
    /** @see ChildSpannable */
    startChildSpanSync(operation: string): ScoutSpan;
    /** @see ChildSpannable */
    getChildSpans(): Promise<ScoutSpan[]>;
    /** @see ChildSpannable */
    getChildSpansSync(): ScoutSpan[];
    /** @see Taggable */
    addContext(tags: ScoutTag[]): Promise<this>;
    /** @see Taggable */
    addContextSync(tags: ScoutTag[]): this;
    /** @see Taggable */
    getContextValue(name: string): JSONValue | JSONValue[] | undefined;
    getTags(): ScoutTag[];
    finish(): Promise<this>;
    finishAndSend(): Promise<this>;
    isStopped(): boolean;
    stop(): Promise<this>;
    stopSync(): this;
    isStarted(): boolean;
    start(): Promise<this>;
    startSync(): this;
    /**
     * Send this request and internal spans to the scoutInstance
     *
     * @returns this request
     */
    send(scoutInstance?: Scout): Promise<this>;
    private logFn;
}
