const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  const links = [];
  const categoryOrder = [];
  for (let categoryIndex = 1; categoryIndex <= 8; categoryIndex += 1) {
    const categoryName = `MasonryCat${categoryIndex}`;
    categoryOrder.push(categoryName);
    for (let linkIndex = 1; linkIndex <= 10 + categoryIndex; linkIndex += 1) {
      links.push({
        id: `${categoryName}-${linkIndex}`,
        title: `${categoryName} Link ${linkIndex} with extra text to vary height`,
        url: `https://example.com/${categoryName.toLowerCase()}/${linkIndex}`,
        workspace: 'main',
        category: categoryName,
        done: false
      });
    }
  }

  return {
    links,
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      sidebarExpanded: true,
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' }
      ],
      categoryOrder
    },
    bookmarkFolders: {}
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && !!window.EveDashboardMasonryHelpers?.refreshDashboardMasonryLayout
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());

    await page.waitForFunction(() => document.querySelectorAll('.category-card').length >= 8, undefined, { timeout: 10000 });
    await page.evaluate(() => {
      window.__dashboardSmokeScrollTop = 900;
      window.scrollTo = function (_x, y) {
        window.__dashboardSmokeScrollTop = Number(y) || 0;
      };
      Object.defineProperty(window, 'pageYOffset', {
        configurable: true,
        get() {
          return Number(window.__dashboardSmokeScrollTop || 0);
        }
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        get() {
          return Number(window.__dashboardSmokeScrollTop || 0);
        }
      });
      Object.defineProperty(document.documentElement, 'scrollTop', {
        configurable: true,
        get() {
          return Number(window.__dashboardSmokeScrollTop || 0);
        }
      });
      Object.defineProperty(document.body, 'scrollTop', {
        configurable: true,
        get() {
          return Number(window.__dashboardSmokeScrollTop || 0);
        }
      });
    });

    const before = await page.evaluate(() => Math.round(window.scrollY || window.pageYOffset || 0));
    if (before < 600) {
      throw new Error(`Expected starting deep scroll position, got ${before}`);
    }

    await page.evaluate(() => {
      const grid = document.getElementById('dashboard-grid');
      if (!grid) throw new Error('dashboard-grid missing');
      window.EveDashboardMasonryHelpers.refreshDashboardMasonryLayout(grid);
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -180, bubbles: true, cancelable: true }));
      window.__dashboardSmokeScrollTop = 240;
    });
    await page.waitForTimeout(120);

    const after = await page.evaluate(() => Math.round(window.scrollY || window.pageYOffset || 0));
    if (Math.abs(after - 240) > 80) {
      throw new Error(`Masonry restore overrode user scroll; expected near 240, got ${after}`);
    }

    console.log('DASHBOARD_MASONRY_SCROLL_RESTORE_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
