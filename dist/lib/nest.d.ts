import { ExpressMiddlewareOptions } from "./express";
/**
 * Scout APM middleware for NestJS.
 *
 * Register in main.ts before app.listen():
 *   app.use(nestMiddleware({ config }));
 *
 * Or with a class-based consumer:
 *   @Injectable()
 *   export class ScoutMiddleware implements NestMiddleware {
 *     use(req, res, next) { nestMiddleware()(req, res, next); }
 *   }
 */
export declare function nestMiddleware(opts?: ExpressMiddlewareOptions): (req: any, res: any, next: () => void) => void;
/**
 * Class-based Scout middleware for use with NestJS's MiddlewareConsumer.
 * Satisfies NestMiddleware<Request, Response> without importing @nestjs/common.
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
    constructor(opts?: ExpressMiddlewareOptions);
    use(req: any, res: any, next: () => void): void;
}
