'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket, WebSocketServer } = require('ws');
const { start } = require('../qualification/lane3-native-visibility-proxy.cjs');

const ROOT = path.resolve(__dirname, '../..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-native-visibility-proxy.json');
const E = { ok: false, deterministic: true, realBrowserClaimed: false, cases: [] };
const owned = [], sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let current = 'startup';
const check = async (id, run) => { current = id; await run(); E.cases.push({ id, ok: true }); };
async function bounded(promise, message, milliseconds = 3000) {
    let timer;
    try { return await Promise.race([promise, new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(Error(message)), milliseconds);
    })]); } finally { clearTimeout(timer); }
}
async function settled(proxy) {
    const deadline = Date.now() + 3000;
    let value;
    do {
        value = proxy.snapshot();
        if (value.closed && value.downstreamSockets === 0 && value.upstreamSockets === 0
            && value.tcpSockets === 0 && value.queuedMessages === 0 && value.queuedBytes === 0) return value;
        await sleep(10);
    } while (Date.now() < deadline);
    assert.fail(`Proxy resources did not settle: ${JSON.stringify(value)}`);
}
async function fakeUpstream() {
    const server = http.createServer(), sockets = new Set();
    const ws = new WebSocketServer({ server });
    const accepted = [];
    ws.on('connection', socket => {
        sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
        accepted.push(socket);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const fixture = { accepted, ws, endpoint: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake-browser-0123456789`,
        async close() {
            for (const socket of sockets) socket.terminate();
            await bounded(Promise.all([new Promise(resolve => ws.close(resolve)), new Promise(resolve => server.close(resolve))]),
                'Fake upstream did not close');
        } };
    owned.push(fixture); return fixture;
}
async function connected(endpoint) {
    const socket = new WebSocket(endpoint);
    socket.on('error', () => {});
    await bounded(once(socket, 'open'), 'Fixture client did not connect');
    owned.push({ close: async () => { if (socket.readyState !== WebSocket.CLOSED) socket.terminate(); } });
    return socket;
}
async function upstreamClient(fixture) {
    const deadline = Date.now() + 3000;
    while (!fixture.accepted.length && Date.now() < deadline) await sleep(10);
    assert.equal(fixture.accepted.length, 1, 'Proxy must open exactly one upstream socket');
    return fixture.accepted[0];
}

async function main() {
    await check('invalid-upstream-refused', async () => {
        for (const endpoint of ['ws://example.invalid:9222/devtools/browser/fake-browser-0123456789',
            'wss://127.0.0.1:9222/devtools/browser/fake-browser-0123456789',
            'ws://127.0.0.1:9222/devtools/page/fake-browser-0123456789',
            'ws://user:pass@127.0.0.1:9222/devtools/browser/fake-browser-0123456789',
            'ws://127.0.0.1:9222/devtools/browser/fake-browser-0123456789?secret=x',
            'ws://127.0.0.1:9222/devtools/browser/fake-browser-0123456789#ignored', 'not-a-url']) {
            await assert.rejects(start(endpoint), /loopback browser WebSocket endpoint/);
        }
    });
    const upstream = await fakeUpstream(), proxy = await start(upstream.endpoint); owned.push(proxy);
    const client = await connected(proxy.endpoint), remote = await upstreamClient(upstream);
    await check('actual-primary-command-rewritten-and-reply-preserved', async () => {
        const upstreamMessage = once(remote, 'message');
        client.send(' { "id":7, "sessionId":"fixture-session", "method":"Emulation.setFocusEmulationEnabled",'
            + ' "params":{"enabled":true,"extra":"retain"}, "other":"retain" } ');
        const [received, binary] = await bounded(upstreamMessage, 'Rewritten CDP request missing');
        assert.equal(binary, false);
        assert.deepEqual(JSON.parse(received), { id: 7, sessionId: 'fixture-session',
            method: 'Emulation.setFocusEmulationEnabled', params: { enabled: false, extra: 'retain' }, other: 'retain' });
        const realReply = ' { "id":7, "sessionId":"fixture-session", "result":{"actualUpstream":true} } ';
        const reply = once(client, 'message'); remote.send(realReply);
        assert.equal((await bounded(reply, 'Actual upstream response missing'))[0].toString(), realReply);
        assert.equal(proxy.snapshot().forcedFocusSuppressed, 1);
    });
    await check('already-false-unknown-and-nonliteral-pass-byte-equivalent', async () => {
        for (const text of [' {"id":8,"method":"Emulation.setFocusEmulationEnabled","params":{"enabled":false}} ',
            '\n{"id":9,"method":"Emulation.setFocusEmulationEnabled","params":{"enabled":"true"}}\n',
            ' {"id":10,"sessionId":"fixture-session","method":"Runtime.enable","params":{}} ',
            '{"id":11,"method":"Emulation.setFocusEmulationEnabled","params":null}', 'not-json']) {
            const message = once(remote, 'message'); client.send(text);
            assert.equal((await bounded(message, 'Unmodified CDP request missing'))[0].toString(), text);
        }
        const message = once(remote, 'message'), bytes = Buffer.from([0, 1, 254, 255]); client.send(bytes);
        const [received, binary] = await bounded(message, 'Binary CDP frame missing');
        assert.equal(binary, true); assert.deepEqual(received, bytes);
        assert.equal(proxy.snapshot().forcedFocusSuppressed, 1);
    });
    await check('one-client-only', async () => {
        const other = new WebSocket(proxy.endpoint); other.on('error', () => {});
        try { await assert.rejects(bounded(once(other, 'open'), 'Second client was not refused'), /403/); }
        finally { other.terminate(); }
        assert.equal(proxy.snapshot().clientAccepted, true); assert.equal(proxy.snapshot().downstreamSockets, 1);
    });
    await check('client-disconnect-closes-proxy-and-resources', async () => {
        client.close(); E.disconnect = await settled(proxy); await proxy.close();
        assert.equal(E.disconnect.errors, 0); await proxy.close();
    });
    await check('upstream-disconnect-cleans-client-and-resources', async () => {
        const upstream2 = await fakeUpstream(), proxy2 = await start(upstream2.endpoint); owned.push(proxy2);
        const client2 = await connected(proxy2.endpoint), remote2 = await upstreamClient(upstream2);
        const closed = once(client2, 'close'); remote2.terminate();
        await bounded(closed, 'Upstream disconnect did not close downstream');
        await proxy2.close(); E.upstreamDisconnect = await settled(proxy2);
    });
    await check('invalid-client-frame-cleans-both-sockets', async () => {
        const upstream3 = await fakeUpstream(), proxy3 = await start(upstream3.endpoint); owned.push(proxy3);
        const client3 = await connected(proxy3.endpoint); await upstreamClient(upstream3);
        const closed = once(client3, 'close');
        // The installed ws protocol parser must reject an unmasked client frame; no browser is involved.
        client3._socket.write(Buffer.from([0x81, 0x01, 0x78]));
        await bounded(closed, 'Invalid client frame did not close the proxy');
        await proxy3.close(); E.clientError = await settled(proxy3); assert.equal(E.clientError.errors, 1);
    });
    await check('upstream-handshake-error-cleans-client-and-resources', async () => {
        const unavailable = await fakeUpstream(), endpoint = unavailable.endpoint;
        await unavailable.close();
        const failed = await start(endpoint); owned.push(failed);
        const downstream = await connected(failed.endpoint), closed = once(downstream, 'close');
        await bounded(closed, 'Upstream handshake failure did not close downstream');
        await failed.close(); E.handshakeFailure = await settled(failed);
        assert.equal(E.handshakeFailure.errors, 1);
    });
    E.ok = true;
}

main().catch(error => { E.error = { id: current, stack: String(error.stack || error) }; process.exitCode = 1; })
    .finally(async () => {
        for (const resource of owned.reverse()) await resource.close().catch(error => {
            E.ok = false; E.cleanupError = String(error.message); process.exitCode = 1;
        });
        fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(E, null, 2));
        if (E.ok) console.log(`AUDIOFLIX_NATIVE_VISIBILITY_PROXY_OK ${E.cases.length}/${E.cases.length}`);
        else {
            console.error(`AUDIOFLIX_NATIVE_VISIBILITY_PROXY_FAIL ${E.error?.id || 'cleanup'} artifact=${artifact}`);
            console.error((E.error?.stack || E.cleanupError).split(/\r?\n/).slice(0, 40).join('\n'));
        }
    });
