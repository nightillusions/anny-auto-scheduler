# Anny Auto Scheduler Guidelines

## Project

- This is a dependency-free Manifest V3 Microsoft Edge extension for `https://anny.eu/planner`.
- Preserve the boundary between `src/bridge-main.js` (Main World network observation and authenticated requests) and `src/content.js` (isolated UI). Communicate only through validated `window.postMessage` messages.
- Keep recurrence calculations in `src/recurrence.js`. Preserve local wall-clock times and DST behavior; add or adjust focused `node:test` coverage for calculation or API-response parsing changes.
- Never persist, log, document, or commit bearer tokens, cookies, app keys, customer IDs, or other credentials.

## Validation

- Run `bun test`, `bun run check`, and `bun run package` after code changes. `node --test`, `node scripts/check.mjs`, and `node scripts/package.mjs` are equivalent when Bun is unavailable.
- Update `README.md` when user-visible behavior, installation, architecture, API assumptions, or security boundaries change. Update `PRIVACY.md` when data handling changes.
- Do not change generated `dist/` output manually; regenerate it with `bun run package`.

## Commits And Versions

- Complete each coherent feature, fix, its tests, and its related documentation in one commit. Do not include unrelated work or revert user changes.
- Classify the highest-impact change in the commit: `fix` for a backward-compatible correction, `feat` for a backward-compatible capability, and `breaking` for an incompatible change.
- After validation, create the commit with `bun run release -- <fix|feat|breaking> "short subject" <related-files...>`. The command bumps the matching Semantic Version in `package.json` and `manifest.json`, stages only the named files plus those version files, and commits them.
- Version policy: `fix` increments patch, `feat` increments minor and resets patch, `breaking` increments major and resets minor and patch. Use the highest-impact classification when a commit contains more than one kind of change.