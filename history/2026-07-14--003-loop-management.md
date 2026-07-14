# 003 Loop Management

## Summary

Completed and verified loop management for Ralphi. The app can start Ralph loops for observed projects, stream live logs over SSE, stop running loops, persist loop history, show project/all-loop history, and recover interrupted loops as failed on restart.

## Verification

- `node --check server.js` and `node --check app.js` passed.
- `docker compose config` passed.
- Existing Docker service was running healthy on port `8081`.
- Live container health check returned `ok`.
- Live container `GET /ralphi/api/projects` returned 24 projects including `ralphi`, `planed1`, and `vibes-proxy`.
- Live container `GET /ralphi/api/loops` returned valid JSON.
- Live container deep links `/ralphi/loops` and `/ralphi/projects/planed1` returned HTTP 200.
- Isolated fixture verified `POST /api/projects/planed1/loop/start` starts `./scripts/ralph-loop-codex.sh 1` as a subprocess in the project directory.
- Isolated fixture verified duplicate start for `planed1` returns HTTP 409 with `Loop laeuft bereits`.
- Isolated fixture verified `GET /api/loops`, `GET /api/loops/{id}`, `GET /api/loops/{id}/logs`, `GET /api/loops/{id}/stream`, and `POST /api/loops/{id}/stop`.
- Isolated fixture verified SSE log output includes stdout/stderr events and closes cleanly after stop.
- Isolated fixture verified stopped loop history and imported project state persist after server restart.
- Isolated fixture verified a loop running during restart is marked `failed` with a restart failure reason.
- Static UI smoke checks verified loop routes/assets, terminal CSS, stderr coloring, auto-scroll code path, loop history rendering, and start/stop/close-log handlers.

## Decisions

- Used a temporary fake `VIBES_ROOT` and fake `planed1` loop script for destructive loop tests, so no real Codex loop was launched and no other project was modified.
- No application code changes were required during this pass because the loop-management backend and frontend were already present and passed verification.
- Marked `specs/003-loop-management/spec.md` complete and incremented `NR_OF_TRIES` to 1.

## Issues

- No in-app browser instance or local browser binary was available for screenshot-based visual QA in this session. UI verification used live route checks plus frontend/CSS smoke checks.
