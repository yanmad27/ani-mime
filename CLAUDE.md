# Ani-Mime

A floating macOS desktop mascot (pixel dog) that reacts to terminal and Claude Code activity in real-time. Built with Tauri 2 + React 19.

## Quick Reference

- **Dev**: `bun run tauri dev`
- **Build**: `bun run tauri build`
- **Type check frontend**: `npx tsc --noEmit`
- **Type check backend**: `cd src-tauri && cargo check`
- **Package manager**: Bun (not npm/yarn)

## Architecture

See `docs/ARCHITECTURE.md` for full details. Key data flow:

```
Shell hooks (curl) → HTTP :1234 → Rust state → Tauri event → React UI
```

### Backend (`src-tauri/src/`)

| Module | Responsibility |
|--------|---------------|
| `lib.rs` | Tauri setup, plugin registration, composition root |
| `state.rs` | `AppState`, `Session`, `resolve_ui_state()`, `emit_if_changed()` |
| `server.rs` | HTTP server on `127.0.0.1:1234` (tiny_http) |
| `watchdog.rs` | Background thread: service→idle transition, stale session cleanup |
| `helpers.rs` | `now_secs()`, `get_query_param()` |
| `setup/mod.rs` | First-launch auto-setup orchestrator |
| `setup/shell.rs` | Shell detection, native dialogs, RC file injection |
| `setup/claude.rs` | Claude Code hooks configuration |
| `platform/macos.rs` | Cocoa/objc window transparency and workspace visibility |

### Frontend (`src/`)

| Module | Responsibility |
|--------|---------------|
| `App.tsx` | Root composition: layout + drag |
| `components/Mascot.tsx` | Sprite animation with auto-freeze |
| `components/StatusPill.tsx` | Colored dot + status label |
| `hooks/useStatus.ts` | Tauri `"status-changed"` event listener |
| `hooks/useDrag.ts` | Window drag via Tauri API |
| `constants/sprites.ts` | Sprite file map, frame counts, auto-stop set |
| `types/status.ts` | `Status` type, `SpriteConfig` interface |

### Status Priority

When multiple terminals are open, the UI shows one winner: `busy > service > idle > disconnected`

## Conventions

- **Rust**: Modules are flat files or directories with `mod.rs`. Shared state uses `Arc<Mutex<AppState>>`.
- **React**: Functional components, hooks for logic. No state management library — `useState` + Tauri events.
- **CSS**: Split by component (`styles/app.css`, `styles/mascot.css`, `styles/status-pill.css`). Uses CSS custom properties for sprite animation.
- **Types**: `Status` is the core shared type. Keep frontend and backend status strings in sync manually (no codegen yet).
- **Shell scripts**: One per shell (`terminal-mirror.{zsh,bash,fish}`). All use `curl` to talk to `:1234`.

## Important Details

- HTTP server runs on `127.0.0.1:1234` — this port is hardcoded in shell scripts, Claude hooks, and Rust server
- pid=0 is reserved for Claude Code hooks (virtual session)
- Heartbeats only refresh `last_seen` for non-busy sessions (prevents stuck commands from staying alive)
- Service state auto-transitions to idle after 2 seconds (watchdog)
- Sessions are removed after 40 seconds with no heartbeat
- Setup marker file: `~/.ani-mime/setup-done`
- macOS-only: uses `cocoa` + `objc` crates for window transparency (behind `#[cfg(target_os = "macos")]`)

## Adding Features

- **New UI state**: Update `Status` type → `sprites.ts` → `StatusPill.tsx` → `status-pill.css` → `resolve_ui_state()` in `state.rs`
- **New HTTP endpoint**: Add route in `server.rs`, lock `AppState` if mutating, call `emit_if_changed()`
- **New shell**: Add script in `src-tauri/script/`, add `ShellInfo` in `setup/shell.rs`, add to `tauri.conf.json` bundle resources
- **Storage**: See `docs/storage.md` for the planned approach (tauri-plugin-store for prefs, SQLite for history)
