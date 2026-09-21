const test = require('node:test');
const assert = require('node:assert/strict');
const delivery = require('../extension/content/prompt-delivery.js');

test('delivery state requires verified composer seeding before submit', () => {
  const state = delivery.create({ requestId: 'r1', text: 'hello' });
  assert.throws(
    () => delivery.attemptOnce(state, 'click', () => {}),
    (error) => error.code === 'PROMPT_DELIVERY_NOT_SEEDED'
  );
  delivery.markSeeded(state, true);
  assert.equal(state.seeded, true);
});

test('delivery checker permits exactly one submit side effect', () => {
  const state = delivery.create({ requestId: 'r2', text: 'hello' });
  delivery.markSeeded(state, true);
  let clicks = 0;
  delivery.attemptOnce(state, 'click', () => { clicks += 1; });
  assert.equal(clicks, 1);
  assert.throws(
    () => delivery.attemptOnce(state, 'enter', () => { clicks += 1; }),
    (error) => error.code === 'PROMPT_DELIVERY_DUPLICATE_SUBMIT_BLOCKED'
  );
  assert.equal(clicks, 1);
});

test('delivery checker succeeds only after a committed user-turn proof', async () => {
  const state = delivery.create({ requestId: 'r3', text: 'hello' });
  delivery.markSeeded(state, true);
  delivery.attemptOnce(state, 'click', () => {});
  let checks = 0;
  const proof = await delivery.verifyCommitted(state, {
    isCommitted: () => ++checks >= 3,
    composer: {},
    composerContainsText: () => false,
    timeoutMs: 1000,
    sleep: async () => {}
  });
  assert.equal(proof.committed, true);
  assert.equal(proof.submitMethod, 'click');
  assert.equal(proof.composerDeparted, true);
});

test('composer departure alone is not full prompt delivery', async () => {
  const state = delivery.create({ requestId: 'r4', text: 'hello' });
  delivery.markSeeded(state, true);
  delivery.attemptOnce(state, 'click', () => {});
  await assert.rejects(
    () => delivery.verifyCommitted(state, {
      isCommitted: () => false,
      composer: {},
      composerContainsText: () => false,
      timeoutMs: 0,
      sleep: async () => {}
    }),
    (error) => error.code === 'PROMPT_DELIVERY_UNCOMMITTED'
      && error.detail?.deliveryProof?.composerDeparted === true
      && error.detail?.deliveryProof?.submitAttempted === true
  );
});

test('submit exceptions still preserve one-attempt delivery evidence', () => {
  const state = delivery.create({ requestId: 'r5', text: 'hello' });
  delivery.markSeeded(state, true);
  assert.throws(
    () => delivery.attemptOnce(state, 'click', () => { throw new Error('click failed'); }),
    (error) => error.code === 'PROMPT_DELIVERY_SUBMIT_FAILED'
      && error.detail?.deliveryProof?.submitMethod === 'click'
      && error.detail?.deliveryProof?.submitAttempted === true
  );
});
