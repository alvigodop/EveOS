const test = require('node:test');
const assert = require('node:assert/strict');
const grokInput = require('../extension/content/grok-input.js');

function control(attrs = {}, textContent = '') {
  return {
    disabled: !!attrs.disabled,
    className: attrs.className || '',
    textContent,
    getAttribute(name) {
      if (name === 'aria-disabled' && attrs.ariaDisabled != null) return String(attrs.ariaDisabled);
      if (name === 'aria-label') return attrs.ariaLabel || null;
      if (name === 'data-testid') return attrs.testid || null;
      if (name === 'name') return attrs.name || null;
      if (name === 'type') return attrs.type || null;
      if (name === 'title') return attrs.title || null;
      return null;
    },
    matches(selector) {
      return selector.includes('button') || selector.includes('[role="button"]');
    }
  };
}

test('Grok send-control safety suite', async (t) => {
  await t.test('microphone and voice controls can never score as send', () => {
    const mic = control({ ariaLabel: 'Microphone', testid: 'voice-input' });
    const voice = control({ title: 'Start voice mode' });
    const record = control({ ariaLabel: 'Record audio' });

    for (const candidate of [mic, voice, record]) {
      assert.equal(grokInput.isUnsafeSendControl(candidate), true);
      assert.equal(grokInput.sendControlScore(candidate), -1000);
    }
  });

  await t.test('known Grok chat-submit control is strongly preferred', () => {
    const submit = control({ testid: 'chat-submit', ariaLabel: 'Submit' });
    assert.equal(grokInput.isUnsafeSendControl(submit), false);
    assert.ok(grokInput.sendControlScore(submit) >= 200);
  });

  await t.test('X Grok send-button control is preferred without weakening voice safety', () => {
    const send = control({ testid: 'send-button', ariaLabel: 'Send' });
    const mic = control({ testid: 'send-button', ariaLabel: 'Microphone' });
    assert.ok(grokInput.sendControlScore(send) >= 180);
    assert.equal(grokInput.sendControlScore(mic), -1000);
  });

  await t.test('disabled submit controls are rejected', () => {
    const disabled = control({ testid: 'chat-submit', ariaLabel: 'Submit', disabled: true });
    const ariaDisabled = control({ testid: 'chat-submit', ariaLabel: 'Submit', ariaDisabled: true });
    assert.equal(grokInput.sendControlScore(disabled), -1000);
    assert.equal(grokInput.sendControlScore(ariaDisabled), -1000);
  });

  await t.test('generic unlabeled icon buttons are not treated as send', () => {
    const genericIcon = control({ className: 'rounded-full icon-button' });
    assert.ok(grokInput.sendControlScore(genericIcon) < 60);
  });
});

test('X Grok frontend uses X-native composer selectors while remaining provider Grok', () => {
  const xUrl = 'https://x.com/i/grok?conversation=abc123';
  const grokUrl = 'https://grok.com/c/abc123';

  assert.equal(grokInput.isXGrokUrl(xUrl), true);
  assert.equal(grokInput.isXGrokUrl(grokUrl), false);

  const xSelectors = grokInput.composerSelectorsForUrl(xUrl);
  const grokSelectors = grokInput.composerSelectorsForUrl(grokUrl);

  assert.equal(xSelectors[0], 'textarea[placeholder="Ask anything"]');
  assert.ok(xSelectors.includes('[data-testid="grokInput"] textarea'));
  assert.equal(grokSelectors[0], '[data-testid="chat-input"] [contenteditable="true"]');
});
