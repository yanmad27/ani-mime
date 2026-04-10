---
id: c3-201
c3-version: 4
title: Hooks Layer
type: component
category: foundation
parent: c3-2
goal: Bridge Tauri backend events and persistent store into React state for UI rendering
summary: Custom React hooks (useStatus, usePeers, useVisitors, useBubble, useTheme, usePet, useNickname, useGlow, useDrag, useDevMode) that listen to Tauri events and manage frontend state
---

# Hooks Layer

## Goal

Bridge Tauri backend events and the persistent Tauri Store into React state, providing a clean API for UI components to consume status, peer, visitor, and preference data.

## Container Connection

All UI components depend on hooks for their data. Without this layer, there is no connection between backend events and React rendering.

## Hook Inventory

```mermaid
graph LR
  subgraph "Tauri Events"
    E1[status-changed]
    E2[task-completed]
    E3[visitor-arrived]
    E4[visitor-left]
    E5[peers-changed]
    E6[dog-away]
    E7[discovery-hint]
    E8[scenario-override]
  end

  subgraph "Hooks"
    H1[useStatus]
    H2[useBubble]
    H3[useVisitors]
    H4[usePeers]
  end

  E1 --> H1
  E6 --> H1
  E8 --> H1
  E2 --> H2
  E7 --> H2
  E3 --> H3
  E4 --> H3
  E5 --> H4

  subgraph "Store Hooks"
    H5[useTheme]
    H6[usePet]
    H7[useNickname]
    H8[useGlow]
  end

  STORE[(Tauri Store)] --> H5
  STORE --> H6
  STORE --> H7
  STORE --> H8
```

| Hook | Source | Returns | Used By |
|------|--------|---------|---------|
| `useStatus()` | `status-changed`, `dog-away`, `scenario-override` events | Current display status string | Mascot, StatusPill |
| `usePeers()` | `peers-changed` event | Array of discovered peers | Context menu |
| `useVisitors()` | `visitor-arrived`, `visitor-left` events | Array of visiting dogs | VisitorDog components |
| `useBubble()` | `task-completed`, `discovery-hint` events | { visible, message } | SpeechBubble |
| `useTheme()` | Tauri Store + `theme-changed` event | [theme, setTheme] | Settings, CSS variables |
| `usePet()` | Tauri Store + `pet-changed` event | [pet, setPet] | Mascot sprite selection |
| `useNickname()` | Tauri Store + `nickname-changed` event | [nickname, setNickname] | Settings, visit protocol |
| `useGlow()` | Tauri Store + `glow-changed` event | [glowMode, setGlowMode] | CSS glow effects |
| `useDrag()` | Native Tauri `startDragging()` | onMouseDown handler | Main window |
| `useDevMode()` | Session state (10× version click) | boolean | Superpower access |

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Tauri events | c3-1 Rust Backend (event bus) |
| IN (uses) | Persistent settings | Tauri Store (settings.json on disk) |
| OUT (provides) | Reactive state | c3-210 Mascot UI, c3-211 Settings |

## Code References

| File | Purpose |
|------|---------|
| `src/hooks/useStatus.ts` | Status resolution from events |
| `src/hooks/usePeers.ts` | Peer list management |
| `src/hooks/useVisitors.ts` | Visitor tracking |
| `src/hooks/useBubble.ts` | Speech bubble trigger logic |
| `src/hooks/useTheme.ts` | Theme persistence |
| `src/hooks/usePet.ts` | Pet selection persistence |
| `src/hooks/useNickname.ts` | Nickname persistence |
| `src/hooks/useGlow.ts` | Glow mode persistence |
| `src/hooks/useDrag.ts` | Window drag handler |
| `src/hooks/useDevMode.ts` | Dev mode toggle |
