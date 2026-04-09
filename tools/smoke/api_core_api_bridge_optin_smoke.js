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
const comickSearchUrl = 'https://api.comick.dev/v1.0/search/?q=kingdom&limit=25&t=false';
const camofoxUrl = 'http://127.0.0.1:3038/api/camofox?format=json&url=' + encodeURIComponent(comickSearchUrl);

async function fetchStub(url, options = {}) {
    fetchCalls.push({ url, options });

    if (url === 'http://127.0.0.1:3000/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3037/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3038/api/status') return makeResponse(true, { status: 'ok', service: 'camofox-bridge' });
    if (url === 'http://127.0.0.1:3039/api/status') return makeResponse(false, {}, 404);

    if (url === comickSearchUrl) throw new TypeError('CORS blocked');

    if (url === 'http://127.0.0.1:3000/api/proxy?url=' + encodeURIComponent(comickSearchUrl)) {
        return makeResponse(false, {}, 502);
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(comickSearchUrl)) {
        return makeResponse(false, {}, 522);
    }

    if (url === 'https://api.allorigins.win/get?url=' + encodeURIComponent(comickSearchUrl)) {
        return makeResponse(false, {}, 522);
    }

    if (url === camofoxUrl) {
        return makeResponse(true, {
            ok: true,
            snapshot: JSON.stringify([
                {
                    slug: '01-kingdom',
                    title: 'Kingdom',
                    user_follow_count: 26773
                }
            ])
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
    DOMParser: class {
        parseFromString() {
            return {
                body: { textContent: '', innerText: '' }
            };
        }
    },
    setTimeout,
    clearTimeout
};
context.window.window = context.window;
context.globalThis = context;

const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const fullPath = path.join(repoRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext);
}

(async () => {
    loadScript('js/modules/features/api-search/api-core.js');

    const Core = context.window.EveOS.API.Core;
    await Core.ensureLocalServicesProbed();

    const result = await Core.fetchWithFallback(
        comickSearchUrl,
        { allowBridgeForApiTarget: true },
        'ComicK Search failed'
    );

    assert(Array.isArray(result), 'Opt-in API bridge fallback should return parsed JSON');
    assert(result[0]?.slug === '01-kingdom', 'Opt-in API bridge fallback should preserve ComicK search data');
    assert(fetchCalls.some((call) => call.url === camofoxUrl), 'Opt-in API bridge fallback should call Camofox');

    console.log('API_CORE_API_BRIDGE_OPTIN_SMOKE_OK');
})();
