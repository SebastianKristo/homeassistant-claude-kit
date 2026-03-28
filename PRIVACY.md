# Privacy

## TL;DR

When you use Claude Code with this kit, Claude can read your Home Assistant config files -- entity IDs, room names, automation logic, and credentials. **Privacy mode** blocks Claude's file-reading tools from accessing sensitive files. It is a convenience filter, not a security boundary.

## What Claude Code Can Access

During any Claude Code session in this repository, Claude can read files using its built-in tools (Read, Glob, Grep) and execute shell commands (Bash). Here is what your config contains:

| Category | Files / Sources | Contains |
|----------|----------------|----------|
| Credentials | `.env`, `dashboard/.env.local`, `config/secrets.yaml` | HA tokens, host URLs, passwords |
| Subsystem credentials | `config/esphome/`, `config/zigbee2mqtt/`, `config/go2rtc.yaml` | WiFi passwords, MQTT creds, RTSP creds |
| Entity registry | SSH queries during setup, `config/.storage/` | Entity IDs, device names, area names |
| Home layout | `docs/house-rules.md`, `docs/system-*.md` | Room names, occupancy patterns, routines |
| Automation config | `config/automations/*.yaml` | Person entity IDs, schedules, presence logic |
| Setup state | `setup-state.json` | Interview answers, room mappings, preferences |
| Dashboard config | `dashboard/src/lib/entities.ts`, `areas.ts` | Person names, room assignments |
| SSH command output | `ha-api`/`ha-ws` responses | Live entity states, device info |
| Database | `*.db` files | Full state history (recorder) |

All data read by Claude during a session is sent to Anthropic's API for processing.

## Privacy Mode

Privacy mode uses a **PreToolUse hook** to block Claude's file-reading tools from accessing sensitive files. Enable it with one command:

```bash
make privacy-on
```

### What Privacy Mode Blocks

When active, the privacy guard hook blocks Claude's Read, Glob, and Grep tools -- plus common Bash file-reading commands -- from accessing these files:

| Pattern | Why |
|---------|-----|
| `.env` | HA access token, host URL, SSH credentials |
| `dashboard/.env.local` | Dashboard token (auto-generated) |
| `config/secrets.yaml` | HA secrets file |
| `config/esphome/` | ESPHome WiFi passwords, API keys |
| `config/zigbee2mqtt/` | Zigbee MQTT credentials |
| `config/go2rtc.yaml` | RTSP camera credentials (hardcoded -- Go can't parse `!secret`) |
| `config/.storage/` | Runtime state -- auth tokens, entity registries, config entries |
| `*.db` | Recorder database with full state history |
| `docs/house-rules.md` | Household routines, behavioral patterns, physical constraints |
| `memory/` | Claude session memory from prior conversations |

### What Privacy Mode Does NOT Block

Privacy mode is a **convenience filter that reduces casual data exposure** -- not a security boundary. These vectors remain:

- **`source .env`** -- intentionally allowed. Setup commands need shell access to `.env` for API/SSH validation. After sourcing, environment values may appear in command output.
- **Bash Python/scripting** -- `python3 -c "print(open('.env').read())"` is not caught by the hook.
- **Git commands** -- `git show HEAD:config/secrets.yaml` or `git diff` may include sensitive content from tracked files.
- **Entity IDs in YAML** -- when Claude edits `config/automations/*.yaml`, entity IDs (which may contain person names or room names) are inherently visible.
- **SSH output** -- `ha-api`/`ha-ws` query responses flow through the conversation.
- **User-typed info** -- anything you type in the conversation is sent to Anthropic.

The hook **does** catch `cat`, `head`, `tail`, and other common Bash file-reading commands on blocked paths, which covers the most common accidental read vector.

### Claude Cannot Disable Privacy Mode

The privacy guard hook blocks Claude from running `make privacy-off` or modifying the privacy patterns file. Only you can disable privacy mode by running `make privacy-off` directly in your terminal.

### Works in All Permission Modes

The privacy guard uses PreToolUse hooks, which are independent of Claude Code's permission system. Privacy mode stays active even with `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`. The hook fires on every tool call regardless of permission mode.

## Not Blocked (By Design)

These files remain accessible to Claude because it needs them to function:

- `setup-state.json` -- required for setup resume (contains room mappings, no credentials)
- `docs/system-*.md` -- Claude's primary reference for understanding your home
- `config/automations/*.yaml` -- Claude needs to read these to edit them
- `config/configuration.yaml` -- needed for helper definitions and template sensors

## Enabling Privacy Mode

```bash
# Enable (copies default patterns)
make privacy-on

# Check status
make privacy-status

# Disable (only run this in your terminal, not through Claude)
make privacy-off
```

Or manually: copy `.claude/privacy-patterns.example` to `.claude/privacy-patterns`.

## Customizing Privacy Mode

Edit `.claude/privacy-patterns` to add or remove blocked paths. The file uses simple pattern matching:

- **Path patterns** (e.g., `config/secrets.yaml`) -- matched as substrings against file paths
- **Glob patterns** (e.g., `*.db`) -- matched against filenames
- **Directory patterns** (e.g., `config/.storage/`) -- block all files under that directory
- Lines starting with `#` are comments

## Anthropic's Data Handling

This kit uses the Claude Code API. For details on how Anthropic handles API data (retention, training policy, security), see [Anthropic's Privacy Policy](https://www.anthropic.com/privacy).

This document describes what data the kit makes available to Claude. We make no claims about Anthropic's internal data practices -- refer to their official policy.
