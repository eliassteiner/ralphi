# 002 Projekt Import

## Summary

Re-verified the completed project import feature and updated the spec verification checklist to reflect the passing checks.

## Verification

- `node --check server.js` and `node --check app.js` passed.
- `docker compose config` passed and confirmed the `/vibes` bind mount is read-only.
- `docker compose up -d --build` rebuilt the image and left `ralphi` running healthy.
- `GET /ralphi/api/projects` returned 24 projects including `ralphi`, `planed1`, and `vibes-proxy`.
- `GET /ralphi/api/projects/planed1` returned detail data with Ralph, Docker, Proxy, and imported state.
- `POST /ralphi/api/projects/planed1/unwatch` removed `planed1`; `POST /ralphi/api/projects/planed1/import` restored it.
- `GET /ralphi/api/projects/imported` returned valid JSON and reflected the watched projects.
- Encoded path traversal input `..%2F..%2Fetc` returned HTTP 400 with a JSON `message`.
- Static assets and API paths returned 200, with no 404s for `/ralphi/styles.css`, `/ralphi/app.js`, `/ralphi/favicon.svg`, or `/ralphi/api/projects/imported`.
- Headless Chrome via temporary `puppeteer-core` rendered `/ralphi/projects` and `/ralphi/projects/planed1` on desktop and mobile with no console warnings/errors, no missing responses, no horizontal overflow, 24 project cards, and five distinct badge colors.

## Decisions

- No application code changes were needed.
- Kept `planed1` in its original watched state after import/unwatch verification.
- Used temporary tooling under `/tmp/ralphi-puppeteer` to avoid adding repository dependencies.
