# Peer Dog Visits — Design Doc

## Summary

Allow multiple Ani-Mime instances on the same LAN to discover each other and send their dog to "visit" another user's screen. The visiting dog physically leaves the sender's screen and appears on the receiver's screen for a timed duration.

## User Flow

1. User sets a nickname in Settings (required for peer feature)
2. App registers itself on the network via mDNS (`_ani-mime._tcp.local`)
3. App continuously discovers other Ani-Mime instances on the LAN
4. User right-clicks the mascot, sees a list of online peers by nickname
5. User clicks a peer — their dog disappears from their screen
6. The dog appears on the peer's screen as a visitor (slide-in animation)
7. After 15 seconds, the visiting dog slides out and returns to the sender's screen
8. Multiple dogs can visit the same screen simultaneously

## Approach: mDNS Discovery + Direct HTTP

### Why mDNS

- macOS exempts mDNS (port 5353) from the firewall dialog — no extra permission prompt
- `mdns-sd` crate is pure Rust, actively maintained (v0.19.0), ~60 lines for registration + browsing
- Automatic discovery — no manual IP entry, no central server
- Works across machines on the same LAN

### Why HTTP for communication

- The app already runs an HTTP server on port 1234
- Adding `/visit` and `/visit-end` routes reuses existing infrastructure
- Simple request/response — no persistent connections needed

## Architecture

### Discovery (`src-tauri/src/discovery.rs`)

- Register mDNS service `_ani-mime._tcp.local` on port 1234
- TXT records: `nickname=<name>`, `pet=<rottweiler|dalmatian>`
- Browse continuously for other `_ani-mime._tcp` services
- Maintain `peers: HashMap<String, PeerInfo>` in `AppState`
- Emit `peers-changed` Tauri event on discovery/removal

### Visit Protocol

**Sender side:**
1. Tauri command `start_visit(peer_id)` triggered by context menu
2. `POST http://<peer_ip>:1234/visit` with `{ pet, nickname, duration_secs }`
3. Set `visiting = Some(peer_id)` in state
4. Emit status change — mascot hides on sender's screen
5. After `VISIT_DURATION_SECS` (15s), send `POST /visit-end` to peer
6. Clear `visiting` — mascot reappears

**Receiver side:**
1. `/visit` route → push `VisitingDog` to `visitors: Vec<VisitingDog>`
2. Emit `visitor-arrived { pet, nickname }` Tauri event
3. Frontend renders visiting dog sprite with slide-in animation
4. Watchdog cleans up expired visitors → emit `visitor-left`

### Data Flow

```
Sender                                 Receiver
──────                                 ────────
mDNS browse ──── discovers ──────────→ mDNS registered
Right-click → pick peer
POST /visit {pet, nickname} ─────────→ HTTP :1234 receives
Dog disappears (visiting state)        Visitor dog appears (slide-in)
    ... 15 seconds ...
POST /visit-end ─────────────────────→ HTTP :1234 receives
Dog reappears                          Visitor dog leaves (slide-out)
```

### State Changes

**AppState additions:**
- `peers: HashMap<String, PeerInfo>` — discovered peers
- `visitors: Vec<VisitingDog>` — dogs currently visiting this screen
- `visiting: Option<String>` — peer ID we're currently visiting

**PeerInfo:** `{ nickname, pet, ip, port }`

**VisitingDog:** `{ pet, nickname, arrived_at, duration_secs }`

### Frontend

- `VisitorDog.tsx` — renders visiting dog sprites, stacked horizontally (~100px offset)
- Right-click context menu via Tauri `Menu` API — lists peers by nickname
- Mascot hides when `visiting` is set, StatusPill shows "Visiting [name]..."
- `"visiting"` added to `Status` type
- Settings gets a "Nickname" text input field

## New Files

| File | Purpose |
|---|---|
| `src-tauri/src/discovery.rs` | mDNS registration + browsing |
| `src/components/VisitorDog.tsx` | Visiting dog renderer |
| `src/styles/visitor.css` | Visitor animations |

## Modified Files

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add `mdns-sd` dependency |
| `src-tauri/src/lib.rs` | Register discovery, add `start_visit` command, context menu |
| `src-tauri/src/server.rs` | Add `/visit` and `/visit-end` routes |
| `src-tauri/src/state.rs` | Add `visitors`, `visiting`, `PeerInfo`, `VisitingDog` |
| `src-tauri/src/watchdog.rs` | Clean up expired visitors |
| `src/App.tsx` | Render visitors, hide mascot when visiting |
| `src/types/status.ts` | Add `"visiting"` status |
| `src/constants/sprites.ts` | Handle `visiting` status |
| `src/components/Settings.tsx` | Add nickname field |
| `src/hooks/useStatus.ts` | Add `"visiting"` to valid statuses |

## Not In Scope

- No encryption/authentication between peers
- No persistent visit history
- No custom visit duration (hardcoded 15s)
- No "reject visit" — all visits accepted
- No cross-subnet discovery (LAN only)

## Dependencies

- `mdns-sd` (pure Rust, no C deps, ~60 LOC for integration)
