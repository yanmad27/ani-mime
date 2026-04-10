---
id: c3-112
c3-version: 4
title: Setup Flow
type: component
category: feature
parent: c3-1
goal: Auto-configure shell hooks and Claude Code hooks on first launch with native macOS dialogs
summary: First-launch detection, shell RC file injection, Claude settings.json hook configuration, and native osascript dialog prompts
---

# Setup Flow

## Goal

Auto-configure shell hooks and Claude Code hooks on first launch, guiding the user through native macOS dialogs to select which shells to integrate and whether to enable Claude tracking.

## Container Connection

Without setup, no shell hooks are installed and no signals reach the backend. This component bridges the gap between "app installed" and "app receiving terminal activity."

## Flow

```mermaid
graph TD
  START[App Launch] --> CHECK{~/.ani-mime/setup-done?}
  CHECK -->|Exists| SKIP[Skip setup]
  CHECK -->|Missing| DETECT[Detect installed shells]

  DETECT --> DIALOG{Show native dialog}
  DIALOG -->|"Single shell"| YESNO["Yes/Skip dialog"]
  DIALOG -->|"Multiple shells"| LIST["Choose from list dialog"]

  YESNO --> INJECT[Inject source line into RC file]
  LIST --> INJECT

  INJECT --> CLAUDE{Detect Claude Code}
  CLAUDE -->|Found| ASKC["Allow Claude tracking?"]
  CLAUDE -->|Not found| PREC["Pre-configure hooks?"]

  ASKC --> HOOKS[Write ~/.claude/settings.json hooks]
  PREC --> HOOKS

  HOOKS --> MARKER[Write ~/.ani-mime/setup-done]
  MARKER --> RESTART["Show 'restart terminal' dialog"]
```

## What Gets Injected

| Target | Injection |
|--------|----------|
| `~/.zshrc` | `source "/Applications/ani-mime.app/.../terminal-mirror.zsh"` |
| `~/.bashrc` | `source "/Applications/ani-mime.app/.../terminal-mirror.bash"` |
| `~/.config/fish/config.fish` | `source "/Applications/ani-mime.app/.../terminal-mirror.fish"` |
| `~/.claude/settings.json` | PreToolUse, Stop, SessionEnd hooks with curl commands |

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Shell detection, RC file paths | Host filesystem |
| OUT (provides) | Configured shell hooks | c3-301 Terminal Mirror (enabled via sourcing) |
| OUT (provides) | Configured Claude hooks | c3-310 Claude Hooks (enabled via settings.json) |

## Code References

| File | Purpose |
|------|---------|
| `src-tauri/src/setup/shell.rs` | Shell detection, RC file editing, native dialog prompts |
| `src-tauri/src/setup/claude.rs` | Claude Code detection, settings.json hook migration |
