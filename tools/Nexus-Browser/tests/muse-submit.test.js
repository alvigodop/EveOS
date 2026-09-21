const test = require('node:test');
const assert = require('node:assert/strict');
const muse = require('../extension/content/muse.js');
const museInput = require('../extension/content/muse-input.js');
const museAnswer = require('../extension/content/muse-answer.js');

function composer(value = 'hello') {
  return {
    tagName: 'TEXTAREA',
    value,
    isContentEditable: false,
    closest(selector) { return selector === 'form' ? this.form || null : null; }
  };
}

test('Muse click submission is accepted only after the prompt leaves the composer', async () => {
  const field = composer('hello');
  const mode = await muse.submitComposer(field, 'hello', {
    click() { field.value = ''; }
  }, { isCommitted: () => field.value === '', commitTimeoutMs: 0 });
  assert.equal(mode, 'click');
  assert.equal(field.value, '');
});

test('Muse never falls through to form or Enter after an uncommitted send click', async () => {
  const field = composer('hello');
  let clicks = 0;
  let formSubmits = 0;
  field.form = { requestSubmit() { formSubmits += 1; } };
  field.dispatchEvent = () => { throw new Error('Enter fallback must not run'); };
  await assert.rejects(
    () => muse.submitComposer(field, 'hello', { click() { clicks += 1; } }, {
      isCommitted: () => false,
      commitTimeoutMs: 0
    }),
    (error) => error.code === 'PROMPT_DELIVERY_UNCOMMITTED'
      && error.detail?.deliveryProof?.submitMethod === 'click'
  );
  assert.equal(clicks, 1);
  assert.equal(formSubmits, 0);
  assert.equal(field.value, 'hello');
});

test('Muse uses form requestSubmit once when no send control exists and verifies commitment', async () => {
  const field = composer('hello');
  let committed = false;
  let formSubmits = 0;
  field.form = {
    requestSubmit() { formSubmits += 1; committed = true; field.value = ''; }
  };
  const mode = await muse.submitComposer(field, 'hello', null, {
    isCommitted: () => committed,
    commitTimeoutMs: 0
  });
  assert.equal(mode, 'requestSubmit');
  assert.equal(formSubmits, 1);
});

test('Muse requestComposerSubmit refuses missing forms without side effects', () => {
  const field = composer('hello');
  assert.equal(muse.requestComposerSubmit(field), false);
  assert.equal(field.value, 'hello');
});


test('Muse resolves a missing composer by opening the headed Chat view once', async () => {
  const field = composer('');
  let mounted = false;
  let clicks = 0;
  const result = await muse.resolveComposer({
    findComposer: () => mounted ? field : null,
    findChatEntryControl: () => ({
      click() { clicks += 1; mounted = true; }
    }),
    sleep: async () => {}
  });
  assert.equal(result, field);
  assert.equal(clicks, 1);
});

test('Muse composer recovery leaves the page untouched when no exact Chat control exists', async () => {
  const result = await muse.resolveComposer({
    findComposer: () => null,
    findChatEntryControl: () => null,
    sleep: async () => {}
  });
  assert.equal(result, null);
});


test('Muse does not fall through to a second submit path once a user turn proves commit', async () => {
  const field = composer('hello');
  let clicks = 0;
  let formSubmits = 0;
  field.form = { requestSubmit() { formSubmits += 1; } };
  const mode = await muse.submitComposer(
    field,
    'hello',
    { click() { clicks += 1; } },
    { isCommitted: () => clicks === 1 }
  );
  assert.equal(mode, 'click');
  assert.equal(clicks, 1);
  assert.equal(formSubmits, 0);
  assert.equal(field.value, 'hello');
});


test('Muse exact-once qualification mode never falls through to form or Enter after one click', async () => {
  const field = composer('hello');
  let clicks = 0;
  let formSubmits = 0;
  field.dispatchEvent = () => { throw new Error('Enter fallback must not run'); };
  field.form = { requestSubmit() { formSubmits += 1; } };
  await assert.rejects(
    () => muse.submitComposer(
      field,
      'hello',
      { click() { clicks += 1; } },
      { exactOnce: true, isCommitted: () => false, commitTimeoutMs: 0 }
    ),
    (error) => error.code === 'PROMPT_DELIVERY_UNCOMMITTED'
  );
  assert.equal(clicks, 1);
  assert.equal(formSubmits, 0);
});


test('Muse exact-once qualification mode refuses fallback paths when no send control is enabled', async () => {
  const field = composer('hello');
  let formSubmits = 0;
  field.form = { requestSubmit() { formSubmits += 1; } };
  field.dispatchEvent = () => { throw new Error('Enter fallback must not run'); };
  await assert.rejects(
    () => muse.submitComposer(field, 'hello', null, { exactOnce: true, isCommitted: () => false, commitTimeoutMs: 0 }),
    /no enabled send control/
  );
  assert.equal(formSubmits, 0);
});


test('Muse qualification reopens Chat and reseeds a remounted composer without submitting', async () => {
  const first = composer('QUALIFY_run-1');
  const second = composer('');
  let chatClicks = 0;
  let submitClicks = 0;
  let opened = false;
  const send = { click() { submitClicks += 1; } };

  const recovered = await muse.recoverQualificationComposer(first, 'QUALIFY_run-1', {
    findComposer: () => opened ? second : first,
    findChatEntryControl: () => ({
      click() { chatClicks += 1; opened = true; }
    }),
    findSendControl: (field) => opened && field === second ? send : null,
    setComposerText: (field, text) => { field.value = text; },
    composerContainsText: (field, text) => field.value === text,
    sleep: async () => {},
    attempts: 2
  });

  assert.equal(chatClicks, 1);
  assert.equal(recovered.composer, second);
  assert.equal(recovered.sendControl, send);
  assert.equal(second.value, 'QUALIFY_run-1');
  assert.equal(submitClicks, 0);
});

test('Muse qualification can follow a composer remount during hydration', async () => {
  const original = {
    findComposer: museInput.findComposer,
    findSendControl: museInput.findSendControl,
    setComposerText: museInput.setComposerText,
    composerContainsText: museInput.composerContainsText,
    assistantNodes: museAnswer.assistantNodes,
    userNodes: museAnswer.userNodes,
    getTurnAssistantText: museAnswer.getTurnAssistantText,
    getTurnUserText: museAnswer.getTurnUserText
  };
  const first = composer('');
  const second = composer('');
  let findCalls = 0;
  let committed = false;
  const send = {
    click() { second.value = ''; committed = true; }
  };
  global.document = global.document || { body: {} };
  const previousObserver = global.MutationObserver;
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  try {
    museInput.findComposer = () => (++findCalls === 1 ? first : second);
    museInput.findSendControl = () => send;
    museInput.setComposerText = (field, text) => { field.value = text; };
    museInput.composerContainsText = (field, text) => field.value === text;
    museAnswer.assistantNodes = () => [];
    museAnswer.userNodes = () => committed ? [{}] : [];
    museAnswer.getTurnAssistantText = () => '';
    museAnswer.getTurnUserText = (nodes, baselineCount) => nodes.length > baselineCount ? 'hello' : '';
    const mode = await muse.submitPrompt('qualification-remount', 'hello', {
      qualification: { runId: 'run-remount', exactOnce: true }
    });
    assert.equal(mode, 'click');
    assert.ok(findCalls >= 2);
    assert.equal(second.value, '');
  } finally {
    muse.stopWatcher('qualification-remount');
    museInput.findComposer = original.findComposer;
    museInput.findSendControl = original.findSendControl;
    museInput.setComposerText = original.setComposerText;
    museInput.composerContainsText = original.composerContainsText;
    museAnswer.assistantNodes = original.assistantNodes;
    museAnswer.userNodes = original.userNodes;
    museAnswer.getTurnAssistantText = original.getTurnAssistantText;
    museAnswer.getTurnUserText = original.getTurnUserText;
    global.MutationObserver = previousObserver;
  }
});


test('Muse qualification seeds composer text before waiting for the send control to appear', async () => {
  const original = {
    findComposer: museInput.findComposer,
    findSendControl: museInput.findSendControl,
    setComposerText: museInput.setComposerText,
    composerContainsText: museInput.composerContainsText,
    assistantNodes: museAnswer.assistantNodes,
    userNodes: museAnswer.userNodes,
    getTurnAssistantText: museAnswer.getTurnAssistantText,
    getTurnUserText: museAnswer.getTurnUserText
  };
  const field = composer('');
  let seeded = false;
  let committed = false;
  const send = { click() { field.value = ''; committed = true; } };
  global.document = global.document || { body: {} };
  const previousObserver = global.MutationObserver;
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  try {
    museInput.findComposer = () => field;
    museInput.findSendControl = () => seeded ? send : null;
    museInput.setComposerText = (target, text) => {
      target.value = text;
      seeded = true;
    };
    museInput.composerContainsText = (target, text) => target.value === text;
    museAnswer.assistantNodes = () => [];
    museAnswer.userNodes = () => committed ? [{}] : [];
    museAnswer.getTurnAssistantText = () => '';
    museAnswer.getTurnUserText = (nodes, baselineCount) => nodes.length > baselineCount ? 'hello' : '';
    const mode = await muse.submitPrompt('qualification-seed-first', 'hello', {
      qualification: { runId: 'run-seed-first', exactOnce: true }
    });
    assert.equal(mode, 'click');
    assert.equal(seeded, true);
    assert.equal(field.value, '');
  } finally {
    muse.stopWatcher('qualification-seed-first');
    museInput.findComposer = original.findComposer;
    museInput.findSendControl = original.findSendControl;
    museInput.setComposerText = original.setComposerText;
    museInput.composerContainsText = original.composerContainsText;
    museAnswer.assistantNodes = original.assistantNodes;
    museAnswer.userNodes = original.userNodes;
    museAnswer.getTurnAssistantText = original.getTurnAssistantText;
    museAnswer.getTurnUserText = original.getTurnUserText;
    global.MutationObserver = previousObserver;
  }
});


test('Muse managed-worker readiness requires a hydrated composer and recognizable send control', () => {
  const field = composer('');
  const send = { click() {} };
  const ready = muse.managedWorkerReady({
    findComposer: () => field,
    findSendControl: () => send,
    isPrehydrationComposer: () => false,
    isUnsafeSendControl: () => false
  });
  assert.deepEqual(ready, { ready: true, reason: 'ready' });

  const prehydration = muse.managedWorkerReady({
    findComposer: () => field,
    findSendControl: () => send,
    isPrehydrationComposer: () => true,
    isUnsafeSendControl: () => false
  });
  assert.deepEqual(prehydration, { ready: false, reason: 'composer-prehydration' });

  const missingControl = muse.managedWorkerReady({
    findComposer: () => field,
    findSendControl: () => null,
    isPrehydrationComposer: () => false,
    isUnsafeSendControl: () => false
  });
  assert.deepEqual(missingControl, { ready: false, reason: 'send-control-missing' });
});

test('Muse managed-worker readiness rejects an unsafe composer action without clicking it', () => {
  const field = composer('');
  const send = { click() { throw new Error('readiness probe must not click'); } };
  const result = muse.managedWorkerReady({
    findComposer: () => field,
    findSendControl: () => send,
    isPrehydrationComposer: () => false,
    isUnsafeSendControl: () => true
  });
  assert.deepEqual(result, { ready: false, reason: 'send-control-unsafe' });
});




test('Muse uncommitted delivery diagnostics distinguish retained composer text from rendered prompt evidence', () => {
  const field = composer('hello');
  const exact = {
    tagName: 'DIV', className: 'hatch-turn',
    innerText: 'hello', textContent: 'hello',
    getAttribute(name) { return name === 'data-testid' ? 'turn-shell' : null; }
  };
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('user-message') || selector.includes('human-message') || selector.includes('data-message')) return [];
      if (selector === 'div,article,section,p,span') return [exact];
      return [];
    }
  };
  const evidence = muse.commitmentDiagnostics('hello', 0, field, root);
  assert.equal(evidence.baselineUserNodes, 0);
  assert.equal(evidence.currentUserNodes, 0);
  assert.equal(evidence.composerRetainedPrompt, true);
  assert.equal(evidence.exactDomMatch.tag, 'div');
  assert.equal(evidence.exactDomMatch.testId, 'turn-shell');
});


test('Muse exact-once submit refreshes a remounted composer and send control before the single click', async () => {
  const original = {
    findComposer: museInput.findComposer,
    findSendControl: museInput.findSendControl,
    setComposerText: museInput.setComposerText,
    composerContainsText: museInput.composerContainsText,
    assistantNodes: museAnswer.assistantNodes,
    userNodes: museAnswer.userNodes,
    getTurnAssistantText: museAnswer.getTurnAssistantText,
    getTurnUserText: museAnswer.getTurnUserText
  };
  const first = composer('');
  const second = composer('');
  let findCalls = 0;
  let staleClicks = 0;
  let freshClicks = 0;
  let committed = false;
  const staleSend = { click() { staleClicks += 1; } };
  const freshSend = { click() { freshClicks += 1; second.value = ''; committed = true; } };
  global.document = global.document || { body: {} };
  const previousObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    museInput.findComposer = () => (++findCalls < 3 ? first : second);
    museInput.findSendControl = (field) => field === second ? freshSend : staleSend;
    museInput.setComposerText = (field, text) => { field.value = text; };
    museInput.composerContainsText = (field, text) => field.value === text;
    museAnswer.assistantNodes = () => [];
    museAnswer.userNodes = () => committed ? [{}] : [];
    museAnswer.getTurnAssistantText = () => '';
    museAnswer.getTurnUserText = (nodes, baselineCount) => nodes.length > baselineCount ? 'hello' : '';
    const mode = await muse.submitPrompt('qualification-remount-before-click', 'hello', {
      qualification: { runId: 'run-remount-before-click', exactOnce: true }
    });
    assert.equal(mode, 'click');
    assert.equal(staleClicks, 0);
    assert.equal(freshClicks, 1);
    assert.equal(second.value, '');
  } finally {
    muse.stopWatcher('qualification-remount-before-click');
    museInput.findComposer = original.findComposer;
    museInput.findSendControl = original.findSendControl;
    museInput.setComposerText = original.setComposerText;
    museInput.composerContainsText = original.composerContainsText;
    museAnswer.assistantNodes = original.assistantNodes;
    museAnswer.userNodes = original.userNodes;
    museAnswer.getTurnAssistantText = original.getTurnAssistantText;
    museAnswer.getTurnUserText = original.getTurnUserText;
    global.MutationObserver = previousObserver;
  }
});
