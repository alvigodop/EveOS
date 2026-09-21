const { randomUUID } = require('node:crypto');
const { WebSocket } = require('ws');
const { urls } = require('../runtime-config');

const runtimeUrls = urls();
const WS_URL = runtimeUrls.websocket;
const DIAGNOSTICS_URL = runtimeUrls.diagnostics;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(label + ' timed out.'), { code: 'QUALIFICATION_TIMEOUT' })), timeoutMs);
    })
  ]);
}

class QualificationClient {
  constructor(url = WS_URL) {
    this.url = url;
    this.ws = null;
    this.waiters = new Map();
    this.listeners = new Set();
    this.closed = true;
    this.sessionId = null;
    this.closeResolve = null;
    this.closePromise = Promise.resolve();
  }

  async connect(timeoutMs = 8000) {
    this.closed = false;
    this.closePromise = new Promise((resolve) => { this.closeResolve = resolve; });
    await withTimeout(new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let settled = false;
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'qualification' })));
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (msg.type === 'qualification_hello' && !settled) {
          settled = true;
          this.sessionId = msg.serverSessionId || null;
          resolve(msg);
        }
        this.handleMessage(msg);
      });
      ws.on('error', (error) => {
        if (!settled) { settled = true; reject(error); }
      });
      ws.on('close', () => {
        this.closed = true;
        this.closeResolve?.();
        this.rejectWaiters(Object.assign(new Error('Qualification socket closed.'), { code: 'QUALIFICATION_SOCKET_CLOSED' }));
        if (!settled) {
          settled = true;
          reject(Object.assign(new Error('Qualification socket closed before hello.'), { code: 'QUALIFICATION_SOCKET_CLOSED' }));
        }
      });
    }), timeoutMs, 'Qualification connection');
    return this;
  }

  handleMessage(msg) {
    const requestId = String(msg?.requestId || '');
    const waiter = requestId ? this.waiters.get(requestId) : null;
    if (waiter && waiter.matcher(msg)) {
      this.waiters.delete(requestId);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    }
    for (const listener of this.listeners) {
      try { listener(msg); } catch {}
    }
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && !this.closed;
  }

  send(payload) {
    if (!this.isOpen()) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  requestEvent(payload, matcher, timeoutMs = 12000) {
    const requestId = String(payload.requestId || ('qualify-rpc-' + randomUUID()));
    if (!this.isOpen()) {
      return Promise.reject(Object.assign(new Error('Qualification socket is not open.'), { code: 'QUALIFICATION_SOCKET_CLOSED' }));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(requestId);
        reject(Object.assign(new Error('Qualification request timed out: ' + payload.type), { code: 'QUALIFICATION_TIMEOUT' }));
      }, timeoutMs);
      this.waiters.set(requestId, { matcher, resolve, reject, timer });
      this.send({ ...payload, requestId });
    });
  }

  rpc(payload, timeoutMs = 12000) {
    return this.requestEvent(
      payload,
      (msg) => msg.type === 'qualification_result' || msg.type === 'error',
      timeoutMs
    );
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  waitForClose(timeoutMs = 15000) {
    if (this.closed) return Promise.resolve();
    return withTimeout(this.closePromise, timeoutMs, 'Supervised server restart');
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function diagnostics(timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(DIAGNOSTICS_URL, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Bridge diagnostics returned HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRestart(previousSessionId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await diagnostics(1500);
      if (last.serverSessionId && last.serverSessionId !== previousSessionId && last.extensionConnected) return last;
    } catch {}
    await delay(250);
  }
  const error = new Error('Supervisor did not restore a new server session with the extension reconnected.');
  error.code = 'QUALIFICATION_RESTART_TIMEOUT';
  error.detail = last;
  throw error;
}

module.exports = { DIAGNOSTICS_URL, WS_URL, QualificationClient, delay, diagnostics, waitForRestart, withTimeout };
