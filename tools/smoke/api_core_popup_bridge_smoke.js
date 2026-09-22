const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPaths = [
    'js/modules/features/api-search/api-core.shared.js',
    'js/modules/features/api-search/api-core.fetch.js',
    'js/modules/features/api-search/api-core.wikimedia.js',
    'js/modules/features/api-search/api-core.js'
];

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
        headers: {
            get() {
                return null;
            }
        },
        async json() {
            return payload;
        },
        async text() {
            return typeof payload === 'string' ? payload : JSON.stringify(payload);
        }
    };
}

async function runScenario(protocol, statusMap, targetUrl, bridges = {}) {
    const fetchCalls = [];
    const context = {
        window: {
            location: { protocol },
            EveOS: { API: {} }
        },
        config: { bridges },
        console,
        fetch: async function fetchStub(url) {
            fetchCalls.push(url);
            const response = statusMap[url];
            if (response) return response;
            throw new Error('Unexpected fetch: ' + url);
        },
        URL,
        URLSearchParams,
        AbortController,
        setTimeout,
        clearTimeout
    };

    context.window.window = context.window;
    context.globalThis = context;

    const vmContext = vm.createContext(context);
    scriptPaths.forEach((relPath) => {
        const scriptCode = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
        vm.runInContext(scriptCode, vmContext, { filename: relPath });
    });

    const Core = context.window.EveOS.API.Core;
    await Core.ensureLocalServicesProbed();
    const popupUrl = await Core.getPopupViewerUrl(targetUrl);
    return { popupUrl, fetchCalls, activeProxyBase: context.window.EveOS.API.CoreRuntime._activeProxyBase };
}

(async () => {
    const targetUrl = 'https://mangadex.org/title/example';
    const statusDown = makeResponse(false, {}, 404);
    const popupStatus = makeResponse(true, { status: 'ok', service: 'popup-bridge' });
    const serverStatus = makeResponse(true, { status: 'ok', service: 'server' });

    const fileMode = await runScenario('file:', {
        'http://127.0.0.1:8765/api/status': serverStatus,
        'http://127.0.0.1:3037/api/status': statusDown,
        'http://127.0.0.1:3038/api/status': statusDown,
        'http://127.0.0.1:3039/api/status': statusDown,
        'http://127.0.0.1:3040/api/status': popupStatus
    }, targetUrl);

    assert(
        fileMode.popupUrl === `http://127.0.0.1:3040/api/popup-view?url=${encodeURIComponent(targetUrl)}`,
        `Expected file:// mode to prefer the standalone popup bridge, got: ${fileMode.popupUrl}`
    );

    const localhostMode = await runScenario('http:', {
        'http://127.0.0.1:8765/api/status': serverStatus,
        'http://127.0.0.1:3037/api/status': statusDown,
        'http://127.0.0.1:3038/api/status': statusDown,
        'http://127.0.0.1:3039/api/status': statusDown,
        'http://127.0.0.1:3040/api/status': statusDown
    }, targetUrl);

    assert(
        localhostMode.popupUrl === `http://127.0.0.1:8765/api/popup-view?url=${encodeURIComponent(targetUrl)}`,
        `Expected localhost mode to use the canonical full server popup view endpoint, got: ${localhostMode.popupUrl}`
    );

    const legacyMode = await runScenario('http:', {
        'http://127.0.0.1:8765/api/status': statusDown,
        'http://127.0.0.1:3000/api/status': serverStatus,
        'http://127.0.0.1:3037/api/status': statusDown,
        'http://127.0.0.1:3038/api/status': statusDown,
        'http://127.0.0.1:3039/api/status': statusDown,
        'http://127.0.0.1:3040/api/status': statusDown
    }, targetUrl, { serverPort: 3000 });

    assert(
        legacyMode.activeProxyBase === 'http://127.0.0.1:3000',
        `Expected legacy persisted port 3000 to remain a fallback when canonical 8765 is offline, got: ${legacyMode.activeProxyBase}`
    );
    assert(
        legacyMode.popupUrl === `http://127.0.0.1:3000/api/popup-view?url=${encodeURIComponent(targetUrl)}`,
        `Expected legacy fallback server to provide popup view, got: ${legacyMode.popupUrl}`
    );

    console.log('API_CORE_POPUP_BRIDGE_SMOKE_OK');
})();
