'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const http = read('server_modules/audioflix_spotify_http.py');
const relay = read('server_modules/audioflix_spotify_relay.py');
const broker = read('server_modules/audioflix_spotify_broker.py');
const remote = read('js/modules/features/audioflix/audioflix.spotify.remote.js');
const hook = read('server_modules/audioflix_spotify_browser_hook.js');
const helper = read('server_modules/audioflix_spotify_browser.js');

assert(http.includes('origin == _server_origin(handler).lower()')
    && !http.includes('Access-Control-Allow-Origin\", \"null\"'),
    'Spotify broker POSTs require the exact localhost relay origin and never CORS-whitelist null origin');
assert(http.includes("frame-ancestors * file:") && http.includes('X-Frame-Options\", \"DENY\"')
    && http.includes("frame-ancestors 'none'"),
    'relay is frameable from network/file EveOS while the trusted approval page remains non-frameable');
assert(relay.includes("event.source !== parent") && relay.includes("event.origin !== 'null' && event.origin !== RELAY_ORIGIN"),
    'relay verifies the source window and exact ordinary origin before accepting a MessageChannel');
assert(relay.includes('new MessageChannel') === false,
    'relay consumes a transferred channel rather than manufacturing authority for an arbitrary parent');
assert(relay.includes("type: 'pairing-required'") && relay.includes("/api/audioflix/spotify-client/pair-status"),
    'opaque/file parent gets an explicit pending pairing flow');
assert(relay.includes('clientToken = String(result.clientToken)')
    && !relay.includes("clientToken: clientToken")
    && !relay.includes("type: 'ready', clientToken"),
    'relay-scoped credential remains in iframe memory and is never posted to the parent');
const publicGrant = relay.slice(relay.indexOf('const publicGrant'), relay.indexOf('const acceptGrant'));
assert(!publicGrant.includes('connectionId') && !publicGrant.includes('sequenceBase'),
    'attachment lease and sequence boundary remain relay-private, not parent-controlled');
assert(relay.includes("window.addEventListener('pagehide', releaseAndClose)")
    && relay.includes('keepalive: true') && relay.includes("action: 'detach'"),
    'relay owns navigation cleanup with a keepalive authenticated detach, not a dying parent request');
assert(relay.includes('let commandChain = Promise.resolve()')
    && relay.includes('commandChain = commandChain.then(() => forwardCommand(message)'),
    'ordered playback requests are serialized so clientCommandSeq cannot be reordered by concurrent HTTP requests');
const independent = relay.match(/INDEPENDENT_ACTIONS = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
assert(['status', 'status-watch', 'import', 'auth'].every((action) => independent.includes(`'${action}'`))
    && relay.includes('INDEPENDENT_ACTIONS.has(action)') && relay.includes('void forwardCommand(message)'),
    'status and long import/auth jobs use the broker independent lane so playback controls stay responsive');
assert(broker.includes('\"jobSeq\": 0') && broker.includes('seq_key = \"jobSeq\" if action in {\"import\", \"auth\"} else \"seq\"'),
    'broker keeps long jobs on a separate replay/order high-water boundary');
assert(broker.includes('secrets.compare_digest') && broker.includes('csrf') && broker.includes('pairingRequired'),
    'file pairing requires single-use trusted approval evidence');
assert(remote.includes('MessageChannel') && remote.includes('eveos:spotify-relay-connect')
    && remote.includes("location.protocol === 'file:'"),
    'ordinary localhost and file clients share the typed relay client');
assert(remote.includes("message.type !== 'eveos:spotify-relay-ready'")
    && remote.includes('event.source !== iframe?.contentWindow')
    && remote.includes('event.origin !== relayOrigin')
    && remote.includes('state.relayReady = true'),
    'parent trusts managed transport only after an exact source+origin relay-ready handshake');
assert(remote.includes('No EveOS Spotify relay answered') && remote.includes('state.relayReady = false'),
    'missing relay handshake is distinguishable from a failure after the trusted relay has answered');
assert(remote.includes("setTimeout(() => finish(false, new Error('Spotify relay approval timed out.'))")
    && remote.includes('clearTimeout(timer)'),
    'file approval wait is bounded even when no later relay notification arrives');
assert(!remote.includes('clientToken'),
    'parent-side Spotify client source never handles the scoped broker token');
assert(!hook.includes('__EveAudioflixManagedBrowserSession') && !hook.includes('sessionId'),
    'no private helper session material is injected into EveOS or Spotify frames');
assert(helper.includes("requestUrl.pathname === '/transport'")
    && !helper.includes("requestUrl.pathname === '/eval'")
    && !helper.includes("requestUrl.pathname === '/evaluate'"),
    'helper exposes fixed Spotify transport commands and no arbitrary evaluation API');

async function checkRenderedRelay() {
    const origin = 'http://127.0.0.1:8765';
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const html = execFileSync(python, ['-c',
        `from server_modules.audioflix_spotify_relay import relay_html; print(relay_html('${origin}'))`
    ], { cwd: ROOT, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true });
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.equal(scripts.length, 1, 'execute the actual single rendered relay script');

    const token = 'private-broker-token-fixture';
    const lease = 'private-connection-lease-fixture';
    const requests = [], posted = [], waiting = new Map(), listeners = new Map(), failures = [];
    const parent = { postMessage: (message) => posted.push(message) };
    const transferred = {
        start() {}, close() {},
        postMessage(message) {
            posted.push(message);
            const key = `${message.type}:${message.requestId || ''}`;
            waiting.get(key)?.(message);
        }
    };
    const receive = (type, requestId = '') => new Promise((resolve, reject) => {
        const key = `${type}:${requestId}`;
        const timer = setTimeout(() => {
            waiting.delete(key);
            reject(new Error(`Rendered relay did not forward ${key}`));
        }, 1500);
        waiting.set(key, (message) => {
            clearTimeout(timer); waiting.delete(key); resolve(message);
        });
    });
    const fetch = async (url, options) => {
        assert.equal(options.method, 'POST');
        assert.equal(options.credentials, 'same-origin');
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        if (url === '/api/audioflix/spotify-client/connect') {
            assert.equal(body.parentOrigin, origin);
            assert.equal(body.mode, 'localhost');
            return { ok: true, status: 200, json: async () => ({
                ok: true, connected: true, clientToken: token, connectionId: lease,
                clientId: 'client-fixture', sequenceBase: 100, protocolVersion: 1
            }) };
        }
        assert.equal(url, '/api/audioflix/spotify-client/command');
        assert.equal(body.clientToken, token, 'relay authenticates without exposing its token');
        assert.equal(body.command.connectionId, lease, 'parent cannot replace the private attachment lease');
        assert.equal(body.command.clientCommandSeq, 102, 'relay preserves its private sequence base');
        const failure = failures.shift();
        assert(failure, 'unexpected additional broker command');
        return { ok: false, status: 400, json: async () => failure };
    };
    vm.runInNewContext(scripts[0][1], {
        parent, fetch, setTimeout, clearTimeout,
        window: { addEventListener: (type, listener) => listeners.set(type, listener) },
        crypto: { randomUUID: () => 'detach-fixture' }
    }, { filename: 'rendered-audioflix-spotify-relay.js', timeout: 1000 });
    assert.equal(posted[0]?.type, 'eveos:spotify-relay-ready');
    const ready = receive('ready');
    listeners.get('message')({
        source: parent, origin, ports: [transferred],
        data: { type: 'eveos:spotify-relay-connect', protocolVersion: 1,
            documentId: 'document-fixture', libraryScopeId: 'scope-fixture' }
    });
    assert.equal((await ready).connected, true);

    for (const [id, action, failure, expired] of [
        ['expired-watch', 'status-watch', { ok: false, authorizationExpired: true, reason: 'Capability expired' }, true],
        ['generic-failure', 'pause', { ok: false, reason: 'Ordinary HTTP 400' }, false],
        ['nonliteral-flag', 'status', { ok: false, authorizationExpired: 'true', reason: 'Nonliteral flag' }, false]
    ]) {
        failures.push(failure);
        const forwarded = receive('result', id);
        transferred.onmessage({ data: {
            type: 'command', requestId: id, command: { action, commandId: id,
                connectionId: 'parent-forged-lease', clientCommandSeq: 2, payload: {} }
        } });
        const result = (await forwarded).result;
        assert.equal(result.ok, false);
        if (expired) assert.equal(result.authorizationExpired, true,
            'HTTP 400 must preserve literal authorization expiry through the rendered relay');
        else assert(result.authorizationExpired === false || result.authorizationExpired === undefined,
            'ordinary HTTP 400 or nonliteral metadata must not claim authorization expiry');
        assert.equal(result.reason, failure.reason);
    }
    assert.equal(requests.length, 4, 'relay performs only the explicit connect and commands');
    const publicMessages = JSON.stringify(posted);
    assert(!publicMessages.includes(token) && !publicMessages.includes(lease),
        'rendered relay must not leak broker token or attachment lease to its parent');
    assert(!/"(?:clientToken|connectionId|sequenceBase)"\s*:/.test(publicMessages),
        'private capability fields must be omitted from parent messages');
}

checkRenderedRelay().then(() => {
    console.log('AUDIOFLIX_SPOTIFY_RELAY_SECURITY_SMOKE_OK');
}).catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
