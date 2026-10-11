'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = 'tools/audioflix/spotify-engine.html';
const ENGINE_SCRIPT = 'js/modules/features/audioflix/audioflix.spotify.engine.js';
const LEGACY_ENGINE = 'audioflix-spotify-engine.html';
const source = fs.readFileSync(path.join(ROOT, ENGINE), 'utf8');
const broker = fs.readFileSync(path.join(ROOT, 'server_modules/audioflix_spotify_broker.py'), 'utf8');
const presentation = fs.readFileSync(path.join(ROOT, 'server_modules/audioflix_spotify_presentation.py'), 'utf8');
const surface = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.spotify.engine-surface.js'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT FAILED: ${message}`); };

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
assert(presentation.includes('_LEGACY_ENGINE_PATH = "/audioflix-spotify-engine.html"')
    && presentation.includes('path = _ENGINE_PATH if parsed.path == _LEGACY_ENGINE_PATH else parsed.path'),
    'existing legacy helper URLs normalize to the canonical engine path before lifecycle comparison');
assert(surface.includes('/tools/audioflix/spotify-engine.html?surface=mirror')
    && !surface.includes('`${base}/audioflix-spotify-engine.html?surface=mirror`'),
    'Internal Player mirror points at the canonical relocated page without spawning another engine');

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
        console.log('AUDIOFLIX_SPOTIFY_ENGINE_RELOCATION_SMOKE_OK http=true file=true migration=true rootClean=true');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
