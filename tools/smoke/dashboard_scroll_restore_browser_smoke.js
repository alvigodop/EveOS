const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  const links = [];
  const categoryOrder = [];
  for (let categoryIndex = 1; categoryIndex <= 40; categoryIndex += 1) {
    const categoryName = `ScrollCat${categoryIndex}`;
    categoryOrder.push(categoryName);
    for (let linkIndex = 1; linkIndex <= 18; linkIndex += 1) {
      links.push({
        id: `${categoryName}-${linkIndex}`,
        title: `${categoryName} Link ${linkIndex}`,
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

    await page.waitForFunction(() => document.querySelectorAll('.category-card').length >= 10, undefined, { timeout: 10000 });
    await page.evaluate(() => {
      window.__dashboardSmokeScrollTop = 900;
      window.scrollTo = function (_x, y) {
        window.__dashboardSmokeScrollTop = Number(y) || 0;
      };
      window._getRobustScrollTop = function () {
        return Number(window.__dashboardSmokeScrollTop || 0);
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
    });
    await page.waitForTimeout(50);

    const beforeRender = await page.evaluate(() => Math.round(window.scrollY || window.pageYOffset || 0));
    if (beforeRender < 600) {
      throw new Error(`Expected to reach a deep dashboard scroll position, got ${beforeRender}`);
    }

    await page.evaluate(() => window.renderDashboard());
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      window.__dashboardSmokeScrollTop = 240;
      document.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(450);

    const afterUserScroll = await page.evaluate(() => Math.round(window.scrollY || window.pageYOffset || 0));
    if (Math.abs(afterUserScroll - 240) > 80) {
      throw new Error(`Dashboard delayed restore overrode user scroll; expected near 240, got ${afterUserScroll}`);
    }

    console.log('DASHBOARD_SCROLL_RESTORE_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
