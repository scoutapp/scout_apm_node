"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
// Project root is calculated based on the file that is being required
// this *may not work* depending on method of node process launch
const PROJECT_ROOT = path.join(path.dirname(require.main.filename), "../../../");
exports.PUG_HTML5_BOILERPLATE = path.resolve(path.join(PROJECT_ROOT, "test/fixtures/files/html5-boilerplate.pug"));
