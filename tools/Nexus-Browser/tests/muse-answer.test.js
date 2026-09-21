const test = require('node:test');
const assert = require('node:assert/strict');
const museAnswer = require('../extension/content/muse-answer.js');

function node(attrs = {}, className = '', parentElement = null) {
  return {
    className,
    parentElement,
    getAttribute(name) { return attrs[name] ?? null; }
  };
}

test('Muse assistant ownership accepts Muse/assistant semantic markers', () => {
  const turn = node({ 'data-sender': 'muse' });
  const content = node({}, 'message-content', turn);
  assert.equal(museAnswer.isAssistantOwned(content), true);
  assert.equal(museAnswer.isUserOwned(content), false);
  assert.equal(museAnswer.hasAssistantMarker(node({ 'data-message-role': 'assistant' })), true);
  assert.equal(museAnswer.hasAssistantMarker(node({}, 'muse-message')), true);
});

test('Muse user-owned content can never be emitted as assistant output', () => {
  const turn = node({ 'data-message-role': 'user' });
  const content = node({}, 'message-content', turn);
  assert.equal(museAnswer.isUserOwned(content), true);
  assert.equal(museAnswer.isAssistantOwned(content), false);
  assert.equal(museAnswer.assistantText(content), '');
});

test('Muse nested-node pruning keeps the outer response block', () => {
  const inner = {};
  const outer = { contains(candidate) { return candidate === inner; } };
  inner.contains = () => false;
  assert.deepEqual(museAnswer.pruneNestedNodes([outer, inner]), [outer]);
});


test('Muse committed-user extraction only reports user turns added after the baseline', () => {
  const makeTurn = (text) => ({
    nodeType: 1,
    tagName: 'DIV',
    className: '',
    textContent: text,
    childNodes: [{ nodeType: 3, nodeValue: text }],
    parentElement: null,
    getAttribute(name) { return name === 'data-message-role' ? 'user' : null; },
    matches() { return false; }
  });
  const first = makeTurn('old prompt');
  const second = makeTurn('QUALIFY_run-1');
  assert.equal(museAnswer.getTurnUserText([first], 1), '');
  assert.equal(museAnswer.getTurnUserText([first, second], 1), 'QUALIFY_run-1');
});
