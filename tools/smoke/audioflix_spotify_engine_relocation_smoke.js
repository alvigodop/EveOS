'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = 'tools/audioflix/spotify-engine.html';
const ENGINE_SCRIPT = 'js/modules/features/audioflix/audioflix.spotify.engine.js';
const LEGACY_ENGINE = 'audioflix-spotify-engine.html';
const CANONICAL_PATH = `/${ENGINE}`;
const LEGACY_PATH = `/${LEGACY_ENGINE}`;
const source = fs.readFileSync(path.join(ROOT, ENGINE), 'utf8');
const broker = fs.readFileSync(path.join(ROOT, 'server_modules/audioflix_spotify_broker.py'), 'utf8');
const presentation = fs.readFileSync(path.join(ROOT, 'server_modules/audioflix_spotify_presentation.py'), 'utf8');
const surface = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.spotify.engine-surface.js'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT FAILED: ${message}`); };
const browserRequested = process.argv.includes('--browser');

function runPython(code) {
    const candidates = [...new Set([process.env.PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean))];
    const failures = [];
    for (const command of candidates) {
        const result = spawnSync(command, ['-c', code], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
        if (!result.error && result.status === 0) return String(result.stdout || '').trim();
        failures.push(`${command}: ${result.error?.message || String(result.stderr || '').trim() || `exit ${result.status}`}`);
    }
    throw new Error(`No usable Python launcher for relocation migration proof (${failures.join(' | ')})`);
}

assert(!fs.existsSync(path.join(ROOT, LEGACY_ENGINE)), 'legacy Spotify engine HTML is absent from repository root');
const match = source.match(/script\.src\s*=\s*['"]([^'"]*audioflix\.spotify\.engine\.js[^'"]*)['"]/);
assert(match, 'relocated engine page declares its dynamic engine script');
const httpScriptUrl = new URL(match[1], `http://127.0.0.1:8765/${ENGINE}`);
assert(httpScriptUrl.pathname === `/${ENGINE_SCRIPT}`,
    `relocated HTTP engine script must resolve to /${ENGINE_SCRIPT}; got ${httpScriptUrl.pathname}`);
const fileScriptUrl = new URL(match[1], pathToFileURL(path.join(ROOT, ENGINE)));
assert(fileScriptUrl.pathname.replace(/\\/g, '/').endsWith(`/${ENGINE_SCRIPT}`),
    `relocated file:// engine script must resolve to ${ENGINE_SCRIPT}; got ${fileScriptUrl.pathname}`);
assert(fs.existsSync(path.join(ROOT, ENGINE_SCRIPT)), 'resolved managed-engine script exists in the tracked runtime tree');
assert(broker.includes('_ENGINE_PATH = "/tools/audioflix/spotify-engine.html"')
    && !broker.includes('server_origin}/audioflix-spotify-engine.html'),
    'broker launch and presentation paths use only the canonical relocated engine URL');
assert(presentation.includes('_LEGACY_ENGINE_PATH = "/audioflix-spotify-engine.html"'),
    'presentation policy retains the intentional legacy URL migration fixture');
assert(surface.includes('/tools/audioflix/spotify-engine.html?surface=mirror')
    && !surface.includes('`${base}/audioflix-spotify-engine.html?surface=mirror`'),
    'Internal Player mirror points at the canonical relocated page without spawning another engine');

const migrated = runPython([
    'from server_modules.audioflix_spotify_presentation import _normalize_engine_url',
    `print(_normalize_engine_url('http://127.0.0.1:8765${LEGACY_PATH}?playwright=headless#migration'))`
].join('; '));
assert(migrated === `http://127.0.0.1:8765${CANONICAL_PATH}?playwright=headless#migration`,
    `legacy helper URL must execute through canonical migration; got ${migrated}`);

const operationalRefs = [
    'server_modules/audioflix_spotify_browser.js',
    'tools/qualification/audioflix_lane3_file_acceptance.mjs',
    'tools/qualification/audioflix_lane3_recovery_acceptance.mjs',
    'tools/qualification/audioflix_lane3_runtime_acceptance.mjs',
    'tools/smoke/audioflix_spotify_long_queue_live_smoke.mjs',
    'tools/smoke/audioflix_spotify_long_queue_live_support.mjs',
    'tools/smoke/audioflix_spotify_engine_smoke.js',
    'tools/smoke/audioflix_spotify_queue_surface_smoke.js'
];
for (const relative of operationalRefs) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert(!text.includes(LEGACY_PATH) && !text.includes(`'${LEGACY_ENGINE}'`) && !text.includes(`"${LEGACY_ENGINE}"`),
        `${relative} must not retain the deleted engine path outside compatibility fixtures`);
}

const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname.replace(/^\/+/, '');
    const target = path.resolve(ROOT, pathname);
    if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403).end();
        return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, { 'Content-Type': target.endsWith('.html') ? 'text/html' : 'text/javascript' });
    fs.createReadStream(target).pipe(response);
});

async function proveBrowserLoading(base) {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
        const entries = [
            { label: 'http', url: `${base}/${ENGINE}` },
            { label: 'file', url: pathToFileURL(path.join(ROOT, ENGINE)).href }
        ];
        for (const entry of entries) {
            const page = await browser.newPage();
            const requests = [];
            const errors = [];
            page.on('request', (request) => requests.push(request.url()));
            page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
            await page.goto(entry.url, { waitUntil: 'load' });
            await page.waitForFunction(() => document.documentElement.dataset.spotifyEngineReady === 'true');
            const loaded = await page.evaluate(() => ({
                ready: window.EveAudioflixSpotifyEngine?.ready === true,
                title: document.title,
                path: location.pathname
            }));
            assert(loaded.ready, `${entry.label} browser entrypoint executes the managed engine module`);
            assert(loaded.title === 'EveOS Spotify Engine', `${entry.label} browser entrypoint is the relocated engine page`);
            assert(requests.some((url) => {
                try { return new URL(url).pathname.replace(/\\/g, '/').endsWith(`/${ENGINE_SCRIPT}`); }
                catch { return false; }
            }), `${entry.label} browser entrypoint actually requests ${ENGINE_SCRIPT}`);
            assert(errors.length === 0, `${entry.label} browser entrypoint has no page errors: ${errors.join(' | ')}`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
}

(async () => {
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    try {
        const { port } = server.address();
        const base = `http://127.0.0.1:${port}`;
        const page = await fetch(`${base}/${ENGINE}`);
        assert(page.status === 200, `relocated engine HTML must be HTTP-readable; got ${page.status}`);
        const html = await page.text();
        const requested = html.match(/script\.src\s*=\s*['"]([^'"]*audioflix\.spotify\.engine\.js[^'"]*)['"]/);
        assert(requested, 'served relocated HTML retains the dynamic engine script request');
        const runtimeUrl = new URL(requested[1], `${base}/${ENGINE}`);
        const script = await fetch(runtimeUrl);
        assert(script.status === 200, `relocated engine script request must succeed; got ${script.status}`);
        const body = await script.text();
        assert(body.includes('EveAudioflixSpotifyEngine'), 'HTTP-loaded engine script is the managed Spotify engine implementation');
        if (browserRequested) await proveBrowserLoading(base);
        console.log(`AUDIOFLIX_SPOTIFY_ENGINE_RELOCATION_SMOKE_OK http=true file=true migration=executed rootClean=true browser=${browserRequested}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
