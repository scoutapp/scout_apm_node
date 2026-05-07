"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScoutNestMiddleware = void 0;
exports.nestMiddleware = nestMiddleware;
const express_1 = require("./express");
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
function nestMiddleware(opts) {
    return (0, express_1.scoutMiddleware)(opts);
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
class ScoutNestMiddleware {
    constructor(opts) {
        this._inner = (0, express_1.scoutMiddleware)(opts);
    }
    use(req, res, next) {
        this._inner(req, res, next);
    }
}
exports.ScoutNestMiddleware = ScoutNestMiddleware;
