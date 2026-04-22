const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  const links = [];
  for (let categoryIndex = 1; categoryIndex <= 8; categoryIndex += 1) {
    const categoryName = `Cat${categoryIndex}`;
    for (let linkIndex = 1; linkIndex <= 24; linkIndex += 1) {
      links.push({
        id: `main-${categoryName}-${linkIndex}`,
        title: `${categoryName} Link ${linkIndex}`,
        url: `https://example.com/${categoryName.toLowerCase()}/${linkIndex}`,
        workspace: 'main',
        category: categoryName,
        done: linkIndex % 5 === 0
      });
    }
  }

  links.push({
    id: 'alt-root',
    title: 'Alt Root',
    url: 'https://example.com/alt',
    workspace: 'alt',
    category: 'Alt',
    done: false
  });

  return {
    links,
    config: {
      activeWorkspace: 'alt',
      viewMode: 'grid',
      sidebarExpanded: true,
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'alt', name: 'Alt', icon: 'folder' }
      ],
      categoryOrder: ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5', 'Cat6', 'Cat7', 'Cat8', 'Alt']
    },
    bookmarkFolders: {}
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.switchWorkspace === 'function'
  ), undefined, { timeout: 120000 });
}

async function seedState(page, seed) {
  await page.evaluate((payload) => {
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
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());

    await page.waitForSelector('.category-card[data-card-category="Alt"]', { timeout: 10000 });

    await page.evaluate(() => {
      if (typeof window.switchWorkspace !== 'function') throw new Error('switchWorkspace unavailable');
      window.switchWorkspace('main');
    });

    await page.waitForFunction(() => {
      const deferredCards = document.querySelectorAll('.category-card[data-card-deferred="1"]');
      const visibleCards = document.querySelectorAll('.category-card');
      return window.config?.activeWorkspace === 'main'
        && visibleCards.length >= 5
        && deferredCards.length >= 1;
    }, undefined, { timeout: 10000 });

    await page.waitForFunction(() => {
      const hydratedCard = document.querySelector('.category-card[data-card-category="Cat1"]:not([data-card-deferred="1"])');
      return !!hydratedCard
        && !!hydratedCard.querySelector('.category-footer')
        && !!hydratedCard.querySelector('.card-header-icon-row, .focus-card-controls');
    }, undefined, { timeout: 10000 });

    console.log('WORKSPACE_SWITCH_PROGRESSIVE_CARDS_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
