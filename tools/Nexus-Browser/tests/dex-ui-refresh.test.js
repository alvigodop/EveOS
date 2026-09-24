'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'dex-ui-refresh.js'), 'utf8');

test('extension observer keeps health-gated reconnect without ever reloading Dex tabs', () => {
  assert.match(source, /type: 'hello', role: 'ui', clientKind: 'ui-refresh'/);
  assert.match(source, /server_session/);
  assert.match(source, /fetchImpl\(HEALTH_URL, \{ cache: 'no-store' \}\)/);
  assert.match(source, /if \(!\(await localRelayReady\(\)\)\) return scheduleReconnect\(\)/);
  assert.doesNotMatch(source, /chrome\.tabs\.reload|location\.reload/);
  assert.doesNotMatch(source, /firstSession/);
});

test('extension observer ignores first handshake and treats restart as a soft target refresh', () => {
  delete require.cache[require.resolve('../extension/dex-ui-refresh.js')];
  const { handleMessage } = require('../extension/dex-ui-refresh.js');
  assert.equal(handleMessage({ data: JSON.stringify({ type: 'server_session', id: 'p1', assetRevision: 'a' }) }).kind, 'handshake');
  assert.equal(handleMessage({ data: JSON.stringify({ type: 'server_session', id: 'p1', assetRevision: 'a' }) }).kind, 'handshake');
  assert.equal(handleMessage({ data: JSON.stringify({ type: 'server_session', id: 'p2', assetRevision: 'a' }) }).kind, 'soft-restart');
  assert.equal(handleMessage({ data: JSON.stringify({ type: 'server_session', id: 'p3', assetRevision: 'b' }) }).kind, 'soft-restart');
});

test('server only publishes authoritative tab snapshots after arbitration', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /onAuthoritySettled/);
  assert.match(server, /if \(extensionSessions\.current\(\)\.ready\) safeSend\(ws, \{ type: 'tabs_update'/);
  assert.match(server, /if \(state\.socket !== ws \|\| !state\.ready\) return/);
  assert.match(server, /EXTENSION_SYNC_PENDING/);
  assert.match(server, /assetRevision: ASSET_REVISION/);
});
