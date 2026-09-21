const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockNode } = require('./helpers/mock-dom.js');
const claudeAnswer = require('../extension/content/claude-answer.js');

test('Claude assistant ownership recognizes current response markers', () => {
  const response = createMockNode({
    tag: 'div',
    attrs: { class: 'font-claude-response' },
    children: ['Hello from Claude']
  });
  assert.equal(claudeAnswer.hasAssistantMarker(response), true);
  assert.equal(claudeAnswer.isAssistantOwned(response), true);
});

test('Claude user-owned content can never be emitted as assistant text', () => {
  const user = createMockNode({
    tag: 'div',
    attrs: { 'data-testid': 'user-message' },
    children: [
      { tag: 'div', attrs: { 'data-testid': 'chat-message-content' }, children: ['User prompt'] }
    ]
  });
  const content = user.children[0];
  assert.equal(claudeAnswer.isUserOwned(content), true);
  assert.equal(claudeAnswer.isAssistantOwned(content), false);
  assert.equal(claudeAnswer.assistantText(content), '');
});

test('Claude structural text preserves paragraphs, lists, and emoji images', () => {
  const response = createMockNode({
    tag: 'div',
    attrs: { class: 'font-claude-response' },
    children: [
      { tag: 'p', children: ['CLAUDE_BRIDGE_OK ', { tag: 'img', attrs: { alt: '✅' } }] },
      { tag: 'p', children: ['Second paragraph'] },
      {
        tag: 'ul',
        children: [
          { tag: 'li', children: ['Item one'] },
          { tag: 'li', children: ['Item two'] }
        ]
      }
    ]
  });

  assert.equal(
    claudeAnswer.assistantText(response),
    'CLAUDE_BRIDGE_OK ✅\n\nSecond paragraph\n\n• Item one\n• Item two'
  );
});

test('Claude chat-message-content is accepted only outside user ownership', () => {
  const response = createMockNode({
    tag: 'div',
    attrs: { 'data-testid': 'chat-message-content' },
    children: ['Assistant response']
  });
  assert.equal(claudeAnswer.isAssistantOwned(response), true);
  assert.equal(claudeAnswer.assistantText(response), 'Assistant response');
});

test('Claude answer extraction prefers markdown blocks and leaves tool widgets out of answer text', () => {
  const root = createMockNode({
    tag: 'div',
    children: [
      {
        tag: 'div',
        attrs: { class: 'font-claude-response' },
        children: [
          { tag: 'div', attrs: { class: 'standard-markdown' }, children: ['Intro sentence.'] },
          {
            tag: 'div',
            attrs: { class: 'tool-widget' },
            children: ['Read 2 pages, searched the web', 'Failed to fetch: https://github.com/driftai/EveOS']
          },
          { tag: 'div', attrs: { class: 'standard-markdown' }, children: ['Final answer text.'] }
        ]
      }
    ]
  });

  const nodes = claudeAnswer.assistantNodes(root);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map((node) => claudeAnswer.assistantText(node)), [
    'Intro sentence.',
    'Final answer text.'
  ]);
  assert.equal(claudeAnswer.getTurnAssistantText(nodes, 0), 'Final answer text.');
});
