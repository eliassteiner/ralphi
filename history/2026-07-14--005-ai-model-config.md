# 005 AI Model Config

## Summary

Completed and re-verified full provider configuration for Ralphi. The app persists `provider.name`, `provider.baseUrl`, `provider.apiKey`, `provider.api`, and `provider.model` in `data/settings.json`, exposes `GET/PUT /api/settings`, imports `~/.pi/agent/models.json` on first start when present, and displays provider/model in the settings UI plus loop list/detail views.

## Verification

- `node --check server.js` and `node --check app.js` passed.
- `docker compose config` passed.
- Isolated runtime verified first-start defaults: `wyna`, `http://100.85.99.127:9002/v1`, `not-needed`, `openai-completions`, `deepseek-v4-flash`.
- Isolated runtime verified `PUT /api/settings` persists provider values, normalizes trailing slashes, and survives server restart.
- Isolated runtime verified first-start pi-config import from a temporary `models.json`.
- Isolated fake project loop verified loop records include provider/model, loop logs `Provider: wyna | Model: deepseek-v4-flash`, and the subprocess receives `CODEX_MODEL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `RALPHI_PROVIDER_NAME`, and `RALPHI_PROVIDER_API`.
- Temporary live server verified `/ralphi/settings`, `/ralphi/app.js`, `/ralphi/styles.css`, and `/ralphi/api/settings` return successfully.
- Static UI assertions verified settings fields, Pi-config hint, responsive CSS marker, and loop provider/model render paths.

## Decisions

- Provider settings remain global; per-project provider overrides are intentionally out of scope.
- Existing loop records keep their recorded model/provider data so later settings changes only affect new loops.
- The legacy single-model settings shape is migrated to the provider object on load.

## Issues

- The in-app browser connector reported no available browser surfaces in this session. Visual verification used the temporary live server plus route, asset, CSS, and UI-render-path assertions.
