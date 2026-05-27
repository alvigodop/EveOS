const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForStatus(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  return {
    links: [
      { id: 'related-a', title: 'Related Alpha', url: 'https://alpha.example.com/ItemZ', workspace: 'main', category: 'Nexus', relatedUrls: [{ url: 'https://mirror.example.com/alpha', label: 'Mirror' }], identifiers: ['reading'], updatedAt: now },
      { id: 'related-b', title: 'Related Beta', url: 'https://beta.example.com/ItemZ', workspace: 'main', category: 'Nexus', relatedUrls: [{ url: 'https://wiki.example.com/beta', label: 'Wiki' }], identifiers: ['reading'], updatedAt: now },
      { id: 'plain-c', title: 'Plain Gamma', url: 'https://plain.example.com/ItemZ', workspace: 'main', category: 'Nexus', identifiers: ['watching'], updatedAt: now }
    ],
    bookmarkFolders: { 'main::Nexus': { nodes: [], settings: {} } },
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      cardFolderViewModes: { 'main::Nexus': true },
      bookmarkIdentifiers: [{ id: 'reading', label: 'Reading' }, { id: 'watching', label: 'Watching' }]
    }
  };
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-nexus-smart-view-'));
  const server = spawn('python', ['python-server.py', String(port), '--no-browser', '--modular-root', modularRoot], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser = null;
  let serverStdout = '';
  let serverStderr = '';
  server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
  server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

  try {
    await waitForStatus(`http://localhost:${port}/api/status`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const seed = buildSeedPayload();
    await page.addInitScript((payload) => {
      localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
      localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
    }, seed);
    await page.goto(`http://localhost:${port}/EveOS.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => (
      !!window.EveSmartViewRegistry
      && !!window.EveOS?.DatapackIndex
      && !!window.EveOS?.SearchAdvanced?.SearchVectors
      && document.querySelector('.category-card[data-card-category="Nexus"]')
    ), undefined, { timeout: 180000 });
    await page.waitForTimeout(1500);

    const result = await page.evaluate(async () => {
      await window.EveOS.DatapackIndex.ensureFresh({ force: true, reason: 'nexus-smart-view-actions-smoke' });
      const searchResult = await window.EveOS.SearchAdvanced.SearchVectors.runMultiVectorSearch(
        'type:smartView Related URLs',
        { activeVectors: { bookmarks: true, knowledge: false, cachedResults: false, google: false }, resultsMode: 'merged' },
        { workspaceId: 'main', categoryName: 'Nexus' }
      );
      const smartTitles = searchResult.results
        .filter((item) => item.type === 'smartView')
        .map((item) => item.title);
      const record = searchResult.results.find((item) => item.type === 'smartView' && (
        item.title === '[ Has Related URLs ]'
        || item.title === 'Has Related URLs'
        || item.title === '[ Mirror ]'
        || item.title === 'Mirror'
        || item.title === '[ Wiki ]'
        || item.title === 'Wiki'
      ));
      if (!record) throw new Error('Related URLs Smart View result was not indexed. Titles: ' + smartTitles.join(' | '));
      const linkIds = window.EveSmartViewRegistry.getSmartViewRecordLinkIds(record);
      const criteriaText = window.EveSmartViewRegistry.describeCriteria(record.provenance.criteria);
      const opened = window.EveSmartViewRegistry.openSmartViewRecord(record);
      const reveal = window.EveSmartViewRegistry.revealSmartViewRecord(record, { toast: false });
      await new Promise((resolve) => setTimeout(resolve, 260));
      const selectedIds = Array.from(window.selectedIds || []);
      const saved = window.EveSmartViewRegistry.saveSmartViewRecordAsCardView(record, { toast: false, label: 'Saved Related URLs' });
      const savedViews = window.eveState.config.smartViews?.cardViews?.['main::Nexus'] || [];
      return {
        indexedSmartViews: searchResult.results.filter((item) => item.type === 'smartView').length,
        recordTitle: record.title,
        criteriaText,
        opened,
        linkIds,
        reveal,
        selectedIds,
        savedOk: !!saved.ok,
        savedCount: savedViews.length,
        savedCriteria: savedViews[0]?.criteria || null
      };
    });

    assert(result.indexedSmartViews > 0, `No Smart View records returned: ${JSON.stringify(result)}`);
    assert(result.opened === true, `Open Smart View action failed: ${JSON.stringify(result)}`);
    assert(result.linkIds.length === 2, `Reveal link IDs should match related bookmarks: ${JSON.stringify(result)}`);
    assert(result.reveal.ok === true && result.reveal.count === 2, `Reveal Smart View action failed: ${JSON.stringify(result)}`);
    assert(result.selectedIds.includes('related-a') && result.selectedIds.includes('related-b'), `Selected IDs missing related bookmarks: ${JSON.stringify(result)}`);
    assert(result.savedOk && result.savedCount >= 1, `Convert To Saved View failed: ${JSON.stringify(result)}`);
    assert(result.savedCriteria && result.savedCriteria.hasRelatedUrls === true, `Saved criteria mismatch: ${JSON.stringify(result)}`);
    assert(result.criteriaText.includes('related_urls') || result.criteriaText.includes('hasRelatedUrls'), `Inspect criteria text missing expected field: ${JSON.stringify(result)}`);

    console.log(`NEXUS_SMART_VIEW_ACTIONS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    console.error('--- SERVER STDOUT ---');
    console.error(serverStdout);
    console.error('--- SERVER STDERR ---');
    console.error(serverStderr);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) {}
    }
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!server.killed) server.kill('SIGKILL');
    fs.rmSync(modularRoot, { recursive: true, force: true });
  }
}

main();
