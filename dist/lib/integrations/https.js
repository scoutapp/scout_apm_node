"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("./http");
// Hook into the express and mongodb module
class HTTPSIntegration extends http_1.HTTPIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "https";
    }
}
exports.HTTPSIntegration = HTTPSIntegration;
exports.default = new HTTPSIntegration();
