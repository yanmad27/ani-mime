---
id: c3-3
c3-version: 4
title: Shell Integration
type: container
boundary: library
parent: c3-0
goal: Bridge developer terminal and Claude Code activity to the Rust backend via HTTP signals
summary: Shell hook scripts for zsh, bash, and fish that classify commands, report state transitions, and send heartbeats to port 1234, plus Claude Code hook scripts for AI activity tracking
---

# Shell Integration

## Goal

Bridge developer terminal activity (command execution, dev servers, idle state) and Claude Code activity to the Rust backend via HTTP signals on port 1234.

## Responsibilities

- Hook into shell command lifecycle (preexec/precmd for zsh, DEBUG/PROMPT_COMMAND for bash, events for fish)
- Classify commands as task vs. service (dev server detection by keyword matching)
- Report state transitions: idle → busy (preexec), busy → idle (precmd)
- Send periodic heartbeats (every 20s) to prevent session timeout
- Provide Claude Code hooks that report busy/idle with reserved pid=0
- Maintain identical behavior across all three shells

## Overview

```mermaid
graph LR
  subgraph "Terminal Session"
    ZSH[zsh hooks] --> CURL1[curl POST /status]
    BASH[bash hooks] --> CURL2[curl POST /status]
    FISH[fish hooks] --> CURL3[curl POST /status]
  end

  subgraph "Claude Code"
    PRE[PreToolUse hook] --> CURL4["curl /status?pid=0&state=busy"]
    STOP[Stop hook] --> CURL5["curl /status?pid=0&state=idle"]
  end

  CURL1 --> SERVER[Rust HTTP Server :1234]
  CURL2 --> SERVER
  CURL3 --> SERVER
  CURL4 --> SERVER
  CURL5 --> SERVER

  subgraph "Heartbeat (per terminal)"
    HB["Background loop every 20s"] --> CURL6["curl /heartbeat?pid=PID"]
    CURL6 --> SERVER
  end
```

## Complexity Assessment

**Level:** moderate
**Why:** Three shell languages with different hook mechanisms must produce identical behavior. Background heartbeat processes must be managed carefully (start on first command, don't duplicate). Command classification uses keyword matching which can have edge cases.

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-301 | [Terminal Mirror](c3-301-terminal-mirror.md) | foundation | active | Shell hook scripts (zsh/bash/fish) that classify and report terminal activity |
| c3-310 | [Claude Hooks](c3-310-claude-hooks.md) | feature | active | Claude Code integration via hook scripts using reserved pid=0 |

## Layer Constraints

This container operates within these boundaries:

**MUST:**
- Coordinate components within its boundary
- Define how context linkages are fulfilled internally
- Own its technology stack decisions

**MUST NOT:**
- Define system-wide policies (context responsibility)
- Implement business logic directly (component responsibility)
- Bypass refs for cross-cutting concerns
- Orchestrate other containers (context responsibility)
