# ralphi Constitution

> A web GUI for creating, planning and continuing Ralph Wiggum loops. Helps write better prompts and specs, shows what Ralph needs to do, and gets out of the way.

**Version:** 1.0.0
**Ralph Wiggum Commit:** 3f15f0fb83b8c2e0ac8d11abdae0e83ab8204981

---

## Context Detection

**Ralph Loop Mode** (started by `ralph-loop*.sh`):
- Pick highest priority incomplete spec from `specs/`
- Implement, test, commit, push
- Output `<promise>DONE</promise>` only when 100% complete
- Output `<promise>ALL_DONE</promise>` when no work remains

**Interactive Mode** (normal conversation):
- Be helpful, guide decisions, create specs

---

## Core Principles

- **Übersichtlich** — Clean, clear UI. Show status at a glance. No clutter.
- **Leicht halten** — Keep it simple. Minimal dependencies. YAGNI.
- **Ralph die Arbeit überlassen** — The GUI manages Ralph, it doesn't replace him. Show what Ralph sees and does. Help write better prompts and specs.

---

## Technical Stack

- **Docker** — Containerized deployment
- Web tech to be determined (keep it simple)

---

## Autonomy

YOLO Mode: ENABLED
Git Autonomy: ENABLED

---

## Specs

Specs live in `specs/` as markdown files. Pick the highest priority incomplete spec (lower number = higher priority). A spec is incomplete if it lacks `## Status: COMPLETE`.

Spec template: https://raw.githubusercontent.com/github/spec-kit/refs/heads/main/templates/spec-template.md

When all specs are complete, re-verify a random one before signaling done.

---

## NR_OF_TRIES

Track attempts per spec via `<!-- NR_OF_TRIES: N -->` at the bottom of the spec file. Increment each attempt. At 10+, the spec is too hard — split it into smaller specs.

---

## History

Append a 1-line summary to `history.md` after each spec completion. For details, create `history/YYYY-MM-DD--spec-name.md` with lessons learned, decisions made, and issues encountered. Check history before starting work on any spec.

---

## Completion Signal

All acceptance criteria verified, tests pass, changes committed and pushed → output `<promise>DONE</promise>`. Never output this until truly complete.

---

## Completion Logs

After each spec, create `completion_log/YYYY-MM-DD--HH-MM-SS--spec-name.md` with a brief summary.
