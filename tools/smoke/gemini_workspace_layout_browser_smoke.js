const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1050 } });
  const pageErrors = [];
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

  try {
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

    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns
        };
      };
      return {
        demo: box('#gemini-ui-root[data-gemini-monitor-view="full"] .demo-content'),
        right: box('#gemini-ui-root[data-gemini-monitor-view="full"] .right-column'),
        chatLog: box('#chatLog'),
        systemLog: box('#systemLog'),
        agenticCardWidths: Array.from(document.querySelectorAll(
          '#gemini-ui-root[data-gemini-monitor-view="full"] .gemini-agentic-card'
        )).slice(0, 6).map((element) => Math.round(element.getBoundingClientRect().width))
      };
    });

    if (!metrics.demo || !/px/.test(metrics.demo.gridTemplateColumns || '')) {
      throw new Error(`Gemini workspace did not use wide grid columns: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.chatLog || metrics.chatLog.height < 290) {
      throw new Error(`Conversation log is too short: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.systemLog || metrics.systemLog.height < 165) {
      throw new Error(`System log is too short: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.agenticCardWidths.length || Math.min(...metrics.agenticCardWidths) < 200) {
      throw new Error(`Agentic cards are too narrow: ${JSON.stringify(metrics)}`);
    }
    if (pageErrors.length) throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
    console.log(`GEMINI_WORKSPACE_LAYOUT_BROWSER_SMOKE_OK ${JSON.stringify(metrics)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
