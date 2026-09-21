const test = require('node:test');
const assert = require('node:assert/strict');
const health = require('../public/dex-provider-health.js');

function room() {
  return {
    members: [
      { id: 'eve', name: 'Eve', binding: { targetClassId: 'online-origin', targetId: 1, providerId: 'chatgpt', providerName: 'ChatGPT' } },
      { id: 'grok', name: 'Grok', binding: { targetClassId: 'online-origin', targetId: 2, providerId: 'grok', providerName: 'Grok' } },
      { id: 'astro', name: 'Astro', binding: { targetClassId: 'local-origin', targetId: 'local-1', providerName: 'Antigravity CLI' } }
    ]
  };
}

test('Dex health context exposes ready and blocked online participants', () => {
  const value = health.roomContext(room(), [
    { id: 1, providerId: 'chatgpt', health: { state: 'ready', blocking: false } },
    { id: 2, providerId: 'grok', health: { state: 'rate_limited', blocking: true, summary: 'Quota reached', cooldownUntil: '2026-09-18T23:00:00.000Z' } }
  ], Date.parse('2026-09-18T21:00:00.000Z'));
  assert.match(value, /Eve \[ChatGPT\]: ready/);
  assert.match(value, /Grok \[Grok\]: Quota reached/);
  assert.match(value, /wait for provider quota reset/);
  assert.doesNotMatch(value, /Astro/);
});

test('Dex health maps provider states to deterministic operator actions', () => {
  assert.match(health.describe({ state: 'conversation_limit', blocking: true, summary: 'Chat limit reached' }), /new chat/);
  assert.match(health.describe({ state: 'auth_required', blocking: true, summary: 'Sign-in required' }), /sign in again/);
  assert.equal(health.stopReason({ state: 'rate_limited' }), 'Provider quota cooldown');
  assert.equal(health.stopReason({ state: 'conversation_limit' }), 'Provider chat limit reached');
});

test('browser health event only updates view state; scheduler owns blocking decisions', () => {
  const state = {
    tabs: [{ id: 2, providerId: 'grok', health: null }],
    onlineTarget: { id: 2, providerId: 'grok' }
  };
  let rendered = 0;
  assert.equal(health.applyEvent(state, {
    type: 'provider_health_update', tabId: 2, providerId: 'grok',
    health: { state: 'rate_limited', blocking: true, summary: 'Quota reached', action: 'wait' }
  }, { renderAll() { rendered += 1; } }), true);
  assert.equal(rendered, 1);
  assert.equal(state.tabs[0].health.state, 'rate_limited');
  assert.equal(state.onlineTarget.health.state, 'rate_limited');
});

test('non-blocking health updates render through the same view-only path', () => {
  const state = { tabs: [{ id: 1, providerId: 'chatgpt' }], onlineTarget: { id: 1, providerId: 'chatgpt' } };
  let rendered = 0;
  assert.equal(health.applyEvent(state, {
    tabId: 1, providerId: 'chatgpt', health: { state: 'ready', blocking: false, summary: 'Ready' }
  }, { renderAll() { rendered += 1; } }), true);
  assert.equal(rendered, 1);
});
