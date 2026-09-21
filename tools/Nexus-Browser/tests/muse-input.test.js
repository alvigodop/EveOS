const test = require('node:test');
const assert = require('node:assert/strict');
const museInput = require('../extension/content/muse-input.js');

function control({ aria = '', testId = '', type = '', text = '', disabled = false, placeholder = '', role = '' } = {}) {
  return {
    id: '',
    disabled,
    className: '',
    textContent: text,
    tagName: 'BUTTON',
    isContentEditable: false,
    getAttribute(name) {
      if (name === 'aria-label') return aria;
      if (name === 'data-testid') return testId;
      if (name === 'type') return type;
      if (name === 'placeholder') return placeholder;
      if (name === 'role') return role;
      if (name === 'aria-disabled') return disabled ? 'true' : null;
      return null;
    },
    matches(selector) { return selector.includes('button'); }
  };
}

test('Muse composer selectors include semantic Muse/message fallbacks', () => {
  const selectors = museInput.composerSelectors();
  assert.equal(selectors.includes('textarea[placeholder*="Muse" i]'), true);
  assert.equal(selectors.includes('[contenteditable="true"][role="textbox"]'), true);
  assert.equal(selectors.includes('textarea'), true);
});

test('Muse send controls score explicit send/submit controls strongly', () => {
  assert.ok(museInput.sendControlScore(control({ aria: 'Send message', testId: 'send-button', type: 'submit' })) >= 500);
  assert.ok(museInput.sendControlScore(control({ testId: 'composer-send' })) >= 200);
});

test('Muse bridge refuses to mistake approval or irreversible-action controls for send', () => {
  for (const aria of ['Approve purchase', 'Allow once', 'Confirm checkout', 'Authorize action', 'Upload file', 'Start voice']) {
    assert.equal(museInput.sendControlScore(control({ aria })), -1000, aria);
    assert.equal(museInput.isUnsafeSendControl(control({ aria })), true, aria);
  }
});

test('Muse composer scoring rejects login/search fields and prefers chat semantics', () => {
  const composer = {
    tagName: 'TEXTAREA', isContentEditable: false, className: '', textContent: '',
    getAttribute(name) {
      if (name === 'placeholder') return 'Message Muse';
      if (name === 'role') return 'textbox';
      return null;
    }
  };
  const search = {
    ...composer,
    getAttribute(name) {
      if (name === 'placeholder') return 'Search';
      if (name === 'role') return 'textbox';
      return null;
    }
  };
  assert.ok(museInput.composerScore(composer) > museInput.composerScore(search));
});


test('Muse Chat recovery only selects an exact visible Chat navigation control', () => {
  const chat = control({ aria: 'Chat', text: 'Chat' });
  const newChat = control({ aria: 'New chat', text: 'New chat' });
  const root = { querySelectorAll() { return [newChat, chat]; } };
  assert.equal(museInput.findChatEntryControl(root), chat);
});


test('Muse composer discovery prefers hydrated controls over the prehydration textarea', () => {
  const makeComposer = ({ prehydration = false, placeholder = 'Message Muse' } = {}) => ({
    tagName: 'TEXTAREA',
    isContentEditable: false,
    className: '',
    textContent: '',
    getAttribute(name) {
      if (name === 'placeholder') return placeholder;
      if (name === 'role') return 'textbox';
      if (name === 'data-hatch-composer-prehydration-input') return prehydration ? 'true' : null;
      return null;
    }
  });
  const prehydration = makeComposer({ prehydration: true });
  const hydrated = makeComposer();
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('prehydration-input')) return [prehydration];
      if (selector === 'textarea[placeholder*="message" i]') return [prehydration, hydrated];
      if (selector === 'textarea[placeholder*="Muse" i]') return [prehydration, hydrated];
      if (selector === 'textarea') return [prehydration, hydrated];
      return [];
    }
  };
  assert.equal(museInput.findComposer(root), hydrated);
  assert.equal(museInput.isPrehydrationComposer(prehydration), true);
  assert.equal(museInput.isPrehydrationComposer(hydrated), false);
});

test('Muse can identify a disabled send candidate without treating it as ready to click', () => {
  const disabled = control({ aria: 'Send message', testId: 'send-button', type: 'submit', disabled: true });
  assert.equal(museInput.sendControlScore(disabled), -1000);
  assert.ok(museInput.sendControlScore(disabled, { allowDisabled: true }) >= 500);
});


test('Muse recognizes an unlabeled right-side composer icon as the local send control', () => {
  const form = {};
  const root = { querySelectorAll() { return []; } };
  const composer = {
    parentElement: { parentElement: form },
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 180, width: 400, height: 80 }; }
  };
  const makeIcon = (left, right, aria = '') => ({
    ...control({ aria }),
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left, right, top: 120, bottom: 160, width: right - left, height: 40 }; }
  });
  const attach = makeIcon(110, 150);
  const send = makeIcon(455, 495);
  form.contains = (candidate) => candidate === attach || candidate === send;
  form.querySelectorAll = (selector) => selector === 'button, [role="button"]' ? [attach, send] : [];

  assert.equal(museInput.findSendControl(composer, { root }), send);
});

test('Muse composer-local fallback still rejects unsafe right-side actions', () => {
  const form = {};
  const root = { querySelectorAll() { return []; } };
  const composer = {
    parentElement: { parentElement: form },
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 180, width: 400, height: 80 }; }
  };
  const upload = {
    ...control({ aria: 'Upload file' }),
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 455, right: 495, top: 120, bottom: 160, width: 40, height: 40 }; }
  };
  form.contains = (candidate) => candidate === upload;
  form.querySelectorAll = (selector) => selector === 'button, [role="button"]' ? [upload] : [];

  assert.equal(museInput.findSendControl(composer, { root }), null);
});

test('Muse readiness can identify a disabled composer-local send candidate without clicking it', () => {
  const form = {};
  const root = { querySelectorAll() { return []; } };
  const composer = {
    parentElement: { parentElement: form },
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 180, width: 400, height: 80 }; }
  };
  const send = {
    ...control({ disabled: true }),
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 455, right: 495, top: 120, bottom: 160, width: 40, height: 40 }; }
  };
  form.contains = (candidate) => candidate === send;
  form.querySelectorAll = (selector) => selector === 'button, [role="button"]' ? [send] : [];

  assert.equal(museInput.findSendControl(composer, { root }), null);
  assert.equal(museInput.findSendControl(composer, { allowDisabled: true, root }), send);
});


test('Muse refuses a semantically strong global send control that is not anchored to the active composer', () => {
  const form = {};
  const localRoot = { contains(candidate) { return candidate === localSend; } };
  const composer = {
    parentElement: { parentElement: localRoot },
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 180, width: 400, height: 80 }; }
  };
  const staleGlobal = {
    ...control({ aria: 'Send message', testId: 'send-button', type: 'submit' }),
    closest() { return null; },
    getBoundingClientRect() { return { left: 10, right: 50, top: 10, bottom: 50, width: 40, height: 40 }; }
  };
  const localSend = {
    ...control({ aria: 'Send message', type: 'submit' }),
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 455, right: 495, top: 120, bottom: 160, width: 40, height: 40 }; }
  };
  form.contains = (candidate) => candidate === localSend;
  form.querySelectorAll = () => [localSend];
  localRoot.querySelectorAll = () => [localSend];
  const root = { querySelectorAll() { return [staleGlobal, localSend]; } };

  assert.equal(museInput.findSendControl(composer, { root }), localSend);
  assert.ok(museInput.composerLocalControlScore(staleGlobal, composer) < 100);
  assert.ok(museInput.composerLocalControlScore(localSend, composer) >= 100);
});

test('Muse fails closed when only an unanchored global send control exists', () => {
  const form = { contains() { return false; }, querySelectorAll() { return []; } };
  const localRoot = { contains() { return false; }, querySelectorAll() { return []; } };
  const composer = {
    parentElement: { parentElement: localRoot },
    closest(selector) { return selector === 'form' ? form : null; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 180, width: 400, height: 80 }; }
  };
  const staleGlobal = {
    ...control({ aria: 'Send message', testId: 'send-button', type: 'submit' }),
    closest() { return null; },
    getBoundingClientRect() { return { left: 10, right: 50, top: 10, bottom: 50, width: 40, height: 40 }; }
  };
  const root = { querySelectorAll() { return [staleGlobal]; } };

  assert.equal(museInput.findSendControl(composer, { root }), null);
});
