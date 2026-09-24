const test = require('node:test');
const assert = require('node:assert/strict');
const geminiAnswer = require('../extension/content/gemini-answer.js');

test('Gemini answer adapter distinguishes both Google frontends', () => {
  assert.equal(geminiAnswer.frontendFromUrl('https://gemini.google.com/app/abc'), 'gemini');
  assert.equal(geminiAnswer.frontendFromUrl('https://aistudio.google.com/prompts/new_chat'), 'aistudio');
});

test('Gemini app ownership rejects user-query and accepts model-response ancestry', () => {
  const user = { tagName: 'USER-QUERY', className: '', parentElement: null, getAttribute() { return null; } };
  const assistantTurn = { tagName: 'MODEL-RESPONSE', className: '', parentElement: null, getAttribute() { return null; } };
  const assistantText = { tagName: 'DIV', className: '', parentElement: assistantTurn, getAttribute() { return null; } };

  assert.equal(geminiAnswer.isUserOwned(user, 'gemini'), true);
  assert.equal(geminiAnswer.isAssistantOwned(assistantText, 'gemini'), true);
  assert.equal(geminiAnswer.isAssistantOwned(user, 'gemini'), false);
});

test('AI Studio ownership uses the surrounding model turn and rejects user turns', () => {
  const modelTurn = {
    tagName: 'MS-CHAT-TURN',
    className: 'model render',
    parentElement: null,
    matches() { return false; },
    querySelector() { return null; },
    getAttribute() { return null; }
  };
  const userTurn = {
    tagName: 'MS-CHAT-TURN',
    className: 'user render',
    parentElement: null,
    matches() { return false; },
    querySelector(selector) { return selector.includes('User') ? {} : null; },
    getAttribute() { return null; }
  };
  const modelNode = { tagName: 'DIV', className: '', parentElement: modelTurn, getAttribute() { return null; } };
  const userNode = { tagName: 'DIV', className: '', parentElement: userTurn, getAttribute() { return null; } };

  assert.equal(geminiAnswer.isAssistantOwned(modelNode, 'aistudio'), true);
  assert.equal(geminiAnswer.isUserOwned(userNode, 'aistudio'), true);
  assert.equal(geminiAnswer.isAssistantOwned(userNode, 'aistudio'), false);
});

test('AI Studio ownership normalizes lowercase role attributes used by the live UI', () => {
  const makeTurn = (role) => ({
    tagName: 'MS-CHAT-TURN',
    className: 'ng-star-inserted',
    parentElement: null,
    querySelector() { return null; },
    getAttribute(name) { return name === 'data-turn-role' ? role : null; }
  });
  const modelTurn = makeTurn('model');
  const userTurn = makeTurn('user');
  const modelNode = { tagName: 'DIV', className: '', parentElement: modelTurn, getAttribute() { return null; } };
  const userNode = { tagName: 'DIV', className: '', parentElement: userTurn, getAttribute() { return null; } };

  assert.equal(geminiAnswer.aiStudioTurnRole(modelTurn), 'model');
  assert.equal(geminiAnswer.isAssistantOwned(modelNode, 'aistudio'), true);
  assert.equal(geminiAnswer.isUserOwned(userNode, 'aistudio'), true);
  assert.equal(geminiAnswer.isAssistantOwned(userNode, 'aistudio'), false);
});

test('Gemini answer normalization strips Gemini said even after rendered leading whitespace', () => {
  assert.equal(
    geminiAnswer.normalizeText('\n   Gemini said\nHey Drift! What are you working on today?'),
    'Hey Drift! What are you working on today?'
  );
});

test('AI Studio fallback cleanup removes model timestamp and timing artifacts', () => {
  assert.equal(
    geminiAnswer.cleanAiStudioFallbackText('Model 6:00 AM\nI am doing well, thank you!\n2s\n2s'),
    'I am doing well, thank you!'
  );
  assert.equal(geminiAnswer.cleanAiStudioFallbackText('2s'), '');
  assert.equal(geminiAnswer.isTimingOnlyText(' 2s '), true);
  assert.equal(geminiAnswer.cleanAiStudioFallbackText('Model 6:53 AM\nThinking'), '');
  assert.equal(geminiAnswer.cleanAiStudioFallbackText('Thinking...'), '');
  assert.equal(geminiAnswer.cleanAiStudioFallbackText('Thinking\n\nActual response here'), 'Actual response here');
  assert.equal(
    geminiAnswer.cleanAiStudioFallbackText(
      'Model 7:10 AM\nTest successful! All systems operational.\ninfo\nGoogle AI models may make mistakes, so double-check outputs.\nUse Arrow Up and Arrow Down to select a turn, Enter to jump to it, and Escape to return to the chat.'
    ),
    'Test successful! All systems operational.'
  );
});

test('AI Studio thought nodes are excluded from answer candidates', () => {
  const thoughtNode = {
    innerText: 'Interpreting the Discrepancy',
    closest(selector) {
      return selector.includes('ms-thought-viewer') ? {} : null;
    }
  };
  const answerNode = {
    innerText: 'Final answer only',
    closest() { return null; }
  };

  assert.equal(geminiAnswer.isAiStudioThoughtNode(thoughtNode), true);
  assert.equal(geminiAnswer.isAiStudioThoughtNode(answerNode), false);
});
