---
id: c3-301
c3-version: 4
title: Terminal Mirror
type: component
category: foundation
parent: c3-3
goal: Hook into zsh, bash, and fish command lifecycle to report terminal activity to the Rust backend via HTTP
summary: Three shell scripts (terminal-mirror.zsh/.bash/.fish) implementing preexec/precmd hooks, command classification (task vs service), heartbeat background loops, and curl-based HTTP reporting
---

# Terminal Mirror

## Goal

Hook into zsh, bash, and fish command lifecycle to report terminal activity (command start, command end, heartbeat) to the Rust backend via HTTP on port 1234.

## Container Connection

The primary data source for the backend. Without terminal mirror, the mascot has no awareness of terminal activity and stays in "disconnected" state.

## Hook Mechanism

```mermaid
graph TD
  subgraph "zsh"
    ZPE[preexec] -->|"command starts"| CLASSIFY
    ZPC[precmd] -->|"command ends"| IDLE
  end

  subgraph "bash"
    BDT[DEBUG trap] -->|"command starts"| CLASSIFY
    BPC[PROMPT_COMMAND] -->|"command ends"| IDLE
  end

  subgraph "fish"
    FPE[fish_preexec] -->|"command starts"| CLASSIFY
    FPC[fish_postexec] -->|"command ends"| IDLE
  end

  CLASSIFY{_tm_classify} -->|"matches dev/serve/watch..."| SERVICE["curl /status?state=busy&type=service"]
  CLASSIFY -->|"other commands"| TASK["curl /status?state=busy&type=task"]
  IDLE --> IDLE_REQ["curl /status?state=idle"]

  subgraph "Heartbeat (background)"
    HB["Loop: sleep 20s"] --> HBREQ["curl /heartbeat?pid=$$"]
    HBREQ --> HB
  end
```

## Command Classification

The `_tm_classify` function checks the command string against keyword lists:

| Type | Keywords (partial match) | Example |
|------|------------------------|---------|
| service | `dev`, `serve`, `start`, `watch`, `run`, `up` | `yarn dev`, `npm start` |
| task | Everything else | `git commit`, `cargo build` |

## Three-Shell Sync Rule

All three scripts must implement identical logic:
1. **Preexec**: classify command → POST /status with busy + type
2. **Precmd/postexec**: POST /status with idle
3. **Heartbeat**: background loop every 20s → GET /heartbeat
4. **PID**: use `$$` (shell PID) as session identifier

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Shell hook APIs | zsh (preexec/precmd), bash (DEBUG/PROMPT_COMMAND), fish (events) |
| OUT (provides) | HTTP activity signals | c3-101 HTTP Server |

## Code References

| File | Purpose |
|------|---------|
| `src-tauri/script/terminal-mirror.zsh` | zsh preexec/precmd hooks + heartbeat |
| `src-tauri/script/terminal-mirror.bash` | bash DEBUG trap + PROMPT_COMMAND hooks |
| `src-tauri/script/terminal-mirror.fish` | fish fish_preexec/fish_postexec events |
