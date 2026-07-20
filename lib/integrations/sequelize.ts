import { RequireIntegration, getIntegrationSymbol } from "../types/integrations";
import { ScoutContextName, ScoutSpanOperation } from "../types";

function extractOperation(sql: string, opts?: any): string {
    if (opts?.type) { return String(opts.type).toUpperCase(); }
    const first = sql.trim().split(/\s+/)[0];
    return first ? first.toUpperCase() : "UNKNOWN";
}

function extractTable(sql: string, opts?: any): string {
    // Tier 1: model instance
    const fromInstance = opts?.instance?.constructor?.tableName;
    if (fromInstance) { return fromInstance; }
    // Tier 2: tableNames array
    if (Array.isArray(opts?.tableNames) && opts.tableNames.length > 0) {
        return opts.tableNames.join(",");
    }
    // Tier 3: regex on SQL (FROM / JOIN / INTO / UPDATE)
    const match = sql.match(/(?:from|join|into|update)\s+["`]?(\w+)["`]?/i);
    return match ? match[1] : "";
}

export class SequelizeIntegration extends RequireIntegration {
    protected readonly packageName: string = "sequelize";

    protected shim(sequelizeExport: any): any {
        const Sequelize = sequelizeExport.Sequelize ?? sequelizeExport;
        if (!Sequelize?.prototype?.query) { return sequelizeExport; }

        const originalQuery = Sequelize.prototype.query;
        if (!originalQuery) { return sequelizeExport; }

        Sequelize[getIntegrationSymbol()] = this;

        const integration = this;

        Sequelize.prototype.query = function(sql: any, options?: any) {
            if (!integration.scout) {
                return originalQuery.apply(this, [sql, options]);
            }

            const sqlText = typeof sql === "string" ? sql : (sql?.query ?? "");
            const operation = extractOperation(sqlText, options);
            const table = extractTable(sqlText, options);

            return integration.scout.instrument(ScoutSpanOperation.SQLQuery, (done: any) => {
                if (!integration.scout) {
                    return originalQuery.apply(this, [sql, options]).then((r: any) => { done(); return r; });
                }

                const span = integration.scout.getCurrentSpan();

                return originalQuery.apply(this, [sql, options])
                    .then((result: any) => {
                        if (span) {
                            span.addContextSync(ScoutContextName.DBStatement, sqlText);
                            span.addContextSync(ScoutContextName.DBOperation, operation);
                            if (table) { span.addContextSync(ScoutContextName.DBModel, table); }
                        }
                        done();
                        return result;
                    })
                    .catch((err: any) => {
                        if (span) {
                            span.addContextSync(ScoutContextName.DBStatement, sqlText);
                            span.addContextSync(ScoutContextName.Error, "true");
                        }
                        done();
                        throw err;
                    });
            });
        };

        return sequelizeExport;
    }
}

export default new SequelizeIntegration();
