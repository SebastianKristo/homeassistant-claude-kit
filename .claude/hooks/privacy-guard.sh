#!/bin/bash
set -euo pipefail
# Privacy guard hook -- blocks Claude from reading sensitive files when privacy mode is active.
# Privacy mode is enabled by copying .claude/privacy-patterns.example to .claude/privacy-patterns.
# See PRIVACY.md for full documentation.

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
            # Substring match -- check if pattern appears in the tool arguments
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
