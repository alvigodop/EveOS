const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockNode } = require('./helpers/mock-dom.js');
const grokAnswer = require('../extension/content/grok-answer.js');

test('Grok structural text preserves paragraph and block boundaries', () => {
  const root = createMockNode({
    tag: 'div',
    children: [
      { tag: 'p', children: ['Test received loud and clear! ✅'] },
      { tag: 'p', children: ['What can I do for you?'] }
    ]
  });

  assert.equal(
    grokAnswer.structuralText(root),
    'Test received loud and clear! ✅\n\nWhat can I do for you?'
  );
});

test('Grok structural text keeps explicit line breaks and list items readable', () => {
  const root = createMockNode({
    tag: 'div',
    children: [
      'First line',
      { tag: 'br' },
      'Second line',
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
    grokAnswer.structuralText(root),
    'First line\nSecond line\n• Item one\n• Item two'
  );
});

test('X Grok visual CSS block lines stay split and action controls are omitted', () => {
  const root = createMockNode({
    tag: 'div',
    children: [
      { tag: 'span', attrs: { class: 'visual-line' }, children: ['Hellooo! 👋'] },
      { tag: 'span', attrs: { class: 'visual-line' }, children: ['How’s it going?'] },
      { tag: 'button', attrs: { 'aria-label': 'Copy text' }, children: ['Copy text'] }
    ]
  });

  const previousGetComputedStyle = global.getComputedStyle;
  global.getComputedStyle = (node) => ({
    display: String(node?.className || '').includes('visual-line') ? 'block' : 'inline',
    visibility: 'visible'
  });

  try {
    assert.equal(
      grokAnswer.structuralText(root),
      'Hellooo! 👋\nHow’s it going?'
    );
  } finally {
    if (previousGetComputedStyle) global.getComputedStyle = previousGetComputedStyle;
    else delete global.getComputedStyle;
  }
});

test('X Grok preserves emoji rendered as image alt text', () => {
  const root = createMockNode({
    tag: 'div',
    children: [
      { tag: 'span', children: ['Test received loud and clear! '] },
      { tag: 'img', attrs: { alt: '✅' } },
      { tag: 'br' },
      { tag: 'span', children: ['Hellooo! '] },
      { tag: 'img', attrs: { alt: '👋' } },
      { tag: 'img', attrs: { alt: 'decorative chart' } }
    ]
  });

  assert.equal(
    grokAnswer.structuralText(root),
    'Test received loud and clear! ✅\nHellooo! 👋'
  );
  assert.equal(grokAnswer.renderedEmojiText(root.children[1]), '✅');
  assert.equal(grokAnswer.renderedEmojiText(root.children[4]), '👋');
  assert.equal(grokAnswer.renderedEmojiText(root.children[5]), '');
});
