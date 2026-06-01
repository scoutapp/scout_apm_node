# Releasing

## Prerequisites

The `NPM_TOKEN` secret must be set in the GitHub repository (Settings → Secrets → Actions).
Generate one at npmjs.com → Account → Access Tokens → New Token → **Automation** type.

## Steps

1. **Merge all changes to master** — the release commit should be on master.

2. **Bump the version in `package.json`**:
   ```sh
   # Edit package.json "version" field, e.g. "0.2.3" → "0.2.4"
   # Then commit:
   git add package.json
   git commit -m "chore: bump version to 0.2.4"
   git push origin master
   ```

3. **Tag the commit and push the tag**:
   ```sh
   git tag v0.2.4
   git push origin v0.2.4
   ```

4. **The publish workflow fires automatically** on tag push. It runs `yarn build` then
   `npm publish`, which puts `@scout_apm/scout-apm@0.2.4` on the npm registry
   (Yarn pulls from the same registry).

5. **Verify** at https://www.npmjs.com/package/@scout_apm/scout-apm

## Notes

- The tag must match `v*` (e.g. `v0.2.4`, `v1.0.0`).
- The version in `package.json` must match the tag (minus the `v` prefix) — npm uses
  the `package.json` version, not the tag name.
- To do a dry run locally: `npm publish --dry-run`
