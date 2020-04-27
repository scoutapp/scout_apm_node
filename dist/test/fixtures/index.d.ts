import { ApplicationMetadata } from "../../lib/types";
import * as PATHS from "./paths";
export declare const FILE_PATHS: typeof PATHS;
export declare const APP_META: Partial<ApplicationMetadata>;
export declare const RESPONSES: {
    V1: {
        REGISTER: {
            COMPLETE: string;
            PARTIAL: string;
            CHUNKED: string[];
        };
    };
};
export declare const SQL_QUERIES: {
    SELECT_TIME: string;
    CREATE_STRING_KV_TABLE: string;
    INSERT_STRING_KV_TABLE: string;
    DROP_STRING_KV_TABLE: string;
};
export declare const MUSTACHE_TEMPLATES: {
    HELLO_WORLD: {
        template: string;
        defaultData: {};
        defaultResult: string;
    };
    HELLO_WORLD_INTERPOLATED: {
        template: string;
        defaultData: {
            name: string;
        };
        defaultResult: string;
    };
};
