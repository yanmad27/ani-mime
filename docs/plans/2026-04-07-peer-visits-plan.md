# Peer Dog Visits — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow Ani-Mime instances on the same LAN to discover each other via mDNS and send their dog to visit another user's screen.

**Architecture:** mDNS (`mdns-sd` crate) for zero-config peer discovery on LAN. Visit commands sent via HTTP POST to the peer's existing `tiny_http` server on port 1234. Frontend renders visiting dogs as additional sprites with slide animations.

**Tech Stack:** Rust (`mdns-sd`, `serde_json`), Tauri 2 commands + events, React 19, CSS animations.

**Design doc:** `docs/plans/2026-04-07-peer-visits-design.md`

---

### Task 1: Add `mdns-sd` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add the crate**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
mdns-sd = { version = "0.12", features = ["async"] }
```

> Note: Use 0.12.x which is the latest stable line. The `async` feature is optional but gives us `ServiceDaemon` which works great in sync threads too.

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "deps: add mdns-sd crate for LAN peer discovery"
```

---

### Task 2: Add state structs for peers and visitors

**Files:**
- Modify: `src-tauri/src/state.rs`

**Step 1: Add the new structs and fields**

Add these structs after `TaskCompleted` in `src-tauri/src/state.rs`:

```rust
/// A peer discovered via mDNS on the local network.
#[derive(Clone, Serialize)]
pub struct PeerInfo {
    pub instance_name: String,
    pub nickname: String,
    pub pet: String,
    pub ip: String,
    pub port: u16,
}

/// A dog currently visiting this screen.
#[derive(Clone, Serialize)]
pub struct VisitingDog {
    pub pet: String,
    pub nickname: String,
    pub arrived_at: u64,
    pub duration_secs: u64,
}
```

Add these fields to `AppState`:

```rust
pub struct AppState {
    pub sessions: HashMap<u32, Session>,
    pub current_ui: String,
    pub idle_since: u64,
    pub sleeping: bool,
    // --- Peer visits ---
    pub peers: HashMap<String, PeerInfo>,
    pub visitors: Vec<VisitingDog>,
    pub visiting: Option<String>,  // instance_name of peer we're visiting
}
```

**Step 2: Update AppState initialization in `lib.rs`**

In `src-tauri/src/lib.rs`, update the `AppState` constructor (around line 65):

```rust
let app_state = Arc::new(Mutex::new(AppState {
    sessions: HashMap::new(),
    current_ui: "searching".to_string(),
    idle_since: 0,
    sleeping: false,
    peers: HashMap::new(),
    visitors: Vec::new(),
    visiting: None,
}));
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (may warn about unused fields — that's fine for now)

**Step 4: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat: add PeerInfo, VisitingDog state structs for peer visits"
```

---

### Task 3: Implement mDNS discovery module

**Files:**
- Create: `src-tauri/src/discovery.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod discovery`, call on startup)

**Step 1: Create the discovery module**

Create `src-tauri/src/discovery.rs`:

```rust
use std::sync::{Arc, Mutex};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tauri::Emitter;

use crate::state::{AppState, PeerInfo};

const SERVICE_TYPE: &str = "_ani-mime._tcp.local.";
const VISIT_PORT: u16 = 1234;

/// Register this instance on the network and browse for peers.
pub fn start_discovery(
    app_handle: tauri::AppHandle,
    app_state: Arc<Mutex<AppState>>,
    nickname: String,
    pet: String,
) {
    std::thread::spawn(move || {
        let mdns = ServiceDaemon::new().expect("Failed to create mDNS daemon");

        // Register our service
        let host_name = hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let instance_name = format!("{}-{}", nickname, std::process::id());

        let properties = [
            ("nickname", nickname.as_str()),
            ("pet", pet.as_str()),
        ];

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &format!("{}.", host_name),
            "",
            VISIT_PORT,
            &properties[..],
        ).expect("Failed to create ServiceInfo");

        mdns.register(service_info.clone())
            .expect("Failed to register mDNS service");
        eprintln!("[discovery] registered as {}", instance_name);

        // Browse for peers
        let receiver = mdns.browse(SERVICE_TYPE)
            .expect("Failed to browse mDNS");

        let my_instance = instance_name.clone();

        loop {
            match receiver.recv() {
                Ok(event) => match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let peer_instance = info.get_fullname().to_string();
                        // Skip ourselves
                        if peer_instance.contains(&my_instance) {
                            continue;
                        }

                        let nickname = info.get_property_val_str("nickname")
                            .unwrap_or("Unknown")
                            .to_string();
                        let pet = info.get_property_val_str("pet")
                            .unwrap_or("rottweiler")
                            .to_string();
                        let ip = info.get_addresses().iter()
                            .next()
                            .map(|a| a.to_string())
                            .unwrap_or_default();
                        let port = info.get_port();

                        let peer = PeerInfo {
                            instance_name: peer_instance.clone(),
                            nickname,
                            pet,
                            ip,
                            port,
                        };

                        eprintln!("[discovery] found peer: {} at {}:{}", peer.nickname, peer.ip, peer.port);

                        let mut st = app_state.lock().unwrap();
                        st.peers.insert(peer_instance, peer);
                        let peers: Vec<PeerInfo> = st.peers.values().cloned().collect();
                        drop(st);

                        let _ = app_handle.emit("peers-changed", &peers);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        eprintln!("[discovery] peer removed: {}", fullname);

                        let mut st = app_state.lock().unwrap();
                        st.peers.remove(&fullname);
                        let peers: Vec<PeerInfo> = st.peers.values().cloned().collect();
                        drop(st);

                        let _ = app_handle.emit("peers-changed", &peers);
                    }
                    _ => {} // Ignore SearchStarted, SearchStopped
                },
                Err(_) => break, // Channel closed
            }
        }
    });
}
```

**Step 2: Register module and call on startup**

In `src-tauri/src/lib.rs`, add `mod discovery;` with the other module declarations (around line 7).

In the `setup` closure, after `watchdog::start_watchdog(...)` (around line 73), add:

```rust
// Start mDNS peer discovery
// TODO: Task 7 will load nickname/pet from store. For now use defaults.
discovery::start_discovery(
    app.handle().clone(),
    app_state.clone(),
    "Anonymous".to_string(),
    "rottweiler".to_string(),
);
```

**Step 3: Add hostname crate**

In `src-tauri/Cargo.toml`, add:

```toml
hostname = "0.4"
```

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

**Step 5: Manual test**

Run: `bun run tauri dev`
Expected: See `[discovery] registered as Anonymous-<pid>` in terminal output. If you run a second instance, both should discover each other.

**Step 6: Commit**

```bash
git add src-tauri/src/discovery.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add mDNS peer discovery via mdns-sd"
```

---

### Task 4: Add `/visit` and `/visit-end` HTTP routes

**Files:**
- Modify: `src-tauri/src/server.rs`

**Step 1: Add visit routes**

In `src-tauri/src/server.rs`, add these two route handlers inside the `for req in server.incoming_requests()` loop, before the debug endpoint (before line 82).

Add a helper to read the request body at the top of the file:

```rust
use std::io::Read as IoRead;
```

Add the routes:

```rust
            // --- Visit routes ---
            if url.starts_with("/visit") && !url.starts_with("/visit-end") {
                // Another dog is visiting us
                let mut body = String::new();
                let mut reader = req.as_reader();
                let _ = reader.read_to_string(&mut body);

                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&body) {
                    let pet = payload["pet"].as_str().unwrap_or("rottweiler").to_string();
                    let nickname = payload["nickname"].as_str().unwrap_or("Unknown").to_string();
                    let duration_secs = payload["duration_secs"].as_u64().unwrap_or(15);

                    let mut st = app_state.lock().unwrap();
                    st.visitors.push(crate::state::VisitingDog {
                        pet: pet.clone(),
                        nickname: nickname.clone(),
                        arrived_at: now,
                        duration_secs,
                    });
                    drop(st);

                    let _ = app_handle.emit("visitor-arrived", serde_json::json!({
                        "pet": pet,
                        "nickname": nickname,
                        "duration_secs": duration_secs,
                    }));
                    eprintln!("[visit] {} ({}) arrived for {}s", nickname, pet, duration_secs);
                }

                let resp = tiny_http::Response::from_string("ok")
                    .with_status_code(200)
                    .with_header(cors.clone());
                let _ = req.respond(resp);
                continue;
            }

            if url.starts_with("/visit-end") {
                // A visiting dog is leaving
                let mut body = String::new();
                let mut reader = req.as_reader();
                let _ = reader.read_to_string(&mut body);

                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&body) {
                    let nickname = payload["nickname"].as_str().unwrap_or("").to_string();

                    let mut st = app_state.lock().unwrap();
                    st.visitors.retain(|v| v.nickname != nickname);
                    drop(st);

                    let _ = app_handle.emit("visitor-left", serde_json::json!({
                        "nickname": nickname,
                    }));
                    eprintln!("[visit] {} left", nickname);
                }

                let resp = tiny_http::Response::from_string("ok")
                    .with_status_code(200)
                    .with_header(cors.clone());
                let _ = req.respond(resp);
                continue;
            }
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

**Step 3: Commit**

```bash
git add src-tauri/src/server.rs
git commit -m "feat: add /visit and /visit-end HTTP routes for peer visits"
```

---

### Task 5: Add visitor cleanup to watchdog

**Files:**
- Modify: `src-tauri/src/watchdog.rs`

**Step 1: Add visitor expiry logic**

In `src-tauri/src/watchdog.rs`, after the stale session removal block (after line 40), add:

```rust
        // Remove expired visitors
        let expired_visitors: Vec<String> = st.visitors
            .iter()
            .filter(|v| now - v.arrived_at >= v.duration_secs)
            .map(|v| v.nickname.clone())
            .collect();

        for nickname in &expired_visitors {
            eprintln!("[watchdog] visitor {} expired", nickname);
            let _ = app_handle.emit("visitor-left", serde_json::json!({
                "nickname": nickname,
            }));
        }

        if !expired_visitors.is_empty() {
            st.visitors.retain(|v| now - v.arrived_at < v.duration_secs);
        }
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

**Step 3: Commit**

```bash
git add src-tauri/src/watchdog.rs
git commit -m "feat: watchdog cleans up expired visiting dogs"
```

---

### Task 6: Add `start_visit` Tauri command + visit timer

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add the Tauri command**

In `src-tauri/src/lib.rs`, add a new Tauri command function before the `run()` function:

```rust
use std::sync::{Arc, Mutex};
use crate::state::AppState;

const VISIT_DURATION_SECS: u64 = 15;

#[tauri::command]
fn start_visit(
    peer_id: String,
    nickname: String,
    pet: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (ip, port) = {
        let st = state.lock().unwrap();

        // Already visiting someone
        if st.visiting.is_some() {
            return Err("Already visiting someone".to_string());
        }

        let peer = st.peers.get(&peer_id)
            .ok_or("Peer not found")?;
        (peer.ip.clone(), peer.port)
    };

    // Send visit request to peer
    let body = serde_json::json!({
        "pet": pet,
        "nickname": nickname,
        "duration_secs": VISIT_DURATION_SECS,
    });

    let url = format!("http://{}:{}/visit", ip, port);
    let client_result = std::thread::spawn(move || {
        ureq::post(&url)
            .send_json(&body)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }).join().map_err(|_| "Thread panicked")?;

    client_result.map_err(|e| format!("Failed to send visit: {}", e))?;

    // Mark ourselves as visiting
    {
        let mut st = state.lock().unwrap();
        st.visiting = Some(peer_id.clone());
    }
    let _ = app.emit("dog-away", true);

    // Schedule return
    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    let nickname_clone = nickname.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(VISIT_DURATION_SECS));

        // Send visit-end to peer
        let end_body = serde_json::json!({ "nickname": nickname_clone });
        if let Ok(peer_info) = {
            let st = state_clone.lock().unwrap();
            st.peers.get(&peer_id).cloned().ok_or(())
        } {
            let end_url = format!("http://{}:{}/visit-end", peer_info.ip, peer_info.port);
            let _ = ureq::post(&end_url).send_json(&end_body);
        }

        // Dog comes home
        let mut st = state_clone.lock().unwrap();
        st.visiting = None;
        drop(st);
        let _ = app_clone.emit("dog-away", false);
        eprintln!("[visit] dog returned home");
    });

    Ok(())
}
```

**Step 2: Add ureq dependency**

In `src-tauri/Cargo.toml`, add:

```toml
ureq = { version = "3", features = ["json"] }
```

> `ureq` is a minimal blocking HTTP client — perfect for sending a single POST from a thread. No async runtime needed.

**Step 3: Register the command and share state**

In `src-tauri/src/lib.rs`, inside the `setup` closure, after creating `app_state`, add:

```rust
app.manage(app_state.clone());
```

Then register the command in the Tauri builder (before `.run()`):

```rust
.invoke_handler(tauri::generate_handler![start_visit])
```

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add start_visit Tauri command with timed return"
```

---

### Task 7: Add nickname to Settings UI + store

**Files:**
- Modify: `src/components/Settings.tsx`
- Create: `src/hooks/useNickname.ts`

**Step 1: Create the useNickname hook**

Create `src/hooks/useNickname.ts`:

```typescript
import { useState, useLayoutEffect, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

const STORE_FILE = "settings.json";
const STORE_KEY = "nickname";

export function useNickname() {
  const [nickname, setNicknameState] = useState("");
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    load(STORE_FILE).then((store) => {
      store.get<string>(STORE_KEY).then((saved) => {
        setNicknameState(saved ?? "");
        setLoaded(true);
      });
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("nickname-changed", (event) => {
      setNicknameState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setNickname = async (next: string) => {
    setNicknameState(next);
    const store = await load(STORE_FILE);
    await store.set(STORE_KEY, next);
    await store.save();
    await emit("nickname-changed", next);
  };

  return { nickname, setNickname, loaded };
}
```

**Step 2: Add nickname field to Settings.tsx**

In `src/components/Settings.tsx`, import the hook:

```typescript
import { useNickname } from "../hooks/useNickname";
```

Inside the `Settings` component, add:

```typescript
const { nickname, setNickname } = useNickname();
```

Add a new section in the General tab, before the Appearance section (before the `<div className="settings-section">` with "Appearance"):

```tsx
<div className="settings-section">
  <div className="settings-section-title">Identity</div>
  <div className="settings-card">
    <div className="settings-row">
      <span className="settings-row-label">Nickname</span>
      <input
        type="text"
        className="settings-input"
        value={nickname}
        placeholder="Enter your name"
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
      />
    </div>
  </div>
</div>
```

**Step 3: Add input styling to settings.css**

In `src/styles/settings.css`, add:

```css
.settings-input {
  background: var(--bg-pill);
  border: 1px solid var(--border-pill);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  width: 160px;
}

.settings-input:focus {
  border-color: #5e5ce6;
}
```

**Step 4: Verify frontend compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/hooks/useNickname.ts src/components/Settings.tsx src/styles/settings.css
git commit -m "feat: add nickname setting for peer identity"
```

---

### Task 8: Add `"visiting"` status to frontend types

**Files:**
- Modify: `src/types/status.ts`
- Modify: `src/hooks/useStatus.ts`
- Modify: `src/constants/sprites.ts`
- Modify: `src/components/StatusPill.tsx`
- Modify: `src/styles/status-pill.css`

**Step 1: Update Status type**

In `src/types/status.ts`, add `"visiting"` to the union:

```typescript
export type Status =
  | "initializing"
  | "searching"
  | "idle"
  | "busy"
  | "service"
  | "disconnected"
  | "visiting";
```

**Step 2: Update useStatus.ts**

In `src/hooks/useStatus.ts`, add `"visiting"` to `validStatuses`:

```typescript
const validStatuses = new Set<string>([
  "initializing",
  "searching",
  "busy",
  "idle",
  "service",
  "disconnected",
  "visiting",
]);
```

Also add a listener for the `dog-away` event that overrides the status:

```typescript
export function useStatus(): Status {
  const [status, setStatus] = useState<Status>("initializing");
  const [away, setAway] = useState(false);

  useEffect(() => {
    const unlistenStatus = listen<string>("status-changed", (e) => {
      if (validStatuses.has(e.payload)) {
        setStatus(e.payload as Status);
      }
    });

    const unlistenAway = listen<boolean>("dog-away", (e) => {
      setAway(e.payload);
    });

    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenAway.then((fn) => fn());
    };
  }, []);

  return away ? "visiting" : status;
}
```

**Step 3: Update sprites.ts**

In `src/constants/sprites.ts`, add `visiting` to each pet's sprite map (reuse the `idle` sprite — the mascot will be hidden anyway):

In the `PetInfo` sprites, add to both pets:

```typescript
visiting: { file: "Sittiing.png", frames: 8 },  // for rottweiler
visiting: { file: "DalmatianSitting.png", frames: 8 },  // for dalmatian
```

**Step 4: Update StatusPill.tsx**

In `src/components/StatusPill.tsx`, add to `dotClassMap` and `labelMap`:

```typescript
visiting: "dot visiting",
```

```typescript
visiting: "Visiting...",
```

Note: The label will be enhanced in Task 10 to show the peer's nickname.

**Step 5: Add visiting dot style**

In `src/styles/status-pill.css`, add:

```css
.dot.visiting {
  background: #af52de;
  box-shadow: 0 0 6px rgba(175, 82, 222, 0.6);
  animation: pulse 1.5s ease-in-out infinite;
}
```

**Step 6: Verify frontend compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 7: Commit**

```bash
git add src/types/status.ts src/hooks/useStatus.ts src/constants/sprites.ts src/components/StatusPill.tsx src/styles/status-pill.css
git commit -m "feat: add visiting status type with purple dot indicator"
```

---

### Task 9: Create VisitorDog component

**Files:**
- Create: `src/components/VisitorDog.tsx`
- Create: `src/styles/visitor.css`
- Create: `src/hooks/useVisitors.ts`
- Modify: `src/App.tsx`

**Step 1: Create the useVisitors hook**

Create `src/hooks/useVisitors.ts`:

```typescript
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface Visitor {
  pet: string;
  nickname: string;
  duration_secs: number;
}

export function useVisitors() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);

  useEffect(() => {
    const unlistenArrived = listen<Visitor>("visitor-arrived", (e) => {
      setVisitors((prev) => [...prev, e.payload]);
    });

    const unlistenLeft = listen<{ nickname: string }>("visitor-left", (e) => {
      setVisitors((prev) => prev.filter((v) => v.nickname !== e.payload.nickname));
    });

    return () => {
      unlistenArrived.then((fn) => fn());
      unlistenLeft.then((fn) => fn());
    };
  }, []);

  return visitors;
}
```

**Step 2: Create the VisitorDog component**

Create `src/components/VisitorDog.tsx`:

```tsx
import { useState, useEffect } from "react";
import { getSpriteMap } from "../constants/sprites";
import type { Pet } from "../types/status";
import "../styles/visitor.css";

interface VisitorDogProps {
  pet: string;
  nickname: string;
  index: number;
}

export function VisitorDog({ pet, nickname, index }: VisitorDogProps) {
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const spriteMap = getSpriteMap(pet as Pet);
  const sprite = spriteMap.idle;
  const spriteUrl = new URL(
    `../assets/sprites/${sprite.file}`,
    import.meta.url
  ).href;

  const offset = index * 80;

  return (
    <div
      className={`visitor-dog ${entered ? "entered" : ""} ${leaving ? "leaving" : ""}`}
      style={{ "--visitor-offset": `${offset}px` } as React.CSSProperties}
    >
      <div className="visitor-name">{nickname}</div>
      <div
        className="visitor-sprite"
        style={{
          backgroundImage: `url(${spriteUrl})`,
          width: 96,
          height: 96,
          "--sprite-steps": sprite.frames,
          "--sprite-width": `${sprite.frames * 96}px`,
          "--sprite-duration": `${sprite.frames * 80}ms`,
        } as React.CSSProperties}
      />
    </div>
  );
}
```

**Step 3: Create visitor.css**

Create `src/styles/visitor.css`:

```css
.visitor-dog {
  position: absolute;
  bottom: 36px;
  right: calc(-110px - var(--visitor-offset));
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(200px);
  transition: transform 0.5s ease-out;
}

.visitor-dog.entered {
  transform: translateX(0);
}

.visitor-dog.leaving {
  transform: translateX(200px);
}

.visitor-name {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-pill);
  padding: 2px 8px;
  border-radius: 8px;
  margin-bottom: 2px;
  white-space: nowrap;
}

.visitor-sprite {
  image-rendering: pixelated;
  background-repeat: no-repeat;
  background-size: var(--sprite-width) 96px;
  animation: visitor-play var(--sprite-duration) steps(var(--sprite-steps), end) infinite;
  transform: scaleX(-1);
}

@keyframes visitor-play {
  from { background-position: 0 0; }
  to { background-position: calc(-1 * var(--sprite-width)) 0; }
}
```

> Note: `scaleX(-1)` flips the visiting dog to face the host dog. Visitors are 96px (slightly smaller than the 128px host).

**Step 4: Wire into App.tsx**

Update `src/App.tsx`:

```tsx
import { Mascot } from "./components/Mascot";
import { StatusPill } from "./components/StatusPill";
import { SpeechBubble } from "./components/SpeechBubble";
import { VisitorDog } from "./components/VisitorDog";
import { useStatus } from "./hooks/useStatus";
import { useDrag } from "./hooks/useDrag";
import { useTheme } from "./hooks/useTheme";
import { useBubble } from "./hooks/useBubble";
import { useVisitors } from "./hooks/useVisitors";
import "./styles/theme.css";
import "./styles/app.css";

function App() {
  const status = useStatus();
  const { dragging, onMouseDown } = useDrag();
  const { visible, message, dismiss } = useBubble();
  const visitors = useVisitors();
  useTheme();

  return (
    <div
      className={`container ${dragging ? "dragging" : ""}`}
      onMouseDown={onMouseDown}
    >
      <SpeechBubble visible={visible} message={message} onDismiss={dismiss} />
      {status !== "visiting" && <Mascot status={status} />}
      {status === "visiting" && <div style={{ width: 128, height: 128 }} />}
      <StatusPill status={status} glow={visible} />
      {visitors.map((v, i) => (
        <VisitorDog key={v.nickname} pet={v.pet} nickname={v.nickname} index={i} />
      ))}
    </div>
  );
}

export default App;
```

**Step 5: Verify frontend compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/components/VisitorDog.tsx src/styles/visitor.css src/hooks/useVisitors.ts src/App.tsx
git commit -m "feat: add VisitorDog component with slide-in animation"
```

---

### Task 10: Add right-click context menu for peer selection

**Files:**
- Modify: `src/App.tsx`
- Create: `src/hooks/usePeers.ts`

**Step 1: Create usePeers hook**

Create `src/hooks/usePeers.ts`:

```typescript
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface PeerInfo {
  instance_name: string;
  nickname: string;
  pet: string;
  ip: string;
  port: number;
}

export function usePeers() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  useEffect(() => {
    const unlisten = listen<PeerInfo[]>("peers-changed", (e) => {
      setPeers(e.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return peers;
}
```

**Step 2: Add context menu to App.tsx**

In `src/App.tsx`, add the context menu handler. Import `invoke` and `Menu`/`MenuItem`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { usePeers } from "./hooks/usePeers";
import { useNickname } from "./hooks/useNickname";
import { usePet } from "./hooks/usePet";
```

Add the hooks and handler inside `App()`:

```typescript
const peers = usePeers();
const { nickname } = useNickname();
const { pet } = usePet();

const onContextMenu = async (e: React.MouseEvent) => {
  e.preventDefault();

  if (status === "visiting") return;

  const items: MenuItem[] = [];

  if (peers.length === 0) {
    const item = await MenuItem.new({ id: "no-peers", text: "No peers nearby", enabled: false });
    items.push(item);
  } else {
    for (const peer of peers) {
      const peerId = peer.instance_name;
      const item = await MenuItem.new({
        id: peerId,
        text: `Visit ${peer.nickname} (${peer.pet})`,
        action: async () => {
          try {
            await invoke("start_visit", {
              peerId,
              nickname,
              pet,
            });
          } catch (err) {
            console.error("Visit failed:", err);
          }
        },
      });
      items.push(item);
    }
  }

  const menu = await Menu.new({ items });
  await menu.popup();
};
```

Add `onContextMenu` to the container div:

```tsx
<div
  className={`container ${dragging ? "dragging" : ""}`}
  onMouseDown={onMouseDown}
  onContextMenu={onContextMenu}
>
```

**Step 3: Verify frontend compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/App.tsx src/hooks/usePeers.ts
git commit -m "feat: add right-click context menu for peer visit selection"
```

---

### Task 11: Load nickname/pet in discovery from store

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/discovery.rs`

**Step 1: Load nickname and pet from store on startup**

In `src-tauri/src/lib.rs`, inside the `setup` closure, replace the placeholder discovery call with one that reads from the store:

```rust
// Load nickname/pet from store for mDNS registration
let discovery_handle = app.handle().clone();
let discovery_state = app_state.clone();
std::thread::spawn(move || {
    // Give the store plugin time to initialize
    std::thread::sleep(std::time::Duration::from_millis(500));

    let app_data_dir = discovery_handle.path().app_data_dir().unwrap();
    let store_path = app_data_dir.join("settings.json");
    let (nickname, pet) = if store_path.exists() {
        let content = std::fs::read_to_string(&store_path).unwrap_or_default();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
        let n = json["nickname"].as_str().unwrap_or("Anonymous").to_string();
        let p = json["pet"].as_str().unwrap_or("rottweiler").to_string();
        (n, p)
    } else {
        ("Anonymous".to_string(), "rottweiler".to_string())
    };

    discovery::start_discovery(discovery_handle, discovery_state, nickname, pet);
});
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: load nickname and pet from store for mDNS registration"
```

---

### Task 12: Expand the main window to fit visitors

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/styles/app.css`

**Step 1: Widen the main window**

In `src-tauri/tauri.conf.json`, update the main window dimensions to accommodate visitors stacking to the right:

```json
{
  "title": "Ani-Mime",
  "width": 500,
  "height": 220,
  "resizable": false,
  "fullscreen": false,
  "alwaysOnTop": true,
  "transparent": true,
  "decorations": false,
  "skipTaskbar": true
}
```

> The window is wider (500px) but transparent — only the sprites are visible. This gives room for ~3 visitor dogs to the right.

**Step 2: Adjust container layout**

In `src/styles/app.css`, update `.container` to position the main dog on the left:

```css
.container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  position: relative;
  padding-left: 20px;
}
```

**Step 3: Verify it compiles and looks correct**

Run: `bun run tauri dev`
Expected: window is wider but mascot stays in the same visual position (left-aligned). Transparent area to the right for visitors.

**Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src/styles/app.css
git commit -m "feat: widen main window to accommodate visiting dogs"
```

---

### Task 13: End-to-end manual test

**No files to modify — this is a verification task.**

**Step 1: Build and run two instances**

Run: `bun run tauri dev`

Then run a second instance from a different directory or machine on the same LAN.

**Step 2: Verify discovery**

Expected: Both instances log `[discovery] found peer: <nickname>` in their terminal output.

**Step 3: Verify visit**

1. Right-click the mascot on instance A
2. See instance B's nickname in the menu
3. Click it
4. Instance A: dog disappears, StatusPill shows "Visiting..." with purple dot
5. Instance B: a smaller dog slides in from the right with instance A's nickname label
6. After 15 seconds: instance A's dog reappears, instance B's visitor slides out

**Step 4: Verify multiple visitors**

Send visits from two instances to a third. Both visiting dogs should appear side by side.

**Step 5: Commit any fixes**

If any bugs found, fix and commit individually.

---

### Task 14: Final cleanup commit

**Step 1: Type check everything**

Run: `npx tsc --noEmit && cd src-tauri && cargo check`
Expected: no errors

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: peer dog visits via mDNS discovery and HTTP"
```
