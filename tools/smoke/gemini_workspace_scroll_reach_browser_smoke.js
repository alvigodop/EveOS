const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1912, height: 913 } });
    await page.addInitScript(() => {
      localStorage.setItem('eve.geminiMonitorView', 'full');
      localStorage.setItem('geminiConnectionEnabled', 'false');
    });
    await page.route(/http:\/\/127\.0\.0\.1:(?:3000|8765)\/api\/gemini-server\/status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: true, state: 'running' })
      });
    });
    await page.route('http://127.0.0.1:9084/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'running', port: 9084 })
      });
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => !!window.SearchMonitorBoot, undefined, { timeout: 120000 });
    await page.evaluate(() => window.SearchMonitorBoot.expand());
    await page.waitForFunction(() => (
      !!window.__GEMINI_WORKSPACE_READY
      && !!document.getElementById('geminiLiveLinkDataStreamToggle')
    ), undefined, { timeout: 180000 });
    const metrics = await page.evaluate(() => {
      const indicator = document.getElementById('loadingIndicator');
      indicator?.classList.add('wide-mode', 'gemini-monitor-workspace-active');
      const root = document.getElementById('gemini-ui-root');
      if (root) {
        root.dataset.geminiMonitorView = 'full';
        root.scrollTop = root.scrollHeight;
      }
      const target = document.getElementById('geminiLiveLinkDataStreamToggle');
      const agentic = document.querySelector('.agentic-functions');
      const read = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          scrollHeight: Math.round(element.scrollHeight),
          clientHeight: Math.round(element.clientHeight),
          overflowY: style.overflowY
        };
      };
      return {
        root: read(root),
        target: read(target),
        agentic: read(agentic)
      };
    });
    if (!metrics.root || !metrics.target || !metrics.agentic) {
      throw new Error(`Missing scroll target metrics: ${JSON.stringify(metrics)}`);
    }
    if (metrics.agentic.overflowY === 'hidden' && metrics.agentic.scrollHeight > metrics.agentic.clientHeight) {
      throw new Error(`Agentic functions are clipping content: ${JSON.stringify(metrics)}`);
    }
    if (metrics.target.bottom > metrics.root.bottom + 8) {
      throw new Error(`Lower EveOS Relay controls are not reachable after scroll: ${JSON.stringify(metrics)}`);
    }
    console.log(`GEMINI_WORKSPACE_SCROLL_REACH_BROWSER_SMOKE_OK ${JSON.stringify(metrics)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
