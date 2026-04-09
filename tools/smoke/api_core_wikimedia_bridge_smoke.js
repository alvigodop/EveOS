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

function makeResponse(ok, payload, status = 200, headers = {}) {
    return {
        ok,
        status,
        headers: {
            get(name) {
                const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === String(name || '').toLowerCase());
                return entry ? entry[1] : null;
            }
        },
        async json() { return payload; },
        async text() {
            return typeof payload === 'string' ? payload : JSON.stringify(payload);
        }
    };
}

const fetchCalls = [];
const wikiUrl = 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*';
const bridgedUrl = 'http://127.0.0.1:3040/api/proxy?url=' + encodeURIComponent(wikiUrl);

async function fetchStub(url, options = {}) {
    fetchCalls.push({ url, options });

    if (url === 'http://127.0.0.1:3000/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3037/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3038/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3039/api/status') return makeResponse(false, {}, 404);
    if (url === 'http://127.0.0.1:3040/api/status') return makeResponse(true, { status: 'ok', service: 'popup-bridge', wikimediaTransport: true, capabilities: ['wikimedia-proxy'] });

    if (url === bridgedUrl) {
        return makeResponse(true, { query: { general: { sitename: 'Wikipedia' } } });
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
    await Core.ensureLocalServicesProbed();

    const payload = await Core.fetchWikimediaJson(wikiUrl);

    assert(payload?.query?.general?.sitename === 'Wikipedia', 'Merged popup bridge fetch should return proxied Wikimedia JSON payload');
    assert(fetchCalls.some((call) => call.url === bridgedUrl), 'Wikimedia requests should route through the merged popup bridge when it is available');
    assert(!fetchCalls.some((call) => call.url === wikiUrl), 'Wikimedia requests should not hit the direct browser URL when the merged popup bridge is available');

    console.log('API_CORE_WIKIMEDIA_BRIDGE_SMOKE_OK');
})();
