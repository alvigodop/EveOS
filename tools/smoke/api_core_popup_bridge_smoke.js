const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'js/modules/features/api-search/api-core.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

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

async function runScenario(protocol, statusMap, targetUrl) {
    const fetchCalls = [];
    const context = {
        window: {
            location: { protocol },
            EveOS: { API: {} }
        },
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
    vm.runInContext(scriptCode, vmContext);

    const Core = context.window.EveOS.API.Core;
    await Core.ensureLocalServicesProbed();
    const popupUrl = await Core.getPopupViewerUrl(targetUrl);
    return { popupUrl, fetchCalls };
}

(async () => {
    const targetUrl = 'https://mangadex.org/title/example';
    const statusDown = makeResponse(false, {}, 404);
    const popupStatus = makeResponse(true, { status: 'ok', service: 'popup-bridge' });
    const serverStatus = makeResponse(true, { status: 'ok', service: 'server' });

    const fileMode = await runScenario('file:', {
        'http://127.0.0.1:3000/api/status': serverStatus,
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
        'http://127.0.0.1:3000/api/status': serverStatus,
        'http://127.0.0.1:3037/api/status': statusDown,
        'http://127.0.0.1:3038/api/status': statusDown,
        'http://127.0.0.1:3039/api/status': statusDown,
        'http://127.0.0.1:3040/api/status': statusDown
    }, targetUrl);

    assert(
        localhostMode.popupUrl === `http://127.0.0.1:3000/api/popup-view?url=${encodeURIComponent(targetUrl)}`,
        `Expected localhost mode to use the full server popup view endpoint, got: ${localhostMode.popupUrl}`
    );

    console.log('API_CORE_POPUP_BRIDGE_SMOKE_OK');
})();
