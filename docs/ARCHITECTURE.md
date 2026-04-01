# Tauri Status Pill — Architecture

## Overview

A floating macOS status pill that shows whether you're actively working in the terminal or free.
Uses **Manual Tagging + Heartbeat** — no process tree scanning, no time-based guessing.

```
┌─────────┐    HTTP    ┌─────────────┐   Tauri Events   ┌──────────┐
│   Zsh   │ ────────── │ Rust Server │ ──────────────── │  React   │
│  Hooks  │  :1234     │  + Watchdog │                   │   Pill   │
└─────────┘            └─────────────┘                   └──────────┘
```

---

## Layer 1: Zsh Script (`terminal-mirror.zsh`)

### Hooks

- **`preexec`** — fires before every command. Classifies the command and sends `busy`.
- **`precmd`** — fires when prompt returns. Sends `idle`.

### Command Classification (regex)

Zsh categorizes the command **before it runs**:

| Command         | Matches keyword | Type      |
| --------------- | --------------- | --------- |
| `yarn start`    | `start`         | `service` |
| `npm run dev`   | `run dev`       | `service` |
| `bun dev`       | `dev`           | `service` |
| `vite`          | no match        | `task`    |
| `metro start`   | `metro`         | `service` |
| `docker-compose up` | `docker-compose` + `up` | `service` |
| `sleep 60`      | no match        | `task`    |
| `make build`    | no match        | `task`    |
| `git push`      | no match        | `task`    |

**Service keywords:** `start`, `dev`, `serve`, `watch`, `metro`, `docker-compose`, `docker compose`, `up`, `run dev`, `run start`, `run serve`

### Heartbeat

A background loop sends `GET /heartbeat?pid=$$` every **20 seconds**.
This proves the terminal session is still alive even when idle.

### HTTP Signals

| Event         | URL                                         |
| ------------- | ------------------------------------------- |
| Command start | `/status?pid=$$&state=busy&type=task`       |
| Service start | `/status?pid=$$&state=busy&type=service`    |
| Command end   | `/status?pid=$$&state=idle`                 |
| Shell alive   | `/heartbeat?pid=$$` (every 20s)             |

---

## Layer 2: Rust Backend (`lib.rs`)

### Design Principles

- **No `sysinfo` crate.** No process tree scanning.
- **No time-based heuristics.** No grace periods or guessing.
- **Zsh tells Rust exactly what the command is.** Rust just reacts.

### Session Map

Tracks each shell PID independently: `HashMap<u32, Session>`

Each session stores:
- `busy_type` — `"task"`, `"service"`, or `""` (idle)
- `ui_state` — what this session is showing
- `last_seen` — last heartbeat/signal timestamp
- `service_since` — when service state started (for 2s auto-transition)

### HTTP Handler

| Receives                    | Session State |
| --------------------------- | ------------- |
| `state=busy&type=task`      | `"busy"`      |
| `state=busy&type=service`   | `"service"` + start 2s timer |
| `state=idle`                | `"idle"`      |
| `/heartbeat?pid=X`          | update `last_seen` |

### Multi-Session Priority

When multiple terminals are open, the **winning UI state** is resolved by priority:

```
busy > service > idle > disconnected
```

Example: Terminal A is `busy`, Terminal B is `idle` → UI shows `busy`.

### Watchdog (runs every 2 seconds)

1. **Service → Idle:** Any session in `"service"` for **2+ seconds** → auto-transition to `"idle"`.
2. **Stale removal:** Any session with no heartbeat for **40 seconds** → remove (terminal was closed/killed).
3. **All gone:** If all sessions removed → emit `"disconnected"`.

---

## Layer 3: React Frontend (`App.tsx` + `App.css`)

### UI States

| Status           | Color  | Animation    | Label        |
| ---------------- | ------ | ------------ | ------------ |
| **searching**    | Yellow | Pulse        | Searching... |
| **busy** (task)  | Red    | Pulse        | Working...   |
| **service**      | Blue   | Steady glow  | Service      |
| **idle**         | Green  | Steady       | Free         |
| **disconnected** | Gray   | None         | Sleep        |

---

## Example Flows

### `sleep 60` (regular command, 60 seconds)

```
0s   preexec → type=task → UI: busy (red)
...  pill stays red for the full 60 seconds
60s  precmd fires → UI: idle (green)
```

### `yarn start` (dev server)

```
0s   preexec → type=service → UI: service (blue)
2s   watchdog auto-transitions → UI: idle (green)
...  server keeps running, pill stays green
Ctrl+C → precmd fires → UI: idle (green)
```

### `git push` (short command, ~5s)

```
0s   preexec → type=task → UI: busy (red)
5s   precmd fires → UI: idle (green)
```

### `make build` (long build, ~45s)

```
0s   preexec → type=task → UI: busy (red)
...  pill stays red for 45 seconds
45s  precmd fires → UI: idle (green)
```

### Close terminal window (force kill)

```
heartbeat stops
... 40 seconds pass with no signal ...
watchdog removes session → UI: disconnected (gray)
```

### Two terminals open

```
Terminal A: runs `make build` → busy
Terminal B: idle
Resolved UI: busy (red) — busy wins over idle

Terminal A finishes → idle
Resolved UI: idle (green)
```

---

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript 5.8
- **Backend:** Tauri 2, `tiny_http` (HTTP server on port 1234)
- **Shell:** Zsh hooks (`preexec`, `precmd`, `add-zsh-hook`)
- **Package manager:** Bun
- **macOS native:** `cocoa` + `objc` crates for transparent window

---

## File Map

```
tauri-app/
├── src/
│   ├── App.tsx              # React pill component
│   ├── App.css              # Status dot colors + animations
│   └── main.tsx             # React entry point
├── src-tauri/
│   ├── Cargo.toml           # Rust dependencies
│   ├── src/
│   │   ├── lib.rs           # HTTP server + watchdog + macOS window setup
│   │   └── main.rs          # Tauri entry point
│   └── script/
│       └── terminal-mirror.zsh  # Zsh integration (sourced in .zshrc)
└── terminal-mirror.zsh      # Alternate copy with heartbeat
```
