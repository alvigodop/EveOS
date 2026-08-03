const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(
    path.join(ROOT, 'js', 'modules', 'features', 'world-book', 'world-book.client.js'),
    'utf8'
);

let mode = 'standalone';
const events = [];

function response(payload, ok = true, status = 200) {
    return {
        ok,
        status,
        async json() {
            return payload;
        }
    };
}

async function fetchMock(url) {
    if (url.endsWith('/api/health')) {
        if (mode === 'offline') throw new Error('offline');
        return response({ ok: true, service: 'world-book', appVersion: 'smoke' });
    }
    if (url.endsWith('/api/world-book/status')) {
        if (mode !== 'managed') throw new Error('controller offline');
        return response({
            ok: true,
            installed: true,
            running: true,
            desiredRunning: true,
            state: 'running',
            url: 'http://127.0.0.1:8766/',
            message: 'World Book is online.'
        });
    }
    throw new Error(`Unexpected URL: ${url}`);
}

class CustomEventMock {
    constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
    }
}

const windowMock = {
    EveWorldBook: {},
    config: {},
    location: {
        protocol: 'file:',
        hostname: '',
        origin: 'null'
    },
    setTimeout,
    clearTimeout,
    dispatchEvent(event) {
        events.push(event);
    }
};

vm.runInNewContext(source, {
    window: windowMock,
    fetch: fetchMock,
    AbortController,
    CustomEvent: CustomEventMock
}, { filename: 'world-book.client.js' });

(async () => {
    const client = windowMock.EveWorldBook.client;

    const standalone = await client.refresh();
    if (!standalone.running || standalone.controllerAvailable || !standalone.directAvailable) {
        throw new Error(`standalone discovery failed: ${JSON.stringify(standalone)}`);
    }
    if (standalone.source !== 'standalone' || !standalone.message.includes('standalone launcher')) {
        throw new Error(`standalone source was not surfaced: ${JSON.stringify(standalone)}`);
    }

    mode = 'managed';
    const managed = await client.refresh();
    if (!managed.running || !managed.controllerAvailable || managed.source !== 'managed') {
        throw new Error(`managed discovery failed: ${JSON.stringify(managed)}`);
    }

    mode = 'offline';
    const offline = await client.refresh();
    if (offline.running || offline.controllerAvailable || offline.directAvailable) {
        throw new Error(`offline state was stale: ${JSON.stringify(offline)}`);
    }
    if (!offline.message.includes('tools\\World-Book\\launch.bat')) {
        throw new Error(`offline launcher guidance missing: ${JSON.stringify(offline)}`);
    }
    if (!events.some((event) => event.type === 'eve:world-book-status')) {
        throw new Error('status events were not published');
    }

    console.log('WORLD_BOOK_CLIENT_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
