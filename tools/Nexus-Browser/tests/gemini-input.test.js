const test = require('node:test');
const assert = require('node:assert/strict');
const geminiInput = require('../extension/content/gemini-input.js');

function control(attrs = {}, className = '') {
  return {
    className,
    disabled: false,
    textContent: attrs.textContent || '',
    getAttribute(name) { return attrs[name] ?? null; },
    matches(selector) { return selector.includes('button'); },
    closest(selector) {
      if (attrs.inPromptBox && selector === 'ms-prompt-box') return {};
      if (attrs.inTestingRequest && selector === '.testing-request') return {};
      return null;
    }
  };
}

test('Gemini provider distinguishes Gemini app and AI Studio frontends', () => {
  assert.equal(geminiInput.frontendFromUrl('https://gemini.google.com/app/abc'), 'gemini');
  assert.equal(geminiInput.frontendFromUrl('https://aistudio.google.com/prompts/new_chat'), 'aistudio');

  const appSelectors = geminiInput.composerSelectors('gemini');
  const studioSelectors = geminiInput.composerSelectors('aistudio');
  assert.ok(appSelectors.some((selector) => selector.includes('ql-editor')));
  assert.ok(studioSelectors.some((selector) => selector.includes('aria-label="Enter a prompt"')));
});

test('AI Studio selectors prioritize current Type something composer and exact Run control', () => {
  const composerSelectors = geminiInput.composerSelectors('aistudio');
  const sendSelectors = geminiInput.sendSelectors('aistudio');
  assert.ok(composerSelectors.indexOf('textarea[aria-label="Type something"]') <= 1);
  assert.ok(sendSelectors.slice(0, 3).some((selector) => selector.includes('button.run-button[aria-label="Run"]')));
});

test('Gemini app send scoring prefers Send and rejects voice/upload controls', () => {
  const send = control({ 'aria-label': 'Send message' }, 'send-button');
  const mic = control({ 'aria-label': 'Microphone' });
  const upload = control({ 'aria-label': 'Upload file' });

  assert.ok(geminiInput.sendControlScore(send, 'gemini') >= 200);
  assert.equal(geminiInput.sendControlScore(mic, 'gemini'), -1000);
  assert.equal(geminiInput.sendControlScore(upload, 'gemini'), -1000);
});

test('AI Studio send scoring prefers enabled Run and rejects disabled Run', () => {
  const run = control({ 'aria-label': 'Run', type: 'submit', inPromptBox: true }, 'run-button');
  const disabledRun = control({ 'aria-label': 'Run', inPromptBox: true }, 'run-button');
  disabledRun.disabled = true;
  const camera = control({ 'aria-label': 'Webcam' });

  assert.ok(geminiInput.sendControlScore(run, 'aistudio') >= 300);
  assert.equal(geminiInput.sendControlScore(disabledRun, 'aistudio'), -1000);
  assert.equal(geminiInput.sendControlScore(camera, 'aistudio'), -1000);
});

test('AI Studio testing-request Run control gets stronger local score', () => {
  const localRun = control({ 'aria-label': 'Run', inTestingRequest: true }, 'run-button');
  const globalRun = control({ 'aria-label': 'Run' }, 'run-button');
  assert.ok(
    geminiInput.sendControlScore(localRun, 'aistudio')
      > geminiInput.sendControlScore(globalRun, 'aistudio')
  );
});

test('AI Studio user turn counting recognizes stable User ownership markers', () => {
  const turns = [
    {
      className: '',
      getAttribute: () => null,
      querySelector: (selector) => selector.includes('data-turn-role="User"') ? {} : null
    },
    {
      className: 'model',
      getAttribute: () => null,
      querySelector: () => null
    }
  ];
  assert.equal(geminiInput.aiStudioUserTurnCount({ querySelectorAll: () => turns }), 1);
});

test('Gemini input visible allows elements without geometry in hidden tabs', () => {
  const previousDocument = global.document;
  global.document = { hidden: true };
  const element = {
    getBoundingClientRect: () => ({ width: 0, height: 0 })
  };
  try {
    assert.equal(geminiInput.visible(element), true);
  } finally {
    global.document = previousDocument;
  }
});

test('AI Studio generation detection does not use page-wide aria-busy state', () => {
  const previousDocument = global.document;
  const seen = [];
  global.document = {
    querySelectorAll(selector) {
      seen.push(selector);
      return [];
    }
  };
  try {
    assert.equal(geminiInput.generationLooksActive('aistudio'), false);
    assert.equal(seen.some((selector) => selector.includes('aria-busy')), false);
    assert.equal(seen.some((selector) => selector.includes('ms-run-button')), true);
  } finally {
    global.document = previousDocument;
  }
});

test('AI Studio completion can detect an enabled Run control without foreground geometry', () => {
  const previousDocument = global.document;
  const run = control({ 'aria-label': 'Run', type: 'submit', inPromptBox: true }, 'run-button');
  run.getBoundingClientRect = () => ({ width: 0, height: 0 });
  global.document = {
    querySelectorAll(selector) {
      return selector.includes('Run') ? [run] : [];
    }
  };
  try {
    assert.equal(geminiInput.submissionReady('aistudio'), true);
  } finally {
    global.document = previousDocument;
  }
});

test('AI Studio completion recognizes Run control presence even when disabled due to empty composer', () => {
  const previousDocument = global.document;
  const run = control({ 'aria-label': 'Run', inPromptBox: true }, 'run-button');
  run.disabled = true;
  global.document = {
    querySelectorAll(selector) {
      return selector.includes('Run') ? [run] : [];
    },
    querySelector() { return run; }
  };
  try {
    assert.equal(geminiInput.submissionReady('aistudio'), true);
  } finally {
    global.document = previousDocument;
  }
});