const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'main-alpha-1', title: 'Main Alpha Bookmark', url: 'https://example.com/main-alpha', workspace: 'main', category: 'Alpha', done: false },
      { id: 'sub-alpha-1', title: 'Sub Alpha Bookmark A', url: 'https://example.com/sub-alpha-a', workspace: 'sub1', category: 'Alpha', done: false },
      { id: 'sub-alpha-2', title: 'Sub Alpha Bookmark B', url: 'https://example.com/sub-alpha-b', workspace: 'sub1', category: 'Alpha', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [
        {
          id: 'main',
          name: 'Main',
          icon: 'M',
          subTabs: [
            { id: 'sub1', name: 'Sub One', icon: 'S', subTabs: [] }
          ]
        }
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
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="sub1"]', { timeout: 10000 });

  const result = await page.evaluate(() => {
    const childCard = document.querySelector('.category-card[data-card-category="Alpha"][data-card-workspace="sub1"]');
    if (!childCard) return null;
    return {
      headerBadges: Array.from(childCard.querySelectorAll('.card-subtab-source')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      rowBadges: Array.from(childCard.querySelectorAll('li .subtab-origin-badge')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      rowTitles: Array.from(childCard.querySelectorAll('li a')).map((node) => node.textContent.replace(/\s+/g, ' ').trim())
    };
  });

  if (!result) throw new Error('Child sub-tab card did not render');
  if (result.headerBadges.length === 0) {
    throw new Error('Expected child sub-tab card to render a card-level source badge');
  }
  if (!result.headerBadges.some((text) => text.includes('Sub One'))) {
    throw new Error(`Expected card-level source badge to mention "Sub One", got [${result.headerBadges.join(', ')}]`);
  }
  if (result.rowBadges.length !== 0) {
    throw new Error(`Expected no per-bookmark sub-tab badges inside child card, got [${result.rowBadges.join(', ')}] for [${result.rowTitles.join(', ')}]`);
  }

  console.log('SUBTAB_CARD_BADGE_SCOPE_BROWSER_SMOKE_OK');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

  try {
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
