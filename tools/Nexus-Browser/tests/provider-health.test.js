const test = require('node:test');
const assert = require('node:assert/strict');
const health = require('../extension/content/provider-health.js');

test('provider health recognizes Grok-style cooldown text and derives a stable deadline', () => {
  const now = Date.parse('2026-09-18T21:00:00.000Z');
  const result = health.classifyText('23 hours 57 minutes before limit is gone. Wait or upgrade to SuperGrok.', now);
  assert.equal(result.state, 'rate_limited');
  assert.equal(result.action, 'wait');
  assert.equal(result.blocking, true);
  assert.equal(result.cooldownUntil, '2026-09-19T20:57:00.000Z');
});

test('provider health recognizes usage-limit notifications even without a parseable duration', () => {
  const result = health.classifyText("You've reached your usage limit. Your limit will refresh later.");
  assert.equal(result.state, 'rate_limited');
  assert.equal(result.action, 'wait');
  assert.equal(result.cooldownUntil, null);
  assert.match(result.resetText, /refresh/i);
});

test('provider health distinguishes exhausted chats from provider quotas', () => {
  const result = health.classifyText('This conversation has reached the maximum length. Start a new chat to continue.');
  assert.equal(result.state, 'conversation_limit');
  assert.equal(result.action, 'new_chat');
});

test('provider health distinguishes auth and transient provider outages', () => {
  assert.equal(health.classifyText('Your session has expired. Sign in again to continue.').state, 'auth_required');
  assert.equal(health.classifyText('Service temporarily unavailable due to high demand. Please try again later.').state, 'provider_unavailable');
});

test('candidate collection excludes conversation turns so quoted quota text is not treated as provider UI', () => {
  const quoted = {
    innerText: 'You have reached your usage limit',
    getAttribute() { return null; },
    closest() { return {}; }
  };
  const banner = {
    innerText: '23 hours 57 minutes before limit is gone',
    getAttribute() { return null; },
    closest() { return null; }
  };
  const root = { querySelectorAll() { return [quoted, banner]; } };
  assert.deepEqual(health.candidateTexts(root), ['23 hours 57 minutes before limit is gone']);
  assert.equal(health.bestIssue(root, Date.parse('2026-09-18T21:00:00.000Z')).state, 'rate_limited');
});

test('candidate collection excludes conversation containers enclosing message turns', () => {
  const container = {
    innerText: 'Quoted context: 23 hours 57 minutes before limit is gone',
    getAttribute() { return null; },
    closest() { return null; },
    querySelector() { return {}; }
  };
  const banner = {
    innerText: '23 hours 57 minutes before limit is gone',
    getAttribute() { return null; },
    closest() { return null; },
    querySelector() { return null; }
  };
  const root = { querySelectorAll() { return [container, banner]; } };
  assert.deepEqual(health.candidateTexts(root), ['23 hours 57 minutes before limit is gone']);
});

test('health summaries tell orchestration what action is needed', () => {
  assert.match(health.summary({ blocking: true, state: 'conversation_limit' }), /new chat needed/i);
  assert.match(health.summary({ blocking: true, state: 'rate_limited', resetText: 'resets in 2 hours' }), /cooldown/i);
  assert.equal(health.summary({ blocking: false, state: 'ready' }), 'Ready');
});


test('usage-window labels are not misread as cooldown durations', () => {
  const result = health.classifyText('5-hour limit reached - resets 7:00 PM', Date.parse('2026-09-18T21:00:00.000Z'));
  assert.equal(result.state, 'rate_limited');
  assert.equal(result.cooldownUntil, null);
  assert.match(result.resetText, /resets 7:00 PM/i);
});

test('context overflow wording maps to a new-chat action', () => {
  const result = health.classifyText('Your prompt exceeds the available context window. Start a new conversation to continue.');
  assert.equal(result.state, 'conversation_limit');
  assert.equal(result.action, 'new_chat');
});
