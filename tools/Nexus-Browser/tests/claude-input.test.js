const test = require('node:test');
const assert = require('node:assert/strict');
const claudeInput = require('../extension/content/claude-input.js');

function mockControl(attrs = {}, text = '') {
  return {
    disabled: !!attrs.disabled,
    className: attrs.class || '',
    textContent: text,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    matches(selector) {
      return selector.includes('button') || selector.includes('[role="button"]');
    }
  };
}

test('Claude composer selector chain prefers current semantic hooks', () => {
  const selectors = claudeInput.composerSelectors();
  assert.equal(selectors[0], '[data-testid="chat-input"][contenteditable="true"]');
  assert.ok(selectors.includes('div.ProseMirror[contenteditable="true"]'));
  assert.ok(selectors.includes('[contenteditable="true"][role="textbox"]'));
});

test('Claude send-control scoring strongly prefers Send message', () => {
  const send = mockControl({ 'aria-label': 'Send message', 'data-testid': 'send-button', type: 'button' });
  assert.ok(claudeInput.sendControlScore(send) >= 400);
});

test('Claude voice/upload controls can never score as send', () => {
  const mic = mockControl({ 'aria-label': 'Voice mode' });
  const upload = mockControl({ 'aria-label': 'Upload file' });
  assert.equal(claudeInput.isUnsafeSendControl(mic), true);
  assert.equal(claudeInput.isUnsafeSendControl(upload), true);
  assert.equal(claudeInput.sendControlScore(mic), -1000);
  assert.equal(claudeInput.sendControlScore(upload), -1000);
});

test('Claude disabled send control is rejected', () => {
  const disabled = mockControl({ 'aria-label': 'Send message', disabled: true });
  assert.equal(claudeInput.sendControlScore(disabled), -1000);
});

test('Claude composer text verification tolerates rendered whitespace', () => {
  const composer = { tagName: 'DIV', innerText: 'reply   exactly\nCLAUDE_BRIDGE_OK' };
  assert.equal(claudeInput.composerContainsText(composer, 'reply exactly CLAUDE_BRIDGE_OK'), true);
});
