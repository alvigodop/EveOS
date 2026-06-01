const { chromium } = require('playwright');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
  const url = 'file:///' + path.resolve(repoRoot, 'EveOS.html').replace(/\\/g, '/');

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(8000);

  const results = await page.evaluate(async () => {
    const faviconUtils = window.EveFaviconUtils || null;
    const helperFactory = window.UnidexViewModules?.createCoreHelperFormat;
    const unidexHelpers = typeof helperFactory === 'function' ? helperFactory() : null;
    const focusedHelpers = window.DashboardCategoriesModules?.focusedLinkHelpers || null;

    const syntheticLink = {
      id: '__favicon_probe__',
      title: 'Favicon Probe',
      url: 'example.com/articles/test',
      icon: 'https://example.invalid/broken-icon.png',
      category: 'Start',
      workspace: 'main',
      done: false
    };

    const listHost = document.createElement('ul');
    listHost.innerHTML = window.DashboardCategories.buildLinkHtml(
      syntheticLink,
      '',
      'main',
      [{ id: 'main', name: 'Main' }],
      {}
    );
    document.body.appendChild(listHost);

    const listImg = listHost.querySelector('img');
    if (listImg) {
      listImg.dispatchEvent(new Event('error'));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const unidexHtml = unidexHelpers?.buildBookmarkIconHtml
      ? unidexHelpers.buildBookmarkIconHtml(syntheticLink, 'Favicon Probe')
      : '';
    const focusedHtml = focusedHelpers?.buildBookmarkIconHtml
      ? focusedHelpers.buildBookmarkIconHtml(syntheticLink, 'Favicon Probe')
      : '';

    const dataIconLink = {
      ...syntheticLink,
      id: '__favicon_probe_data__',
      icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 16 16%22%3E%3Crect width=%2216%22 height=%2216%22 rx=%224%22 fill=%22%2300d4ff%22/%3E%3C/svg%3E'
    };
    const dataHost = document.createElement('ul');
    dataHost.innerHTML = window.DashboardCategories.buildLinkHtml(
      dataIconLink,
      '',
      'main',
      [{ id: 'main', name: 'Main' }],
      {}
    );
    document.body.appendChild(dataHost);
    const dataImg = dataHost.querySelector('img');

    return {
      hasDomainHelper: !!(faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'),
      extractedDomain: faviconUtils?.getDomainFromUrl?.('example.com/articles/test') || '',
      fallbackSrcPrefix: String(faviconUtils?.getFallbackSrc?.('example.com', 32) || '').slice(0, 18),
      listIcon: listImg ? {
        srcAttr: listImg.getAttribute('src') || '',
        currentSrc: listImg.currentSrc || '',
        fallbackApplied: listImg.dataset.fallbackApplied || '',
        fallbackSrc: listImg.dataset.fallbackSrc || ''
      } : null,
      unidexHasFallbackAttr: /data-fallback-src=/.test(unidexHtml),
      focusedHasFallbackAttr: /data-fallback-src=/.test(focusedHtml),
      dataIconCurrentSrc: dataImg?.currentSrc || '',
      dataIconSrcAttr: dataImg?.getAttribute('src') || ''
    };
  });

  console.log(JSON.stringify(results, null, 2));

  assert(results.hasDomainHelper, 'Missing favicon domain helper');
  assert(results.extractedDomain === 'example.com', `Unexpected extracted domain: ${results.extractedDomain}`);
  assert(results.fallbackSrcPrefix.startsWith('data:image/svg+xml'), 'Fallback src is not an inline SVG data URI');
  assert(results.listIcon, 'Synthetic dashboard bookmark icon did not render');
  assert(results.listIcon.fallbackApplied === '1', 'Dashboard bookmark icon did not apply fallback on error');
  assert(String(results.listIcon.currentSrc || '').startsWith('data:image/svg+xml'), 'Dashboard bookmark icon did not land on a placeholder/favicon data URI');
  assert(results.unidexHasFallbackAttr, 'Unidex bookmark icon html is missing fallback metadata');
  assert(results.focusedHasFallbackAttr, 'Focused bookmark icon html is missing fallback metadata');
  assert(String(results.dataIconSrcAttr || '').startsWith('data:image/svg+xml'), 'Data URI bookmark icons did not route into an image element');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/favicon_bookmark_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
