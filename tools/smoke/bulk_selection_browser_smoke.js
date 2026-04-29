const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'p1', title: 'Plain One', url: 'https://example.com/p1', workspace: 'main', category: 'AlphaPlain' },
      { id: 'p2', title: 'Plain Two', url: 'https://example.com/p2', workspace: 'main', category: 'AlphaPlain' },
      { id: 'p3', title: 'Plain Three', url: 'https://example.com/p3', workspace: 'main', category: 'AlphaPlain' },
      { id: 'p4', title: 'Plain Four', url: 'https://example.com/p4', workspace: 'main', category: 'AlphaPlain' },

      { id: 'f1', title: 'Folder Parent Link', url: 'https://example.com/f1', workspace: 'main', category: 'AlphaFolder', folderId: 'folder-parent' },
      { id: 'f2', title: 'Folder Child Link', url: 'https://example.com/f2', workspace: 'main', category: 'AlphaFolder', folderId: 'folder-child' },
      { id: 'f3', title: 'Folder Other Link', url: 'https://example.com/f3', workspace: 'main', category: 'AlphaFolder', folderId: 'folder-other' },
      { id: 'f4', title: 'Folder Root Link', url: 'https://example.com/f4', workspace: 'main', category: 'AlphaFolder' },

      { id: 's1', title: 'Second Target Link', url: 'https://example.com/s1', workspace: 'second', category: 'TargetCard' },
      { id: 's2', title: 'Second Else Link', url: 'https://example.com/s2', workspace: 'second', category: 'ElseCard' }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'second', name: 'Second', icon: 'folder' }
      ],
      categoryOrder: ['AlphaPlain', 'AlphaFolder'],
      cardFolderViewModes: {
        'main::AlphaFolder': true
      }
    },
    bookmarkFolders: {
      'main::AlphaFolder': {
        nodes: [
          { id: 'folder-parent', parentId: null, name: 'Parent Folder', order: 0 },
          { id: 'folder-child', parentId: 'folder-parent', name: 'Child Folder', order: 1 },
          { id: 'folder-other', parentId: null, name: 'Other Folder', order: 2 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.toggleBulkMode
    && !!window.bulkToggleCardScopeSelection
    && !!window.bulkToggleFolderScopeSelection
    && !!window.bulkMarkDone
    && !!window.bulkMarkUndone
    && !!window.confirmBulkTabMove
    && typeof window.renderBulkTabOptions === 'function'
    && typeof window.renderBulkMoveCategoryOptions === 'function'
  ), undefined, { timeout: 120000 });
}

async function seedState(page, payload) {
  await page.evaluate((seed) => {
    config = JSON.parse(JSON.stringify(seed.config));
    links = JSON.parse(JSON.stringify(seed.links));
    bookmarkFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders || {}));
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, payload);
}

async function installBulkInstrumentation(page) {
  await page.evaluate(() => {
    window.__bulkSmokeEvents = [];
    window.__bulkSmokeSaves = [];
    window.addEventListener('eve:bulk-bookmark-move', (event) => {
      window.__bulkSmokeEvents.push({
        type: 'eve:bulk-bookmark-move',
        detail: event.detail
      });
    });
    window.addEventListener('eve:state-mutated', (event) => {
      window.__bulkSmokeEvents.push({
        type: 'eve:state-mutated',
        detail: event.detail
      });
    });
    if (!window.__bulkSmokeSaveWrapped && typeof window.saveData === 'function') {
      const originalSaveData = window.saveData;
      window.saveData = function smokeSaveDataWrapper(payload) {
        window.__bulkSmokeSaves.push(JSON.parse(JSON.stringify(payload || {})));
        return originalSaveData.apply(this, arguments);
      };
      window.__bulkSmokeSaveWrapped = true;
    }
  });
}

async function getSelectedIds(page) {
  return await page.evaluate(() => Array.from(window.EveBulkToolbar.getSelectedIds()).sort());
}

async function clearSelection(page) {
  await page.evaluate(() => {
    window.EveBulkToolbar.clearSelection();
    window.EveBulkToolbar.updateBulkUI();
  });
}

async function activateBulkMode(page) {
  const isActive = await page.evaluate(() => document.body.classList.contains('bulk-active'));
  if (!isActive) {
    await page.evaluate(() => window.toggleBulkMode());
    await page.waitForFunction(() => document.body.classList.contains('bulk-active'));
  }
}

async function openTabMoveModal(page) {
  await page.locator('#bulk-toolbar button', { hasText: 'Tab' }).click();
  await page.waitForSelector('#bulk-tab-modal-overlay[style*="flex"]', { timeout: 5000 });
}

async function runSmoke(page) {
  await activateBulkMode(page);

  const alphaPlainCard = page.locator('.category-card', {
    has: page.locator('.category-title', { hasText: 'AlphaPlain' })
  }).first();
  const alphaPlainChecks = alphaPlainCard.locator('.bulk-check');
  if ((await alphaPlainChecks.count()) < 4) {
    throw new Error('Expected four bulk checkboxes in AlphaPlain card.');
  }
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.category-card')).find((node) => {
      const title = node.querySelector('.category-title');
      return title && title.textContent.trim() === 'AlphaPlain';
    });
    if (!card) throw new Error('Missing AlphaPlain card for range selection');
    const checks = Array.from(card.querySelectorAll('.bulk-check[data-bulk-id]'));
    const first = checks[0];
    const third = checks[2];
    if (!first || !third) throw new Error('Missing expected visible range checkboxes');
    first.checked = true;
    window.toggleSelect(first, first.getAttribute('data-bulk-id'), {
      stopPropagation() {},
      preventDefault() {},
      shiftKey: false
    });
    third.checked = true;
    window.toggleSelect(third, third.getAttribute('data-bulk-id'), {
      stopPropagation() {},
      preventDefault() {},
      shiftKey: true
    });
  });
  let selectedIds = await getSelectedIds(page);
  if (selectedIds.join('|') !== 'p1|p2|p3') {
    throw new Error(`Shift range selection mismatch: ${selectedIds.join('|')}`);
  }

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.category-card')).find((node) => {
      const title = node.querySelector('.category-title');
      return title && title.textContent.trim() === 'AlphaPlain';
    });
    const checks = Array.from(card.querySelectorAll('.bulk-check[data-bulk-id]'));
    const second = checks[1];
    second.checked = false;
    window.toggleSelect(second, second.getAttribute('data-bulk-id'), {
      stopPropagation() {},
      preventDefault() {},
      shiftKey: false
    });
  });
  selectedIds = await getSelectedIds(page);
  if (selectedIds.join('|') !== 'p1|p3') {
    throw new Error(`Normal toggle after shift range mismatch: ${selectedIds.join('|')}`);
  }

  await clearSelection(page);
  if (!(await alphaPlainCard.locator('.card-header-icon-btn.bulk-scope-btn[title="Select Card"]').first().isVisible())) {
    throw new Error('Card scope select button is not visible in bulk mode.');
  }
  await page.evaluate(() => window.bulkToggleCardScopeSelection('AlphaPlain', 'main'));
  selectedIds = await getSelectedIds(page);
  if (selectedIds.join('|') !== 'p1|p2|p3|p4') {
    throw new Error(`Card scope selection mismatch: ${selectedIds.join('|')}`);
  }

  await clearSelection(page);
  const alphaFolderCard = page.locator('.category-card', {
    has: page.locator('.category-title', { hasText: 'AlphaFolder' })
  }).first();
  const folderScopeButton = alphaFolderCard.locator('.folder-tile-edit-btn.bulk-scope-btn[title="Select Folder Subtree"]').first();
  if (!(await folderScopeButton.isVisible())) {
    throw new Error('Folder subtree select button is not visible in bulk mode.');
  }
  await page.evaluate(() => window.bulkToggleFolderScopeSelection('AlphaFolder', 'main', 'folder-parent'));
  selectedIds = await getSelectedIds(page);
  if (selectedIds.join('|') !== 'f1|f2') {
    throw new Error(`Folder subtree selection mismatch: ${selectedIds.join('|')}`);
  }

  await page.evaluate(() => window.bulkMarkDone());
  let doneStates = await page.evaluate(() => window.links.filter((link) => ['f1', 'f2'].includes(link.id)).map((link) => ({ id: link.id, done: !!link.done })));
  if (!doneStates.every((entry) => entry.done)) {
    throw new Error(`Bulk mark done failed: ${JSON.stringify(doneStates)}`);
  }

  await page.evaluate(() => window.bulkMarkUndone());
  doneStates = await page.evaluate(() => window.links.filter((link) => ['f1', 'f2'].includes(link.id)).map((link) => ({ id: link.id, done: !!link.done })));
  if (doneStates.some((entry) => entry.done)) {
    throw new Error(`Bulk mark undone failed: ${JSON.stringify(doneStates)}`);
  }

  await clearSelection(page);
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.category-card')).find((node) => {
      const title = node.querySelector('.category-title');
      return title && title.textContent.trim() === 'AlphaPlain';
    });
    const checks = Array.from(card.querySelectorAll('.bulk-check[data-bulk-id]'));
    [checks[0], checks[1]].forEach((checkbox) => {
      checkbox.checked = true;
      window.toggleSelect(checkbox, checkbox.getAttribute('data-bulk-id'), {
        stopPropagation() {},
        preventDefault() {},
        shiftKey: false
      });
    });
  });
  await openTabMoveModal(page);

  const modalSummary = await page.locator('#bulk-tab-selection-summary').textContent();
  if (!String(modalSummary || '').includes('2 selected')) {
    throw new Error(`Bulk tab modal summary did not reflect selection: ${modalSummary}`);
  }

  await page.fill('#bulk-tab-workspace-filter', 'Second');
  await page.waitForTimeout(100);
  let workspaceOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#bulk-tab-existing-select option')).map((option) => ({
    value: option.value,
    text: option.textContent.trim()
  })));
  if (workspaceOptions.length !== 1 || workspaceOptions[0].value !== 'second') {
    throw new Error(`Destination tab filter mismatch: ${JSON.stringify(workspaceOptions)}`);
  }

  await page.selectOption('#bulk-tab-existing-select', 'second');
  await page.waitForTimeout(100);
  await page.fill('#bulk-tab-card-filter', 'Target');
  await page.waitForTimeout(100);
  let filteredCardOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#bulk-tab-card-existing-select option')).map((option) => option.value));
  if (filteredCardOptions.join('|') !== 'TargetCard') {
    throw new Error(`Destination card filter mismatch: ${filteredCardOptions.join('|')}`);
  }
  await page.fill('#bulk-tab-card-filter', 'NoCardSmoke');
  await page.waitForTimeout(100);
  let activeCardMode = await page.evaluate(() => document.querySelector('input[name="bulkTabCardMode"]:checked')?.value || '');
  if (activeCardMode !== 'new') {
    throw new Error(`Card filter miss should temporarily switch to new-card mode, got ${activeCardMode}`);
  }
  await page.fill('#bulk-tab-card-filter', 'Target');
  await page.waitForTimeout(100);
  activeCardMode = await page.evaluate(() => document.querySelector('input[name="bulkTabCardMode"]:checked')?.value || '');
  if (activeCardMode !== 'existing') {
    throw new Error(`Clearing a card-filter miss should restore existing-card mode, got ${activeCardMode}`);
  }
  await page.fill('#bulk-tab-card-filter', '');
  await page.waitForTimeout(100);
  const existingCardOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#bulk-tab-card-existing-select option')).map((option) => option.value));
  if (existingCardOptions.includes('AlphaPlain') || existingCardOptions.includes('AlphaFolder')) {
    throw new Error(`Destination card options leaked source-tab cards: ${existingCardOptions.join('|')}`);
  }
  if (!existingCardOptions.includes('TargetCard') || !existingCardOptions.includes('ElseCard')) {
    throw new Error(`Destination card options missing target cards: ${existingCardOptions.join('|')}`);
  }
  await page.selectOption('#bulk-tab-card-existing-select', 'TargetCard');
  await page.evaluate(() => window.confirmBulkTabMove());
  await page.waitForFunction(() => !document.body.classList.contains('bulk-active'));

  const firstMoveMeta = await page.evaluate(() => ({
    moveEvents: window.__bulkSmokeEvents.filter((event) => event.type === 'eve:bulk-bookmark-move'),
    saves: window.__bulkSmokeSaves
  }));
  const firstMoveEvent = firstMoveMeta.moveEvents[firstMoveMeta.moveEvents.length - 1];
  if (!firstMoveEvent || firstMoveEvent.detail.source !== 'bulk-workspace-bookmark-move') {
    throw new Error(`Bulk move event metadata missing: ${JSON.stringify(firstMoveMeta.moveEvents)}`);
  }
  if (!Array.isArray(firstMoveEvent.detail.touchedScopes) || firstMoveEvent.detail.touchedScopes.length < 2) {
    throw new Error(`Bulk move event did not include touched scopes: ${JSON.stringify(firstMoveEvent.detail)}`);
  }
  const firstSave = firstMoveMeta.saves[firstMoveMeta.saves.length - 1];
  if (!firstSave || firstSave.source !== 'bulk-workspace-bookmark-move' || firstSave.meta?.kind !== 'bulk-move') {
    throw new Error(`Bulk move save metadata missing: ${JSON.stringify(firstMoveMeta.saves)}`);
  }

  let movedLinks = await page.evaluate(() => window.links.filter((link) => ['p1', 'p2'].includes(link.id)).map((link) => ({
    id: link.id,
    workspace: link.workspace,
    category: link.category,
    folderId: link.folderId || ''
  })));
  if (!movedLinks.every((entry) => entry.workspace === 'second' && entry.category === 'TargetCard' && !entry.folderId)) {
    throw new Error(`Existing-card tab move mismatch: ${JSON.stringify(movedLinks)}`);
  }

  await activateBulkMode(page);
  await page.evaluate(() => {
    const checkbox = document.querySelector('.bulk-check[data-bulk-id="p3"]');
    checkbox.checked = true;
    window.toggleSelect(checkbox, checkbox.getAttribute('data-bulk-id'), {
      stopPropagation() {},
      preventDefault() {},
      shiftKey: false
    });
  });
  await openTabMoveModal(page);
  await page.selectOption('#bulk-tab-existing-select', 'second');
  await page.locator('input[name="bulkTabCardMode"][value="new"]').check();
  await page.fill('#bulk-tab-card-new-input', 'FreshCard');
  await page.evaluate(() => window.confirmBulkTabMove());
  await page.waitForFunction(() => !document.body.classList.contains('bulk-active'));

  movedLinks = await page.evaluate(() => window.links.filter((link) => link.id === 'p3').map((link) => ({
    id: link.id,
    workspace: link.workspace,
    category: link.category
  })));
  if (movedLinks.length !== 1 || movedLinks[0].workspace !== 'second' || movedLinks[0].category !== 'FreshCard') {
    throw new Error(`New-card tab move mismatch: ${JSON.stringify(movedLinks)}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await installBulkInstrumentation(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    console.log('BULK_SELECTION_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})();
