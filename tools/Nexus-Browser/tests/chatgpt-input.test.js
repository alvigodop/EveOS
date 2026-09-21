const test = require('node:test');
const assert = require('node:assert/strict');
const chatgptInput = require('../extension/content/chatgpt-input.js');
const chatgpt = require('../extension/content/chatgpt.js');

function control({ id = '', aria = '', testId = '', type = '', disabled = false, title = '' } = {}) {
  return {
    id,
    disabled,
    className: '',
    textContent: '',
    getAttribute(name) {
      if (name === 'aria-label') return aria;
      if (name === 'data-testid') return testId;
      if (name === 'type') return type;
      if (name === 'title') return title;
      if (name === 'aria-disabled') return disabled ? 'true' : null;
      return null;
    },
    matches(selector) {
      return selector.includes('button');
    }
  };
}

test('ChatGPT composer selector chain includes the current prompt-textarea and fallback textarea', () => {
  const selectors = chatgptInput.composerSelectors();
  assert.equal(selectors.includes('#prompt-textarea[contenteditable="true"]'), true);
  assert.equal(selectors.includes('textarea[name="prompt-textarea"]'), true);
  assert.equal(selectors.includes('textarea[name="prompt"]'), true);
});

test('ChatGPT known send controls score strongly', () => {
  assert.ok(chatgptInput.sendControlScore(control({ id: 'composer-submit-button', aria: 'Send prompt' })) >= 500);
  assert.ok(chatgptInput.sendControlScore(control({ testId: 'send-button' })) >= 250);
  assert.ok(chatgptInput.sendControlScore(control({ testId: 'fruitjuice-send-button' })) >= 200);
  assert.ok(chatgptInput.sendControlScore(control({ aria: 'Send' })) >= 150);
});

test('ChatGPT voice/dictation controls can never score as send', () => {
  assert.equal(chatgptInput.sendControlScore(control({ aria: 'Start dictation' })), -1000);
  assert.equal(chatgptInput.sendControlScore(control({ aria: 'Start Voice' })), -1000);
  assert.equal(chatgptInput.sendControlScore(control({ aria: 'Upload file' })), -1000);
});

test('ChatGPT disabled send controls are rejected', () => {
  assert.equal(chatgptInput.sendControlScore(control({ testId: 'send-button', disabled: true })), -1000);
});


test('ChatGPT generation detection recognizes current stop-streaming controls', () => {
  const stop = control({ aria: 'Stop streaming' });
  const root = {
    querySelectorAll(selector) {
      return selector === 'button[aria-label="Stop streaming"]' ? [stop] : [];
    }
  };
  assert.equal(chatgptInput.generationLooksActive(root), true);
});

test('ChatGPT generation detection ignores an idle document with no busy or stop control', () => {
  const root = { querySelectorAll() { return []; } };
  assert.equal(chatgptInput.generationLooksActive(root), false);
});


test('ChatGPT ready-composer wait tolerates initial hydration with no composer', async () => {
  const hydrated = { value: '' };
  const send = {};
  const original = {
    findComposer: chatgptInput.findComposer,
    findSendControl: chatgptInput.findSendControl,
    setComposerText: chatgptInput.setComposerText,
    composerContainsText: chatgptInput.composerContainsText
  };
  let calls = 0;
  try {
    chatgptInput.findComposer = () => (++calls < 3 ? null : hydrated);
    chatgptInput.findSendControl = (field) => field === hydrated && field.value === 'payload' ? send : null;
    chatgptInput.setComposerText = (field, text) => { field.value = text; };
    chatgptInput.composerContainsText = (field, text) => !!field && field.value === text;
    const ready = await chatgpt.waitForReadyComposer(null, 'payload', 300);
    assert.equal(ready.composer, hydrated);
    assert.equal(ready.control, send);
    assert.equal(hydrated.value, 'payload');
  } finally {
    Object.assign(chatgptInput, original);
  }
});

test('ChatGPT Dex result delivery follows a remounted composer before submit', async () => {
  const first = { value: 'payload' };
  const second = { value: '' };
  const send = {};
  const original = {
    findComposer: chatgptInput.findComposer,
    findSendControl: chatgptInput.findSendControl,
    setComposerText: chatgptInput.setComposerText,
    composerContainsText: chatgptInput.composerContainsText
  };
  let calls = 0;
  try {
    chatgptInput.findComposer = () => (++calls < 2 ? first : second);
    chatgptInput.findSendControl = (field) => field === second && field.value === 'payload' ? send : null;
    chatgptInput.setComposerText = (field, text) => { field.value = text; };
    chatgptInput.composerContainsText = (field, text) => field.value === text;
    const ready = await chatgpt.waitForReadyComposer(first, 'payload', 250);
    assert.equal(ready.composer, second);
    assert.equal(ready.control, send);
    assert.equal(second.value, 'payload');
    assert.ok(chatgpt.DEX_CONTROL_SEND_WAIT_MS >= 12000);
  } finally {
    chatgptInput.findComposer = original.findComposer;
    chatgptInput.findSendControl = original.findSendControl;
    chatgptInput.setComposerText = original.setComposerText;
    chatgptInput.composerContainsText = original.composerContainsText;
  }
});

test('ChatGPT treats a committed user turn as submission success even if composer text lingers', async () => {
  const field = { value: 'payload', closest() { return null; } };
  let clicks = 0;
  const originalContains = chatgptInput.composerContainsText;
  try {
    chatgptInput.composerContainsText = (composer, text) => composer.value === text;
    const mode = await chatgpt.submitComposer(
      field,
      'payload',
      { click() { clicks += 1; } },
      { exactOnce: true, isCommitted: () => clicks === 1 }
    );
    assert.equal(mode, 'click');
    assert.equal(clicks, 1);
    assert.equal(field.value, 'payload');
  } finally {
    chatgptInput.composerContainsText = originalContains;
  }
});

