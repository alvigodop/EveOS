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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  const links = [];
  for (let index = 0; index < 1220; index += 1) {
    const workspace = index % 3 === 0 ? 'main' : (index % 3 === 1 ? 'ws-a' : 'ws-b');
    const category = index % 4 === 0 ? 'Alpha' : (index % 4 === 1 ? 'Beta' : (index % 4 === 2 ? 'Gamma' : 'Delta'));
    const folderId = index % 5 === 0 ? `folder-${category.toLowerCase()}` : '';
    links.push({
      id: `chunk-link-${index}`,
      title: `Chunked Bookmark ${index}`,
      url: `https://chunk.example.com/item/${index}`,
      workspace,
      category,
      folderId,
      tags: index % 7 === 0 ? ['reading', 'chunked'] : [],
      relatedUrls: index % 11 === 0 ? [{ url: `https://mirror.example.com/item/${index}` }] : [],
      updatedAt: now - index
    });
  }
  return {
    links,
    bookmarkFolders: {
      'main::Alpha': { nodes: [{ id: 'folder-alpha', parentId: null, name: 'Alpha Folder', order: 0, createdAt: now, updatedAt: now }] },
      'ws-a::Beta': { nodes: [{ id: 'folder-beta', parentId: null, name: 'Beta Folder', order: 0, createdAt: now, updatedAt: now }] },
      'ws-b::Gamma': { nodes: [{ id: 'folder-gamma', parentId: null, name: 'Gamma Folder', order: 0, createdAt: now, updatedAt: now }] },
      'main::Delta': { nodes: [{ id: 'folder-delta', parentId: null, name: 'Delta Folder', order: 0, createdAt: now, updatedAt: now }] }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'ws-a', name: 'Workspace A', icon: 'folder' },
        { id: 'ws-b', name: 'Workspace B', icon: 'folder' }
      ],
      nexusIndexBuildChunkSize: 150
    }
  };
}

function summarize(records) {
  return records
    .map((record) => `${record.type}::${record.id}`)
    .sort();
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-index-chunk-store-'));
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
      !!window.EveOS?.SearchAdvanced?.IndexRecordBuildersSources?.buildLocalRecordBundle
      && !!window.EveOS?.SearchAdvanced?.IndexRecordBuildersSources?.buildLocalRecordBundleChunked
      && !!window.eveState?.config
    ), null, { timeout: 180000 });

    const result = await page.evaluate(async (seedPayload) => {
      window.eveState = window.eveState || {};
      window.eveState.config = Object.assign({}, window.eveState.config || {}, seedPayload.config);
      window.eveState.links = seedPayload.links.slice();
      window.eveState.bookmarkFolders = JSON.parse(JSON.stringify(seedPayload.bookmarkFolders));
      window.links = window.eveState.links;
      window.bookmarkFolders = window.eveState.bookmarkFolders;
      try { bookmarkFolders = window.eveState.bookmarkFolders; } catch (error) {}

      const builders = window.EveOS.SearchAdvanced.IndexRecordBuildersSources;
      const syncBundle = builders.buildLocalRecordBundle();
      const chunkedBundle = await builders.buildLocalRecordBundleChunked();
      const syncIds = syncBundle.records.map((record) => `${record.type}::${record.id}`).sort();
      const chunkedIds = chunkedBundle.records.map((record) => `${record.type}::${record.id}`).sort();
      const sampleBookmarkIds = ['chunk-link-0', 'chunk-link-154', 'chunk-link-915', 'chunk-link-1219'];
      const syncBookmarkMap = new Map(syncBundle.records
        .filter((record) => record.type === 'bookmark')
        .map((record) => [String(record.sourceIdentity?.linkId || ''), record]));
      const chunkedBookmarkMap = new Map(chunkedBundle.records
        .filter((record) => record.type === 'bookmark')
        .map((record) => [String(record.sourceIdentity?.linkId || ''), record]));
      const sampleDifferences = [];
      const sampleParity = sampleBookmarkIds.every((id) => {
        const syncRecord = syncBookmarkMap.get(id);
        const chunkedRecord = chunkedBookmarkMap.get(id);
        const ok = !!syncRecord
          && !!chunkedRecord
          && syncRecord.title === chunkedRecord.title
          && syncRecord.url === chunkedRecord.url
          && syncRecord.searchableText === chunkedRecord.searchableText
          && JSON.stringify(syncRecord.baseHealth) === JSON.stringify(chunkedRecord.baseHealth);
        if (!ok) {
          sampleDifferences.push({
            id,
            syncTitle: syncRecord?.title,
            chunkedTitle: chunkedRecord?.title,
            syncUrl: syncRecord?.url,
            chunkedUrl: chunkedRecord?.url,
            syncHealth: syncRecord?.baseHealth,
            chunkedHealth: chunkedRecord?.baseHealth,
            syncText: syncRecord?.searchableText,
            chunkedText: chunkedRecord?.searchableText
          });
        }
        return ok;
      });
      const workerStats = window.EveOS.SearchAdvanced._lastIndexWorkerStats || null;
      const typeCounts = (records) => records.reduce((acc, record) => {
        const key = String(record?.type || 'unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return {
        syncCount: syncIds.length,
        chunkedCount: chunkedIds.length,
        sameIds: JSON.stringify(syncIds) === JSON.stringify(chunkedIds),
        sampleParity,
        sampleDifferences,
        syncTypes: typeCounts(syncBundle.records),
        chunkedTypes: typeCounts(chunkedBundle.records),
        chunkSize: window.eveState.config.nexusIndexBuildChunkSize,
        workerStats
      };
    }, seed);

    assert(result.syncCount > 1220, `Expected bookmark plus structural records: ${JSON.stringify(result)}`);
    assert(result.syncCount === result.chunkedCount, `Chunked count mismatch: ${JSON.stringify(result)}`);
    assert(result.sameIds, `Chunked index changed record identities: ${JSON.stringify(result)}`);
    assert(result.sampleParity, `Worker bookmark sample parity failed: ${JSON.stringify(result)}`);
    assert(JSON.stringify(result.syncTypes) === JSON.stringify(result.chunkedTypes), `Chunked type counts mismatch: ${JSON.stringify(result)}`);
    assert(result.workerStats?.attempted, `Worker path was not attempted: ${JSON.stringify(result)}`);
    assert(result.workerStats?.used, `Worker path was not used: ${JSON.stringify(result)}`);
    assert(result.workerStats?.mode === 'raw', `Worker raw-link mode was not used: ${JSON.stringify(result)}`);
    assert(!result.workerStats?.failed, `Worker path failed and fell back: ${JSON.stringify(result)}`);

    console.log(`NEXUS_INDEX_CHUNKED_BUNDLE_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
