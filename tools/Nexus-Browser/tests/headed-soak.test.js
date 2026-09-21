const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs, bindingRooms, activeRooms, isFreshDisposableTarget, tabSummary,
  verifyLedger, verifyAlternation, verifyReplyContent, seedText, pickTarget
} = require('../scripts/headed-soak.js');

test('headed soak exposes guarded stale-recovery cleanup mode', () => {
  const parsed = parseArgs(['--cleanup-stale']);
  assert.equal(parsed.cleanupStale, true);
});

test('headed soak CLI is explicit about provider targets and bounded load', () => {
  const parsed = parseArgs([
    '--chatgpt-tab-id', '101', '--muse-tab-id', '202',
    '--turns', '16', '--seed-kb', '128', '--timeout-ms', '900000'
  ]);
  assert.equal(parsed.chatgptTabId, 101);
  assert.equal(parsed.museTabId, 202);
  assert.equal(parsed.turns, 16);
  assert.equal(parsed.seedKb, 128);
  assert.equal(parsed.timeoutMs, 900000);
  assert.throws(() => parseArgs(['--turns', '61']), (error) => error.code === 'SOAK_BAD_ARGS');
  assert.throws(() => parseArgs(['--seed-kb', '257']), (error) => error.code === 'SOAK_BAD_ARGS');
});

test('headed soak accepts only fresh disposable ChatGPT and Muse surfaces', () => {
  assert.equal(isFreshDisposableTarget({ providerId: 'chatgpt', url: 'https://chatgpt.com/' }), true);
  assert.equal(isFreshDisposableTarget({ providerId: 'chatgpt', url: 'https://chatgpt.com/c/existing' }), false);
  assert.equal(isFreshDisposableTarget({ providerId: 'chatgpt', url: 'https://chatgpt.com/#settings' }), false);
  assert.equal(isFreshDisposableTarget({ providerId: 'muse', url: 'https://muse.ai/thread/new' }), true);
  assert.equal(isFreshDisposableTarget({ providerId: 'muse', url: 'https://muse.ai/' }), false);
  assert.equal(isFreshDisposableTarget({ providerId: 'muse', url: 'https://muse.ai/thread/existing' }), false);
});

test('headed soak target listing exposes existing room bindings so production targets can be refused', () => {
  const state = {
    rooms: [{
      id: 'growth', name: 'Growth Lab',
      members: [{ binding: { targetClassId: 'online-origin', targetId: 101, providerId: 'chatgpt' } }]
    }]
  };
  assert.deepEqual(bindingRooms(state, 101, 'chatgpt'), [{ id: 'growth', name: 'Growth Lab' }]);
  const listed = tabSummary([
    { id: 101, providerId: 'chatgpt', url: 'https://chatgpt.com/c/x' },
    { id: 202, providerId: 'muse', url: 'https://muse.ai/' }
  ], state);
  assert.equal(listed[0].boundRooms.length, 1);
  assert.equal(listed[0].freshDisposable, false);
  assert.equal(listed[1].boundRooms.length, 0);
  assert.equal(listed[1].freshDisposable, false);
  assert.equal(pickTarget(listed, 'muse', 202).id, 202);
});

test('headed soak refuses to start over pre-existing active Dex work', () => {
  const state = {
    rooms: [
      { id: 'paused', name: 'Paused', relay: { active: false } },
      { id: 'busy', name: 'Busy', relay: { active: true } },
      { id: 'recovering', name: 'Recovering', recovery: { requestId: 'x' } }
    ]
  };
  assert.deepEqual(activeRooms(state).map((room) => room.id), ['busy', 'recovering']);
});

test('headed soak reply verification requires deterministic provider alternation', () => {
  const good = [
    { senderId: 'chatgpt' }, { senderId: 'muse' },
    { senderId: 'chatgpt' }, { senderId: 'muse' }
  ];
  assert.equal(verifyAlternation(good, 'chatgpt', 'muse').ok, true);
  const bad = [{ senderId: 'chatgpt' }, { senderId: 'chatgpt' }];
  const result = verifyAlternation(bad, 'chatgpt', 'muse');
  assert.equal(result.ok, false);
  assert.equal(result.index, 1);
});

test('headed soak reply integrity requires exact bracketed ACKs matching ledger request ids', () => {
  const ledger = new Map([
    ['dex-turn-11111111-1111-1111-1111-111111111111', [{ state: 'completed', dispatchAttempts: 1 }]],
    ['dex-turn-22222222-2222-2222-2222-222222222222', [{ state: 'completed', dispatchAttempts: 1 }]]
  ]);
  const good = [
    { text: 'SOAK_ACK[dex-turn-11111111-1111-1111-1111-111111111111]' },
    { text: 'SOAK_ACK[dex-turn-22222222-2222-2222-2222-222222222222]' }
  ];
  assert.deepEqual(verifyReplyContent(good, ledger), []);

  const partial = [{ text: 'SOAK' }, good[1]];
  assert.equal(verifyReplyContent(partial, ledger)[0].reason, 'malformed_ack');

  const wrong = [
    { text: 'SOAK_ACK[dex-turn-33333333-3333-3333-3333-333333333333]' },
    good[1]
  ];
  assert.equal(verifyReplyContent(wrong, ledger).some((entry) => entry.reason === 'ledger_id_mismatch'), true);
});

test('headed soak ledger verification requires one dispatch and completed final state per turn', () => {
  const good = new Map([
    ['a', [{ state: 'dispatching', dispatchAttempts: 1 }, { state: 'completed', dispatchAttempts: 1 }]],
    ['b', [{ state: 'responding', dispatchAttempts: 1 }, { state: 'completed', dispatchAttempts: 1 }]]
  ]);
  assert.deepEqual(verifyLedger(good, 2), []);

  const bad = new Map([
    ['a', [{ state: 'dispatching', dispatchAttempts: 2 }, { state: 'completed', dispatchAttempts: 2 }]],
    ['b', [{ state: 'responding', dispatchAttempts: 1 }]]
  ]);
  assert.equal(verifyLedger(bad, 2).length, 2);
});

test('headed soak source keeps live progress and preserves stalled evidence', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'headed-soak.js'), 'utf8');
  assert.match(source, /\[soak\] seed complete/);
  assert.match(source, /provider replies \$\{replies\.length\}\/\$\{turns\}/);
  assert.match(source, /SOAK_TIMEOUT/);
  assert.match(source, /SOAK_EARLY_STOP/);
  assert.match(source, /SOAK_SEED_LOSS/);
  assert.match(source, /SOAK_REPLY_INTEGRITY_FAILED/);
  assert.match(source, /SOAK_ACK\[<the Turn ID/);
  assert.match(source, /durableSeeds\.length !== chunks/);
  assert.match(source, /preservedForInspection/);
});

test('headed soak seed payloads are bounded and unique', () => {
  const first = seedText(0, 8000);
  const second = seedText(1, 8000);
  assert.equal(first.length, 8000);
  assert.equal(second.length, 8000);
  assert.notEqual(first, second);
});
