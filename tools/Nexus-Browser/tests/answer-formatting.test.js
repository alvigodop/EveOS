const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockNode } = require('./helpers/mock-dom.js');
const deepseek = require('../extension/content/deepseek.js');

test('DeepSeek Answer Formatting Suite', async (t) => {
  await t.test('Citation cleaner identifies standalone citation numbers without removing legitimate numbers', () => {
    const isCitationAnchor = (text) => /^[-\[]?\d+[\]]?$/.test(text.trim());
    assert.equal(isCitationAnchor('-11'), true);
    assert.equal(isCitationAnchor('11'), true);
    assert.equal(isCitationAnchor('[11]'), true);
    assert.equal(isCitationAnchor('-20'), true);
    assert.equal(isCitationAnchor('[1]'), true);
    assert.equal(isCitationAnchor('-11 degrees'), false);
    assert.equal(isCitationAnchor('September 15, 2026'), false);
    assert.equal(isCitationAnchor('3:13 PM'), false);
    assert.equal(isCitationAnchor('Read 4 pages'), false);
    assert.equal(isCitationAnchor('https://example.com'), false);
  });

  await t.test('LI containing P renders bullet and text on the same line without orphan bullets', () => {
    const list = createMockNode({
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', children: ['Eastern Time (ET): 3:58 PM EDT'] }] },
        { tag: 'li', children: [{ tag: 'p', children: ['Central Time (CT): 2:58 PM CDT'] }] }
      ]
    });

    const rendered = deepseek.structuralText(list);
    assert.equal(rendered, '• Eastern Time (ET): 3:58 PM EDT\n• Central Time (CT): 2:58 PM CDT');
    assert.equal(rendered.includes('•\n'), false);
  });

  await t.test('Citation wrapper entirely omitted and no remnant left', () => {
    const para = createMockNode({
      tag: 'p',
      children: [
        'Eastern Time (ET): 3:58 PM EDT',
        {
          tag: 'span',
          attrs: { class: 'citation' },
          children: ['-', { tag: 'a', attrs: { href: '#ref1' }, children: ['11'] }]
        }
      ]
    });

    const rendered = deepseek.assistantText(para);
    assert.equal(rendered, 'Eastern Time (ET): 3:58 PM EDT');
    assert.equal(rendered.includes('11'), false);
    assert.equal(rendered.includes('-'), false);
  });

  await t.test('Icon-only citation wrapper leaves no trailing dash', () => {
    const para = createMockNode({
      tag: 'p',
      children: [
        'Alaska Time (AKT): 11:58 AM AKDT - ',
        {
          tag: 'a',
          attrs: { class: 'source-pill', href: 'https://example.com' },
          children: [{ tag: 'svg', children: [] }]
        }
      ]
    });

    assert.equal(deepseek.assistantText(para), 'Alaska Time (AKT): 11:58 AM AKDT');
  });

  await t.test('Legitimate negative numbers like -11 degrees are preserved exactly', () => {
    const para = createMockNode({
      tag: 'p',
      children: ['The temperature outside in Fairbanks was -11 degrees yesterday.']
    });
    assert.equal(
      deepseek.assistantText(para),
      'The temperature outside in Fairbanks was -11 degrees yesterday.'
    );
  });

  await t.test('Normal unordered and ordered lists format cleanly', () => {
    const unordered = createMockNode({
      tag: 'ul',
      children: [
        { tag: 'li', children: ['Item A'] },
        { tag: 'li', children: ['Item B'] }
      ]
    });
    assert.equal(deepseek.structuralText(unordered), '• Item A\n• Item B');

    const ordered = createMockNode({
      tag: 'ol',
      children: [
        { tag: 'li', children: [{ tag: 'p', children: ['Step 1'] }] },
        { tag: 'li', children: [{ tag: 'p', children: ['Step 2'] }] }
      ]
    });
    assert.equal(deepseek.structuralText(ordered), '1. Step 1\n2. Step 2');

    const citationOnly = createMockNode({
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            {
              tag: 'span',
              attrs: { class: 'citation' },
              children: [{ tag: 'a', attrs: { href: '#' }, children: ['1'] }]
            }
          ]
        }
      ]
    });
    assert.equal(deepseek.assistantText(citationOnly), '');
  });

  await t.test('Full DeepSeek time response keeps human formatting with citations stripped', () => {
    const root = createMockNode({
      tag: 'div',
      attrs: { class: 'ds-markdown' },
      children: [
        { tag: 'p', children: ['Here is the current time across the main U.S. time zones on Tuesday, September 15, 2026:'] },
        {
          tag: 'ul',
          children: [
            { tag: 'li', children: [{ tag: 'p', children: ['Eastern Time (ET): 3:58 PM EDT', { tag: 'span', attrs: { class: 'citation' }, children: ['-', { tag: 'a', attrs: { href: '#cite-11' }, children: ['11'] }] }] }] },
            { tag: 'li', children: [{ tag: 'p', children: ['Central Time (CT): 2:58 PM CDT', { tag: 'span', attrs: { class: 'citation' }, children: ['-', { tag: 'a', attrs: { href: '#cite-21' }, children: ['21'] }] }] }] },
            { tag: 'li', children: [{ tag: 'p', children: ['Mountain Time (MT): 1:58 PM MDT', { tag: 'span', attrs: { class: 'citation' }, children: ['-', { tag: 'a', attrs: { href: '#cite-30' }, children: ['30'] }] }] }] },
            { tag: 'li', children: [{ tag: 'p', children: ['Pacific Time (PT): 12:59 PM PDT', { tag: 'span', attrs: { class: 'citation' }, children: ['-', { tag: 'a', attrs: { href: '#cite-37' }, children: ['37'] }] }] }] },
            { tag: 'li', children: [{ tag: 'p', children: ['Alaska Time (AKT): 11:58 AM AKDT - ', { tag: 'a', attrs: { class: 'source-pill', href: '#cite-ak' }, children: [{ tag: 'svg' }] }] }] },
            { tag: 'li', children: [{ tag: 'p', children: ['Hawaii-Aleutian Time (HAT): 9:58 AM HST - ', { tag: 'a', attrs: { class: 'source-pill', href: '#cite-hi' }, children: [{ tag: 'svg' }] }] }] }
          ]
        },
        { tag: 'p', children: ['All zones except Hawaii are currently observing Daylight Saving Time. If you need the time for a specific city, just let me know.'] }
      ]
    });

    const expected = [
      'Here is the current time across the main U.S. time zones on Tuesday, September 15, 2026:',
      '',
      '• Eastern Time (ET): 3:58 PM EDT',
      '• Central Time (CT): 2:58 PM CDT',
      '• Mountain Time (MT): 1:58 PM MDT',
      '• Pacific Time (PT): 12:59 PM PDT',
      '• Alaska Time (AKT): 11:58 AM AKDT',
      '• Hawaii-Aleutian Time (HAT): 9:58 AM HST',
      '',
      'All zones except Hawaii are currently observing Daylight Saving Time. If you need the time for a specific city, just let me know.'
    ].join('\n');

    assert.equal(deepseek.assistantText(root), expected);
  });
});
