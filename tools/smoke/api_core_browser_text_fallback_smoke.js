const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

function makeResponse(ok, payload, status = 200) {
    return {
        ok,
        status,
        async json() { return payload; },
        async text() {
            return typeof payload === 'string' ? payload : JSON.stringify(payload);
        }
    };
}

const fetchCalls = [];
const targetUrl = 'https://comick.dev/comic/01-kingdom';
const camofoxUrl = 'http://127.0.0.1:3038/api/camofox?format=json&url=' + encodeURIComponent(targetUrl);
const blockedHtml = '<html><title>Just a moment...</title><body>Performing security verification</body></html>';
const snapshotText = 'Kingdom\nTags\nShow less\nWar/s\nChina\nWorld Building\nReferrers\nraw';

async function fetchStub(url, options = {}) {
    fetchCalls.push({ url, options });

    if (url === 'http://127.0.0.1:3000/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3037/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3038/api/status') return makeResponse(true, { status: 'ok', service: 'camofox-bridge' });

    if (url === targetUrl) {
        return makeResponse(true, blockedHtml);
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(targetUrl)) {
        return makeResponse(true, blockedHtml);
    }

    if (url === 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl)) {
        return makeResponse(true, blockedHtml);
    }

    if (url === camofoxUrl) {
        return makeResponse(true, {
            metadata: { source: 'Camofox' },
            snapshot: snapshotText
        });
    }

    throw new Error('Unexpected fetch: ' + url);
}

const context = {
    window: { EveOS: { API: {} } },
    console,
    fetch: fetchStub,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout
};
context.window.window = context.window;
context.globalThis = context;

const vmContext = vm.createContext(context);

const code = fs.readFileSync(path.join(repoRoot, 'js/modules/features/api-search/api-core.js'), 'utf8');
vm.runInContext(code, vmContext);

(async () => {
    const Core = context.window.EveOS.API.Core;
    const text = await Core.fetchTextWithFallback(targetUrl, {}, 'ComicK Page failed');

    assert(typeof text === 'string' && text.includes('War/s'), 'Browser text fallback should return Camofox snapshot text for blocked pages');
    assert(fetchCalls.some((call) => call.url === camofoxUrl), 'Browser text fallback should reach Camofox for blocked ComicK pages');

    console.log('API_CORE_BROWSER_TEXT_FALLBACK_SMOKE_OK');
})();
