const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3035;

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
    const modularRoot = path.join(os.tmpdir(), `eve-api-live-${Date.now()}`);
    let browser = null;
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStdout = '';
    let serverStderr = '';
    server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
    server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });
    const pageErrors = [];
    const consoleErrors = [];

    try {
        await waitForStatus(`http://localhost:${PORT}/api/status`);

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
        page.on('pageerror', (error) => {
            pageErrors.push(error && error.stack ? error.stack : String(error));
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto(`http://localhost:${PORT}/api/status`, {
            waitUntil: 'load',
            timeout: 60000
        });
        await page.setContent('<!doctype html><html><body><div id="resultCount"></div></body></html>');

        const minimalApiScripts = [
            `/js/modules/features/api-search/api-cache.shared.js?v=0.1.0`,
            `/js/modules/features/api-search/api-cache.storage.js?v=0.1.0`,
            `/js/modules/features/api-search/api-cache.query.js?v=0.1.0`,
            `/js/modules/features/api-search/api-cache.js?v=0.1.2`,
            `/js/modules/features/api-search/api-core.shared.js?v=0.1.0`,
            `/js/modules/features/api-search/api-core.fetch.js?v=0.1.0`,
            `/js/modules/features/api-search/api-core.wikimedia.js?v=0.1.0`,
            `/js/modules/features/api-search/api-core.js?v=0.3.0`,
            `/js/modules/features/api-search/openlibrary.js`,
            `/js/modules/features/api-search/tvmaze.js`,
            `/js/modules/features/api-search/components/api-manager-utils.js?v=0.4.9`,
            `/js/modules/features/api-search/components/api-manager-prefs.js?v=0.4.9`,
            `/js/modules/features/api-search/components/api-manager-providers.js?v=0.5.0`,
            `/js/modules/features/api-search/components/api-manager-ui-core.js?v=0.5.1`,
            `/js/modules/features/api-search/components/api-manager-ui-unidex.results.js?v=0.1.0`,
            `/js/modules/features/api-search/components/api-manager-orchestrator.shared.js?v=0.1.0`,
            `/js/modules/features/api-search/components/api-manager-orchestrator.api.js?v=0.1.0`,
            `/js/modules/features/api-search/components/api-manager-orchestrator.knowledge.js?v=0.1.0`,
            `/js/modules/features/api-search/components/api-manager-orchestrator.run.js?v=0.1.0`,
            `/js/modules/features/api-search/components/api-manager-orchestrator.js?v=0.5.0`,
            `/js/modules/features/api-search/index.js?v=0.4.9`
        ];

        for (const scriptPath of minimalApiScripts) {
            await page.addScriptTag({ url: `http://localhost:${PORT}${scriptPath}` });
        }

        const result = await page.evaluate(async () => {
            window.EveOS = window.EveOS || {};
            window.EveOS.API = window.EveOS.API || {};
            window.EveOS.API.Display = {
                displayResults() {}
            };
            window.EveOS.API.MangaDex = {
                searchMangaDex: async function () { return { data: [] }; }
            };
            window.EveOS.API.Jikan = {
                searchJikanManga: async function () { return { data: [] }; },
                searchJikanAnime: async function () { return { data: [] }; }
            };
            window.EveOS.API.AniList = {
                searchAniListManga: async function () { return { data: { Page: { media: [] } } }; },
                searchAniListAnime: async function () { return { data: { Page: { media: [] } } }; }
            };
            window.EveOS.API.MangaUpdates = {
                searchMangaUpdates: async function () { return { results: [] }; }
            };
            window.EveOS.API.Kitsu = {
                searchKitsuAnime: async function () { return { data: [] }; },
                searchKitsuManga: async function () { return { data: [] }; }
            };
            window.EveOS.API.iTunes = {
                searchiTunes: async function () { return { results: [] }; }
            };
            window.EveOS.API.WlnUpdates = {
                searchWlnUpdates: async function () { return { data: [] }; }
            };
            window.EveOS.API.ComicK = {
                searchComicK: async function () { return []; }
            };

            const resultsContainer = document.createElement('div');
            document.body.appendChild(resultsContainer);

            const openlibrary = await window.EveOS.API.Manager.runSearch('hobbit', resultsContainer, null, {
                categoryName: 'Live Acceptance',
                providerKey: 'openlibrary',
                liveResults: true,
                hybridResults: true,
                ttlMs: 60 * 60 * 1000
            });

            const openlibraryCache = await window.EveOS.API.Cache.getQuery('hobbit', 'Live Acceptance');
            const openlibraryCount = Number(openlibraryCache?.summary?.perSource?.openlibrary || 0);

            const tvmaze = await window.EveOS.API.Manager.runSearch('friends', resultsContainer, null, {
                categoryName: 'Live Acceptance',
                providerKey: 'tvmaze',
                liveResults: true,
                hybridResults: true,
                ttlMs: 60 * 60 * 1000
            });

            const tvmazeCache = await window.EveOS.API.Cache.getQuery('friends', 'Live Acceptance');
            const tvmazeCount = Number(tvmazeCache?.summary?.perSource?.tvmaze || 0);

            return {
                openlibrarySummary: openlibrary?.meta?.summary || null,
                openlibraryCount,
                openlibraryCached: !!openlibraryCache,
                tvmazeSummary: tvmaze?.meta?.summary || null,
                tvmazeCount,
                tvmazeCached: !!tvmazeCache
            };
        });

        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Failed to load resource/i.test(entry)) return false;
            if (/Access to fetch at/i.test(entry)) return false;
            return true;
        });

        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        if (!result.openlibraryCached || result.openlibraryCount < 1 || (result.openlibrarySummary?.totalResults || 0) < 1) {
            throw new Error(`OpenLibrary live acceptance failed: ${JSON.stringify(result)}`);
        }
        if (!result.tvmazeCached || result.tvmazeCount < 1 || (result.tvmazeSummary?.totalResults || 0) < 1) {
            throw new Error(`TVmaze live acceptance failed: ${JSON.stringify(result)}`);
        }

        console.log(`API_LIVE_PROVIDER_ACCEPTANCE_SMOKE_OK ${JSON.stringify(result)}`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (_) {}
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
}

main();
