import * as path from "path";

// Project root is calculated based on the file that is being required
// this *may not work* depending on method of node process launch
// and it *is* dependent on which file the line is performed from
//
// Travis CI does some monkey business with the path and there is an additonial 'node_modules' in the path
const PROJECT_ROOT = path.join(path.dirname(require!.main!.filename), process.env.CI ? "../../../../" : "../../../");

export const PUG_HTML5_BOILERPLATE = path.resolve(
    path.join(PROJECT_ROOT, "test/fixtures/files/html5-boilerplate.pug"),
);
