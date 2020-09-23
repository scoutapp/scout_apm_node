import * as path from "path";

import { get as getRootDir } from "app-root-dir";

export const PUG_HTML5_BOILERPLATE = path.resolve(
    path.join(getRootDir(), "test/fixtures/files/html5-boilerplate.pug"),
);

export const EJS_HTML5_BOILERPLATE = path.resolve(
    path.join(getRootDir(), "test/fixtures/files/html5-boilerplate.ejs"),
);

export const EXPRESS_APP_PATH = path.resolve(
    path.join(getRootDir(), "test/fixtures/applications/express-app.js"),
);

export const EXPRESS_APP_WITH_SCOUT_PATH = path.resolve(
    path.join(getRootDir(), "test/fixtures/applications/express-app-with-scout.js"),
);
