import { LogFn, ScoutConfiguration } from "./types";
import { Scout } from "./scout";
export type NestMiddlewareOptions = {
    config?: Partial<ScoutConfiguration>;
    logFn?: LogFn;
    requestTimeoutMs?: number;
    statisticsIntervalMS?: number;
    scout?: Scout;
    waitForScoutSetup?: boolean;
};
type NestMiddleware = (req: any, res: any, next: () => void) => void;
export declare function nestMiddleware(opts?: NestMiddlewareOptions): NestMiddleware;
/**
 * Class-based Scout middleware for use with NestJS's MiddlewareConsumer.
 *
 * Example:
 *   @Module({})
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(ScoutNestMiddleware).forRoutes('*');
 *     }
 *   }
 */
export declare class ScoutNestMiddleware {
    private readonly _inner;
    constructor(opts?: NestMiddlewareOptions);
    use(req: any, res: any, next: () => void): void;
}
export {};
