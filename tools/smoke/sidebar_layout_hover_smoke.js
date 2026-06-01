const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack ? error.stack : error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const repoRoot = path.resolve(__dirname, '..', '..');
  const fileUrl = pathToFileURL(path.join(repoRoot, 'EveOS.html')).toString();
  const targetUrl = `${fileUrl}?ws=ws_sidebar_layout_hover_${Date.now()}`;

  try {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(14000);

    const sidebar = page.locator('#sidebar');
    const hoverButton = page.locator('#sidebar .ws-hover-reveal');

    await sidebar.hover();
    await page.waitForTimeout(150);

    const initialSummary = await page.evaluate(() => {
      const sidebarEl = document.getElementById('sidebar');
      const button = sidebarEl ? sidebarEl.querySelector('.ws-hover-reveal') : null;
      const content = sidebarEl ? sidebarEl.querySelector('.ws-sidebar-content') : null;
      const rows = sidebarEl
        ? Array.from(sidebarEl.querySelectorAll('.ws-item, .ws-group-header, .ws-group-empty'))
        : [];

      const sidebarRect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
      const rowWidths = rows
        .filter((element) =>
          !element.classList.contains('ws-sub-item') &&
          !element.classList.contains('ws-hover-reveal'))
        .map((element) => Math.round(element.getBoundingClientRect().width));

      const overflowCount = rows.filter((element) => {
        const rect = element.getBoundingClientRect();
        return sidebarRect && rect.right > sidebarRect.right + 1;
      }).length;

      return {
        hasSidebar: !!sidebarEl,
        hasButton: !!button,
        hasContent: !!content,
        sidebarClassName: sidebarEl ? sidebarEl.className : '',
        buttonClassName: button ? button.className : '',
        overflowCount,
        rowWidths
      };
    });

    await hoverButton.hover();
    await page.waitForTimeout(200);

    const hoverSummary = await page.evaluate(() => {
      const sidebarEl = document.getElementById('sidebar');
      const button = sidebarEl ? sidebarEl.querySelector('.ws-hover-reveal') : null;
      const footer = sidebarEl ? sidebarEl.querySelector('.ws-sidebar-footer') : null;
      const content = sidebarEl ? sidebarEl.querySelector('.ws-sidebar-content') : null;
      const buttonRect = button ? button.getBoundingClientRect() : null;
      const sidebarRect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
      const footerRect = footer ? footer.getBoundingClientRect() : null;

      if (content) {
        const spacer = document.createElement('div');
        spacer.dataset.smokeSpacer = 'true';
        spacer.style.width = '100%';
        spacer.style.height = '1600px';
        spacer.style.pointerEvents = 'none';
        content.appendChild(spacer);
        content.scrollTop = content.scrollHeight;
      }

      const scrolledButtonRect = button ? button.getBoundingClientRect() : null;
      const scrolledFooterRect = footer ? footer.getBoundingClientRect() : null;
      const contentScrollTop = content ? content.scrollTop : 0;
      const contentCanScroll = content ? content.scrollHeight > content.clientHeight : false;

      return {
        hasButton: !!button,
        sidebarActive: !!(sidebarEl && sidebarEl.classList.contains('ws-hover-reveal-active')),
        buttonActive: !!(button && button.classList.contains('active')),
        buttonInFooter: !!(footer && button && button.parentElement === footer),
        buttonRect,
        sidebarRect,
        footerRect,
        scrolledButtonRect,
        scrolledFooterRect,
        contentScrollTop,
        contentCanScroll
      };
    });

    const uniqueRowWidths = Array.from(new Set(initialSummary.rowWidths || []));
    const summary = {
      ...initialSummary,
      ...hoverSummary,
      uniqueRowWidths,
      pageErrors,
      consoleErrors
    };

    console.log(JSON.stringify(summary, null, 2));

    const layoutOk = summary.hasSidebar
      && summary.hasButton
      && summary.overflowCount === 0
      && summary.buttonInFooter
      && summary.sidebarActive
      && summary.buttonActive
      && (!summary.contentCanScroll || (summary.contentScrollTop > 0
        && Math.abs(summary.scrolledFooterRect.bottom - summary.sidebarRect.bottom) <= 1
        && Math.abs(summary.scrolledButtonRect.bottom - summary.scrolledFooterRect.bottom) <= 12));

    if (!layoutOk || pageErrors.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
