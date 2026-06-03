"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPRESS_APP_WITH_SCOUT_PATH = exports.EXPRESS_APP_PATH = exports.EJS_HTML5_BOILERPLATE = exports.PUG_HTML5_BOILERPLATE = void 0;
const path = require("path");
const app_root_dir_1 = require("app-root-dir");
exports.PUG_HTML5_BOILERPLATE = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/files/html5-boilerplate.pug"));
exports.EJS_HTML5_BOILERPLATE = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/files/html5-boilerplate.ejs"));
exports.EXPRESS_APP_PATH = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/applications/express-app.js"));
exports.EXPRESS_APP_WITH_SCOUT_PATH = path.resolve(path.join((0, app_root_dir_1.get)(), "test/fixtures/applications/express-app-with-scout.js"));
