const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'dex-ui-refresh.js'), 'utf8');

test('extension refresh helper watches the bridge session and reloads headed Dex tabs', () => {
  assert.match(source, /type: 'hello', role: 'ui', clientKind: 'ui-refresh'/);
  assert.match(source, /msg\?\.type !== 'server_session'/);
  assert.match(source, /chrome\.tabs\.query\(\{ url: DEX_URL \}\)/);
  assert.match(source, /chrome\.tabs\.reload\(tab\.id, \{ bypassCache: true \}\)/);
  assert.match(source, /fetchImpl\(HEALTH_URL, \{ cache: 'no-store' \}\)/);
  assert.match(source, /if \(!\(await localRelayReady\(\)\)\) return scheduleReconnect\(\)/);
  assert.match(source, /setTimeout\(\(\) => connect\(\)\.catch\(\(\) => \{\}\), 1200\)/);
});

test('extension refresh helper bootstraps once and reloads again only for a changed server session', () => {
  assert.match(source, /let firstSession = true/);
  assert.match(source, /const changed = !!lastSessionId && lastSessionId !== next/);
  assert.match(source, /if \(!firstSession && !changed\) return/);
});


test('extension refresh helper health-gates WebSocket construction during normal server downtime', () => {
  const healthIndex = source.indexOf('await localRelayReady()');
  const socketIndex = source.indexOf('new WebSocket(WS_URL)', healthIndex);
  assert.ok(healthIndex >= 0 && socketIndex > healthIndex);
  assert.match(source, /let connectInFlight = false/);
});
