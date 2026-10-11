'use strict';

// Qualification-only CDP adapter. Suppress forced focus on the actual Playwright sessions,
// retaining native visibility. Never evaluate page JavaScript or fabricate protocol responses.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

function validateEndpoint(endpoint) {
    let url;
    try { url = new URL(endpoint); } catch { throw Error('Native visibility requires a loopback browser WebSocket endpoint'); }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (typeof endpoint !== 'string' || url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '::1'].includes(host)
        || !url.port || !/^\/devtools\/browser\/[A-Za-z0-9_-]{16,120}$/.test(url.pathname)
        || url.username || url.password || url.search || url.hash || url.href !== endpoint) {
        throw Error('Native visibility requires an exact loopback browser WebSocket endpoint');
    }
    return endpoint;
}

async function start(endpoint) {
    validateEndpoint(endpoint);
    const route = '/native-visibility/' + randomUUID();
    const server = http.createServer((_request, response) => { response.writeHead(426); response.end(); });
    const webSockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 });
    const tcp = new Set(), downstreams = new Set(), upstreams = new Set();
    const queue = [], maxQueueBytes = 16 * 1024 * 1024;
    let queuedBytes = 0, accepted = false, closed = false, closePromise, forcedFocusSuppressed = 0, errors = 0;

    const snapshot = () => ({ closed, clientAccepted: accepted, forcedFocusSuppressed, errors,
        downstreamSockets: downstreams.size, upstreamSockets: upstreams.size, tcpSockets: tcp.size,
        queuedMessages: queue.length, queuedBytes });
    const close = () => {
        if (closePromise) return closePromise;
        closed = true; queue.length = 0; queuedBytes = 0;
        closePromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Native visibility proxy cleanup timed out')), 3000);
            let pending = 2;
            const done = error => {
                if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') { clearTimeout(timer); reject(error); return; }
                if (--pending === 0) { clearTimeout(timer); resolve(); }
            };
            for (const socket of [...downstreams, ...upstreams]) socket.terminate();
            for (const socket of tcp) socket.destroy();
            webSockets.close(done); server.close(done);
        });
        return closePromise;
    };
    const shutdown = (failed = false) => {
        if (failed) errors++;
        void close().catch(() => { errors++; });
    };
    const track = (set, socket) => {
        set.add(socket);
        socket.once('close', () => { set.delete(socket); if (!closed) shutdown(); });
        socket.on('error', () => { if (!closed) shutdown(true); });
    };
    const forward = (target, data, binary) => {
        if (closed) return;
        if (target.readyState !== WebSocket.OPEN || target.bufferedAmount > maxQueueBytes) { shutdown(true); return; }
        target.send(data, { binary }, error => { if (error && !closed) shutdown(true); });
    };
    const filter = (data, binary) => {
        if (binary) return data;
        let message;
        try { message = JSON.parse(data.toString('utf8')); } catch { return data; }
        if (message?.method !== 'Emulation.setFocusEmulationEnabled' || message.params?.enabled !== true) return data;
        forcedFocusSuppressed++;
        return JSON.stringify({ ...message, params: { ...message.params, enabled: false } });
    };

    server.on('connection', socket => { tcp.add(socket); socket.once('close', () => tcp.delete(socket)); });
    server.on('error', () => { if (!closed) shutdown(true); });
    server.on('upgrade', (request, socket, head) => {
        if (closed || accepted || request.url !== route) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
        }
        accepted = true;
        webSockets.handleUpgrade(request, socket, head, downstream => {
            track(downstreams, downstream);
            const upstream = new WebSocket(endpoint, { handshakeTimeout: 5000, maxPayload: 256 * 1024 * 1024 });
            track(upstreams, upstream);
            downstream.on('message', (data, binary) => {
                const filtered = filter(data, binary);
                if (closed) return;
                if (upstream.readyState === WebSocket.OPEN) return forward(upstream, filtered, binary);
                const bytes = Buffer.byteLength(filtered);
                if (upstream.readyState !== WebSocket.CONNECTING || queue.length >= 256 || queuedBytes + bytes > maxQueueBytes) {
                    shutdown(true); return;
                }
                queue.push({ data: filtered, binary }); queuedBytes += bytes;
            });
            upstream.on('open', () => {
                for (const entry of queue.splice(0)) forward(upstream, entry.data, entry.binary);
                queuedBytes = 0;
            });
            upstream.on('message', (data, binary) => forward(downstream, data, binary));
        });
    });
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
        });
    } catch (error) { await close().catch(() => {}); throw error; }
    return { endpoint: `ws://127.0.0.1:${server.address().port}${route}`, close, snapshot };
}

module.exports = { start };
