import * as path from "path";
import { HTTPIntegration } from "./http";
import { ClientRequest } from "http";
import { RequestOptions } from "https";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout, DoneCallback, ScoutSpan, ScoutRequest } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class HTTPSIntegration extends HTTPIntegration {
    protected readonly packageName: string = "https";
}

export default new HTTPSIntegration();
