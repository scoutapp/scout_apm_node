import { scoutMiddleware, ExpressMiddlewareOptions } from "./express";

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
export function nestMiddleware(opts?: ExpressMiddlewareOptions) {
    return scoutMiddleware(opts);
}

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
export class ScoutNestMiddleware {
    private readonly _inner: ReturnType<typeof scoutMiddleware>;

    constructor(opts?: ExpressMiddlewareOptions) {
        this._inner = scoutMiddleware(opts);
    }

    use(req: any, res: any, next: () => void): void {
        this._inner(req, res, next);
    }
}
