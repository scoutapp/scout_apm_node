import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, getIntegrationSymbol } from "../types/integrations";
import { ScoutSpanOperation } from "../types";
import { getActiveGlobalScoutInstance } from "../global";

// Instruments the NestJS execution pipeline — guards, pipes, interceptors — by hooking
// into the internal consumer submodule paths that NestJS uses at require-time.
//
// Consumer modules are eagerly loaded by @nestjs/core before ritmHook fires,
// so RITM v5 Hook instances won't backfill them. Patch prototypes directly
// via require() — they're already in the module cache and will return instantly.
//
// Each component gets its own span as a sibling within the active Scout request:
//   NestJS/Guards/<ClassName>        — GuardsConsumer.tryActivate
//   NestJS/Pipes/<ClassName>         — PipesConsumer.applyPipes
//   NestJS/Interceptors/<ClassName>  — span ends at next.handle() handoff (pre-handler only)
//
// Pipes appear as siblings of guards/interceptors because setCurrentSpan() synchronously
// restores store.span to the interceptor's parent after done() is called. doneFn() does
// the same thing but runs asynchronously (inside span.stop()), too late for pipes.
//
// @nestjs/schedule jobs each become their own Scout transaction (background jobs in Scout UI).

export class NestJSIntegration extends RequireIntegration {
    protected readonly packageName: string = "@nestjs/core";

    public ritmHook(_exportBag: ExportBag): void {
        const integration = this;

        const syncScout = () => {
            const g = getActiveGlobalScoutInstance();
            if (g) { integration.setScoutInstance(g); }
        };

        const patchConsumers = () => {
            // ── Guards ──────────────────────────────────────────────────────────
            try {
                const m = require("@nestjs/core/guards/guards-consumer");
                const proto = m?.GuardsConsumer?.prototype;
                if (proto?.tryActivate && !proto._scoutGuardsPatched) {
                    proto._scoutGuardsPatched = true;
                    const original = proto.tryActivate;
                    proto.tryActivate = async function(guards: any[], ...rest: any[]) {
                        if (!guards?.length || !integration.scout) {
                            return original.apply(this, [guards, ...rest]);
                        }
                        const names = guards.map((g: any) => g?.constructor?.name || "Guard").join(",");
                        const op = `${ScoutSpanOperation.NestJSGuards}/${names}`;
                        return integration.scout.instrument(op, (done: any) => {
                            return original.apply(this, [guards, ...rest])
                                .then((r: any) => { done(); return r; })
                                .catch((e: any) => { done(); throw e; });
                        });
                    };
                }
            } catch (_e) { /* guards-consumer not available */ }

            // ── Pipes ────────────────────────────────────────────────────────────
            try {
                const m = require("@nestjs/core/pipes/pipes-consumer");
                const proto = m?.PipesConsumer?.prototype;
                if (proto?.applyPipes && !proto._scoutPipesPatched) {
                    proto._scoutPipesPatched = true;
                    const original = proto.applyPipes;
                    proto.applyPipes = async function(value: any, metadata: any, transforms: any[]) {
                        if (!transforms?.length || !integration.scout) {
                            return original.apply(this, [value, metadata, transforms]);
                        }
                        const names = transforms.map((p: any) => p?.constructor?.name || "Pipe").join(",");
                        const op = `${ScoutSpanOperation.NestJSPipes}/${names}`;
                        return integration.scout.instrument(op, (done: any) => {
                            return original.apply(this, [value, metadata, transforms])
                                .then((r: any) => { done(); return r; })
                                .catch((e: any) => { done(); throw e; });
                        });
                    };
                }
            } catch (_e) { /* pipes-consumer not available */ }

            // ── Interceptors ─────────────────────────────────────────────────────
            // Interceptors return RxJS Observables (lazy). Wrap each interceptor's
            // CallHandler so the span ends at next.handle() — pre-handler work only.
            // After done(), setCurrentSpan() synchronously restores store.span to the
            // interceptor's parent so pipes run as siblings, not children.
            try {
                const m = require("@nestjs/core/interceptors/interceptors-consumer");
                const proto = m?.InterceptorsConsumer?.prototype;
                if (proto?.intercept && !proto._scoutInterceptorsPatched) {
                    proto._scoutInterceptorsPatched = true;
                    const original = proto.intercept;
                    proto.intercept = async function(interceptors: any[], ...rest: any[]) {
                        if (!interceptors?.length || !integration.scout) {
                            return original.apply(this, [interceptors, ...rest]);
                        }
                        const { Observable } = require("rxjs");
                        const { finalize } = require("rxjs");
                        const scout = integration.scout;
                        const wrapped = interceptors.map((interceptor: any) => {
                            const name = interceptor?.constructor?.name || "Interceptor";
                            const op = `${ScoutSpanOperation.NestJSInterceptors}/${name}`;
                            return {
                                intercept(ctx: any, next: any) {
                                    if (!scout) { return interceptor.intercept(ctx, next); }
                                    return new Observable((subscriber: any) => {
                                        scout.instrument(op, (done: any, info: any) => {
                                            return new Promise<void>((resolve) => {
                                                let spanEnded = false;
                                                const endSpan = () => {
                                                    if (!spanEnded) {
                                                        spanEnded = true;
                                                        done();
                                                        // Synchronously restore store.span to the interceptor's parent so
                                                        // pipes in next.handle() become siblings of the interceptor span.
                                                        // doneFn() does the same thing but runs async (inside span.stop()).
                                                        const parentSpan = (info.parent !== info.request) ? info.parent : undefined;
                                                        scout.setCurrentSpan(parentSpan);
                                                    }
                                                };
                                                const wrappedNext = {
                                                    handle() {
                                                        endSpan();
                                                        return next.handle();
                                                    },
                                                };
                                                interceptor.intercept(ctx, wrappedNext)
                                                    .pipe(finalize(() => { endSpan(); resolve(); }))
                                                    .subscribe({
                                                        next: (v: any) => subscriber.next(v),
                                                        error: (e: any) => subscriber.error(e),
                                                        complete: () => subscriber.complete(),
                                                    });
                                            });
                                        }).catch(() => {});
                                    });
                                },
                            };
                        });
                        return original.apply(this, [wrapped, ...rest]);
                    };
                }
            } catch (_e) { /* interceptors-consumer not available */ }
        };

        patchConsumers();

        // ── Schedule (optional — only fires if @nestjs/schedule is installed) ──
        new Hook(["@nestjs/schedule/dist/scheduler.orchestrator"], (exports) => {
            syncScout();
            return integration.shimSchedule(exports);
        });
    }

    // Not used (ritmHook is overridden), but required by the abstract base class.
    protected shim(exports: any): any { return exports; }

    private shimSchedule(exports: any): any {
        const proto = exports?.SchedulerOrchestrator?.prototype;
        if (!proto) { return exports; }

        const integration = this;

        const wrapMountMethod = (
            methodName: "mountCron" | "mountIntervals" | "mountTimeouts",
            jobsField: string,
            opBase: ScoutSpanOperation,
        ) => {
            const original = proto[methodName];
            if (!original || (proto as any)[`_scout_${methodName}_patched`]) { return; }
            (proto as any)[`_scout_${methodName}_patched`] = true;

            proto[methodName] = function(this: any) {
                const jobs: Record<string, any> = this[jobsField] || {};
                for (const [key, meta] of Object.entries(jobs)) {
                    if (!meta || (meta as any)._scoutWrapped) { continue; }
                    (meta as any)._scoutWrapped = true;

                    const targetKey = "target" in meta ? "target" : "fn";
                    const originalFn = meta[targetKey];
                    if (typeof originalFn !== "function") { continue; }

                    meta[targetKey] = async function(this: any, ...args: any[]) {
                        const scout = integration.scout;
                        if (!scout) { return originalFn.apply(this, args); }
                        const opName = `${opBase}/${key}`;
                        return scout.transaction(opName, (done: any) => {
                            return scout.instrument(opName, () => {
                                return Promise.resolve(originalFn.apply(this, args))
                                    .then((r: any) => { done(); return r; })
                                    .catch((e: any) => { done(); throw e; });
                            });
                        });
                    };
                }
                return original.apply(this, arguments);
            };
        };

        wrapMountMethod("mountCron",      "cronJobs",      ScoutSpanOperation.NestJSScheduleCron);
        wrapMountMethod("mountIntervals", "intervalJobs",  ScoutSpanOperation.NestJSScheduleInterval);
        wrapMountMethod("mountTimeouts",  "timeoutJobs",   ScoutSpanOperation.NestJSScheduleTimeout);

        exports[getIntegrationSymbol()] = integration;
        return exports;
    }
}

export default new NestJSIntegration();
