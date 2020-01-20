import * as path from "path";

import { get as getRootDir } from "app-root-dir";

export const PUG_HTML5_BOILERPLATE = path.resolve(
    path.join(getRootDir(), "test/fixtures/files/html5-boilerplate.pug"),
);
