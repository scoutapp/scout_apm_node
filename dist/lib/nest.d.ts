import { LogFn, ScoutConfiguration } from "./types";
import { Scout } from "./scout";
export interface NestMiddlewareOptions {
    config?: Partial<ScoutConfiguration>;
    logFn?: LogFn;
    requestTimeoutMs?: number;
    statisticsIntervalMS?: number;
    scout?: Scout;
    waitForScoutSetup?: boolean;
}
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
    private readonly inner;
    constructor(opts?: NestMiddlewareOptions);
    use(req: any, res: any, next: () => void): void;
}
/**
 * Returns a NestJS-compatible global exception filter that captures errors via Scout.
 *
 * Does not require @nestjs/common as a dependency — NestJS duck-types the catch() method.
 *
 * @example
 * const { nestErrorFilter } = require("@scout_apm/scout-apm");
 * // after NestFactory.create():
 * app.useGlobalFilters(nestErrorFilter());
 */
export declare function nestErrorFilter(): {
    catch(exception: any, host: any): void;
};
export {};
