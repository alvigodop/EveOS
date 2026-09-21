const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../extension/provider-health-state.js');

test('provider health state sanitizes content-script payloads', () => {
  const result = state.normalize({
    state: 'rate_limited',
    blocking: true,
    action: 'wait',
    summary: 'Quota reached',
    evidence: 'x'.repeat(500),
    cooldownUntil: '2026-09-19T20:00:00.000Z'
  }, Date.parse('2026-09-18T20:00:00.000Z'));
  assert.equal(result.state, 'rate_limited');
  assert.equal(result.blocking, true);
  assert.equal(result.action, 'wait');
  assert.equal(result.evidence.length, 320);
  assert.equal(result.cooldownUntil, '2026-09-19T20:00:00.000Z');
});

test('provider health state derives provider identity from the sender tab and broadcasts only changes', () => {
  const sent = [];
  let publishes = 0;
  const deps = {
    providerForUrl(url) { return url.startsWith('https://grok.com/') ? { id: 'grok', name: 'Grok' } : null; },
    safeSend(payload) { sent.push(payload); return true; },
    scheduleTabPublish() { publishes += 1; }
  };
  const sender = { tab: { id: 42, url: 'https://grok.com/c/test' } };
  const msg = { type: 'provider_health_update', health: { state: 'rate_limited', action: 'wait', blocking: true, summary: 'Quota reached', detectedAt: '2026-09-18T21:00:00.000Z' } };
  assert.equal(state.handle(msg, sender, deps), true);
  assert.equal(state.get(42).providerId, 'grok');
  assert.equal(sent.length, 1);
  assert.equal(publishes, 1);
  assert.equal(state.handle(msg, sender, deps), true);
  assert.equal(sent.length, 1);
  assert.equal(publishes, 1);
  assert.equal(state.forget(42), true);
  assert.equal(state.get(42), null);
});

test('unknown pages cannot inject provider health into bridge state', () => {
  const sent = [];
  const handled = state.handle(
    { type: 'provider_health_update', health: { state: 'rate_limited', blocking: true } },
    { tab: { id: 99, url: 'https://example.com/' } },
    { providerForUrl: () => null, safeSend: (payload) => sent.push(payload) }
  );
  assert.equal(handled, true);
  assert.equal(sent.length, 0);
  assert.equal(state.get(99), null);
});


test('fresh health snapshot blocks sends with a deterministic error code', async () => {
  const chromeApi = {
    tabs: {
      async sendMessage(tabId, msg) {
        assert.equal(tabId, 7);
        assert.equal(msg.type, 'provider_health_snapshot');
        return {
          ok: true,
          health: {
            state: 'conversation_limit', blocking: true, action: 'new_chat',
            summary: 'Chat limit reached · new chat needed',
            detectedAt: '2026-09-18T21:00:00.000Z'
          }
        };
      }
    }
  };
  await assert.rejects(
    () => state.assertSendable(chromeApi, 7, 'chatgpt'),
    (error) => error.code === 'PROVIDER_CONVERSATION_LIMIT'
      && error.detail?.health?.action === 'new_chat'
  );
});

test('fresh ready snapshot allows the send path', async () => {
  const chromeApi = {
    tabs: {
      async sendMessage() {
        return { ok: true, health: { state: 'ready', blocking: false, action: 'none', summary: 'Ready' } };
      }
    }
  };
  const result = await state.assertSendable(chromeApi, 8, 'claude');
  assert.equal(result.state, 'ready');
  assert.equal(result.blocking, false);
});


test('missing sensor self-heals with read-only script injection before a send decision', async () => {
  let injected = 0, calls = 0;
  const chromeApi = {
    tabs: {
      async sendMessage(_tabId, msg) {
        calls += 1;
        if (calls === 1) throw new Error('Receiving end does not exist');
        assert.equal(msg.type, 'provider_health_snapshot');
        return { ok: true, health: { state: 'rate_limited', blocking: true, action: 'wait', summary: 'Quota reached' } };
      }
    },
    scripting: {
      async executeScript(options) {
        injected += 1;
        assert.equal(options.target.tabId, 12);
        assert.deepEqual(options.files, ['content/provider-health.js']);
      }
    }
  };
  await assert.rejects(
    () => state.assertSendable(chromeApi, 12, 'grok'),
    (error) => error.code === 'PROVIDER_RATE_LIMITED'
  );
  assert.equal(injected, 1);
  assert.equal(calls, 2);
});
