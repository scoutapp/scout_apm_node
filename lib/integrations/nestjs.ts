import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, getIntegrationSymbol } from "../types/integrations";
import { ScoutSpanOperation } from "../types";
import { getActiveGlobalScoutInstance } from "../global";

// Instruments the NestJS execution pipeline — guards, pipes, interceptors — by hooking
// into the internal consumer submodule paths that NestJS uses at require-time.
//
// Each category gets a single aggregate span inside the active Scout request span:
//   NestJS/Guards        — GuardsConsumer.tryActivate (all guards in sequence)
//   NestJS/Pipes         — PipesConsumer.applyPipes   (all pipes in sequence)
//   NestJS/Interceptors  — InterceptorsConsumer.intercept (all interceptors)
//
// @nestjs/schedule jobs (Cron / Interval / Timeout) each become their own Scout
// transaction so they appear as background jobs in the Scout UI.

export class NestJSIntegration extends RequireIntegration {
    protected readonly packageName: string = "@nestjs/core";

    // Override ritmHook entirely — we need to hook submodule paths, not the top-level
    // @nestjs/core export, because GuardsConsumer etc. are not exported from the index.
    public ritmHook(_exportBag: ExportBag): void {
        const integration = this;

        const syncScout = () => {
            const g = getActiveGlobalScoutInstance();
            if (g) { integration.setScoutInstance(g); }
        };

        // ── Guards ──────────────────────────────────────────────────────────────
        new Hook(["@nestjs/core/guards/guards-consumer"], (exports) => {
            syncScout();
            const proto = exports?.GuardsConsumer?.prototype;
            if (!proto?.tryActivate || proto._scoutGuardsPatched) { return exports; }
            proto._scoutGuardsPatched = true;

            const original = proto.tryActivate;
            proto.tryActivate = async function(guards: any[], ...rest: any[]) {
                if (!guards?.length || !integration.scout) {
                    return original.apply(this, [guards, ...rest]);
                }
                return integration.scout.instrument(ScoutSpanOperation.NestJSGuards, (done: any) => {
                    return original.apply(this, [guards, ...rest])
                        .then((r: any) => { done(); return r; })
                        .catch((e: any) => { done(); throw e; });
                });
            };

            exports[getIntegrationSymbol()] = integration;
            return exports;
        });

        // ── Pipes ───────────────────────────────────────────────────────────────
        new Hook(["@nestjs/core/pipes/pipes-consumer"], (exports) => {
            syncScout();
            const proto = exports?.PipesConsumer?.prototype;
            if (!proto?.applyPipes || proto._scoutPipesPatched) { return exports; }
            proto._scoutPipesPatched = true;

            const original = proto.applyPipes;
            proto.applyPipes = async function(value: any, metadata: any, transforms: any[]) {
                if (!transforms?.length || !integration.scout) {
                    return original.apply(this, [value, metadata, transforms]);
                }
                return integration.scout.instrument(ScoutSpanOperation.NestJSPipes, (done: any) => {
                    return original.apply(this, [value, metadata, transforms])
                        .then((r: any) => { done(); return r; })
                        .catch((e: any) => { done(); throw e; });
                });
            };

            exports[getIntegrationSymbol()] = integration;
            return exports;
        });

        // ── Interceptors ────────────────────────────────────────────────────────
        new Hook(["@nestjs/core/interceptors/interceptors-consumer"], (exports) => {
            syncScout();
            const proto = exports?.InterceptorsConsumer?.prototype;
            if (!proto?.intercept || proto._scoutInterceptorsPatched) { return exports; }
            proto._scoutInterceptorsPatched = true;

            const original = proto.intercept;
            proto.intercept = async function(interceptors: any[], ...rest: any[]) {
                if (!interceptors?.length || !integration.scout) {
                    return original.apply(this, [interceptors, ...rest]);
                }
                return integration.scout.instrument(ScoutSpanOperation.NestJSInterceptors, (done: any) => {
                    return original.apply(this, [interceptors, ...rest])
                        .then((r: any) => { done(); return r; })
                        .catch((e: any) => { done(); throw e; });
                });
            };

            exports[getIntegrationSymbol()] = integration;
            return exports;
        });

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

                    // Cron stores the callback on meta.target; intervals/timeouts vary
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
