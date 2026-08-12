const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3036;
const CAMOFOX_BRIDGE_PORT = 3038;
const PROVIDERS = [
    { key: 'mangadex', query: 'kingdom', min: 1, strict: true },
    { key: 'jikanManga', query: 'kingdom', min: 1, strict: true },
    { key: 'jikanAnime', query: 'naruto', min: 1, strict: true },
    { key: 'anilistManga', query: 'kingdom', min: 1, strict: true },
    { key: 'anilistAnime', query: 'naruto', min: 1, strict: true },
    { key: 'mangaupdates', query: 'kingdom', min: 1, strict: true },
    { key: 'kitsuAnime', query: 'naruto', min: 1, strict: true },
    { key: 'kitsuManga', query: 'kingdom', min: 1, strict: true },
    { key: 'tvmaze', query: 'friends', min: 1, strict: true },
    { key: 'itunes', query: 'taylor swift', min: 1, strict: true },
    { key: 'wlnupdates', query: 'overgeared', min: 1, strict: false },
    { key: 'openlibrary', query: 'hobbit', min: 1, strict: true },
    { key: 'comick', query: 'kingdom', min: 1, strict: true }
];

async function waitForStatus(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
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
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
    const modularRoot = path.join(os.tmpdir(), `eve-api-provider-matrix-${Date.now()}`);
    let browser = null;
    let camofoxBridge = null;
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStdout = '';
    let serverStderr = '';
    let bridgeStdout = '';
    let bridgeStderr = '';
    server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
    server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

    try {
        await waitForStatus(`http://localhost:${PORT}/api/status`, 60000);
        try {
            await waitForStatus(`http://localhost:${CAMOFOX_BRIDGE_PORT}/api/status`, 1500);
        } catch (_) {
            camofoxBridge = spawn('python', ['server/bridges/camofox-bridge.py', String(CAMOFOX_BRIDGE_PORT)], {
                cwd: REPO_ROOT,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            camofoxBridge.stdout.on('data', (chunk) => { bridgeStdout += String(chunk); });
            camofoxBridge.stderr.on('data', (chunk) => { bridgeStderr += String(chunk); });
            await waitForStatus(`http://localhost:${CAMOFOX_BRIDGE_PORT}/api/status`, 30000);
        }
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error && error.stack ? error.stack : String(error)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto(`http://localhost:${PORT}/api/status`, { waitUntil: 'load', timeout: 60000 });
        await page.setContent('<!doctype html><html><body><div id="resultCount"></div><div id="results"></div></body></html>');

        const scripts = [
            '/js/modules/features/api-search/api-cache.shared.js?v=0.1.0',
            '/js/modules/features/api-search/api-cache.storage.js?v=0.1.0',
            '/js/modules/features/api-search/api-cache.query.js?v=0.1.0',
            '/js/modules/features/api-search/api-cache.js?v=0.1.2',
            '/js/modules/features/api-search/api-core.shared.js?v=0.1.0',
            '/js/modules/features/api-search/api-core.fetch.js?v=0.1.0',
            '/js/modules/features/api-search/api-core.wikimedia.js?v=0.1.0',
            '/js/modules/features/api-search/api-core.js?v=0.3.0',
            '/js/modules/features/api-search/mangadex.js?v=0.2.1',
            '/js/modules/features/api-search/jikan.js',
            '/js/modules/features/api-search/anilist.js?v=0.2.1',
            '/js/modules/features/api-search/mangaupdates.js?v=0.2.3',
            '/js/modules/features/api-search/kitsu.js?v=0.2.1',
            '/js/modules/features/api-search/tvmaze.js',
            '/js/modules/features/api-search/itunes.js?v=0.1.1',
            '/js/modules/features/api-search/wlnupdates.js?v=0.2.1',
            '/js/modules/features/api-search/openlibrary.js',
            '/js/modules/features/api-search/comick.js?v=0.2.7',
            '/js/modules/features/api-search/components/api-manager-utils.js?v=0.4.9',
            '/js/modules/features/api-search/components/api-manager-prefs.js?v=0.4.9',
            '/js/modules/features/api-search/components/api-manager-providers.js?v=0.6.0',
            '/js/modules/features/api-search/components/api-manager-ui-core.js?v=0.5.1',
            '/js/modules/features/api-search/components/api-manager-ui-unidex.results.js?v=0.1.0',
            '/js/modules/features/api-search/components/api-manager-orchestrator.shared.js?v=0.1.0',
            '/js/modules/features/api-search/components/api-manager-orchestrator.api.js?v=0.1.0',
            '/js/modules/features/api-search/components/api-manager-orchestrator.knowledge.js?v=0.1.0',
            '/js/modules/features/api-search/components/api-manager-orchestrator.run.js?v=0.1.0',
            '/js/modules/features/api-search/components/api-manager-orchestrator.js?v=0.6.0',
            '/js/modules/features/api-search/index.js?v=0.4.9'
        ];

        for (const scriptPath of scripts) {
            await page.addScriptTag({ url: `http://localhost:${PORT}${scriptPath}` });
        }

        const result = await page.evaluate(async (providers) => {
            window.EveOS = window.EveOS || {};
            window.EveOS.API = window.EveOS.API || {};
            window.EveOS.API.Display = {
                displayResults() {}
            };

            const resultsContainer = document.getElementById('results') || document.body.appendChild(document.createElement('div'));
            const categoryName = 'Provider Matrix';
            const rows = [];

            for (const provider of providers) {
                const live = await window.EveOS.API.Manager.runSearch(provider.query, resultsContainer, null, {
                    categoryName,
                    providerKey: provider.key,
                    liveResults: true,
                    hybridResults: true,
                    ttlMs: 60 * 60 * 1000
                });
                const liveCount = Number(live?.meta?.summary?.perSource?.[provider.key] || 0);
                const cachedEntry = await window.EveOS.API.Cache.getQuery(provider.query, categoryName);
                const cachedCount = Number(cachedEntry?.summary?.perSource?.[provider.key] || 0);
                const cacheOnly = await window.EveOS.API.Manager.runSearch(provider.query, resultsContainer, null, {
                    categoryName,
                    providerKey: provider.key,
                    liveResults: false,
                    hybridResults: false,
                    ttlMs: 60 * 60 * 1000
                });
                const cacheOnlyCount = Number(cacheOnly?.meta?.summary?.perSource?.[provider.key] || 0);
                rows.push({
                    key: provider.key,
                    query: provider.query,
                    liveCount,
                    cachedCount,
                    cacheOnlyCount,
                    cacheOnlyFromCache: cacheOnly?.meta?.fromCache === true,
                    strict: provider.strict === true
                });
            }

            return {
                rows,
                cachePoolOrder: Array.isArray((await window.EveOS.API.Cache.loadPool(categoryName))?.order)
                    ? (await window.EveOS.API.Cache.loadPool(categoryName)).order.slice()
                    : []
            };
        }, PROVIDERS);

        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Failed to load resource/i.test(entry)) return false;
            if (/Access to fetch at/i.test(entry)) return false;
            return true;
        });
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        const failures = result.rows.filter((row) => row.strict && (
            row.liveCount < 1 || row.cachedCount < 1 || row.cacheOnlyCount < 1 || !row.cacheOnlyFromCache
        ));
        if (failures.length) {
            throw new Error(`Provider matrix failures: ${JSON.stringify({ failures, result }, null, 2)}`);
        }

        console.log(`API_PROVIDER_MATRIX_LIVE_SMOKE_OK ${JSON.stringify(result)}`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        console.error('--- BRIDGE STDOUT ---');
        console.error(bridgeStdout);
        console.error('--- BRIDGE STDERR ---');
        console.error(bridgeStderr);
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (_) {}
        }
        if (camofoxBridge) {
            camofoxBridge.kill('SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (!camofoxBridge.killed) camofoxBridge.kill('SIGKILL');
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
}

main();
