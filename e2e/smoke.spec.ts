import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tauriMockScript } from './tauri-mock';

const __filename = fileURLToPath(import.meta.url);
const __e2eDir = path.dirname(__filename);

// Helper: inject mock before navigation so it's available when React boots.
async function loadWithMock(page: import('@playwright/test').Page, path = '/') {
  await page.addInitScript(tauriMockScript);
  await page.goto(path);
}

// ---------------------------------------------------------------------------
// 1. App loads
// ---------------------------------------------------------------------------
test('app loads and shows initializing status', async ({ page }) => {
  await loadWithMock(page);

  // The main container should be visible
  const container = page.locator('[data-testid="app-container"]');
  await expect(container).toBeVisible();

  // The sprite element should exist
  const sprite = page.locator('[data-testid="mascot-sprite"]');
  await expect(sprite).toBeVisible();

  // The status pill should show "Initializing..." (the default state)
  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Initializing...');
});

// ---------------------------------------------------------------------------
// 2. Status transition to busy
// ---------------------------------------------------------------------------
test('status transitions to busy', async ({ page }) => {
  await loadWithMock(page);

  // Wait for initial render
  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // Emit a status-changed event with "busy"
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('status-changed', 'busy');
  });

  // The label should now read "Working..."
  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Working...');

  // The dot should have the "busy" class
  const dot = page.locator('[data-testid="status-dot"]');
  await expect(dot).toHaveClass(/\bbusy\b/);
});

// ---------------------------------------------------------------------------
// 3. Status transition to idle
// ---------------------------------------------------------------------------
test('status transitions to idle', async ({ page }) => {
  await loadWithMock(page);

  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // Emit idle
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('status-changed', 'idle');
  });

  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Free');

  const dot = page.locator('[data-testid="status-dot"]');
  await expect(dot).toHaveClass(/\bidle\b/);
});

// ---------------------------------------------------------------------------
// 4. Speech bubble appears and dismisses
// ---------------------------------------------------------------------------
test('speech bubble appears on task-completed and dismisses on click', async ({ page }) => {
  await loadWithMock(page);

  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // The bubble should not be visible initially
  await expect(page.locator('[data-testid="speech-bubble"]')).not.toBeVisible();

  // Emit a task-completed event (useBubble listens to this)
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('task-completed', { duration_secs: 5 });
  });

  // The bubble should now be visible with some message text
  const bubble = page.locator('[data-testid="speech-bubble"]');
  await expect(bubble).toBeVisible();

  const bubbleText = page.locator('[data-testid="speech-bubble-text"]');
  await expect(bubbleText).not.toBeEmpty();

  // Click the bubble to dismiss it
  await bubble.click();

  // The bubble should disappear
  await expect(bubble).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 5. Scenario mode
// ---------------------------------------------------------------------------
test('scenario override shows badge and changes status', async ({ page }) => {
  await loadWithMock(page);

  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // No scenario badge initially
  await expect(page.locator('[data-testid="scenario-badge"]')).not.toBeVisible();

  // Emit scenario-override with status "service"
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('scenario-override', { status: 'service' });
  });

  // The scenario badge should appear
  const badge = page.locator('[data-testid="scenario-badge"]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('SCENARIO');

  // The container should have scenario-active class
  const container = page.locator('[data-testid="app-container"]');
  await expect(container).toHaveClass(/scenario-active/);

  // The status pill should show "Service"
  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Service');
});

// ---------------------------------------------------------------------------
// 6. Status transition to disconnected
// ---------------------------------------------------------------------------
test('status transitions to disconnected', async ({ page }) => {
  await loadWithMock(page);

  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // Emit disconnected
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('status-changed', 'disconnected');
  });

  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Sleep');

  const dot = page.locator('[data-testid="status-dot"]');
  await expect(dot).toHaveClass(/\bdisconnected\b/);
});

// ---------------------------------------------------------------------------
// 7. Status transition to searching
// ---------------------------------------------------------------------------
test('status transitions to searching', async ({ page }) => {
  await loadWithMock(page);

  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();

  // Emit searching
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('status-changed', 'searching');
  });

  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Searching...');

  const dot = page.locator('[data-testid="status-dot"]');
  await expect(dot).toHaveClass(/\bsearching\b/);
});

// ---------------------------------------------------------------------------
// 8. Visiting status hides mascot
// ---------------------------------------------------------------------------
test('visiting status hides mascot', async ({ page }) => {
  await loadWithMock(page);

  // Wait for initial render and set idle so mascot is visible
  await expect(page.locator('[data-testid="status-label"]')).toBeVisible();
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('status-changed', 'idle');
  });
  await expect(page.locator('[data-testid="mascot-sprite"]')).toBeVisible();

  // Emit dog-away with true to trigger visiting status
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('dog-away', true);
  });

  // The mascot sprite should no longer be visible (replaced by placeholder div)
  await expect(page.locator('[data-testid="mascot-sprite"]')).not.toBeVisible();

  // The status pill should show "Visiting..."
  const label = page.locator('[data-testid="status-label"]');
  await expect(label).toHaveText('Visiting...');
});

// ---------------------------------------------------------------------------
// 9. Settings page loads
// ---------------------------------------------------------------------------
test('settings page loads and renders form', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // The settings container should be visible
  const settings = page.locator('.settings');
  await expect(settings).toBeVisible();

  // The sidebar should be rendered with tab buttons
  const sidebar = page.locator('.settings-sidebar');
  await expect(sidebar).toBeVisible();

  // Should have General, Mime, and About tabs
  await expect(sidebar.locator('.sidebar-item')).toHaveCount(3);
  await expect(sidebar.locator('.sidebar-item').nth(0)).toHaveText('General');
  await expect(sidebar.locator('.sidebar-item').nth(1)).toHaveText('Mime');
  await expect(sidebar.locator('.sidebar-item').nth(2)).toHaveText('About');

  // The content area with the title should be visible
  const content = page.locator('.settings-content');
  await expect(content).toBeVisible();

  // The title should show "General" (the default tab)
  const title = page.locator('.settings-title');
  await expect(title).toHaveText('General');
});

// ---------------------------------------------------------------------------
// 10. Upload Charlotte as custom sprite
// ---------------------------------------------------------------------------
test('upload Charlotte as custom sprite via manual flow', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // Navigate to Mime tab
  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');

  // Click the Manual add card to open the creator form
  await page.click('.pet-card.add-card:has-text("Manual")');
  const creator = page.locator('.custom-creator');
  await expect(creator).toBeVisible();

  const saveBtn = creator.locator('.creator-btn.save');

  // Clicking Save without a name shows validation error
  await saveBtn.click();
  await expect(page.locator('.save-error')).toHaveText('Name is required');

  // Enter "Charlotte" as the mime name
  await creator.locator('.settings-input').fill('Charlotte');

  // Configure mock file dialog to return a fake sprite path
  await page.evaluate(() => {
    (window as any).__MOCK_DIALOG_RESULT__ = '/mock/sprites/charlotte.png';
  });

  // Pick a sprite file for each of the 7 statuses
  const pickButtons = creator.locator('.sprite-pick-btn');
  await expect(pickButtons).toHaveCount(7);

  for (let i = 0; i < 7; i++) {
    await pickButtons.nth(i).click();
    // Button text changes from "Choose PNG" to the selected filename
    await expect(pickButtons.nth(i)).toHaveText('charlotte.png');
  }

  // Customise frame specs using range expressions
  // idle=1-5, busy=8, service=1-3, disconnected=1, searching=41-55,57,58, initializing=1-4, visiting=2-6,8
  const frameInputs = creator.locator('.frame-count-input');
  const frameSpecs = ['1-5', '8', '1-3', '1', '41-55,57,58', '1-4', '2-6,8'];

  for (let i = 0; i < frameSpecs.length; i++) {
    await frameInputs.nth(i).fill(frameSpecs[i]);
  }

  // Save should be enabled (name + files + valid frame specs)
  await expect(saveBtn).toBeEnabled();

  // Save the custom mime
  await saveBtn.click();

  // The creator form should close
  await expect(creator).not.toBeVisible();

  // Charlotte should appear in the custom mimes list
  const charlotteName = page.locator('.pet-card-wrapper .pet-name', { hasText: 'Charlotte' });
  await expect(charlotteName).toBeVisible();
});

// ---------------------------------------------------------------------------
// 11. Edit Charlotte: rename and change busy frame range
// ---------------------------------------------------------------------------
test('edit Charlotte sprite: rename and change busy frame range', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // Navigate to Mime tab
  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');

  // Inject Charlotte into custom mimes via event
  await page.evaluate(() => {
    (window as any).__TEST_EMIT__('custom-mimes-changed', [{
      id: 'custom-12345',
      name: 'Charlotte',
      sprites: {
        idle:          { fileName: 'custom-12345-idle.png',          frames: 5 },
        busy:          { fileName: 'custom-12345-busy.png',          frames: 8 },
        service:       { fileName: 'custom-12345-service.png',       frames: 3 },
        disconnected:  { fileName: 'custom-12345-disconnected.png',  frames: 1 },
        searching:     { fileName: 'custom-12345-searching.png',     frames: 17 },
        initializing:  { fileName: 'custom-12345-initializing.png',  frames: 4 },
        visiting:      { fileName: 'custom-12345-visiting.png',      frames: 6 },
      },
    }]);
  });

  // Charlotte should appear in the custom section
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'Charlotte' })).toBeVisible();

  // Hover the card to reveal the edit button, then click it
  const charlotteWrapper = page.locator('.pet-card-wrapper', { has: page.locator('.pet-name', { hasText: 'Charlotte' }) });
  await charlotteWrapper.hover();
  await page.click('[data-testid="edit-mime-custom-12345"]');

  // The creator form should open with Charlotte's data pre-filled
  const creator = page.locator('.custom-creator');
  await expect(creator).toBeVisible();

  // Name should be pre-filled with "Charlotte"
  const nameInput = creator.locator('.settings-input');
  await expect(nameInput).toHaveValue('Charlotte');

  // Frame inputs should be pre-filled from existing data
  const frameInputs = creator.locator('.frame-count-input');
  await expect(frameInputs.nth(0)).toHaveValue('5');   // idle
  await expect(frameInputs.nth(1)).toHaveValue('8');   // busy

  // Sprite buttons should show existing file names (not "Choose PNG")
  const pickButtons = creator.locator('.sprite-pick-btn');
  await expect(pickButtons.nth(1)).toHaveText('custom-12345-busy.png');

  // --- Make edits ---

  // Rename to "Charlotte v2"
  await nameInput.fill('Charlotte v2');

  // Change busy frames from "8" to "1-10"
  await frameInputs.nth(1).fill('1-10');

  // Save should be enabled (existing files carry over when editing)
  const saveBtn = creator.locator('.creator-btn.save');
  await expect(saveBtn).toBeEnabled();

  // Save
  await saveBtn.click();

  // The creator form should close
  await expect(creator).not.toBeVisible();

  // The updated name should appear; the old name should not
  const allNames = await page.locator('.pet-card-wrapper .pet-name').allTextContents();
  expect(allNames).toContain('Charlotte v2');
  expect(allNames).not.toContain('Charlotte');
});

// ---------------------------------------------------------------------------
// 13. SmartImport create → edit → re-save round trip
// ---------------------------------------------------------------------------
test('smart-import mime can be edited via Smart Import and keeps its meta', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // Load Bowser fixture bytes
  const bowserPath = path.resolve(__e2eDir, '../src/__tests__/fixtures/sprites/bowser/input.gif');
  const bowserBytes = readFileSync(bowserPath);
  const b64 = bowserBytes.toString('base64');

  await page.evaluate((data: string) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    (window as any).__MOCK_READ_FILE_BYTES__ = bytes;
    (window as any).__MOCK_DIALOG_RESULT__ = '/mock/sprites/Bowser.gif';
  }, b64);

  // --- Step A: create a smart-import mime ---------------------------------
  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');
  await page.click('.pet-card.add-card:has-text("Import Sheet")');

  const frameAssign = page.locator('.smart-import-frame-assign');
  await expect(frameAssign.first()).toBeVisible();
  await expect(frameAssign).toHaveCount(7);

  // Rename the mime
  const nameInput = page.locator('.smart-import .settings-input');
  await nameInput.fill('RoundTrip');

  // Accept auto-distributed frame ranges; save immediately
  const saveBtn = page.locator('.creator-btn.save');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.locator('.smart-import')).not.toBeVisible();

  // --- Step B: verify source sheet was written + meta persisted ------------
  const wroteSource = await page.evaluate(() => {
    const files = (window as any).__MOCK_WRITTEN_FILES__ || [];
    return files.some((f: any) => /-source\.png$/.test(f.path ?? ''));
  });
  expect(wroteSource).toBe(true);

  const storedMimes = await page.evaluate(async () => {
    const rid = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|load', { path: 'settings.json' }
    );
    const val = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|get', { rid, key: 'customMimes' }
    );
    return val ? val[0] : null;
  });
  expect(storedMimes).toHaveLength(1);
  expect(storedMimes[0].name).toBe('RoundTrip');
  expect(storedMimes[0].smartImportMeta).toBeDefined();
  expect(storedMimes[0].smartImportMeta.sheetFileName).toMatch(/^custom-\d+-source\.png$/);
  expect(storedMimes[0].smartImportMeta.frameInputs).toBeDefined();
  const originalFrameInputs = storedMimes[0].smartImportMeta.frameInputs;
  const mimeId = storedMimes[0].id;

  // --- Step C: click edit → Smart Import should re-open --------------------
  // Point the FS mock at the same Bowser bytes for source sheet re-read
  await page.evaluate((data: string) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    (window as any).__MOCK_READ_FILE_BYTES__ = bytes;
    // Clear the written files log to isolate update writes
    (window as any).__MOCK_WRITTEN_FILES__ = [];
  }, b64);

  // Hover to reveal edit button (hidden by default, shown on hover)
  const roundTripWrapper = page.locator('.pet-card-wrapper', {
    has: page.locator('.pet-name', { hasText: 'RoundTrip' }),
  });
  await roundTripWrapper.hover();
  await page.click(`[data-testid="edit-mime-${mimeId}"]`);

  // Smart Import editor opens (not Manual)
  await expect(page.locator('.smart-import-frame-assign').first()).toBeVisible();
  await expect(page.locator('.smart-import-frame-assign')).toHaveCount(7);
  await expect(page.locator('.manual-status-row')).toHaveCount(0);

  // Name is pre-filled with the saved name
  await expect(page.locator('.smart-import .settings-input')).toHaveValue('RoundTrip');

  // Frame inputs should be pre-filled with the saved values before the user edits them
  const frameInputs = page.locator('.smart-import-frame-input');
  await expect(frameInputs.nth(0)).toHaveValue(originalFrameInputs.idle);

  // --- Step D: change the first status's frame range (idle) and save -------
  const idleInput = frameInputs.nth(0); // statusOrder[0] = idle
  await idleInput.clear();
  await idleInput.fill('3-4');
  await idleInput.blur();

  const editSaveBtn = page.locator('.creator-btn.save');
  await expect(editSaveBtn).toBeEnabled();
  await editSaveBtn.click();
  await expect(page.locator('.smart-import')).not.toBeVisible();

  // --- Step E: verify the store's meta reflects the edit -------------------
  const updatedMimes = await page.evaluate(async () => {
    const rid = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|load', { path: 'settings.json' }
    );
    const val = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|get', { rid, key: 'customMimes' }
    );
    return val ? val[0] : null;
  });
  expect(updatedMimes).toHaveLength(1);
  expect(updatedMimes[0].id).toBe(mimeId); // same id, in-place update
  expect(updatedMimes[0].name).toBe('RoundTrip');
  expect(updatedMimes[0].smartImportMeta).toBeDefined();
  expect(updatedMimes[0].smartImportMeta.frameInputs.idle).toBe('3-4');

  // Other statuses should be preserved from original
  for (const status of ['busy', 'service', 'disconnected', 'searching', 'initializing', 'visiting']) {
    expect(updatedMimes[0].smartImportMeta.frameInputs[status]).toBe(originalFrameInputs[status]);
  }

  // --- Step F: verify the update wrote the source sheet again --------------
  const reWroteSource = await page.evaluate((id: string) => {
    const files = (window as any).__MOCK_WRITTEN_FILES__ || [];
    return files.some((f: any) => new RegExp(`${id}-source\\.png$`).test(f.path ?? ''));
  }, mimeId);
  expect(reWroteSource).toBe(true);
});

// ---------------------------------------------------------------------------
// 13c. Imported .animime mime (no smart meta) opens Manual editor on edit
// ---------------------------------------------------------------------------
test('imported .animime mime (no smart meta) opens Manual editor on edit', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // Navigate to Mime tab first
  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');

  // Inject a manual-style mime (no smartImportMeta) via event
  await page.evaluate(() => {
    const mimes = [{
      id: 'custom-imported-1',
      name: 'FromAnimime',
      sprites: {
        idle:          { fileName: 'custom-imported-1-idle.png',          frames: 3 },
        busy:          { fileName: 'custom-imported-1-busy.png',          frames: 3 },
        service:       { fileName: 'custom-imported-1-service.png',       frames: 3 },
        disconnected:  { fileName: 'custom-imported-1-disconnected.png',  frames: 3 },
        searching:     { fileName: 'custom-imported-1-searching.png',     frames: 3 },
        initializing:  { fileName: 'custom-imported-1-initializing.png',  frames: 3 },
        visiting:      { fileName: 'custom-imported-1-visiting.png',      frames: 3 },
      },
    }];
    (window as any).__TEST_SEED_STORE__('settings.json', 'customMimes', mimes);
    (window as any).__TEST_EMIT__('custom-mimes-changed', mimes);
  });

  // The mime should appear
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'FromAnimime' })).toBeVisible();

  // Hover to reveal edit button, then click it
  const fromAnimimeWrapper = page.locator('.pet-card-wrapper', {
    has: page.locator('.pet-name', { hasText: 'FromAnimime' }),
  });
  await fromAnimimeWrapper.hover();
  await page.click('[data-testid="edit-mime-custom-imported-1"]');

  // Manual editor is visible (not Smart Import)
  await expect(page.locator('.manual-status-row').first()).toBeVisible();
  await expect(page.locator('.manual-status-row')).toHaveCount(7);
  await expect(page.locator('.smart-import-frame-assign')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 14. Export Charlotte as .animime file
// ---------------------------------------------------------------------------
test('Bowser SmartImport → export → import roundtrip preserves smartImportMeta', async ({ page }) => {
  await loadWithMock(page, '/settings.html');

  // --- Step A: SmartImport Bowser from fixture -------------------------------
  const bowserPath = path.resolve(__e2eDir, '../src/__tests__/fixtures/sprites/bowser/input.gif');
  const b64 = readFileSync(bowserPath).toString('base64');

  await page.evaluate((data: string) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    (window as any).__MOCK_READ_FILE_BYTES__ = bytes;
    (window as any).__MOCK_DIALOG_RESULT__ = '/mock/sprites/Bowser.gif';
  }, b64);

  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');
  await page.click('.pet-card.add-card:has-text("Import Sheet")');

  const frameAssign = page.locator('.smart-import-frame-assign');
  await expect(frameAssign.first()).toBeVisible();
  await expect(frameAssign).toHaveCount(7);

  // Verify name is auto-filled from filename
  const nameInput = page.locator('.smart-import .settings-input');
  await expect(nameInput).toHaveValue('Bowser');

  // Read detected frame count so we can assign explicit ranges
  const framesInfo = page.locator('.smart-import-frames-info');
  await expect(framesInfo).toContainText('detected');
  const totalFrames = await framesInfo.evaluate((el) => {
    const match = el.textContent?.match(/(\d+)\s+detected/);
    return match ? parseInt(match[1]) : 0;
  });
  expect(totalFrames).toBeGreaterThan(48); // Bowser sheet has many frames

  // Set frame ranges matching the real Bowser export
  const statusOrder = ['idle', 'busy', 'service', 'disconnected', 'searching', 'initializing', 'visiting'];
  const frameRanges: Record<string, string> = {
    idle: '1-34',
    busy: '68-128,128,128,128,128,128,128,128,128,129',
    service: '56-64,61,65-67,61-56',
    disconnected: '141-158,130-141',
    searching: '34-55',
    initializing: '160-163',
    visiting: '164-196',
  };
  const expectedCounts: Record<string, number> = {
    idle: 34, busy: 70, service: 19, disconnected: 30,
    searching: 22, initializing: 4, visiting: 33,
  };
  const frameInputs = page.locator('.smart-import-frame-input');
  for (let i = 0; i < statusOrder.length; i++) {
    const input = frameInputs.nth(i);
    await input.clear();
    await input.fill(frameRanges[statusOrder[i]]);
    await input.blur();
  }

  // Verify each status shows the correct number of frame thumbnails with numbers
  for (let i = 0; i < statusOrder.length; i++) {
    const status = statusOrder[i];
    const assign = frameAssign.nth(i);
    const thumbs = assign.locator('.smart-import-frame-thumb-item');
    const nums = assign.locator('.smart-import-frame-num');
    await expect(thumbs).toHaveCount(expectedCounts[status]);
    await expect(nums).toHaveCount(expectedCounts[status]);
  }

  // Verify first frame number for idle is "1"
  const idleFirstNum = frameAssign.first().locator('.smart-import-frame-num').first();
  await expect(idleFirstNum).toHaveText('1');

  // Save the mime
  const saveBtn = page.locator('.creator-btn.save');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.locator('.smart-import')).not.toBeVisible();

  // --- Step B: Verify the created mime has smartImportMeta -------------------
  const storedAfterCreate = await page.evaluate(async () => {
    const rid = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|load', { path: 'settings.json' }
    );
    const val = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|get', { rid, key: 'customMimes' }
    );
    return val ? val[0] : null;
  });
  expect(storedAfterCreate).toHaveLength(1);
  const createdMime = storedAfterCreate[0];
  expect(createdMime.name).toBe('Bowser');
  expect(createdMime.smartImportMeta).toBeDefined();
  expect(createdMime.smartImportMeta.frameInputs.idle).toBe('1-34');
  expect(createdMime.smartImportMeta.frameInputs.busy).toBe('68-128,128,128,128,128,128,128,128,128,129');
  const mimeId = createdMime.id;

  // Capture written files (strips + source sheet) for export reads
  const writtenFiles = await page.evaluate(() => {
    const files = (window as any).__MOCK_WRITTEN_FILES__ || [];
    const result: Record<string, Uint8Array> = {};
    for (const f of files) {
      if (f.path) {
        // Extract filename from path
        const name = f.path.split('/').pop();
        const raw = f.contents;
        result[name] = raw instanceof Uint8Array ? raw : new Uint8Array(Object.values(raw) as number[]);
      }
    }
    return result;
  });

  // --- Step C: Export the Bowser mime ----------------------------------------
  // Set up read file map so export can read the strip PNGs + source sheet
  await page.evaluate((files: Record<string, Uint8Array>) => {
    const map: Record<string, Uint8Array> = {};
    for (const [name, bytes] of Object.entries(files)) {
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes) as number[]);
      map[name] = arr;
    }
    (window as any).__MOCK_READ_FILE_MAP__ = map;
    (window as any).__MOCK_SAVE_DIALOG_RESULT__ = '/mock/export/Bowser.animime';
    (window as any).__MOCK_WRITTEN_FILES__ = []; // Clear to isolate export write
  }, writtenFiles);

  // Hover to reveal export button, then click
  const bowserWrapper = page.locator('.pet-card-wrapper', {
    has: page.locator('.pet-name', { hasText: 'Bowser' }),
  });
  await bowserWrapper.hover();
  await page.click(`[data-testid="export-mime-${mimeId}"]`);

  // Wait for export to write the .animime file
  await page.waitForFunction(() => {
    const files = (window as any).__MOCK_WRITTEN_FILES__;
    return files && files.length > 0;
  });

  // Read the exported .animime JSON
  const exported = await page.evaluate(() => {
    const files = (window as any).__MOCK_WRITTEN_FILES__;
    const last = files[files.length - 1];
    const raw = last.contents;
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(Object.values(raw) as number[]);
    const text = new TextDecoder().decode(bytes);
    return { path: last.path, json: JSON.parse(text) };
  });

  // Verify .animime structure
  expect(exported.path).toContain('Bowser.animime');
  expect(exported.json.version).toBe(1);
  expect(exported.json.name).toBe('Bowser');

  // Verify all 7 statuses have non-empty sprite data
  for (const status of statusOrder) {
    expect(exported.json.sprites[status]).toBeDefined();
    expect(exported.json.sprites[status].data.length).toBeGreaterThan(0);
  }
  // Verify frame counts match our explicit ranges
  expect(exported.json.sprites.idle.frames).toBe(34);
  expect(exported.json.sprites.busy.frames).toBe(70);
  expect(exported.json.sprites.service.frames).toBe(19);
  expect(exported.json.sprites.disconnected.frames).toBe(30);
  expect(exported.json.sprites.searching.frames).toBe(22);
  expect(exported.json.sprites.initializing.frames).toBe(4);
  expect(exported.json.sprites.visiting.frames).toBe(33);

  // Verify smartImportMeta is present in export
  expect(exported.json.smartImportMeta).toBeDefined();
  expect(exported.json.smartImportMeta.sourceSheet.length).toBeGreaterThan(0);
  expect(exported.json.smartImportMeta.frameInputs.idle).toBe('1-34');
  expect(exported.json.smartImportMeta.frameInputs.visiting).toBe('164-196');

  // --- Step D: Import the .animime file into a fresh session -----------------
  // Delete the existing Bowser mime first
  await bowserWrapper.hover();
  await page.click(`[data-testid="delete-mime-${mimeId}"]`);
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'Bowser' })).not.toBeVisible();

  // Set up import mocks: inject the exported .animime bytes
  const animimePayload = JSON.stringify(exported.json);
  await page.evaluate((payload: string) => {
    (window as any).__MOCK_DIALOG_RESULT__ = '/mock/import/Bowser.animime';
    const encoder = new TextEncoder();
    (window as any).__MOCK_READ_FILE_BYTES__ = encoder.encode(payload);
    (window as any).__MOCK_WRITTEN_FILES__ = [];
  }, animimePayload);

  // Click import .animime button
  await page.click('[data-testid="import-animime-btn"]');

  // Bowser should appear in the mime list
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'Bowser' })).toBeVisible();

  // --- Step E: Verify the imported mime has smartImportMeta ------------------
  const storedAfterImport = await page.evaluate(async () => {
    const rid = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|load', { path: 'settings.json' }
    );
    const val = await (window as any).__TAURI_INTERNALS__.invoke(
      'plugin:store|get', { rid, key: 'customMimes' }
    );
    return val ? val[0] : null;
  });
  expect(storedAfterImport).toHaveLength(1);
  const importedMime = storedAfterImport[0];
  expect(importedMime.name).toBe('Bowser');

  // Verify frame counts survived the roundtrip
  expect(importedMime.sprites.idle.frames).toBe(34);
  expect(importedMime.sprites.busy.frames).toBe(70);
  expect(importedMime.sprites.service.frames).toBe(19);
  expect(importedMime.sprites.disconnected.frames).toBe(30);
  expect(importedMime.sprites.searching.frames).toBe(22);
  expect(importedMime.sprites.initializing.frames).toBe(4);
  expect(importedMime.sprites.visiting.frames).toBe(33);

  // Verify smartImportMeta survived the roundtrip
  expect(importedMime.smartImportMeta).toBeDefined();
  expect(importedMime.smartImportMeta.sheetFileName).toMatch(/-source\.png$/);
  expect(importedMime.smartImportMeta.frameInputs.idle).toBe('1-34');
  expect(importedMime.smartImportMeta.frameInputs.busy).toBe('68-128,128,128,128,128,128,128,128,128,129');
  expect(importedMime.smartImportMeta.frameInputs.visiting).toBe('164-196');

  // Verify source sheet was written to disk during import
  const wroteSource = await page.evaluate(() => {
    const files = (window as any).__MOCK_WRITTEN_FILES__ || [];
    return files.some((f: any) => /-source\.png$/.test(f.path ?? ''));
  });
  expect(wroteSource).toBe(true);

  // --- Step F: Verify imported Bowser renders on main page at tiny scale ----
  const importedId = importedMime.id;
  await page.addInitScript(tauriMockScript);
  await page.goto('/');
  await expect(page.locator('[data-testid="app-container"]')).toBeVisible();

  await page.evaluate((id: string) => {
    const emit = (window as any).__TEST_EMIT__;
    emit('custom-mimes-changed', [{
      id,
      name: 'Bowser',
      sprites: {
        idle:          { fileName: `${id}-idle.png`,          frames: 34 },
        busy:          { fileName: `${id}-busy.png`,          frames: 70 },
        service:       { fileName: `${id}-service.png`,       frames: 19 },
        disconnected:  { fileName: `${id}-disconnected.png`,  frames: 30 },
        searching:     { fileName: `${id}-searching.png`,     frames: 22 },
        initializing:  { fileName: `${id}-initializing.png`,  frames: 4 },
        visiting:      { fileName: `${id}-visiting.png`,      frames: 33 },
      },
    }]);
    emit('pet-changed', id);
    emit('scale-changed', 0.5);
  }, importedId);

  const sprite = page.locator('[data-testid="mascot-sprite"]');
  await expect(sprite).toBeVisible();
  // At scale 0.5, sprite should be 64×64 (128 * 0.5)
  await expect(sprite).toHaveCSS('width', '64px');
  await expect(sprite).toHaveCSS('height', '64px');

  // --- Step G: Delete the imported Bowser mime ------------------------------
  await page.addInitScript(tauriMockScript);
  await page.goto('/settings.html');
  await page.click('.sidebar-item:nth-child(2)');
  await expect(page.locator('.settings-title')).toHaveText('Mime');

  // Re-inject the mime so it appears in the list
  await page.evaluate((id: string) => {
    (window as any).__TEST_EMIT__('custom-mimes-changed', [{
      id,
      name: 'Bowser',
      sprites: {
        idle:          { fileName: `${id}-idle.png`,          frames: 34 },
        busy:          { fileName: `${id}-busy.png`,          frames: 70 },
        service:       { fileName: `${id}-service.png`,       frames: 19 },
        disconnected:  { fileName: `${id}-disconnected.png`,  frames: 30 },
        searching:     { fileName: `${id}-searching.png`,     frames: 22 },
        initializing:  { fileName: `${id}-initializing.png`,  frames: 4 },
        visiting:      { fileName: `${id}-visiting.png`,      frames: 33 },
      },
    }]);
  }, importedId);
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'Bowser' })).toBeVisible();

  const deleteWrapper = page.locator('.pet-card-wrapper', {
    has: page.locator('.pet-name', { hasText: 'Bowser' }),
  });
  await deleteWrapper.hover();
  await page.click(`[data-testid="delete-mime-${importedId}"]`);
  await expect(page.locator('.pet-card-wrapper .pet-name', { hasText: 'Bowser' })).not.toBeVisible();
});


// ---------------------------------------------------------------------------
// 17. Window auto-resizes to fit sprite content
// ---------------------------------------------------------------------------
test('window resizes to match sprite content, not fixed 500x220', async ({ page }) => {
  await loadWithMock(page);

  // Wait for initial render and auto-size
  await expect(page.locator('[data-testid="app-container"]')).toBeVisible();

  // Wait for at least one setSize call from the ResizeObserver
  await page.waitForFunction(() => {
    const sizes = (window as any).__MOCK_WINDOW_SIZES__;
    return sizes && sizes.length > 0;
  });

  const lastSize = await page.evaluate(() => {
    const sizes = (window as any).__MOCK_WINDOW_SIZES__;
    const last = sizes[sizes.length - 1];
    // Serialize through JSON to flatten class instances
    const parsed = JSON.parse(JSON.stringify(last.value));
    const logical = parsed.Logical ?? parsed;
    return { width: logical.width, height: logical.height };
  });

  // Window should NOT be the old hardcoded 500x220
  const isOldFixed = lastSize.width === 500 && lastSize.height === 220;
  expect(isOldFixed).toBe(false);

  // Window size should be positive and reasonable (content-driven)
  expect(lastSize.width).toBeGreaterThan(0);
  expect(lastSize.height).toBeGreaterThan(0);

  // The container's actual size should match what was sent to setSize
  const containerSize = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="app-container"]') as HTMLElement;
    return { width: el.offsetWidth, height: el.offsetHeight };
  });
  expect(lastSize.width).toBe(containerSize.width);
  expect(lastSize.height).toBe(containerSize.height);
});
