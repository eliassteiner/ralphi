# 005 AI Model Config

## Summary

Completed configurable AI model support for Ralphi. The app now persists global settings in `data/settings.json`, exposes `GET/PUT /api/settings`, shows the active model in the top navigation/status panel, and records/displays the model used by each loop.

## Verification

- `node --check server.js` and `node --check app.js` passed.
- `docker compose config` passed.
- Isolated fixture verified `GET /api/settings` creates and returns default `{ "model": "gpt-5.5" }`.
- Isolated fixture verified invalid model names return HTTP 400.
- Isolated fixture verified `PUT /api/settings` with `{ "model": "o3" }` persists and survives server restart.
- Isolated fixture verified loop start returns `model: "o3"`, logs `Using model: o3`, and passes `CODEX_MODEL=o3` into a fake loop subprocess.
- Temporary live server verified `/ralphi/settings` returns HTTP 200.
- Temporary live server verified `/ralphi/api/settings` reads and updates settings.
- Static asset checks verified Settings route/form rendering code, nav model badge, loop list/detail model rendering, and mobile CSS rules are present.

## Decisions

- Settings are global for this spec; per-project model overrides remain optional and were not implemented.
- Model validation accepts letters, numbers, dots, dashes, underscores, and colons to avoid hard-coding a model allowlist.
- Loop records store the model at creation time so later settings changes only affect new loops.

## Issues

- The in-app browser connector had no available browser surface in this session. Visual verification used the temporary live server plus static route/CSS/UI assertions.
