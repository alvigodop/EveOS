const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../extension/content/gemini.js');

test('AI Studio can finalize from DOM state without waiting on a foreground timer', () => {
  assert.equal(gemini.aiStudioCanFinalize({
    frontend: 'aistudio',
    isGenerating: false,
    submissionReady: true,
    hasResponse: true
  }), true);
});

test('AI Studio does not finalize while generating or before a response exists', () => {
  assert.equal(gemini.aiStudioCanFinalize({
    frontend: 'aistudio',
    isGenerating: true,
    submissionReady: false,
    hasResponse: true
  }), false);
  assert.equal(gemini.aiStudioCanFinalize({
    frontend: 'aistudio',
    isGenerating: false,
    submissionReady: true,
    hasResponse: false
  }), false);
  assert.equal(gemini.aiStudioCanFinalize({
    frontend: 'aistudio',
    isGenerating: false,
    submissionReady: true,
    hasResponse: true,
    sawGenerating: false
  }), false);
});

test('Gemini App keeps its normal settle path', () => {
  assert.equal(gemini.aiStudioCanFinalize({
    frontend: 'gemini',
    isGenerating: false,
    submissionReady: true,
    hasResponse: true
  }), false);
});

test('AI Studio Ctrl/Cmd+Enter fallback uses only the platform-appropriate modifier', () => {
  assert.deepEqual(gemini.aiStudioShortcutModifiers('Win32'), { ctrlKey: true, metaKey: false });
  assert.deepEqual(gemini.aiStudioShortcutModifiers('MacIntel'), { ctrlKey: false, metaKey: true });
});