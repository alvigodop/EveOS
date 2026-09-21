const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deadline = require('../extension/content/response-deadline.js');
const providers = require('../extension/providers.js');

const MINUTE = 60 * 1000;

test('response deadline keeps the four-minute no-response guard', () => {
  const decision = deadline.nextResponseDeadline({ startedAt: 0, now: 4 * MINUTE });
  assert.equal(decision.action, 'timeout_idle');
  assert.equal(decision.limitMs, 4 * MINUTE);
});

test('active generation extends past four minutes without becoming unbounded', () => {
  const atFour = deadline.nextResponseDeadline({
    startedAt: 0,
    now: 4 * MINUTE,
    isGenerating: true
  });
  assert.deepEqual(
    { action: atFour.action, delayMs: atFour.delayMs, limitMs: atFour.limitMs },
    { action: 'wait', delayMs: 6 * MINUTE, limitMs: 10 * MINUTE }
  );

  const atTen = deadline.nextResponseDeadline({
    startedAt: 0,
    now: 10 * MINUTE,
    isGenerating: true
  });
  assert.equal(atTen.action, 'timeout_active');
  assert.equal(atTen.limitMs, 10 * MINUTE);
});

test('captured text finalizes instead of timing out after generation is inactive', () => {
  const decision = deadline.nextResponseDeadline({
    startedAt: 0,
    now: 5 * MINUTE,
    hasText: true,
    isGenerating: false
  });
  assert.equal(decision.action, 'finalize');
});

test('ChatGPT provider loads the reusable deadline helper before its adapter', () => {
  const chatgpt = providers.getProvider('chatgpt');
  const files = chatgpt.groups[0].files;
  assert.ok(files.includes('content/response-deadline.js'));
  assert.ok(files.indexOf('content/response-deadline.js') < files.indexOf('content/chatgpt.js'));
});

test('ChatGPT watcher uses the shared generation-aware deadline policy', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'content', 'chatgpt.js'),
    'utf8'
  );
  assert.match(source, /BrowserAiBridgeResponseDeadline/);
  assert.match(source, /nextResponseDeadline/);
  assert.doesNotMatch(source, /4-minute bridge timeout expired/);
  assert.doesNotMatch(source, /240000/);
});
