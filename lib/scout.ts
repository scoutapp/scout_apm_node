import { Agent, ScoutConfiguration } from "./types";
import * as Errors from "./errors";

// A class that represents objects that can have/contain child spans
interface ChildSpannable {
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

interface Taggable {
    addTags(tags: string[]): Promise<this>;
}

interface Stoppable {
    stop(): Promise<this>;
}

export class ScoutRequest implements ChildSpannable, Taggable, Stoppable {
    public readonly id: string;

    private readonly scoutInstance: Scout;
    private stopped: boolean;
    private childSpans: ScoutSpan[];

    /** @see ChildSpannable */
    public startChildSpan(): Promise<ScoutSpan> {
        // TODO: fill out
        return Promise.reject(Errors.NotImplemented);
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    public addTags(tag: string[]): Promise<this> {
        return Promise.resolve(this);
    }

    public stop(): Promise<this> {
        // TODO: Check if already stopped
        // TODO: Stop all child spans first
        // TODO: Fill out
        return Promise.resolve(this);
    }
}

export class ScoutSpan implements ChildSpannable, Taggable, Stoppable {
    public readonly request: ScoutRequest;
    public readonly id: string;

    private readonly scoutInstance: Scout;
    private parentId?: string;
    private stopped: boolean;
    private childSpans: ScoutSpan[];

    public addTags(tag: string[]): Promise<this> {
        return Promise.resolve(this);
    }

    /** @see ChildSpannable */
    public startChildSpan(): Promise<this> {
        return Promise.resolve(this);
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    public stop(): Promise<this> {
        // TODO: Check if already stopped
        // TODO: Stop all child spans first
        // TODO: Fill out
        return Promise.resolve(this);
    }
}

export class Scout {
    public static build(config?: ScoutConfiguration): Scout {
        // Build a scout agent based if one was not provided
        config = config || ScoutConfiguration.build();

        const scout = new Scout(config);
        return scout;
    }

    private readonly agent: Agent;
    private readonly config: ScoutConfiguration;

    constructor(config: ScoutConfiguration) {
        this.config = config;
    }

    public hasAgent(): boolean {
        return this.agent !== null;
    }

    public startRequest(): Promise<ScoutRequest> {
        return Promise.reject(new Errors.NotImplemented());
    }

}
