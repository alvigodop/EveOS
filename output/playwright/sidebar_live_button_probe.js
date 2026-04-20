const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack ? error.stack : error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const repoRoot = path.resolve(__dirname, '..', '..');
  const fileUrl = pathToFileURL(path.join(repoRoot, 'EveOS.html')).toString();
  const targetUrl = `${fileUrl}?ws=ws_sidebar_live_probe_${Date.now()}`;
  const screenshotPath = path.join(repoRoot, 'output', 'playwright', 'sidebar_live_button_probe.png');

  try {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(14000);

    const summary = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      const button = sidebar ? sidebar.querySelector('.ws-hover-reveal') : null;
      const style = button ? window.getComputedStyle(button) : null;
      const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
      const buttonRect = button ? button.getBoundingClientRect() : null;
      return {
        hasSidebar: !!sidebar,
        hasButton: !!button,
        buttonText: button ? button.textContent.trim() : '',
        buttonDisplay: style ? style.display : '',
        buttonOpacity: style ? style.opacity : '',
        buttonVisibility: style ? style.visibility : '',
        buttonBg: style ? style.backgroundImage || style.backgroundColor : '',
        buttonColor: style ? style.color : '',
        sidebarRect,
        buttonRect
      };
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.pageErrors = pageErrors.length;
    summary.consoleErrors = consoleErrors.length;
    summary.screenshotPath = screenshotPath;

    console.log(JSON.stringify(summary, null, 2));
    if (!summary.hasButton || summary.pageErrors > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
