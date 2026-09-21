const test = require('node:test');
const assert = require('node:assert/strict');
const chatgptAnswer = require('../extension/content/chatgpt-answer.js');

function node(attrs = {}, className = '', parentElement = null) {
  return {
    className,
    parentElement,
    getAttribute(name) { return attrs[name] ?? null; }
  };
}

function textNode(value) {
  return { nodeType: 3, nodeValue: String(value) };
}

function element(tagName, childNodes = []) {
  const nodeValue = {
    nodeType: 1,
    tagName,
    childNodes,
    parentElement: null,
    className: '',
    getAttribute() { return null; },
    matches() { return false; }
  };
  for (const child of childNodes) {
    if (child && child.nodeType === 1) child.parentElement = nodeValue;
  }
  Object.defineProperty(nodeValue, 'textContent', {
    get() {
      return childNodes.map((child) => child?.nodeType === 3 ? child.nodeValue : child?.textContent || '').join('');
    }
  });
  return nodeValue;
}

test('ChatGPT assistant ownership uses semantic author-role markers', () => {
  const turn = node({ 'data-message-author-role': 'assistant' });
  const content = node({}, 'markdown', turn);
  assert.equal(chatgptAnswer.isAssistantOwned(content), true);
  assert.equal(chatgptAnswer.isUserOwned(content), false);
});

test('ChatGPT user-owned content can never be emitted as assistant output', () => {
  const turn = node({ 'data-message-author-role': 'user' });
  const content = node({}, 'markdown', turn);
  assert.equal(chatgptAnswer.isUserOwned(content), true);
  assert.equal(chatgptAnswer.isAssistantOwned(content), false);
  assert.equal(chatgptAnswer.assistantText(content), '');
});

test('ChatGPT legacy assistant fallbacks remain recognized', () => {
  assert.equal(chatgptAnswer.hasAssistantMarker(node({ 'data-role': 'assistant' })), true);
  assert.equal(chatgptAnswer.hasAssistantMarker(node({ 'data-message-author': 'assistant' })), true);
  assert.equal(chatgptAnswer.hasAssistantMarker(node({}, 'agent-turn')), true);
});

test('ChatGPT nested-node pruning keeps only the outer response block', () => {
  const inner = {};
  const outer = { contains(candidate) { return candidate === inner; } };
  inner.contains = () => false;
  assert.deepEqual(chatgptAnswer.pruneNestedNodes([outer, inner]), [outer]);
});


test('ChatGPT list paragraphs stay attached to their bullets without phantom blank lines', () => {
  const root = element('UL', [
    element('LI', [element('P', [textNode('first item')])]),
    element('LI', [element('P', [textNode('second item')])])
  ]);
  assert.equal(chatgptAnswer.structuralText(root), '• first item\n• second item');
});

test('ChatGPT list wrapper divs do not push bullet text onto the next line', () => {
  const root = element('UL', [
    element('LI', [
      element('DIV', [
        element('DIV', [
          element('P', [textNode('Eve → Dex → Astro works')])
        ])
      ])
    ]),
    element('LI', [
      element('DIV', [
        element('P', [textNode('Astro → Dex → Eve works')])
      ])
    ])
  ]);
  assert.equal(
    chatgptAnswer.structuralText(root),
    '• Eve → Dex → Astro works\n• Astro → Dex → Eve works'
  );
});


test('prompt-bound response skips an older assistant turn', () => {
  const oldUser = node({ 'data-message-author-role': 'user' }); oldUser.innerText = 'old prompt';
  const oldAssistant = node({ 'data-message-author-role': 'assistant' }); oldAssistant.innerText = 'old answer';
  const newUser = node({ 'data-message-author-role': 'user' }); newUser.innerText = 'fresh proof prompt';
  const newAssistant = node({ 'data-message-author-role': 'assistant' }); newAssistant.innerText = 'fresh proof answer';
  const turns = [oldUser, oldAssistant, newUser, newAssistant];
  const root = { querySelectorAll(selector) {
    if (selector === chatgptAnswer.USER_SELECTOR) return [oldUser, newUser];
    if (selector.includes(chatgptAnswer.USER_SELECTOR) && selector.includes(chatgptAnswer.ASSISTANT_SELECTOR)) return turns;
    return [];
  } };
  assert.equal(chatgptAnswer.responseTextForUserPrompt('fresh proof prompt', 1, root), 'fresh proof answer');
  const laterAssistant = node({ 'data-message-author-role': 'assistant' });
  laterAssistant.innerText = 'fresh proof answer complete.';
  turns.push(laterAssistant);
  assert.equal(chatgptAnswer.responseTextForUserPrompt('fresh proof prompt', 1, root), 'fresh proof answer complete.');
  turns.pop();
  turns.pop();
  assert.equal(chatgptAnswer.responseTextForUserPrompt('fresh proof prompt', 1, root), '');
});
