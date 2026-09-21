const test = require('node:test');
const assert = require('node:assert/strict');
const grokAnswer = require('../extension/content/grok-answer.js');

test('Grok answer extraction is anchored to assistant-owned turns only', () => {
  let assistantTurn;
  const assistantContent = {
    innerText: 'Actual Grok reply',
    textContent: 'Actual Grok reply',
    closest: (selector) => selector === '[data-testid="assistant-message"]' ? assistantTurn : null,
    querySelectorAll: () => [],
    cloneNode() {
      return {
        innerText: 'Actual Grok reply',
        textContent: 'Actual Grok reply',
        querySelectorAll: () => []
      };
    }
  };
  assistantTurn = {
    getAttribute: (name) => name === 'data-testid' ? 'assistant-message' : null,
    closest: (selector) => selector === '[data-testid="assistant-message"]' ? assistantTurn : null,
    querySelector: (selector) => selector === '.response-content-markdown' ? assistantContent : null
  };
  const root = {
    querySelectorAll: (selector) => selector === '[data-testid="assistant-message"]' ? [assistantTurn] : []
  };

  const nodes = grokAnswer.assistantNodes(root);
  assert.deepEqual(nodes, [assistantContent]);
  assert.equal(grokAnswer.assistantText(nodes[0]), 'Actual Grok reply');
});

test('Grok user-owned markdown can never be emitted as assistant text', () => {
  const userOwned = {
    closest: (selector) => selector === '[data-testid="user-message"]' ? {} : null,
    cloneNode: () => { throw new Error('user-owned node should not be cloned as assistant content'); }
  };
  assert.equal(grokAnswer.isUserOwned(userOwned), true);
  assert.equal(grokAnswer.assistantText(userOwned), '');
});

test('Grok responseNodeForAssistantTurn rejects non-assistant turns', () => {
  const userTurn = {
    getAttribute: (name) => name === 'data-testid' ? 'user-message' : null,
    querySelector: () => ({})
  };
  assert.equal(grokAnswer.responseNodeForAssistantTurn(userTurn), null);
});

test('X Grok can use the assistant-message wrapper itself when no markdown child exists', () => {
  let assistantTurn;
  assistantTurn = {
    getAttribute: (name) => name === 'data-testid' ? 'assistant-message' : null,
    closest: (selector) => selector === '[data-testid="assistant-message"]' ? assistantTurn : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    cloneNode() {
      return {
        innerText: 'Hi! How can I help you today? 😊',
        textContent: 'Hi! How can I help you today? 😊',
        querySelectorAll: () => []
      };
    },
    innerText: 'Hi! How can I help you today? 😊',
    textContent: 'Hi! How can I help you today? 😊'
  };
  const root = {
    querySelectorAll: (selector) => selector === '[data-testid="assistant-message"]' ? [assistantTurn] : []
  };

  assert.equal(grokAnswer.responseNodeForAssistantTurn(assistantTurn), assistantTurn);
  const nodes = grokAnswer.assistantNodes(root);
  assert.deepEqual(nodes, [assistantTurn]);
  assert.equal(grokAnswer.assistantText(nodes[0]), 'Hi! How can I help you today? 😊');
});

test('assistant text still rejects wrappers that are not assistant-owned', () => {
  const orphan = {
    closest: () => null,
    cloneNode: () => ({
      innerText: 'should not leak',
      textContent: 'should not leak',
      querySelectorAll: () => []
    })
  };
  assert.equal(grokAnswer.isAssistantOwned(orphan), false);
  assert.equal(grokAnswer.assistantText(orphan), '');
});

test('flat X Grok assistant message-bubble is accepted without a nested markdown node', () => {
  const xLocation = { href: 'https://x.com/i/grok?conversation=abc' };
  const bubble = {
    ownerDocument: { location: xLocation },
    className: 'message-bubble relative text-primary prose',
    innerText: "Hi again! What's up?",
    textContent: "Hi again! What's up?",
    getAttribute: () => null,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    cloneNode() {
      return {
        innerText: "Hi again! What's up?",
        textContent: "Hi again! What's up?",
        querySelectorAll: () => []
      };
    }
  };
  const root = {
    location: xLocation,
    querySelectorAll(selector) {
      return selector === '.message-bubble' ? [bubble] : [];
    }
  };

  assert.equal(grokAnswer.isXAssistantFallback(bubble), true);
  assert.deepEqual(grokAnswer.assistantTurns(root), [bubble]);
  assert.deepEqual(grokAnswer.assistantNodes(root), [bubble]);
  assert.equal(grokAnswer.assistantText(bubble), "Hi again! What's up?");
});

test('flat X Grok filled user bubble is never accepted as assistant output', () => {
  const xLocation = { href: 'https://x.com/i/grok?conversation=abc' };
  const bubble = {
    ownerDocument: { location: xLocation },
    className: 'message-bubble relative bg-surface-l1 rounded-3xl',
    innerText: 'hi again',
    textContent: 'hi again',
    getAttribute: () => null,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false
  };
  const root = {
    location: xLocation,
    querySelectorAll(selector) {
      return selector === '.message-bubble' ? [bubble] : [];
    }
  };

  assert.equal(grokAnswer.isXAssistantFallback(bubble), false);
  assert.equal(grokAnswer.isAssistantOwned(bubble), false);
  assert.deepEqual(grokAnswer.assistantTurns(root), []);
  assert.equal(grokAnswer.assistantText(bubble), '');
});

test('X Grok assistant-only Copy text action anchors a flat hashed reply container', () => {
  const xLocation = { href: 'https://x.com/i/grok?conversation=live-shape' };
  let replyTurn;
  const copyButton = {
    ownerDocument: { location: xLocation },
    parentElement: null,
    getAttribute(name) {
      return name === 'aria-label' ? 'Copy text' : null;
    },
    querySelector: () => null
  };
  const actionRow = {
    ownerDocument: { location: xLocation },
    parentElement: null,
    innerText: '',
    textContent: '',
    getAttribute: () => null,
    closest: () => null,
    querySelector: () => null,
    matches: () => false
  };
  replyTurn = {
    ownerDocument: { location: xLocation },
    parentElement: null,
    previousElementSibling: {},
    className: 'css-175oi2r r-13awgt0',
    innerText: "123 — got it!\nAnything else on your mind?",
    textContent: "123 — got it!\nAnything else on your mind?",
    getAttribute: () => null,
    closest: () => null,
    matches: () => false,
    contains(node) { return node === actionRow || node === copyButton; },
    querySelector(selector) {
      if (/Copy text|copy/i.test(selector)) return copyButton;
      return null;
    },
    querySelectorAll: () => [],
    cloneNode() {
      return {
        innerText: "123 — got it!\nAnything else on your mind?",
        textContent: "123 — got it!\nAnything else on your mind?",
        querySelectorAll: () => []
      };
    }
  };
  copyButton.parentElement = actionRow;
  actionRow.parentElement = replyTurn;

  const root = {
    location: xLocation,
    querySelectorAll(selector) {
      if (selector.includes('Copy text')) return [copyButton];
      return [];
    }
  };

  assert.equal(grokAnswer.hasXAssistantSignal(copyButton), true);
  assert.equal(grokAnswer.xTurnForSignal(copyButton), replyTurn);
  assert.deepEqual(grokAnswer.xAssistantTurnsFromSignals(root), [replyTurn]);
  assert.deepEqual(grokAnswer.assistantTurns(root), [replyTurn]);
  assert.deepEqual(grokAnswer.assistantNodes(root), [replyTurn]);
  assert.equal(grokAnswer.assistantText(replyTurn), "123 — got it!\nAnything else on your mind?");
});
