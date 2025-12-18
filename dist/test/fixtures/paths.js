"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPRESS_APP_WITH_SCOUT_PATH = exports.EXPRESS_APP_PATH = exports.EJS_HTML5_BOILERPLATE = exports.PUG_HTML5_BOILERPLATE = void 0;
const path = __importStar(require("path"));
const app_root_dir_1 = require("app-root-dir");
exports.PUG_HTML5_BOILERPLATE = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/files/html5-boilerplate.pug"));
exports.EJS_HTML5_BOILERPLATE = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/files/html5-boilerplate.ejs"));
exports.EXPRESS_APP_PATH = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/applications/express-app.js"));
exports.EXPRESS_APP_WITH_SCOUT_PATH = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/applications/express-app-with-scout.js"));
