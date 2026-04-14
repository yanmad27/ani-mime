# Editable Smart-Import Mimes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the user clicks "Edit" on a mime that was created via Smart Import, re-open the Smart Import editor pre-populated with the original sprite sheet and the saved per-status frame-range assignments, so they can tweak the slicing without starting over. Mimes created via Manual upload or imported from `.animime` continue to use the Manual editor.

**Architecture:**
- Persist the processed source sprite sheet alongside the 7 status strips (`<appDataDir>/custom-sprites/<id>-source.png`) and save the per-status frame-range strings (e.g. `"1-5"`) as metadata on the stored mime.
- A mime only gets `smartImportMeta` if it was created (or re-saved) through Smart Import. Manual-created and `.animime`-imported mimes never set the field, so they continue to route to the existing Manual editor on Edit — no backwards-compat migration is required for pre-existing records.
- Extend `useCustomMimes` with `addMimeFromBlobs(..., smartImportMeta?)` and a new `updateMimeFromSmartImport(...)`. Extend `SmartImport` with edit-mode props (`initialName`, `initialFrameInputs`, `editingId`) and a new `onSave` signature that hands back the processed sheet bytes and the frame inputs.

**Tech Stack:** TypeScript, React 19, Tauri 2 (`plugin-fs`, `plugin-store`, `api/event`), Vitest + React Testing Library for unit tests, Playwright for e2e.

**Data migration stance (read this before implementing):**

The store schema is forward-compatible by construction — `smartImportMeta` is optional, so tauri-plugin-store deserializing a pre-existing `customMimes` entry just leaves the field `undefined` and the existing edit-routing code (`if (mime.smartImportMeta) ... else fall back to Manual`) handles legacy entries transparently. No migration code, no schema version bump.

What the plan deliberately does **not** do:
- **Grandfathering legacy smart-import mimes is impossible in a meaningful sense.** A pre-existing smart-import mime doesn't have its source sheet on disk, so there is no way to re-open the Smart Import editor for it with real data. Synthesizing a fake source from the 7 output strips would let the editor render, but the strips are already normalized 128×128 frames — re-slicing them produces no new information. Legacy smart-import mimes therefore route to the Manual editor on Edit. Users who want to regain Smart Import editability can delete and re-create the mime. This is a one-time UX paper cut acceptable given the small user base for the feature.
- **No origin flag** (e.g. `source: "manual" | "smart" | "animime" | "legacy"`). Considered and rejected: it would let us show a softer copy in the Manual editor for legacy smart-import mimes ("Source sheet wasn't saved — recreate via Smart Import to regain re-slicing"), but it costs a persistent string field on every mime and non-trivial UI copy for a transient grandfathering problem. Mentioned again in the Notes section so a future reader can opt in if the migration gap becomes painful in practice.

Specific failure modes we explicitly tolerate:
- **Downgrade is lossy.** If a user installs a pre-feature build after creating a mime with `smartImportMeta`, the old hook's save path reconstructs `customMimes` from its own in-memory type (which has no `smartImportMeta`), so any subsequent save in the old build will drop the field. On re-upgrade the mime is permanently grandfathered to Manual editing and the `-source.png` file is an orphan on disk. Acceptable — downgrade is not a supported path.
- **Partial-write atomicity is best-effort, not transactional.** `updateMimeFromSmartImport` writes 7 strips + 1 sheet sequentially, then calls `saveMimes` (which persists the store + emits the change event). If any `writeFile` throws mid-sequence, some strips have new pixels while the store still reflects the old `frames` counts — a corrupted mime until manually re-saved. `addMimeFromBlobs` already has this property pre-feature. A proper fix (temp-write + atomic rename, or write-ahead log) is out of scope.

**Out of scope for this plan:**
- Changing the `.animime` export/import format — those stay lossy (strips only, no source sheet, no meta).
- Editing sprite-sheet rendering or the strip generator (`createStripFromFrames`) — reused unchanged.
- Edit entry point UX polish (e.g. a "Re-slice" vs "Edit manually" chooser on the edit button) — we use the simple "route based on presence of meta" rule.
- Origin tracking (`source` field on `CustomMimeData`) — see Notes for future work.
- Atomic multi-file writes — see Notes for future work.

---

## Task 1: Extend `CustomMimeData` with optional `smartImportMeta`

**Files:**
- Modify: `src/types/status.ts`

**Step 1: Edit the type**

Replace the existing `CustomMimeData` interface (`src/types/status.ts:30-34`) with:

```ts
export interface SmartImportMeta {
  /** File name (within custom-sprites dir) of the processed source sheet PNG */
  sheetFileName: string;
  /** User-assigned frame-range strings keyed by status, e.g. "1-5", "6,7,8" */
  frameInputs: Record<Status, string>;
}

export interface CustomMimeData {
  id: string;
  name: string;
  sprites: Record<Status, { fileName: string; frames: number }>;
  /** Present only for mimes created via Smart Import. Lets us re-open them in the Smart Import editor. */
  smartImportMeta?: SmartImportMeta;
}
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors. (The field is optional so every existing consumer still compiles.)

**Step 3: Commit**

```bash
git add src/types/status.ts
git commit -m "feat(types): add SmartImportMeta field to CustomMimeData"
```

---

## Task 2: `addMimeFromBlobs` persists optional Smart Import meta

**Files:**
- Modify: `src/hooks/useCustomMimes.ts:111-137`
- Test: `src/__tests__/hooks/useCustomMimes.test.ts`

**Step 1: Write the failing test**

Append inside the `describe("useCustomMimes", ...)` block in `src/__tests__/hooks/useCustomMimes.test.ts`:

```ts
it("addMimeFromBlobs writes source sheet + stores meta when smartImportMeta provided", async () => {
  vi.mocked(exists).mockResolvedValue(true);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});

  const frameInputs: Record<string, string> = {};
  for (const status of ALL_STATUSES) frameInputs[status] = "1-3";

  let returnedId: string | undefined;
  await act(async () => {
    returnedId = await result.current.addMimeFromBlobs(
      "SmartMime",
      makeBlobsRecord() as any,
      {
        sheetBlob: new Uint8Array([9, 9, 9]),
        frameInputs: frameInputs as Record<
          import("../../types/status").Status,
          string
        >,
      }
    );
  });

  // 7 status strips + 1 source sheet = 8 writes
  expect(writeFile).toHaveBeenCalledTimes(ALL_STATUSES.length + 1);

  // Exactly one of the writes targets the <id>-source.png path
  const sheetCall = vi
    .mocked(writeFile)
    .mock.calls.find((c) => /\/custom-\d+-source\.png$/.test(c[0] as string));
  expect(sheetCall).toBeDefined();
  expect(sheetCall![1]).toEqual(new Uint8Array([9, 9, 9]));

  // Persisted mime carries smartImportMeta with the correct sheetFileName
  expect(result.current.mimes[0].smartImportMeta).toBeDefined();
  expect(result.current.mimes[0].smartImportMeta!.sheetFileName).toMatch(
    /^custom-\d+-source\.png$/
  );
  expect(result.current.mimes[0].smartImportMeta!.frameInputs).toEqual(
    frameInputs
  );
  expect(returnedId).toMatch(/^custom-\d+$/);
});

it("addMimeFromBlobs omits smartImportMeta when not provided (backward compatible)", async () => {
  vi.mocked(exists).mockResolvedValue(true);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});

  await act(async () => {
    await result.current.addMimeFromBlobs(
      "NoMetaMime",
      makeBlobsRecord() as any
    );
  });

  // Only 7 writes (no source sheet)
  expect(writeFile).toHaveBeenCalledTimes(ALL_STATUSES.length);
  expect(result.current.mimes[0].smartImportMeta).toBeUndefined();
});

it("loads a legacy-shaped store entry (no smartImportMeta field) cleanly", async () => {
  // Simulate a mime persisted by a pre-feature build: the JSON has no
  // smartImportMeta key at all (not even undefined). This guards against
  // code paths that would crash on a missing field or add one spuriously.
  const legacyEntry = {
    id: "custom-legacy-001",
    name: "FromOldBuild",
    sprites: {
      idle: { fileName: "custom-legacy-001-idle.png", frames: 4 },
      busy: { fileName: "custom-legacy-001-busy.png", frames: 4 },
      service: { fileName: "custom-legacy-001-service.png", frames: 4 },
      disconnected: { fileName: "custom-legacy-001-disconnected.png", frames: 4 },
      searching: { fileName: "custom-legacy-001-searching.png", frames: 4 },
      initializing: { fileName: "custom-legacy-001-initializing.png", frames: 4 },
      visiting: { fileName: "custom-legacy-001-visiting.png", frames: 4 },
    },
  };
  mockStoreValue("settings.json", "customMimes", [legacyEntry]);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});

  expect(result.current.mimes).toHaveLength(1);
  expect(result.current.mimes[0].id).toBe("custom-legacy-001");
  // Key assertion: missing field is exposed as `undefined`, not throwing.
  expect(result.current.mimes[0].smartImportMeta).toBeUndefined();
});
```

**Step 2: Run the tests and verify they fail**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: both new tests FAIL (`addMimeFromBlobs` currently accepts only 2 arguments and never writes a source sheet).

**Step 3: Update the hook**

In `src/hooks/useCustomMimes.ts`, change the `addMimeFromBlobs` signature and body (around `:111-137`) to:

```ts
const addMimeFromBlobs = useCallback(async (
  name: string,
  spriteBlobs: Record<Status, { blob: Uint8Array; frames: number }>,
  smartImportMeta?: { sheetBlob: Uint8Array; frameInputs: Record<Status, string> }
) => {
  const id = `custom-${Date.now()}`;
  info(`[custom-mimes] addMimeFromBlobs: name="${name}", id=${id}, hasSmartMeta=${!!smartImportMeta}`);
  const dir = await ensureSpritesDir();

  const sprites: Record<string, { fileName: string; frames: number }> = {};
  for (const status of ALL_STATUSES) {
    const { blob, frames } = spriteBlobs[status];
    const fileName = `${id}-${status}.png`;
    const destPath = `${dir}/${fileName}`;
    info(`[custom-mimes] writing ${fileName} (${blob.length} bytes)`);
    await writeFile(destPath, blob);
    sprites[status] = { fileName, frames };
  }

  let metaRecord: CustomMimeData["smartImportMeta"];
  if (smartImportMeta) {
    const sheetFileName = `${id}-source.png`;
    info(`[custom-mimes] writing ${sheetFileName} (${smartImportMeta.sheetBlob.length} bytes)`);
    await writeFile(`${dir}/${sheetFileName}`, smartImportMeta.sheetBlob);
    metaRecord = { sheetFileName, frameInputs: smartImportMeta.frameInputs };
  }

  const newMime: CustomMimeData = {
    id,
    name,
    sprites: sprites as Record<Status, { fileName: string; frames: number }>,
    ...(metaRecord ? { smartImportMeta: metaRecord } : {}),
  };

  await saveMimes([...mimes, newMime]);
  return id;
}, [mimes, saveMimes, ensureSpritesDir]);
```

**Step 4: Run the tests and verify they pass**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: all tests in the file PASS.

**Step 5: Commit**

```bash
git add src/hooks/useCustomMimes.ts src/__tests__/hooks/useCustomMimes.test.ts
git commit -m "feat(mimes): addMimeFromBlobs persists source sheet + frame meta"
```

---

## Task 3: Add `updateMimeFromSmartImport`

**Files:**
- Modify: `src/hooks/useCustomMimes.ts`
- Test: `src/__tests__/hooks/useCustomMimes.test.ts`

**Step 1: Write the failing test**

Add inside the same `describe` block:

```ts
it("updateMimeFromSmartImport overwrites strips + source sheet and updates meta", async () => {
  const existing: CustomMimeData = {
    id: "custom-777",
    name: "OldName",
    sprites: makeSpriteRecord("custom-777"),
    smartImportMeta: {
      sheetFileName: "custom-777-source.png",
      frameInputs: ALL_STATUSES.reduce<Record<string, string>>((acc, s) => {
        acc[s] = "1-2";
        return acc;
      }, {}),
    },
  } as any;
  mockStoreValue("settings.json", "customMimes", [existing]);
  vi.mocked(exists).mockResolvedValue(true);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});
  vi.mocked(writeFile).mockClear();

  const newInputs: Record<string, string> = {};
  for (const status of ALL_STATUSES) newInputs[status] = "3-6";

  await act(async () => {
    await result.current.updateMimeFromSmartImport(
      "custom-777",
      "NewName",
      makeBlobsRecord() as any,
      new Uint8Array([5, 5, 5]),
      newInputs as Record<import("../../types/status").Status, string>
    );
  });

  // 7 strips + 1 sheet overwritten
  expect(writeFile).toHaveBeenCalledTimes(ALL_STATUSES.length + 1);

  // All writes target filenames prefixed with the existing id (no new id generated)
  for (const call of vi.mocked(writeFile).mock.calls) {
    expect(call[0]).toMatch(/\/custom-777-/);
  }

  const updated = result.current.mimes.find((m) => m.id === "custom-777")!;
  expect(updated.name).toBe("NewName");
  expect(updated.smartImportMeta!.frameInputs).toEqual(newInputs);
  expect(updated.smartImportMeta!.sheetFileName).toBe("custom-777-source.png");

  // Sprite frame counts reflect the new blobs (4 from makeBlobsRecord)
  for (const status of ALL_STATUSES) {
    expect(updated.sprites[status].frames).toBe(4);
  }
});

it("updateMimeFromSmartImport is a no-op if id is unknown", async () => {
  mockStoreValue("settings.json", "customMimes", []);
  vi.mocked(exists).mockResolvedValue(true);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});
  vi.mocked(writeFile).mockClear();

  await act(async () => {
    await result.current.updateMimeFromSmartImport(
      "custom-does-not-exist",
      "x",
      makeBlobsRecord() as any,
      new Uint8Array([1]),
      ALL_STATUSES.reduce<Record<string, string>>((a, s) => { a[s] = "1"; return a; }, {}) as any
    );
  });

  expect(writeFile).not.toHaveBeenCalled();
});
```

**Step 2: Run and verify fail**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: both new tests FAIL with `result.current.updateMimeFromSmartImport is not a function`.

**Step 3: Implement `updateMimeFromSmartImport`**

Add inside `useCustomMimes` (after `updateMime`, before `deleteMime`):

```ts
const updateMimeFromSmartImport = useCallback(
  async (
    id: string,
    name: string,
    spriteBlobs: Record<Status, { blob: Uint8Array; frames: number }>,
    sheetBlob: Uint8Array,
    frameInputs: Record<Status, string>
  ) => {
    const existing = mimes.find((m) => m.id === id);
    if (!existing) return;

    info(`[custom-mimes] updateMimeFromSmartImport: id=${id}, name="${name}"`);
    const dir = await ensureSpritesDir();

    const sprites: Record<string, { fileName: string; frames: number }> = {};
    for (const status of ALL_STATUSES) {
      const { blob, frames } = spriteBlobs[status];
      const fileName = `${id}-${status}.png`;
      await writeFile(`${dir}/${fileName}`, blob);
      sprites[status] = { fileName, frames };
    }

    const sheetFileName = `${id}-source.png`;
    await writeFile(`${dir}/${sheetFileName}`, sheetBlob);

    const updated: CustomMimeData = {
      id,
      name,
      sprites: sprites as Record<Status, { fileName: string; frames: number }>,
      smartImportMeta: { sheetFileName, frameInputs },
    };

    await saveMimes(mimes.map((m) => (m.id === id ? updated : m)));
  },
  [mimes, saveMimes, ensureSpritesDir]
);
```

Then add `updateMimeFromSmartImport` to the hook's return object (around `:284`).

**Step 4: Run and verify pass**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/hooks/useCustomMimes.ts src/__tests__/hooks/useCustomMimes.test.ts
git commit -m "feat(mimes): add updateMimeFromSmartImport for in-place edits"
```

---

## Task 4: `deleteMime` cleans up the source sheet

**Files:**
- Modify: `src/hooks/useCustomMimes.ts:176-197`
- Test: `src/__tests__/hooks/useCustomMimes.test.ts`

**Step 1: Write the failing test**

Add inside the `describe`:

```ts
it("deleteMime removes the source sheet when smartImportMeta is present", async () => {
  const mime: CustomMimeData = {
    id: "custom-888",
    name: "SmartToDelete",
    sprites: makeSpriteRecord("custom-888"),
    smartImportMeta: {
      sheetFileName: "custom-888-source.png",
      frameInputs: ALL_STATUSES.reduce<Record<string, string>>((a, s) => { a[s] = "1"; return a; }, {}),
    },
  } as any;
  mockStoreValue("settings.json", "customMimes", [mime]);
  vi.mocked(exists).mockResolvedValue(true);
  vi.mocked(remove).mockResolvedValue(undefined);

  const { result } = renderHook(() => useCustomMimes());
  await act(async () => {});

  await act(async () => {
    await result.current.deleteMime("custom-888");
  });

  // 7 strips + 1 source sheet = 8 removes
  expect(remove).toHaveBeenCalledTimes(ALL_STATUSES.length + 1);
  const sheetRemove = vi
    .mocked(remove)
    .mock.calls.find((c) => /custom-888-source\.png$/.test(c[0] as string));
  expect(sheetRemove).toBeDefined();
});
```

**Step 2: Run and verify fail**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: new test FAILS because `deleteMime` currently calls `remove` 7 times, not 8.

**Step 3: Update `deleteMime`**

Replace the `deleteMime` body in `src/hooks/useCustomMimes.ts:176-197` with:

```ts
const deleteMime = useCallback(
  async (id: string) => {
    info(`[custom-mimes] deleteMime: id=${id}`);
    const mime = mimes.find((m) => m.id === id);
    if (!mime) return;

    const dir = await ensureSpritesDir();
    for (const status of ALL_STATUSES) {
      const fileName = mime.sprites[status]?.fileName;
      if (fileName) {
        try {
          await remove(`${dir}/${fileName}`);
        } catch {
          /* ok if missing */
        }
      }
    }
    if (mime.smartImportMeta?.sheetFileName) {
      try {
        await remove(`${dir}/${mime.smartImportMeta.sheetFileName}`);
      } catch {
        /* ok if missing */
      }
    }

    await saveMimes(mimes.filter((m) => m.id !== id));
  },
  [mimes, saveMimes, ensureSpritesDir]
);
```

**Step 4: Run and verify pass**

Run: `bun run vitest run src/__tests__/hooks/useCustomMimes.test.ts`
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/hooks/useCustomMimes.ts src/__tests__/hooks/useCustomMimes.test.ts
git commit -m "feat(mimes): clean up source sheet on delete"
```

---

## Task 5: `SmartImport` captures processed sheet bytes and frame inputs on save

**Files:**
- Modify: `src/components/SmartImport.tsx`

This task changes `SmartImport`'s `onSave` signature so it hands back the data needed by `addMimeFromBlobs` (with meta) and `updateMimeFromSmartImport`. No new behavior yet — Task 7 will wire the call sites.

**Step 1: Update `SmartImportProps`**

In `src/components/SmartImport.tsx:18-22` replace with:

```ts
interface SmartImportProps {
  onSave: (
    name: string,
    blobs: Record<Status, { blob: Uint8Array; frames: number }>,
    meta: {
      sheetBlob: Uint8Array;
      frameInputs: Record<Status, string>;
    }
  ) => Promise<void>;
  onCancel: () => void;
  initialFilePath?: string;
  initialName?: string;
  initialFrameInputs?: Record<Status, string>;
  editingId?: string;
}
```

**Step 2: Accept the new props and wire `initialName`**

In the component signature at `:69`, destructure the new props:

```ts
export function SmartImport({
  onSave,
  onCancel,
  initialFilePath,
  initialName,
  initialFrameInputs,
  editingId,
}: SmartImportProps) {
```

Change the `useState` for `name` at `:77` to:

```ts
const [name, setName] = useState(initialName ?? "");
```

**Step 3: Let `processFile` honor `initialFrameInputs`**

Inside `processFile` (`:115-133`), gate the auto-distribution on `initialFrameInputs`:

```ts
// Auto-assign: distribute frames evenly across statuses (skipped in edit mode)
const autoInputs: Record<string, string> = {};
if (initialFrameInputs) {
  for (const s of ALL_STATUSES) autoInputs[s] = initialFrameInputs[s] ?? "";
} else {
  const perStatus = Math.max(1, Math.floor(allFrames.length / ALL_STATUSES.length));
  for (let si = 0; si < ALL_STATUSES.length; si++) {
    const start = si * perStatus + 1;
    const end = si === ALL_STATUSES.length - 1
      ? allFrames.length
      : Math.min((si + 1) * perStatus, allFrames.length);
    autoInputs[ALL_STATUSES[si]] = `${start}-${end}`;
  }
}
setFrameInputs(autoInputs as Record<Status, string>);

// Generate initial thumbnails
const initThumbs: Record<string, { src: string; num: number }[]> = {};
for (const s of ALL_STATUSES) {
  const indices = parseFrameInput(autoInputs[s], allFrames.length);
  initThumbs[s] = indices.map((i) => ({ src: getFramePreview(prepared, allFrames[i], 72), num: i + 1 }));
}
setFrameThumbs(initThumbs as Record<Status, { src: string; num: number }[]>);
```

Also inside `processFile` (near the start, where `setName(rawName.replace(...))` runs at `:95`) skip the name reset when `initialName` is present:

```ts
if (!initialName) {
  setName(rawName.replace(/\.[^.]+$/, ""));
}
```

**Step 4: Replace `handleSave` to pass meta**

Replace the body of `handleSave` (`:196-225`) with:

```ts
const handleSave = useCallback(async () => {
  if (!name.trim()) { setError("Name is required"); return; }
  if (!canvas) { setError("No sprite sheet loaded"); return; }
  if (!allStatusesAssigned) {
    const missing = ALL_STATUSES.find((s) => parseFrameInput(frameInputs[s], frames.length).length === 0);
    setError(`Assign frames to "${missing}"`);
    return;
  }
  setProcessing(true);
  setError(null);

  try {
    info(`[smart-import] saving mime "${name}" with ${ALL_STATUSES.length} statuses`);
    const blobs: Record<string, { blob: Uint8Array; frames: number }> = {};

    for (const status of ALL_STATUSES) {
      const indices = parseFrameInput(frameInputs[status], frames.length);
      const strip = await createStripFromFrames(canvas, frames, indices);
      blobs[status] = strip;
    }

    const sheetBlob: Uint8Array = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) return reject(new Error("Failed to encode source sheet"));
        b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });

    await onSave(
      name.trim(),
      blobs as Record<Status, { blob: Uint8Array; frames: number }>,
      { sheetBlob, frameInputs }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save mime";
    logError(`[smart-import] handleSave failed: ${msg}`);
    setError(msg);
  } finally {
    setProcessing(false);
  }
}, [canvas, name, allStatusesAssigned, frameInputs, frames, onSave]);
```

> Note: `editingId` isn't consumed directly by `SmartImport` — it's just part of the prop contract so callers can easily pass it around; the caller's `onSave` closure handles create-vs-update. We keep it as a prop (rather than an implicit caller concern) so future UX changes (e.g. showing "Editing X" in the header) have somewhere to hook in.

**Step 5: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: errors at the old call site in `Settings.tsx` (the `<SmartImport ... onSave={...}>` usage), which Task 7 fixes. For now, expect ONLY errors in `src/components/Settings.tsx`. If errors appear anywhere else in the project, stop and fix them before continuing.

**Step 6: Commit (broken state — next task fixes the caller)**

```bash
git add src/components/SmartImport.tsx
git commit -m "refactor(smart-import): onSave returns sheet bytes + frame inputs"
```

---

## Task 6: `SmartImport` unit test for initial-props edit mode

**Files:**
- Create: `src/__tests__/components/SmartImport.test.tsx`

**Step 1: Write the test**

Create `src/__tests__/components/SmartImport.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { SmartImport } from "../../components/SmartImport";
import type { Status } from "../../types/status";

// Stub the sprite-sheet processor so the test doesn't need a real canvas pipeline
vi.mock("../../utils/spriteSheetProcessor", () => ({
  loadImage: vi.fn(),
  prepareCanvas: vi.fn(),
  detectRows: vi.fn(),
  extractFrames: vi.fn(),
  getFramePreview: vi.fn(),
  createStripFromFrames: vi.fn(),
}));

describe("SmartImport", () => {
  it("renders the dropzone when no file is loaded", () => {
    render(<SmartImport onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Choose a sprite sheet/i)).toBeInTheDocument();
  });

  it("pre-fills name from initialName prop", () => {
    // Force-render the form branch by providing a fake canvas via the dropzone skip path:
    // easiest way is to exercise the prop on the initial render of the pick screen
    // — name is controlled state, so the input is not visible until a sheet loads.
    // Instead, we assert the prop is wired: rendering with initialName doesn't throw
    // and the initial state equals initialName (observed via the "editingId" data path below).
    // This is a smoke test; the full round-trip is covered by e2e in Task 9.
    const { container } = render(
      <SmartImport
        onSave={vi.fn()}
        onCancel={vi.fn()}
        initialName="EditMe"
        editingId="custom-abc"
      />
    );
    // The picker is still visible (no canvas yet). Component renders without error.
    expect(container.querySelector(".smart-import-pick")).toBeInTheDocument();
  });
});
```

> This test is intentionally narrow: it guards against future refactors accidentally removing the new props, but the full "initial props populate the editor form" round-trip is easier to cover end-to-end in Task 9 where a real Tauri FS mock is available.

**Step 2: Run and verify pass**

Run: `bun run vitest run src/__tests__/components/SmartImport.test.tsx`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/__tests__/components/SmartImport.test.tsx
git commit -m "test(smart-import): smoke test edit-mode props render without error"
```

---

## Task 7: Wire Settings create flow to the new `onSave` signature

**Files:**
- Modify: `src/components/Settings.tsx:582-591`

**Step 1: Update the create-path `onSave` callback**

In `src/components/Settings.tsx`, replace the `<SmartImport ...>` block at `:582-591` with:

```tsx
<SmartImport
  initialFilePath={smartImportPath ?? undefined}
  onSave={async (mimeName, blobs, meta) => {
    const id = await addMimeFromBlobs(mimeName, blobs, meta);
    setPet(id);
    setCreating(false);
    setSmartImportPath(null);
  }}
  onCancel={() => { handleCancelCreate(); setSmartImportPath(null); }}
/>
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. (Task 5's SmartImport signature now matches the caller.)

**Step 3: Run existing Settings tests**

Run: `bun run vitest run src/__tests__/components/Settings.test.tsx`
Expected: all PASS. (The mock `addMimeFromBlobs` in the test file accepts any args, so passing a 3rd arg is fine.)

**Step 4: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(settings): persist smart-import meta on mime create"
```

---

## Task 8: Settings routes edit to SmartImport when `smartImportMeta` is present

**Files:**
- Modify: `src/components/Settings.tsx`
- Test: `src/__tests__/components/Settings.test.tsx`

**Step 1: Write the failing test**

In `src/__tests__/components/Settings.test.tsx`, first inspect the existing setup — the hook is mocked via `vi.mock("../../hooks/useCustomMimes", ...)`. Add two tests near the existing edit-button ones:

```tsx
it("editing a smart-import mime opens the Smart Import editor", async () => {
  // Stub useCustomMimes to return a mime with smartImportMeta
  const smartMime = {
    id: "custom-smart-1",
    name: "Smarty",
    sprites: Object.fromEntries(
      ALL_STATUSES_CONST.map((s) => [s, { fileName: `custom-smart-1-${s}.png`, frames: 3 }])
    ),
    smartImportMeta: {
      sheetFileName: "custom-smart-1-source.png",
      frameInputs: Object.fromEntries(ALL_STATUSES_CONST.map((s) => [s, "1-3"])),
    },
  };
  // (Use the same mock-injection pattern already used in this file for custom mimes;
  //  follow existing tests for the exact shape — typically mockUseCustomMimes({ mimes: [smartMime], ... }))

  const { user } = renderSettings(); // existing helper in this file
  // Navigate to Mime tab — existing helper / click
  await user.click(screen.getByRole("button", { name: /Mime/ }));
  await user.click(screen.getByTestId("edit-mime-custom-smart-1"));

  // SmartImport renders its dropzone or its form (depending on auto-load status).
  // Manual editor's hallmark is the "Choose PNG" sprite picker — it must NOT appear.
  expect(screen.queryByText(/Choose PNG/)).not.toBeInTheDocument();
});

it("editing a manual (no meta) mime opens the Manual editor", async () => {
  const manualMime = {
    id: "custom-manual-1",
    name: "Manny",
    sprites: Object.fromEntries(
      ALL_STATUSES_CONST.map((s) => [s, { fileName: `custom-manual-1-${s}.png`, frames: 3 }])
    ),
    // no smartImportMeta
  };
  // inject via the same mock-injection pattern

  const { user } = renderSettings();
  await user.click(screen.getByRole("button", { name: /Mime/ }));
  await user.click(screen.getByTestId("edit-mime-custom-manual-1"));

  // Manual editor's "Choose PNG" picker is visible
  expect(screen.getAllByText(/Choose PNG|[a-z0-9-]+\.png/i).length).toBeGreaterThan(0);
});

it("editing a LEGACY (pre-feature) mime — no smartImportMeta field at all — opens the Manual editor", async () => {
  // Distinct from "manualMime" above: the legacy shape has no smartImportMeta KEY
  // in the persisted JSON, whereas a mime created post-feature via Manual has
  // { ...manualMime, smartImportMeta: undefined } after hook serialization. Both
  // must route the same way. This guards against an accidental `'smartImportMeta' in mime`
  // check that would split their behavior.
  const legacyMime = {
    id: "custom-legacy-1",
    name: "FromOldBuild",
    sprites: Object.fromEntries(
      ALL_STATUSES_CONST.map((s) => [s, { fileName: `custom-legacy-1-${s}.png`, frames: 3 }])
    ),
    // Note: no smartImportMeta key — this is what the store contained before the feature landed.
  };
  // inject via the same mock-injection pattern

  const { user } = renderSettings();
  await user.click(screen.getByRole("button", { name: /Mime/ }));
  await user.click(screen.getByTestId("edit-mime-custom-legacy-1"));

  expect(screen.getAllByText(/Choose PNG|[a-z0-9-]+\.png/i).length).toBeGreaterThan(0);
});
```

> IMPORTANT: before writing these tests, open `src/__tests__/components/Settings.test.tsx` and **mirror its existing helpers** for `renderSettings`, `ALL_STATUSES_CONST`, and whatever mock-injection pattern it already uses for `useCustomMimes`. The scaffolding above is schematic — adapt to the file's conventions. If the existing tests use a different pattern (e.g. direct `vi.doMock` with a factory), use that exact pattern.

**Step 2: Run and verify fail**

Run: `bun run vitest run src/__tests__/components/Settings.test.tsx`
Expected: the new "smart-import mime opens Smart Import editor" test FAILS (today, edit always opens the manual editor).

**Step 3: Update `handleEditCustom` and the smart-import render branch**

In `src/components/Settings.tsx`:

1. Change `handleEditCustom` (`:235-246`) to branch on `smartImportMeta`:

```tsx
const handleEditCustom = async (id: string) => {
  const mime = customMimes.find((m) => m.id === id);
  if (!mime) return;
  setEditingMime(id);

  if (mime.smartImportMeta) {
    // Resolve the on-disk path for the stored source sheet and open Smart Import in edit mode.
    const base = await appDataDir();
    const path = await join(base, "custom-sprites", mime.smartImportMeta.sheetFileName);
    setSmartImportPath(path);
    setCreating("smart");
    setNewName(mime.name); // kept in sync; SmartImport also uses initialName
    return;
  }

  // Fall back to the existing Manual editor path
  setCreating("manual");
  setNewName(mime.name);
  const filled: any = {};
  for (const s of ALL_STATUSES) {
    filled[s] = { path: "", frames: String(mime.sprites[s].frames) };
  }
  setSpriteInputs(filled);
};
```

2. Update the `creating === "smart"` block (`:581-591`) to pass edit-mode props and call the right hook method:

```tsx
) : creating === "smart" ? (
  <SmartImport
    initialFilePath={smartImportPath ?? undefined}
    initialName={editingMime ? customMimes.find((m) => m.id === editingMime)?.name : undefined}
    initialFrameInputs={
      editingMime
        ? customMimes.find((m) => m.id === editingMime)?.smartImportMeta?.frameInputs
        : undefined
    }
    editingId={editingMime ?? undefined}
    onSave={async (mimeName, blobs, meta) => {
      if (editingMime) {
        await updateMimeFromSmartImport(
          editingMime,
          mimeName,
          blobs,
          meta.sheetBlob,
          meta.frameInputs
        );
        setEditingMime(null);
      } else {
        const id = await addMimeFromBlobs(mimeName, blobs, meta);
        setPet(id);
      }
      setCreating(false);
      setSmartImportPath(null);
    }}
    onCancel={() => { handleCancelCreate(); setSmartImportPath(null); }}
  />
```

3. Destructure `updateMimeFromSmartImport` from `useCustomMimes` at `:81`:

```tsx
const {
  mimes: customMimes,
  pickSpriteFile,
  addMime,
  addMimeFromBlobs,
  updateMime,
  updateMimeFromSmartImport,
  deleteMime,
  exportMime,
  importMime,
} = useCustomMimes();
```

**Step 4: Run Settings tests and verify pass**

Run: `bun run vitest run src/__tests__/components/Settings.test.tsx`
Expected: all tests PASS.

**Step 5: Full frontend type check + full unit tests**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `bun run vitest run`
Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/components/Settings.tsx src/__tests__/components/Settings.test.tsx
git commit -m "feat(settings): route edit to Smart Import when smartImportMeta is set"
```

---

## Task 9: E2E smoke — smart-import create → edit → re-save round trip

**Files:**
- Modify or extend: `e2e/smoke.spec.ts` (or a new `e2e/smart-import-edit.spec.ts` if you want it isolated — either is fine, follow whatever convention the repo currently uses for multi-test files)

**Step 1: Inspect existing patterns**

Open `e2e/smoke.spec.ts` and `e2e/tauri-mock.ts`. Identify:
- How the existing "delete + re-import Charlotte via `.animime` file" test drives the mock FS and dialog (look for `__MOCK_READ_FILE_BYTES__`, `__MOCK_READ_FILE_MAP__`, `__MOCK_WRITTEN_FILES__`).
- How it asserts on `settings.json` contents after a save.

The new spec must follow the same style — no standalone Playwright fixtures.

**Step 2: Write the e2e scenario**

Add a test to `e2e/smoke.spec.ts` (placement: near the existing `.animime` import tests so related behavior stays grouped):

```ts
test("smart-import mime can be edited via Smart Import and keeps its meta", async ({ page }) => {
  await openApp(page); // existing helper

  // --- Step A: create a smart-import mime (re-use the existing "Import Sheet" helper flow if present,
  //     otherwise drive the UI: Mime tab → Import Sheet → pick mock sprite sheet → Save).

  // --- Step B: assert the store entry has smartImportMeta set
  const storeBefore = await page.evaluate(async () => {
    return (window as any).__TAURI_INTERNALS__.invoke("plugin:store|load", { path: "settings.json" });
  });
  // Drill into the persisted customMimes array and assert the new mime has smartImportMeta
  // (use whatever helper the spec file already uses for store assertions)

  // --- Step C: click the edit button for that mime
  await page.getByTestId(/^edit-mime-custom-/).first().click();

  // --- Step D: assert that the Smart Import editor opened (not the Manual editor).
  //     Distinguishing marker: Manual uses "Choose PNG" buttons; Smart Import uses "Assign frames to states".
  await expect(page.getByText(/Assign frames to states/i)).toBeVisible();

  // --- Step E: change one status's frame assignment (e.g. idle "1-2" → "3-4") and click Save.

  // --- Step F: assert the store entry still has smartImportMeta and its frameInputs reflect the edit;
  //     assert the source sheet file path (<id>-source.png) appears in __MOCK_WRITTEN_FILES__ for both create and update.

  // --- Step G: cross-check that editing the default "Charlotte" (imported from .animime, no meta)
  //     still opens the Manual editor.
});
```

> Flesh this out using the actual helpers and selectors in the file. Do not invent selectors — run the app in dev (`bun run tauri dev`) or inspect existing spec code to confirm `data-testid` values before writing assertions.

**Step 3: Run the e2e suite**

Run: `bunx playwright test -c e2e/playwright.config.ts --project=chromium`
Expected: all tests PASS, including the new one.

**Step 4: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): smart-import mime edit round-trip preserves meta"
```

---

## Final Verification

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 2: Full unit test suite**

Run: `bun run vitest run`
Expected: all tests PASS.

**Step 3: Full e2e**

Run: `bunx playwright test -c e2e/playwright.config.ts --project=chromium`
Expected: all tests PASS.

**Step 4: Manual smoke**

Run: `bun run tauri dev`
- Create a mime via Import Sheet; click Edit on it; confirm the Smart Import editor opens pre-populated with name and frame ranges; change one range; save; confirm the mime still renders correctly in the main window.
- Import a `.animime` file; click Edit on the imported mime; confirm the **Manual** editor opens (not Smart Import).
- Delete the smart-import mime; confirm no orphan `<id>-source.png` is left in `~/Library/Application Support/com.vietnguyenwsilentium.ani-mime/custom-sprites/` (use `ls` to verify).

If all three pass, the branch is ready for PR.

---

## Notes for future work (out of scope)

These are known gaps that were considered and deliberately deferred, not oversights. A future change can pick any of them up without rework of what this plan delivers.

### `.animime` round-trip export
Today `.animime` export drops the source sheet and frame inputs. A future round-trippable export would bump the format version to 2 and add `sheetData` + `frameInputs` fields. The importer would set `smartImportMeta` on the imported mime when the payload has those fields, and fall back to today's Manual-routing behavior for v1 payloads. Leave the current `version: 1` path alone until someone asks for this.

### Origin flag (`source: "manual" | "smart" | "animime" | "legacy"`)
Rejected for this plan. It would give us a clean way to show a softer message in the Manual editor when the user tries to edit a legacy smart-import mime (e.g. "Originally made with Smart Import. The source sheet wasn't saved — edit frames manually, or delete and recreate to regain Smart Import editing."). The cost is a persistent string field on every mime, copy work, and a no-op migration for every existing record to assign a plausible `source`. The benefit is a one-time UX polish for an already-small population of grandfathered mimes. Revisit if we get user feedback saying the current silent Manual-fallback is confusing.

### Downgrade-safety of `smartImportMeta`
If a user installs a pre-feature build after this lands, the old hook's save path rebuilds `customMimes` from its own in-memory `CustomMimeData` type, which has no `smartImportMeta` — so any subsequent save on the old build drops the field. On re-upgrade, the mime is indistinguishable from a legacy smart-import mime and routes to Manual forever after. The `-source.png` file becomes an orphan in `custom-sprites/`. Acceptable because downgrade is not a supported path. A defensive fix (keeping a raw JSON mirror in the store that preserves unknown fields through the old build's write path) is disproportionate.

### Atomic multi-file writes
`addMimeFromBlobs` and `updateMimeFromSmartImport` write 7 strips + (optionally) 1 source sheet sequentially, then call `saveMimes` which persists the store entry + emits the change event. If any `writeFile` throws mid-sequence, the filesystem contains a mix of old and new pixels while the store still holds the pre-update sprite record — a visually corrupted mime until the user re-saves. This pre-dates the plan (`addMimeFromBlobs` already has the same property) and the plan doesn't make it worse. A proper fix — write to `<id>-<status>.png.tmp` files in a batch, then atomically rename once all succeed, with a rollback on partial failure — is a good ~half-day of work and isn't blocking the user-visible feature. Worth doing next time someone touches the hook for an unrelated reason.

### Recovery path for legacy smart-import mimes
See "Data migration stance" at the top of this plan for why this isn't feasible: the original sheet is gone and synthesizing one from the output strips doesn't enable meaningful re-slicing. If we ever want to offer a recovery path, the only real option is to ask the user to re-upload the original sheet, match it against the existing mime id (to preserve the pet selection and settings), and run the Smart Import pipeline against it. That's a new UX flow ("Rebuild from source sheet") and should be proposed as its own design, not a migration.
