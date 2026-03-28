# Brainstorm: Privacy Documentation & Privacy Mode

**Date:** 2026-03-28
**Status:** Draft

## What We're Building

Privacy documentation and an optional "privacy mode" for the homeassistant-claude-kit, so users understand what personal data flows to Anthropic when using Claude Code on their Home Assistant config, and can opt into file-level blocking if they want tighter control.

### Deliverables

1. **PRIVACY.md** — detailed privacy documentation covering what data the kit exposes to Claude, scoped to the kit itself (links to Anthropic's policy for their side)
2. **README.md privacy section** — brief summary with link to PRIVACY.md
3. **`.claudeignore.example`** — pre-built ignore file for privacy-sensitive files; not active by default
4. **Setup skill update** — setup-infrastructure asks if user wants to enable privacy mode (copies `.claudeignore.example` → `.claudeignore`)
5. **CLAUDE.md / AGENTS.md updates** — instructions handle graceful degradation when privacy mode blocks file access
6. **Skill updates** — setup-customize notes that `docs/house-rules.md` can't be re-read in privacy mode; setup-infrastructure adapts Steps 1-2

## Why This Approach

- **File-level blocking via `.claudeignore`** is simple, well-understood, and doesn't require anonymization complexity or per-field consent flows
- **`.claudeignore.example` + setup prompt** gives users an informed choice without degrading the default first-run experience (Claude needs to read `.env` during setup validation)
- **Kit-scoped documentation** avoids making claims about Anthropic's internal practices that could become stale; links to their official policy instead
- **Writing for both audiences** (experienced HA users + privacy skeptics) means scannable structure with enough depth for those who want it

## Key Decisions

1. **Privacy mode = file-level blocking only.** No anonymization, no per-field consent. `.claudeignore` prevents Claude from reading specified files. Limitation: entity IDs in automation YAML are still visible when Claude edits those files.

2. **Not active by default in the shipped repo.** Ships as `.claudeignore.example` (inactive). Setup skill offers to activate it at Step 1 (consent prompt) — users who opt in get privacy mode for their entire first session. Bash-based setup steps still work because `.claudeignore` only blocks Claude's Read/Glob/Grep tools, not shell commands.

3. **Documentation scope = what the kit does.** PRIVACY.md covers what data the kit makes available to Claude and how. For what Anthropic does with API data, we link to their privacy policy. This keeps the doc maintainable and accurate.

4. **Audience = both.** Scannable for experienced users (tables, TL;DR), detailed enough for skeptics (data flow descriptions, specific file lists, retention notes).

5. **Graceful degradation.** All skills and CLAUDE.md instructions must work when `.claudeignore` blocks files. Specifically: don't assume `docs/house-rules.md` or credentials are readable; use SSH queries as fallback for entity/state lookups; ask the user to provide values manually when a blocked file would have been useful.

## Data Categories (for PRIVACY.md)

### What Claude Can See (without privacy mode)

| Category | Files / Sources | Contains |
|----------|----------------|----------|
| **Credentials** | `.env`, `dashboard/.env.local`, `config/secrets.yaml` | HA tokens, host URLs, passwords |
| **Entity registry** | SSH queries during setup, `config/.storage/` if pulled | Entity IDs, device names, area names |
| **Home layout** | `docs/house-rules.md`, `docs/system-*.md` | Room names, occupancy patterns, routines |
| **Automation config** | `config/automations/*.yaml` | Person entity IDs, schedules, presence logic |
| **Setup state** | `setup-state.json` | Interview answers, room mappings, preferences |
| **Dashboard config** | `dashboard/src/lib/entities.ts`, `areas.ts` | Person names, room assignments |
| **SSH command output** | `ha-api`/`ha-ws` responses | Live entity states, device info |

### What `.claudeignore` Blocks (privacy mode)

```gitignore
# Credentials (repo root + config)
.env
dashboard/.env.local
config/secrets.yaml
config/esphome/
config/zigbee2mqtt/

# Runtime state with tokens/auth
config/.storage/

# Personal data
docs/house-rules.md
```

> **Note:** `setup-state.json` is intentionally NOT blocked — Claude needs it for setup resume. It contains room mappings and preferences but no credentials.

### What `.claudeignore` Cannot Block

- Entity IDs in automation YAML files Claude is asked to edit
- SSH command output (ha-api/ha-ws queries happen at runtime)
- Information the user types directly in conversation
- Area/room names embedded in generated config files

## Impact on Existing Skills

### How Skills Detect Privacy Mode

Skills check for the presence of `.claudeignore`: `test -f .claudeignore`. If it exists, privacy mode is active and skills should skip attempts to read blocked files. No need to try-and-catch — a simple file existence check is sufficient.

### Key Insight: `.claudeignore` vs Bash

`.claudeignore` blocks Claude's **Read/Glob/Grep tools** only. Bash commands like `source .env && curl...` still work because the **shell** reads the file, not Claude. This means most setup steps work unchanged — Claude just can't visually inspect `.env` contents.

### setup-infrastructure — Step-by-step Impact

| Step | What it does | Privacy mode impact | Change needed |
| ---- | ------------ | ------------------- | ------------- |
| 1 | Consent prompt | Add privacy mode opt-in, copy `.claudeignore` | **Yes** — expand consent, add privacy choice |
| 2 | Check/read `.env` | Can't read file contents to display/verify | **Yes** — tell user to verify values, skip display |
| 3 | `source .env && curl...` | Shell reads `.env`, not Claude → works fine | None |
| 4 | `source .env && ssh...` | Same — shell reads `.env` → works fine | None |
| 5 | Write `dashboard/.env.local` | Bash `cat >` still works | None |
| 6 | `make pull` | Makefile sources `.env` → works fine | None |
| 7 | Python venv | No `.env` dependency | None |
| 8 | SSH install tools | `source .env && ssh` → works fine | None |
| 9 | Write `setup-state.json` | `setup-state.json` NOT in `.claudeignore` → works | None |

**Summary:** Only Steps 1 and 2 need changes. The rest work because Bash shell reads are unaffected by `.claudeignore`.

**Step 2 adaptation (privacy mode):**

1. Check file exists: `test -f .env`
2. If missing: tell user to `cp .env.example .env` and fill in values
3. Do NOT attempt to read/display contents
4. Say: "I can't read .env in privacy mode. Please verify it has HA_TOKEN, HA_URL, HA_HOST, SSH_USER filled in."
5. Proceed to Step 3 — the curl test validates the values actually work

### setup-customize

- `setup-state.json` stays readable (NOT in `.claudeignore`) → resume works normally
- Entity discovery via SSH → unaffected
- Writes `docs/house-rules.md` → writing works, but Claude can't re-read in future sessions
- Generates `entities.ts`/`areas.ts` → writing works, can't re-read later

### CLAUDE.md / AGENTS.md

- "Read `docs/house-rules.md` before changes" → add: "if accessible (may be blocked by privacy mode)"
- Entity verification instructions → add SSH fallback when local files are blocked

## Resolved Questions

1. **`docs/system-*.md` NOT in `.claudeignore.example`.** They're Claude's primary reference for understanding the home. Room names alone aren't very sensitive. Blocking them would severely degrade advice quality.

2. **README: callout box + link.** A short privacy callout (3-4 lines) in the Quick Start section with a link to PRIVACY.md. No full subsection needed.

3. **Yes to `make privacy-on` / `make privacy-off`.** Simple cp/rm of `.claudeignore.example` → `.claudeignore`. Low effort, nice UX. Setup skill also offers this during first run.
