---
id: c3-202
c3-version: 4
title: Sprite Engine
type: component
category: foundation
parent: c3-2
goal: Animate pixel art characters using CSS sprite sheets with precise frame timing and auto-freeze optimization
summary: CSS steps() animation on horizontal sprite strips (128px frames), sprite registry mapping characters × statuses to sheet files, and visibility-based auto-freeze to save CPU
---

# Sprite Engine

## Goal

Animate pixel art characters using CSS sprite sheets with precise frame timing, supporting multiple characters and statuses, with auto-freeze when the window is not visible.

## Container Connection

The visual core of Ani-Mime. Without the sprite engine, there is no animated mascot — just a static image. It translates status strings into living pixel art.

## Animation Model

```mermaid
graph LR
  STATUS[Status String] --> REGISTRY[Sprite Registry]
  PET[Pet Selection] --> REGISTRY

  REGISTRY --> SHEET["Sprite Sheet File<br/>(e.g. RottweilerBark.png)"]
  REGISTRY --> FRAMES["Frame Count<br/>(e.g. 12)"]
  REGISTRY --> TIMING["Frame Duration<br/>(80ms)"]

  SHEET --> DIV["<div> with backgroundImage"]
  FRAMES --> CSS["CSS animation: steps(N)"]
  TIMING --> CSS

  CSS --> ANIM["@keyframes sprite-play<br/>0% → backgroundPosition: 0<br/>100% → backgroundPosition: -(N×128)px"]
```

| Parameter | Value |
|-----------|-------|
| Frame size | 128 × 128 pixels |
| Frame duration | 80ms per frame |
| Sheet layout | Horizontal strip (frames side by side) |
| Animation function | `steps(N)` where N = frame count |
| Total duration | N × 80ms (e.g. 12 frames = 960ms) |

## Sprite Registry

Maps `(character, status)` → `{ file, frames }`:

| Character | Statuses covered |
|-----------|-----------------|
| Rottweiler | initializing, searching, busy, service, idle, disconnected, visiting |
| Dalmatian | Same set |
| Samurai | Same set |
| Hancock | Same set |

## Auto-Freeze

When the mascot is not visible (e.g., app minimized or on different space), the CSS animation is paused to save CPU. Resumes when visible again using the Page Visibility API.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Status + pet selection | c3-201 Hooks Layer |
| IN (uses) | Sprite sheet PNG files | `public/sprites/` directory |
| OUT (provides) | Animated `<div>` element | c3-210 Mascot UI |

## Code References

| File | Purpose |
|------|---------|
| `src/constants/sprites.ts` | Sprite registry: character → status → { file, frames } |
| `src/components/Mascot.tsx` | Sprite rendering, CSS animation application, auto-freeze |
| `src/styles/mascot.css` | @keyframes sprite-play, steps() animation rules |
