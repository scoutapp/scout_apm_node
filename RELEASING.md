# Releasing

## Prerequisites

This repo uses **OIDC trusted publishing** — no `NPM_TOKEN` secret needed. Instead,
npmjs.com is configured to trust GitHub Actions tokens from this repository.

One-time setup (already done for this package):
- On npmjs.com: package → Settings → Trusted Publishers → add GitHub Actions publisher
  for `scoutapp/scout_apm_node`, workflow `publish.yml`.

## Steps

1. **Merge all changes to master** — the release commit should be on master.

2. **Bump the version in `package.json`** via a PR — do not push directly to master:
   ```sh
   git checkout -b chore/bump-version-0.2.4
   # Edit package.json "version" field, e.g. "0.2.3" → "0.2.4"
   git add package.json
   git commit -m "chore: bump version to 0.2.4"
   git push origin chore/bump-version-0.2.4
   # Open a PR, get approval, then merge to master
   ```

3. **Tag the merged master commit and push the tag**:
   ```sh
   git checkout master && git pull
   git tag v0.2.4
   git push origin v0.2.4
   ```

4. **The publish workflow fires automatically** on tag push. It runs `npm ci`,
   `npm run build`, `npm test`, then `npm publish` — authenticated via OIDC,
   no secrets required.

5. **Verify** at https://www.npmjs.com/package/@scout_apm/scout-apm

## Notes

- The tag must match `v*` (e.g. `v0.2.4`, `v1.0.0`).
- The version in `package.json` must match the tag (minus the `v` prefix) — npm uses
  the `package.json` version, not the tag name.
- To do a dry run locally: `npm publish --dry-run`
