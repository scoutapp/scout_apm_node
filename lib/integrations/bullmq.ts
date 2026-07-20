import { RequireIntegration } from "../types/integrations";
import { ScoutContextName, ScoutSpanOperation } from "../types";
import { trackJobQueueTime } from "../job-queue-time";

export class BullMQIntegration extends RequireIntegration {
    protected readonly packageName: string = "bullmq";

    protected shim(bullmqExport: any) {
        return this.shimWorker(bullmqExport);
    }

    private shimWorker(bullmqExport: any): any {
        const Worker = bullmqExport.Worker;
        if (!Worker || !Worker.prototype) { return bullmqExport; }

        const originalCallProcessJob = Worker.prototype.callProcessJob;
        if (!originalCallProcessJob) { return bullmqExport; }

        const integration = this;

        Worker.prototype.callProcessJob = function(job: any, token: string) {
            if (!integration.scout) {
                return originalCallProcessJob.apply(this, [job, token]);
            }

            const opName = `${ScoutSpanOperation.BullMQJob}/${job.name || "unknown"}`;
            const self = this;

            return integration.scout.transaction(opName, (finishRequest) => {
                return integration.scout!.instrument(opName, (_, { span }) => {
                    if (span) {
                        span.addContextSync(ScoutContextName.TaskId, job.id || "");
                        span.addContextSync(ScoutContextName.Queue, job.queueName || "");
                        span.addContextSync(
                            ScoutContextName.Priority,
                            job.opts?.priority != null ? String(job.opts.priority) : "unknown",
                        );
                        if (job.timestamp) { trackJobQueueTime(span, job.timestamp); }
                    }

                    return originalCallProcessJob.apply(self, [job, token])
                        .then((result: any) => {
                            finishRequest();
                            return result;
                        })
                        .catch((err: any) => {
                            if (span) { span.addContextSync(ScoutContextName.Error, "true"); }
                            finishRequest();
                            throw err;
                        });
                });
            });
        };

        return bullmqExport;
    }
}

export default new BullMQIntegration();
