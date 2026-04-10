---
id: c3-111
c3-version: 4
title: Peer Discovery
type: component
category: feature
parent: c3-1
goal: Enable LAN peer discovery and dog visits between Ani-Mime instances using mDNS/Bonjour
summary: mdns-sd based service registration and browsing for _ani-mime._tcp.local, with HTTP-based visit protocol for sending dogs to peers
---

# Peer Discovery

## Goal

Enable LAN peer discovery and dog visits between Ani-Mime instances using mDNS/Bonjour, allowing developers to see each other's mascots visit their screen.

## Container Connection

Powers the social feature of Ani-Mime — without peer discovery, the app is isolated. Provides the peer list for the context menu "Visit" action and handles the visit protocol.

## Protocol

```mermaid
sequenceDiagram
  participant A as Instance A
  participant MDNS as mDNS (Bonjour)
  participant B as Instance B

  A->>MDNS: Register "alice-12345._ani-mime._tcp.local"
  B->>MDNS: Register "bob-99999._ani-mime._tcp.local"
  MDNS-->>A: Discover bob-99999
  MDNS-->>B: Discover alice-12345

  Note over A: User right-clicks → "Visit Bob"
  A->>B: POST /visit {nickname, pet, fromHost}
  B-->>B: emit("visitor-arrived")
  A-->>A: emit("dog-away", true)

  Note over A: 15 seconds later
  A->>B: POST /visit-end {fromHost}
  B-->>B: emit("visitor-left")
  A-->>A: emit("dog-away", false)
```

## mDNS Service

| Field | Value |
|-------|-------|
| Service type | `_ani-mime._tcp.local` |
| Instance name | `{nickname}-{port}` |
| Port | 1234 (or ANI_MIME_PORT) |
| TXT records | nickname, pet, version |

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Peer registry in AppState | c3-102 State Management |
| IN (uses) | Visit HTTP endpoints | c3-101 HTTP Server |
| OUT (provides) | Peer list + visit events | c3-2 React Frontend (usePeers, useVisitors hooks) |

## Code References

| File | Purpose |
|------|---------|
| `src-tauri/src/discovery.rs` | mDNS daemon, service registration, peer browsing, address detection |
| `src-tauri/src/lib.rs` | `start_visit` Tauri command, visit thread spawning |
