const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function measureWorkspace(page) {
  await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => !!window.SearchMonitorBoot, undefined, { timeout: 120000 });
  await page.evaluate(() => window.SearchMonitorBoot.expand());
  await page.waitForFunction(() => (
    !!window.__GEMINI_WORKSPACE_READY
    && !!document.getElementById('chatLog')
    && !!document.getElementById('systemLog')
  ), undefined, { timeout: 180000 });

  await page.evaluate(() => {
    const indicator = document.getElementById('loadingIndicator');
    indicator?.classList.add('wide-mode', 'gemini-monitor-workspace-active');
    const root = document.getElementById('gemini-ui-root');
    if (root) root.dataset.geminiMonitorView = 'full';
  });

  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns
      };
    };
    const pastChats = box('#pastChatsLog');
    const visibleUpperLog = pastChats && pastChats.display !== 'none' && pastChats.height > 0
      ? pastChats
      : box('#chatLog');
    const systemLog = box('#systemLog');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      indicator: box('#loadingIndicator'),
      demo: box('#gemini-ui-root[data-gemini-monitor-view="full"] .demo-content'),
      right: box('#gemini-ui-root[data-gemini-monitor-view="full"] .right-column'),
      chatLog: box('#chatLog'),
      pastChats,
      systemLog,
      upperToSystemGap: visibleUpperLog && systemLog ? Math.round(systemLog.top - visibleUpperLog.bottom) : null,
      agenticCardWidths: Array.from(document.querySelectorAll(
        '#gemini-ui-root[data-gemini-monitor-view="full"] .gemini-agentic-card'
      )).slice(0, 6).map((element) => Math.round(element.getBoundingClientRect().width))
    };
  });
}

function assertMetrics(metrics) {
  const minIndicatorWidth = metrics.viewport.width - 48;
  const minChatHeight = Math.max(330, Math.floor(metrics.viewport.height * 0.31));
  const maxChatHeight = Math.max(430, Math.ceil(metrics.viewport.height * 0.39));
  const minSystemHeight = Math.max(185, Math.floor(metrics.viewport.height * 0.18));
  const maxSystemHeight = Math.max(245, Math.ceil(metrics.viewport.height * 0.24));

  if (!metrics.indicator || metrics.indicator.width < minIndicatorWidth) {
    throw new Error(`Gemini workspace wide panel is too narrow: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.demo || !/px/.test(metrics.demo.gridTemplateColumns || '')) {
    throw new Error(`Gemini workspace did not use wide grid columns: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.chatLog || metrics.chatLog.height < minChatHeight) {
    throw new Error(`Conversation log is too short: ${JSON.stringify(metrics)}`);
  }
  if (metrics.chatLog.height > maxChatHeight) {
    throw new Error(`Conversation log is too tall: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.systemLog || metrics.systemLog.height < minSystemHeight) {
    throw new Error(`System log is too short: ${JSON.stringify(metrics)}`);
  }
  if (metrics.systemLog.height > maxSystemHeight) {
    throw new Error(`System log is too tall: ${JSON.stringify(metrics)}`);
  }
  if (metrics.upperToSystemGap === null || metrics.upperToSystemGap > 24) {
    throw new Error(`Log stack has a large vertical gap: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.agenticCardWidths.length || Math.min(...metrics.agenticCardWidths) < 200) {
    throw new Error(`Agentic cards are too narrow: ${JSON.stringify(metrics)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const results = [];

  try {
    for (const viewport of [{ width: 1365, height: 1050 }, { width: 2560, height: 1440 }, { width: 3440, height: 1800 }]) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));
      await page.addInitScript(() => {
        localStorage.setItem('eve.geminiMonitorView', 'full');
        localStorage.setItem('geminiConnectionEnabled', 'false');
      });
      await page.route(/http:\/\/127\.0\.0\.1:(?:3000|8765)\/api\/gemini-server\/status/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ running: false, state: 'stopped' })
        });
      });
      await page.route('http://127.0.0.1:9084/status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'running', port: 9084 })
        });
      });
      const metrics = await measureWorkspace(page);
      assertMetrics(metrics);
      results.push(metrics);
      await page.close();
    }
    if (pageErrors.length) throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
    console.log(`GEMINI_WORKSPACE_LAYOUT_BROWSER_SMOKE_OK ${JSON.stringify(results)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
