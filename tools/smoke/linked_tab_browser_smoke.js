const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'main-1', title: 'Main Bookmark A', url: 'https://example.com/a', workspace: 'main', category: 'Alpha', done: false },
      { id: 'main-2', title: 'Main Bookmark B', url: 'https://example.com/b', workspace: 'main', category: 'Alpha', done: false },
      { id: 'sub-1', title: 'Sub Tab Bookmark', url: 'https://example.com/sub', workspace: 'sub1', category: 'Alpha', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [
        { id: 'main', name: 'Main', icon: '📁', subTabs: [
          { id: 'sub1', name: 'Sub One', icon: '📂', subTabs: [] }
        ] },
        { id: 'alt', name: 'Alt', icon: '📁', subTabs: [] }
      ],
      categoryOrder: ['Alpha'],
      hideStats: [],
      collapsedTabs: []
    },
    bookmarkFolders: {}
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.switchWorkspace === 'function'
    && !!window.EveWorkspaceHelpers?.findById
  ), undefined, { timeout: 120000 });
}

async function seedState(page, seed) {
  await page.evaluate((payload) => {
    try { localStorage.clear(); } catch (_) {}
    config = JSON.parse(JSON.stringify(payload.config));
    links = JSON.parse(JSON.stringify(payload.links));
    bookmarkFolders = JSON.parse(JSON.stringify(payload.bookmarkFolders || {}));
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }
    try {
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage in some runs
    }
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  // ──────────────────────────────────────────────
  // TEST 1: ctxWsCreateShortcut creates a linked tab
  // ──────────────────────────────────────────────
  console.log('  [1] Creating shortcut via ctxWsCreateShortcut...');
  await page.evaluate(() => {
    window.ctxWsId = 'main';
    if (typeof window.ctxWsCreateShortcut !== 'function') {
      throw new Error('ctxWsCreateShortcut is not defined');
    }
    window.ctxWsCreateShortcut();
  });

  // Verify a new linked tab was created at root level
  const linkedTab = await page.evaluate(() => {
    const helpers = window.EveWorkspaceHelpers;
    const all = helpers.flatten(config.workspaces);
    const linked = all.find(ws => ws.linkedTo === 'main');
    if (!linked) return null;
    return {
      id: linked.id,
      name: linked.name,
      icon: linked.icon,
      linkedTo: linked.linkedTo,
      isRoot: config.workspaces.some(ws => ws.id === linked.id)
    };
  });

  if (!linkedTab) throw new Error('TEST 1 FAILED: No linked tab was created');
  if (!linkedTab.name.includes('(Link)')) throw new Error(`TEST 1 FAILED: Name should contain "(Link)", got: ${linkedTab.name}`);
  if (linkedTab.icon !== '🔗') throw new Error(`TEST 1 FAILED: Icon should be 🔗, got: ${linkedTab.icon}`);
  if (linkedTab.linkedTo !== 'main') throw new Error(`TEST 1 FAILED: linkedTo should be "main", got: ${linkedTab.linkedTo}`);
  if (!linkedTab.isRoot) throw new Error('TEST 1 FAILED: Linked tab should be at root level');
  console.log(`  [1] PASS — Created "${linkedTab.name}" (${linkedTab.icon}) → linkedTo: ${linkedTab.linkedTo}`);

  // ──────────────────────────────────────────────
  // TEST 2: Switching to linked tab shows inherited cards
  // ──────────────────────────────────────────────
  console.log('  [2] Switching to linked tab...');
  await page.evaluate((tabId) => {
    window.switchWorkspace(tabId);
  }, linkedTab.id);

  // Wait for dashboard to render
  await page.waitForFunction((tabId) => {
    return String(window.config?.activeWorkspace) === tabId;
  }, linkedTab.id, { timeout: 10000 });

  // Small delay for deferred render batches to complete
  await page.waitForTimeout(1000);

  const visibleCards = await page.evaluate(() => {
    const cards = document.querySelectorAll('.category-card');
    const linkItems = document.querySelectorAll('.category-card li');
    return {
      cardCount: cards.length,
      linkCount: linkItems.length,
      linkTitles: Array.from(linkItems).map(li => {
        const a = li.querySelector('a');
        return a ? a.textContent.trim() : '';
      }).filter(Boolean)
    };
  });

  if (visibleCards.linkCount === 0) throw new Error('TEST 2 FAILED: No inherited bookmarks visible in linked tab');
  console.log(`  [2] PASS — ${visibleCards.linkCount} bookmarks visible: [${visibleCards.linkTitles.join(', ')}]`);

  // ──────────────────────────────────────────────
  // TEST 3: Inherited cards from main have ⚓ Main Link badge
  // ──────────────────────────────────────────────
  console.log('  [3] Checking origin badges...');
  const badges = await page.evaluate(() => {
    const items = document.querySelectorAll('.category-card li');
    const result = { mainLink: [], mainSubTab: [], shortcutLocal: [], noBadge: [] };
    items.forEach(li => {
      const badge = li.querySelector('.subtab-origin-badge');
      const a = li.querySelector('a');
      const title = a ? a.textContent.trim() : '?';
      if (!badge) {
        result.noBadge.push(title);
      } else {
        const text = badge.textContent.trim();
        if (text.includes('Main Link')) result.mainLink.push(title);
        else if (text.includes('Main Sub-Tab')) result.mainSubTab.push(title);
        else if (text.includes('Shortcut Local')) result.shortcutLocal.push(title);
        else result.noBadge.push(title + ' (badge: ' + text + ')');
      }
    });
    return result;
  });

  if (badges.mainLink.length === 0) throw new Error('TEST 3 FAILED: No ⚓ Main Link badges found on inherited cards');
  console.log(`  [3] PASS — ⚓ Main Link: [${badges.mainLink.join(', ')}]`);
  if (badges.mainSubTab.length > 0) console.log(`       ⚓ Main Sub-Tab: [${badges.mainSubTab.join(', ')}]`);
  if (badges.shortcutLocal.length > 0) console.log(`       🔗 Shortcut Local: [${badges.shortcutLocal.join(', ')}]`);

  // ──────────────────────────────────────────────
  // TEST 4: Sub-tab cards have ⚓ Main Sub-Tab badge
  // ──────────────────────────────────────────────
  console.log('  [4] Checking sub-tab origin badges...');
  if (badges.mainSubTab.length === 0) throw new Error('TEST 4 FAILED: No ⚓ Main Sub-Tab badges found (expected Sub Tab Bookmark)');
  if (!badges.mainSubTab.includes('Sub Tab Bookmark')) {
    throw new Error(`TEST 4 FAILED: Expected "Sub Tab Bookmark" to have ⚓ Main Sub-Tab badge, got: [${badges.mainSubTab.join(', ')}]`);
  }
  console.log(`  [4] PASS — Sub-tab bookmark correctly badged as ⚓ Main Sub-Tab`);

  // ──────────────────────────────────────────────
  // TEST 5: Adding a card to the linked tab gets 🔗 Shortcut Local badge
  // ──────────────────────────────────────────────
  console.log('  [5] Adding a local card to the shortcut tab...');
  await page.evaluate((tabId) => {
    const newLink = {
      id: 'local-shortcut-1',
      title: 'Shortcut Local Card',
      url: 'https://example.com/local',
      workspace: tabId,
      category: 'Alpha',
      done: false
    };
    links.push(newLink);
    if (window.eveState) window.eveState.links = links;
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, linkedTab.id);

  await page.waitForTimeout(500);

  const localBadges = await page.evaluate(() => {
    const items = document.querySelectorAll('.category-card li');
    const result = [];
    items.forEach(li => {
      const badge = li.querySelector('.subtab-origin-badge');
      const a = li.querySelector('a');
      const title = a ? a.textContent.trim() : '?';
      if (badge && badge.textContent.includes('Shortcut Local')) {
        result.push(title);
      }
    });
    return result;
  });

  if (localBadges.length === 0) throw new Error('TEST 5 FAILED: No 🔗 Shortcut Local badge found on locally-added card');
  if (!localBadges.includes('Shortcut Local Card')) {
    throw new Error(`TEST 5 FAILED: Expected "Shortcut Local Card" to have 🔗 Shortcut Local badge, got: [${localBadges.join(', ')}]`);
  }
  console.log(`  [5] PASS — Local card correctly badged as 🔗 Shortcut Local`);

  // ──────────────────────────────────────────────
  // TEST 6: Sidebar shows the linked tab with correct icon/name
  // ──────────────────────────────────────────────
  console.log('  [6] Verifying sidebar shows linked tab...');
  const sidebarEntry = await page.evaluate((tabId) => {
    const items = document.querySelectorAll('#sidebar .ws-item');
    for (const item of items) {
      const icon = item.querySelector('.ws-icon');
      const label = item.querySelector('.ws-label');
      if (icon && label && label.textContent.includes('(Link)')) {
        return { icon: icon.textContent.trim(), label: label.textContent.trim() };
      }
    }
    return null;
  }, linkedTab.id);

  if (!sidebarEntry) throw new Error('TEST 6 FAILED: Linked tab not found in sidebar');
  console.log(`  [6] PASS — Sidebar entry: ${sidebarEntry.icon} ${sidebarEntry.label}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('LINKED_TAB_BROWSER_SMOKE: Starting...');
    console.log('  URL: ' + FILE_URL);
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    console.log('LINKED_TAB_BROWSER_SMOKE_OK');
  } catch (err) {
    console.error('LINKED_TAB_BROWSER_SMOKE_FAIL: ' + err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
