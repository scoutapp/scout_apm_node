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
export function nestErrorFilter() {
    return {
        catch(exception: any, host: any): void {
            const { captureError } = require("./error-monitor");

            const ctx = host.switchToHttp();
            const req = ctx.getRequest();
            const res = ctx.getResponse();

            if (req) {
                captureError(
                    exception,
                    undefined,
                    {
                        controller: (req.route && req.route.path) || req.path || null,
                        action: req.method ? req.method.toUpperCase() : null,
                        module: null,
                        requestId: req.scout && req.scout.request ? req.scout.request.requestId : undefined,
                        requestUrl: req.originalUrl || req.url,
                        requestParams: (req.query || req.body)
                            ? Object.assign({}, req.query, req.body)
                            : undefined,
                        requestSession: req.session || undefined,
                    },
                );
            } else {
                captureError(exception);
            }

            // Determine HTTP status — NestJS HttpException carries getStatus()
            const status = exception && typeof exception.getStatus === "function"
                ? exception.getStatus()
                : 500;

            const message = exception instanceof Error
                ? exception.message
                : typeof exception === "string" ? exception : "Internal server error";

            res.status(status).json({ statusCode: status, message });
        },
    };
}
