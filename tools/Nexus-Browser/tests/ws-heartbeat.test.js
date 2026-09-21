const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachWebSocketHeartbeat } = require('../dex/ws-heartbeat.js');

class FakeWss extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }
}

test('heartbeat marks new sockets alive and deterministically terminates stale sockets', () => {
  const wss = new FakeWss();
  let terminated = 0;
  const ws = new EventEmitter();
  ws.ping = () => {};
  ws.terminate = () => { terminated += 1; };
  wss.clients.add(ws);
  const heartbeat = attachWebSocketHeartbeat(wss, { intervalMs: 60000 });
  wss.emit('connection', ws);
  assert.equal(ws.isAlive, true);
  heartbeat.sweep();
  assert.equal(ws.isAlive, false);
  heartbeat.sweep();
  assert.equal(terminated, 1);
  heartbeat.stop();
});

test('pong preserves a live socket lease between sweeps', () => {
  const wss = new FakeWss();
  let terminated = 0;
  const ws = new EventEmitter();
  ws.ping = () => {};
  ws.terminate = () => { terminated += 1; };
  wss.clients.add(ws);
  const heartbeat = attachWebSocketHeartbeat(wss, { intervalMs: 60000 });
  wss.emit('connection', ws);
  heartbeat.sweep();
  ws.emit('pong');
  heartbeat.sweep();
  assert.equal(terminated, 0);
  heartbeat.stop();
});
