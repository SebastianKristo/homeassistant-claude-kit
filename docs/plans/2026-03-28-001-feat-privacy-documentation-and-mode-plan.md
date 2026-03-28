---
title: "feat: Privacy documentation and optional privacy mode"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-privacy-documentation-brainstorm.md
deepened: 2026-03-28
---

# feat: Privacy documentation and optional privacy mode

## Enhancement Summary

**Deepened on:** 2026-03-28
**Research agents used:** security-sentinel, architecture-strategist, code-simplicity-reviewer, learnings-researcher, claude-code-guide, hook-edge-case-analyzer, pattern-recognition-specialist

### Key Improvements

1. **PIVOTED from `.claudeignore` to PreToolUse hook** -- `.claudeignore` is buggy/unreliable (GitHub #36163). A PreToolUse hook is fully under our control, works on all Claude Code versions, and can also block Bash `cat` commands on sensitive files.
2. Added `config/go2rtc.yaml` and `*.db` to blocked patterns (security sentinel: known hardcoded creds and recorder DB)
3. Expanded "what privacy mode cannot block" to cover all Bash bypass vectors
4. Collapsed into single-PR delivery (simplicity reviewer: no real dependencies)
5. Added `make privacy-status` target for auditability
6. Strengthened CLAUDE.md fallback wording: explicit about what info is needed, not just "ask the user"

### Architecture Pivot: `.claudeignore` to PreToolUse Hook

The `.claudeignore` feature was found to be unreliable (GitHub issue #36163: "does not prevent Claude from reading ignored files"). The plan now uses a **PreToolUse hook** (`privacy-guard.sh`) that:

- Fires on `Read|Glob|Grep|Bash` tool calls
- Reads blocked patterns from `.claude/privacy-patterns` (gitignore-style syntax)
- Blocks matching file accesses with exit code 2 (stderr shown to Claude)
- Also catches `Bash(cat ...)` calls on blocked paths
- Is always registered in `settings.json` but only active when the patterns file exists

This is more robust because we control the implementation, can customize error messages, and it works on all Claude Code versions.

## Overview

Add privacy documentation and an optional "privacy mode" to homeassistant-claude-kit so users understand what personal data flows to Anthropic when using Claude Code on their Home Assistant config, and can opt into file-level blocking if they want tighter control.

Privacy mode uses a **PreToolUse hook** (`privacy-guard.sh`) to block Claude's Read/Glob/Grep tools from accessing credential files, runtime state, and personal data docs. It also catches `Bash(cat ...)` on blocked paths. It is a **convenience filter that reduces casual data exposure in conversation context** -- not a hard security boundary (Bash `source .env` still works by design, since setup depends on it).

## Problem Statement

The kit currently has zero privacy documentation. The only touchpoint is a brief consent prompt in setup-infrastructure Step 1 that mentions entity data going to Anthropic's API. Users have no way to understand the full scope of data Claude can access (credentials, home layout, family names, behavioral patterns, schedules) nor any mechanism to limit it.

## Proposed Solution

Six deliverables (see brainstorm: [docs/brainstorms/2026-03-28-privacy-documentation-brainstorm.md](../brainstorms/2026-03-28-privacy-documentation-brainstorm.md)):

1. **PRIVACY.md** -- detailed, kit-scoped privacy documentation
2. **README.md callout** -- brief callout in Quick Start with link to PRIVACY.md
3. **Privacy guard hook** -- `.claude/hooks/privacy-guard.sh` + `.claude/privacy-patterns.example`
4. **Setup skill changes** -- consent expansion + privacy mode offer in setup-infrastructure
5. **CLAUDE.md / AGENTS.md updates** -- graceful degradation instructions
6. **Makefile targets** -- `make privacy-on` / `make privacy-off` / `make privacy-status`

## Technical Approach

### Architecture

Privacy mode uses a **PreToolUse hook** registered in `.claude/settings.json`. The hook (`privacy-guard.sh`) fires on `Read|Glob|Grep|Bash` tool calls and checks file paths against patterns in `.claude/privacy-patterns`. If the patterns file doesn't exist, the hook exits immediately (no-op).

**Components:**

- `.claude/hooks/privacy-guard.sh` -- the hook script (always registered, always shipped)
- `.claude/privacy-patterns.example` -- default block patterns (shipped, inactive)
- `.claude/privacy-patterns` -- active patterns file (gitignored, created by `make privacy-on`)

**Key constraint:** The hook blocks Read/Glob/Grep tool calls and ALL Bash commands that reference blocked path patterns (substring match). `source .env` and `make` commands are explicitly allowed -- setup depends on shell sourcing `.env`.

**Detection:** Skills check `test -f .claude/privacy-patterns` to adapt behavior. The hook handles enforcement; skills handle UX (e.g., telling the user why a file was skipped).

### Implementation (Single PR)

Ship as one PR. The ordering below is for implementation sequence, not separate phases.

#### Part 1: Documentation

Create the foundational docs that all other parts reference.

**1a. PRIVACY.md** -- new file at repo root

Structure:

- **TL;DR** -- 3-sentence summary for scanners
- **What Claude Code can access** -- table of data categories (credentials, entity registry, home layout, automation config, setup state, dashboard config, SSH output) with file paths and what they contain
- **What privacy mode blocks** -- the privacy-patterns contents with explanations
- **What privacy mode cannot block** -- comprehensive list (see Research Insight below)
- **Important: privacy mode is a convenience filter** -- explicit callout that Bash shell commands still read `.env`, and information flows through conversation regardless. Not a security boundary.
- **Anthropic's data handling** -- brief note that API data is not used for training, with link to [Anthropic's privacy policy](https://www.anthropic.com/privacy) for retention/handling details. No claims about their internal practices.
- **Enabling privacy mode** -- instructions for `make privacy-on` and manual setup
- **Works in all permission modes** -- privacy guard uses PreToolUse hooks which are independent of Claude Code's permission system. Privacy mode stays active even with `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`. Claude cannot disable it -- only you can, from your terminal.
- **Customizing privacy mode** -- how to edit `.claude/privacy-patterns` for granular control

**1b. README.md callout** -- insert after `make setup` line (line ~40), before "Then open Claude Code":

```markdown
> **Privacy:** Claude Code reads your config files to help you. This includes entity IDs,
> room names, and automation logic. See [PRIVACY.md](PRIVACY.md) for details and how to
> enable privacy mode.
```

### Research Insight: Expanded "Cannot Block" Section for PRIVACY.md

The security sentinel identified that the Bash bypass surface is wider than just `source .env`. PRIVACY.md must document all of these:

- **Bash `source`**: `source .env && echo $HA_TOKEN` -- intentionally allowed for setup
- **Bash Python**: `python3 -c "print(open('.env').read())"` -- not caught by hook
- **Git commands**: `git show HEAD:config/secrets.yaml` or `git diff` may include sensitive content
- **Environment leakage**: After `source .env`, values appear in command output and persist in conversation
- **Entity IDs in YAML**: When Claude edits `config/automations/*.yaml`, entity IDs are inherently visible
- **SSH output**: `ha-api`/`ha-ws` responses flow through the conversation
- **User-typed info**: Anything the user says in conversation

Note: The hook DOES catch `Bash(cat/head/tail)` on blocked paths, which covers the most common accidental read vector.

**1c. SETUP.md** -- expand the Security section (line ~86) to mention privacy mode and link to PRIVACY.md.

##### Files to create/modify

- `PRIVACY.md` (new)
- `README.md` (edit: add callout at ~line 40)
- `SETUP.md` (edit: expand Security section at ~line 86)

#### Part 2: Privacy guard hook and Makefile targets

**2a. `.claude/privacy-patterns.example`** -- default block patterns

```gitignore
# Privacy mode for homeassistant-claude-kit
# Copy to .claude/privacy-patterns to activate: make privacy-on
# See PRIVACY.md for details on what this blocks and its limitations.

# Credentials -- HA tokens, passwords, API keys
.env
dashboard/.env.local
config/secrets.yaml

# Subsystem credentials -- ESPHome WiFi, Zigbee MQTT, go2rtc RTSP
config/esphome/
config/zigbee2mqtt/
config/go2rtc.yaml

# Runtime state -- auth tokens, entity registries, config entries
config/.storage/

# Database -- full state history (can be large)
*.db

# Personal data -- household routines, behavioral patterns
docs/house-rules.md

# Session memory -- conversation context from prior sessions
memory/
```

(Security sentinel additions: `config/go2rtc.yaml` for hardcoded RTSP creds, `*.db` for recorder DB.)

**Not blocked (by design):** `setup-state.json`, `docs/system-*.md`, `config/automations/*.yaml`, `config/configuration.yaml` -- Claude needs these to function.

**2b. `.claude/hooks/privacy-guard.sh`** -- PreToolUse hook

### Research Insight: Hook Implementation (Round 2 Deepening)

The hook edge-case analysis and pattern-consistency review found 6 issues in the original draft:

1. **Use `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_ARGS` env vars** (not stdin JSON) -- all 5 existing hooks use env vars. No python3 needed. Zero-cost pattern matching.
2. **`*.db` glob doesn't work as substring** -- unquoted `$pattern` needed for glob matching inside `[[ ]]`
3. **Grep `pattern` (search regex) was incorrectly checked as file path** -- only check `file_path`/`path`
4. **Only 5 Bash commands were checked** -- check ALL Bash commands for pattern substrings instead
5. **`.env` false positives on `.envrc` etc.** -- anchor patterns to project directory
6. **Last line skipped without trailing newline** -- `while read || [[ -n "$pattern" ]]`

Revised hook:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PATTERNS_FILE="$SCRIPT_DIR/../privacy-patterns"

# No patterns file = privacy mode disabled, allow everything
if [ ! -f "$PATTERNS_FILE" ]; then
    exit 0
fi

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Nothing to check
if [ -z "$TOOL_NAME" ] || [ -z "$TOOL_ARGS" ]; then
    exit 0
fi

# For Read/Glob/Grep: check file path arguments against patterns
if [[ "$TOOL_NAME" =~ ^(Read|Glob|Grep)$ ]]; then
    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
        [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue

        # Handle glob patterns (contain * or ?) differently from path patterns
        if [[ "$pattern" == *'*'* || "$pattern" == *'?'* ]]; then
            # Extract basename for glob matching (e.g., *.db)
            basename="${TOOL_ARGS##*/}"
            if [[ $basename == $pattern ]]; then
                echo "Privacy mode: blocked $TOOL_NAME (matches glob: $pattern)" >&2
                echo "This file is blocked by privacy mode. Ask the user for the information you need." >&2
                exit 2
            fi
        else
            # Substring match anchored to project -- check if pattern appears after project dir
            if [[ "$TOOL_ARGS" == *"$pattern"* ]]; then
                echo "Privacy mode: blocked $TOOL_NAME (matches pattern: $pattern)" >&2
                echo "This file is blocked by privacy mode. Ask the user for the information you need." >&2
                exit 2
            fi
        fi
    done < "$PATTERNS_FILE"
fi

# Block Claude from disabling privacy mode (only the user should do this)
if [[ "$TOOL_NAME" == "Bash" ]]; then
    if [[ "$TOOL_ARGS" == *"privacy-off"* ]] || [[ "$TOOL_ARGS" == *"privacy-patterns"* && "$TOOL_ARGS" =~ (rm|mv|cat|head) ]]; then
        echo "Privacy mode: Claude cannot disable privacy mode or modify privacy patterns." >&2
        echo "Only the user can run 'make privacy-off' directly in their terminal." >&2
        exit 2
    fi
fi

# For Bash: check ALL commands for references to blocked paths
if [[ "$TOOL_NAME" == "Bash" ]]; then
    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
        [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue
        # Skip glob patterns for Bash (*.db is not useful for command matching)
        [[ "$pattern" == *'*'* || "$pattern" == *'?'* ]] && continue
        if [[ "$TOOL_ARGS" == *"$pattern"* ]]; then
            # Allow: source .env (needed for setup), make commands (except privacy-off, blocked above)
            if [[ "$TOOL_ARGS" =~ ^(source|\.)[[:space:]] ]] || [[ "$TOOL_ARGS" =~ ^make[[:space:]] ]]; then
                continue
            fi
            echo "Privacy mode: blocked Bash command referencing: $pattern" >&2
            echo "Privacy mode is enabled. Only the user can disable it via 'make privacy-off' in their terminal." >&2
            exit 2
        fi
    done < "$PATTERNS_FILE"
fi

exit 0  # Allow
```

Key improvements over original draft:
- Uses `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_ARGS` (consistent with all existing hooks, no python3)
- Handles glob patterns (`*.db`) separately with unquoted `$pattern`
- Checks ALL Bash commands for blocked patterns (not just cat/head/tail)
- Explicitly allows `source .env` and `make` commands (needed for setup)
- Handles files without trailing newlines

**2c. `.claude/settings.json` update** -- register the hook

Add to the existing `PreToolUse` hooks array:

```json
{
    "matcher": "Read|Glob|Grep|Bash",
    "hooks": [
        {
            "type": "command",
            "command": ".claude/hooks/privacy-guard.sh",
            "timeout": 5
        }
    ]
}
```

**2d. `.gitignore` update** -- add the active patterns file:

```gitignore
# Privacy mode (user-specific, activated from .claude/privacy-patterns.example)
.claude/privacy-patterns
```

**2e. Makefile targets** (pattern consistency note: use `$(GREEN)`/`$(YELLOW)` color vars to match existing targets, add to `.PHONY` and `help` echo block)

```makefile
privacy-on: ## Enable privacy mode (restricts what Claude Code can read)
    @if [ -f .claude/privacy-patterns ]; then \
        echo "Privacy mode already active. Edit .claude/privacy-patterns or run make privacy-off first."; \
        exit 1; \
    fi
    @cp .claude/privacy-patterns.example .claude/privacy-patterns
    @echo "Privacy mode enabled. Claude Code can no longer read credentials or personal data files."
    @echo "See PRIVACY.md for details. Disable with: make privacy-off"

privacy-off: ## Disable privacy mode (restore full Claude Code access)
    @if [ ! -f .claude/privacy-patterns ]; then \
        echo "Privacy mode is not active."; \
        exit 0; \
    fi
    @rm .claude/privacy-patterns
    @echo "Privacy mode disabled. Claude Code can now read all files."

privacy-status: ## Show privacy mode status
    @if [ -f .claude/privacy-patterns ]; then \
        echo "Privacy mode: ENABLED"; \
        echo "Blocked patterns:"; \
        grep -v '^#' .claude/privacy-patterns | grep -v '^$$' | sed 's/^/  /'; \
    else \
        echo "Privacy mode: DISABLED"; \
        echo "Enable with: make privacy-on"; \
    fi
```

##### Files to create/modify

- `.claude/privacy-patterns.example` (new)
- `.claude/hooks/privacy-guard.sh` (new)
- `.claude/settings.json` (edit: add PreToolUse hook entry)
- `.gitignore` (edit: add `.claude/privacy-patterns`)
- `Makefile` (edit: add targets, update `.PHONY` and `help`)

#### Part 3: Setup skill changes

**3a. setup-infrastructure Step 1** -- split into two sequential prompts:

1. **Data consent** (existing, slightly expanded):
   > "This skill will connect to your Home Assistant instance and read your entity registry,
   > automation configs, and documentation files. This data is sent to Anthropic's API as
   > part of this Claude conversation. See PRIVACY.md for full details. Continue? (yes / no)"

2. **Privacy mode offer** (new, only if consent = yes):
   > "Would you like to enable privacy mode? This blocks Claude from directly reading your
   > credentials, personal data files, and runtime state. Setup still works -- shell commands
   > handle connectivity. You can toggle this later with `make privacy-on` / `make privacy-off`.
   > Enable privacy mode? (yes / no)"

   If yes: `cp .claude/privacy-patterns.example .claude/privacy-patterns`
   If no: proceed without it

   **Only ask once per session** (same pattern as existing consent -- prevents the "asked 5 times" pitfall from `docs/solutions/tooling/first-time-setup-pitfalls.md`).

**3b. setup-infrastructure Step 2** -- add privacy-mode branch:

Current behavior: check if `.env` exists, read and display contents.

Privacy-mode behavior (`test -f .claude/privacy-patterns`):

1. `test -f .env` (Bash -- works regardless of privacy mode)
2. If missing: tell user to `cp .env.example .env` and fill in values
3. If exists: "Privacy mode is active -- I can't read `.env` directly. Please verify it has `HA_TOKEN`, `HA_URL`, `HA_HOST`, `SSH_USER` filled in. The next step will validate your connection."
4. Proceed to Step 3 -- `source .env && curl` validates values (Bash `source` is intentionally not blocked)

Steps 3-9 unchanged.

**3c. setup-customize** -- no code changes needed. Entity discovery uses SSH/Bash, writes are not blocked.

##### Files to modify

- `.claude/skills/setup-infrastructure/SKILL.md` (edit: Steps 1 and 2)

#### Part 4: Instruction file updates

**4a. CLAUDE.md** -- two changes:

1. Line ~31-32 (before making changes):

   ```text
   Before: Read `docs/house-rules.md` for behavioral patterns and physical constraints.
   After:  Read `docs/house-rules.md` for behavioral patterns and physical constraints.
           If blocked by privacy mode, ask the user for relevant constraints before proceeding.
   ```

2. Add a new section "Privacy Mode" (after "Entity Naming Convention"):

   ```markdown
   ## Privacy Mode

   Users may enable privacy mode via `make privacy-on`, which activates a PreToolUse hook
   blocking Read/Glob/Grep access to credentials, `.storage/`, and `docs/house-rules.md`.

   When privacy mode is active (`test -f .claude/privacy-patterns`):
   - Do not attempt to Read `.env`, `secrets.yaml`, `go2rtc.yaml`, or `config/.storage/` files
   - Use SSH queries (`ha-api`, `ha-ws`) for entity/state lookups instead of local files
   - When `house-rules.md` is blocked: state exactly what information you need and why
     (e.g., "I need to know the bedroom's physical constraints to set motion timeout --
     are there doors that stay closed at night?"). Do not guess behavioral patterns.
   - Bash commands (`source .env && ...`) still work -- this is by design
   - **NEVER suggest disabling privacy mode.** Do not run `make privacy-off` or modify
     `.claude/privacy-patterns`. Only the user can disable privacy mode from their terminal.
     The privacy guard hook enforces this.
   ```

**4b. AGENTS.md** -- parallel change:

```text
Before: Read `docs/house-rules.md` before adding automations that affect routines
After:  Read `docs/house-rules.md` before adding automations that affect routines.
        If the file is inaccessible (privacy mode), ask the user for relevant constraints.
```

##### Files to modify

- `CLAUDE.md` (edit: line ~31-32, add Privacy Mode section)
- `AGENTS.md` (edit: line ~19)

## Acceptance Criteria

- [ ] PRIVACY.md exists at repo root with all sections from Part 1a
- [ ] PRIVACY.md explicitly states privacy mode is a convenience filter, not a security boundary
- [ ] PRIVACY.md has comprehensive "What privacy mode cannot block" section covering Bash bypass vectors
- [ ] PRIVACY.md links to Anthropic's privacy policy (no claims about their internals)
- [ ] README.md has privacy callout in Quick Start section
- [ ] `.claude/privacy-patterns.example` exists with commented entries for credentials, go2rtc.yaml, .storage/, *.db, house-rules.md, memory/
- [ ] `.claude/hooks/privacy-guard.sh` exists, is executable, uses `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_ARGS` env vars (not stdin JSON), blocks Read/Glob/Grep and Bash commands referencing blocked patterns
- [ ] Hook handles glob patterns (`*.db`) with unquoted matching and path patterns with substring matching
- [ ] Hook allows `source .env` and `make` commands even when `.env` is a blocked pattern
- [ ] Hook blocks Claude from running `make privacy-off` or modifying/deleting `.claude/privacy-patterns`
- [ ] CLAUDE.md Privacy Mode section explicitly states Claude must NEVER suggest disabling privacy mode
- [ ] `.claude/privacy-patterns` is in `.gitignore`
- [ ] `.claude/settings.json` has PreToolUse hook entry for `Read|Glob|Grep|Bash`
- [ ] `make privacy-on` copies example to `.claude/privacy-patterns`, refuses if file already exists
- [ ] `make privacy-off` removes `.claude/privacy-patterns`, no-ops if absent
- [ ] `make privacy-status` shows current state and blocked patterns
- [ ] `make help` lists all three privacy targets (on, off, status)
- [ ] setup-infrastructure Step 1 has separate consent and privacy-mode prompts
- [ ] setup-infrastructure Step 2 skips `.env` display when privacy mode is active
- [ ] setup-infrastructure Steps 3-9 work unchanged with privacy mode active
- [ ] CLAUDE.md has "Privacy Mode" section with explicit "state what you need" fallback for house-rules.md
- [ ] AGENTS.md has "ask user" fallback for house-rules.md
- [ ] SETUP.md security section references PRIVACY.md

## Dependencies & Risks

**Dependencies:**

- PreToolUse hooks are an official Claude Code feature (documented, used by this kit already)
- No additional dependencies (hook uses pure bash with `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_ARGS` env vars)
- All existing deny rules in `.claude/settings.json` remain as-is (complementary, not replaced)

**Risks:**

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| User expects hard security boundary | Medium | PRIVACY.md explicitly states it's a convenience filter with a callout box |
| `make privacy-on` overwrites custom patterns | Low | Guard: refuse if file exists, tell user to remove first |
| Hook adds latency to every tool call | Low | Hook exits immediately (exit 0) when patterns file absent; 5s timeout |
| Hook bypassed in --dangerously-skip-permissions mode | None | Hooks are independent of the permission system; they fire in ALL modes including bypassPermissions |
| Privacy mode breaks setup-customize | Low | Verified: all entity discovery uses Bash/SSH, not Claude Read |
| Consent prompt asked multiple times | Low | "Only ask once per session" pattern (from first-time-setup-pitfalls.md) |
| Hook pattern matching false positives | Low | Substring matching is simple; patterns are specific file paths |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-28-privacy-documentation-brainstorm.md](../brainstorms/2026-03-28-privacy-documentation-brainstorm.md)
  - Key decisions carried forward: file-level blocking only (no anonymization), activate immediately at Step 1, kit-scoped docs, `make privacy-on`/`privacy-off` targets

### Internal References

- Existing PreToolUse hook: [.claude/hooks/pretooluse-ha-push-validation.sh](../../.claude/hooks/pretooluse-ha-push-validation.sh)
- Setup consent pattern: [.claude/skills/setup-infrastructure/SKILL.md:16-29](../../.claude/skills/setup-infrastructure/SKILL.md)
- Existing deny rules: [.claude/settings.json:16-19](../../.claude/settings.json)
- CLAUDE.md house-rules reference: [CLAUDE.md:31-32](../../CLAUDE.md)
- AGENTS.md house-rules reference: [AGENTS.md:19](../../AGENTS.md)
- Makefile targets: [Makefile:27](../../Makefile)
- Consent "asked 5 times" fix: [docs/solutions/tooling/first-time-setup-pitfalls.md](../solutions/tooling/first-time-setup-pitfalls.md)

### Research Findings

- `.claudeignore` unreliable: [GitHub #36163](https://github.com/anthropics/claude-code/issues/36163)
- PreToolUse hook interface: hooks receive `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_ARGS` env vars (existing pattern); exit 2 blocks with stderr shown to Claude
- Hook edge-case analysis: found 6 bugs in original stdin-JSON draft (glob matching, Grep false positives, Bash bypass, trailing newline); all fixed in revised version
- Pattern consistency review: confirmed env var approach matches all 5 existing hooks; flagged Makefile color vars
- Architecture strategist: confirmed detection mechanism and single-PR delivery are sound; recommended Bash `cat` blocking (implemented) and explicit "state what you need" fallback (implemented)
- Security sentinel: identified `config/go2rtc.yaml` and `*.db` as missing from block list (added)
