const test = require('node:test');
const assert = require('node:assert/strict');
const museInput = require('../extension/content/muse-input.js');

function node(attrs = {}, closestBusy = false) {
  return {
    getAttribute(name) { return attrs[name] ?? null; },
    closest(selector) {
      return closestBusy && selector === '[aria-busy="true"]' ? {} : null;
    }
  };
}

function rootFor(map = {}) {
  return {
    querySelectorAll(selector) { return map[selector] || []; }
  };
}

test('Muse ignores completed historical thinking widgets as active generation', () => {
  const stale = node({ 'data-testid': 'thinking-complete' });
  const root = rootFor({ '[data-testid*="thinking" i]': [stale] });
  assert.equal(museInput.generationLooksActive(root), false);
});

test('Muse accepts explicit active thinking state and busy ancestry', () => {
  const active = node({ 'data-state': 'active' });
  const nestedBusy = node({}, true);
  assert.equal(museInput.generationLooksActive(rootFor({
    '[data-testid*="thinking" i]': [active]
  })), true);
  assert.equal(museInput.generationLooksActive(rootFor({
    '[data-testid*="working" i]': [nestedBusy]
  })), true);
});

test('Muse stop controls remain authoritative active-generation evidence', () => {
  const stop = node();
  assert.equal(museInput.generationLooksActive(rootFor({
    'button[aria-label*="stop" i]': [stop]
  })), true);
});


test('Muse treats soft busy/thinking signals as stale once the normal send control is ready', () => {
  const active = node({ 'data-state': 'active' });
  const busy = node({ 'aria-busy': 'true' });
  const send = node({ 'data-pel-click': 'chat_send_message' });
  const sendSelector = 'button[data-pel-click="chat_send_message"]';

  assert.equal(museInput.generationLooksActive(rootFor({
    '[data-testid*="thinking" i]': [active],
    [sendSelector]: [send]
  })), false);

  assert.equal(museInput.generationLooksActive(rootFor({
    '[aria-busy="true"][data-testid*="message" i]': [busy],
    [sendSelector]: [send]
  })), false);
});

test('Muse stop control remains active even if a send-like control is also visible', () => {
  const stop = node();
  const send = node({ 'data-pel-click': 'chat_send_message' });
  assert.equal(museInput.generationLooksActive(rootFor({
    'button[aria-label*="stop" i]': [stop],
    'button[data-pel-click="chat_send_message"]': [send]
  })), true);
});
