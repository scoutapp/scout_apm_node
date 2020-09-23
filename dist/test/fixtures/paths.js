"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const app_root_dir_1 = require("app-root-dir");
exports.PUG_HTML5_BOILERPLATE = path.resolve(path.join(app_root_dir_1.get(), "test/fixtures/files/html5-boilerplate.pug"));
exports.EJS_HTML5_BOILERPLATE = path.resolve(path.join(app_root_dir_1.get(), "test/fixtures/files/html5-boilerplate.ejs"));
exports.EXPRESS_APP_PATH = path.resolve(path.join(app_root_dir_1.get(), "test/fixtures/applications/express-app.js"));
exports.EXPRESS_APP_WITH_SCOUT_PATH = path.resolve(path.join(app_root_dir_1.get(), "test/fixtures/applications/express-app-with-scout.js"));
