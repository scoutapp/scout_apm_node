import { ScoutConfiguration } from "./types";
export declare function setupErrorMonitoring(config: Partial<ScoutConfiguration>): void;
/**
 * Options for captureError. Mirrors the Ruby agent's ScoutApm::Error.capture signature:
 *   capture(error, context = {}, env: nil, name: nil)
 *
 * - controller / action / module: where the error "lives" (shown as location in APM).
 *   Express middleware fills these in automatically; pass overrides here to change them.
 * - name: override the exception class name shown in APM (useful for string errors or
 *   when you want a stable grouping name regardless of the class).
 * - requestId / requestUrl / requestParams / requestSession: request envelope data.
 *   Express middleware populates these from req; you can supply them manually too.
 */
export interface CaptureOptions {
    controller?: string | null;
    action?: string | null;
    module?: string | null;
    name?: string;
    requestId?: string;
    requestUrl?: string;
    requestParams?: object;
    requestSession?: object;
}
/**
 * Report an error to Scout APM.
 *
 * @param error  - An Error object or a plain string message.
 * @param context - Flat key-value object of custom context data (shown alongside the error).
 * @param opts   - Optional location override and request envelope.
 *
 * @example
 * // Simple
 * captureError(new Error("Payment failed"))
 *
 * // With custom context
 * captureError(new Error("Payment failed"), { userId: req.user.id, plan: "pro" })
 *
 * // With explicit location (e.g. from a background job or non-Express handler)
 * captureError(new Error("Payment failed"), { orderId: 42 }, {
 *   controller: "CheckoutController",
 *   action: "process",
 * })
 */
export declare function captureError(error: Error | string | any, context?: Record<string, any>, opts?: CaptureOptions): void;
