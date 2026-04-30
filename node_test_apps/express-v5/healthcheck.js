const http = require("http");

const options = {
  host: "127.0.0.1",
  port: process.env.PORT || 3001,
  path: "/",
  timeout: 2000,
};

const req = http.request(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on("error", () => process.exit(1));
req.on("timeout", () => process.exit(1));
req.end();
