const test = require('node:test');
const assert = require('node:assert/strict');
const activity = require('../extension/content/grok-activity.js');

test('Grok visible activity extracts Worked-for label and visible detail', () => {
  const container = {
    innerText: 'Worked for 4s\nClarifying the user\'s intent',
    textContent: 'Worked for 4s\nClarifying the user\'s intent'
  };
  const turn = {
    querySelector: (selector) => selector === '.thinking-container' ? container : null
  };

  const event = activity.thoughtEventForTurn(turn);
  assert.deepEqual(event, {
    type: 'thought',
    label: 'Worked for 4s',
    duration: '4s',
    text: "Clarifying the user's intent"
  });
});

test('Grok visible activity returns nothing without a thinking container', () => {
  const turn = { querySelector: () => null };
  assert.equal(activity.thoughtEventForTurn(turn), null);
});
