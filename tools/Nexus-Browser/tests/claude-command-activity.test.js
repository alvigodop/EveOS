const test = require('node:test');
const assert = require('node:assert/strict');
const commandActivity = require('../extension/content/claude-activity-command.js');

function textNode(text) {
  return {
    innerText: text,
    textContent: text,
    contains() { return false; },
    querySelectorAll() { return []; }
  };
}

function commandFixture() {
  const language = textNode('bash');
  const outputLabel = textNode('Output');
  const commandCode = {
    innerText: 'for repo in EveOS Council-Hud; do\n  echo "$repo"\ndone',
    textContent: 'for repo in EveOS Council-Hud; do\n  echo "$repo"\ndone',
    contains() { return false; },
    getBoundingClientRect() { return { width: 300, height: 60 }; }
  };
  const outputCode = {
    innerText: '=== EveOS/main ===\n200',
    textContent: '=== EveOS/main ===\n200',
    contains() { return false; },
    getBoundingClientRect() { return { width: 300, height: 40 }; }
  };
  const commandSection = {
    children: [language, commandCode],
    parentElement: null,
    querySelectorAll(selector) { return selector === 'span, p' ? [language] : []; }
  };
  const outputSection = {
    children: [outputLabel, outputCode],
    parentElement: null,
    querySelectorAll(selector) { return selector === 'span, p' ? [outputLabel] : []; }
  };
  commandCode.parentElement = commandSection;
  outputCode.parentElement = outputSection;

  const widget = {
    innerText: [
      'Ran a command',
      'bash',
      'for repo in EveOS Council-Hud; do',
      '  echo "$repo"',
      'done',
      'Output',
      '=== EveOS/main ===',
      '200'
    ].join('\n'),
    textContent: '',
    querySelectorAll(selector) {
      if (selector === 'code') return [commandCode, outputCode];
      if (selector === 'pre') return [];
      return [];
    }
  };
  commandSection.parentElement = widget;
  outputSection.parentElement = widget;
  return { widget, commandCode, outputCode };
}

function groupedCommandFixture() {
  const makeCard = (command, output) => {
    const summary = {
      innerText: 'Ran a command',
      textContent: 'Ran a command',
      parentElement: null,
      contains() { return false; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 120, height: 24 }; }
    };
    const card = {
      innerText: ['Ran a command', 'bash', command, 'Output', output].join('\n'),
      textContent: '',
      parentElement: null,
      contains(node) { return node === summary; },
      querySelectorAll(selector) {
        if (selector.includes('button')) return [summary];
        return [];
      },
      getBoundingClientRect() { return { width: 500, height: 220 }; }
    };
    summary.parentElement = card;
    return { summary, card };
  };

  const first = makeCard('echo first', 'first');
  const second = makeCard('echo second', 'second');
  const third = makeCard('echo third', 'third');
  const allSummaries = [first.summary, second.summary, third.summary];
  const group = {
    innerText: [
      'Ran 3 commands',
      first.card.innerText,
      second.card.innerText,
      third.card.innerText
    ].join('\n'),
    textContent: '',
    parentElement: null,
    contains(node) {
      return allSummaries.includes(node) || [first.card, second.card, third.card].includes(node);
    },
    querySelectorAll(selector) {
      if (selector.includes('button')) return allSummaries;
      return [];
    }
  };
  for (const entry of [first, second, third]) entry.card.parentElement = group;

  const root = {
    contains() { return true; },
    querySelectorAll(selector) {
      if (selector.includes('button')) return allSummaries;
      return [];
    }
  };
  group.parentElement = root;
  return { root, group, entries: [first, second, third] };
}

test('Claude command activity extracts language, multiline command, and output as structured blocks', () => {
  const { widget } = commandFixture();
  assert.deepEqual(commandActivity.commandBlocks(widget), [{
    language: 'bash',
    command: 'for repo in EveOS Council-Hud; do\n  echo "$repo"\ndone',
    output: '=== EveOS/main ===\n200'
  }]);
});

test('Claude command activity falls back to visible bash/Output text when code nodes are absent', () => {
  const widget = {
    innerText: [
      'Ran a command',
      'bash',
      'for repo in Matrix-Rain-Project Side-Builds; do',
      '  echo "$repo"',
      'done',
      'Output',
      '=== Matrix-Rain-Project/main ===',
      '404',
      '=== Side-Builds/main ===',
      '404'
    ].join('\n'),
    textContent: '',
    querySelectorAll() { return []; }
  };

  assert.deepEqual(commandActivity.commandBlocks(widget), [{
    language: 'bash',
    command: 'for repo in Matrix-Rain-Project Side-Builds; do\n  echo "$repo"\ndone',
    output: '=== Matrix-Rain-Project/main ===\n404\n=== Side-Builds/main ===\n404'
  }]);
});

test('Claude command activity removes flattened command/output lines from narration', () => {
  const { widget } = commandFixture();
  const commands = commandActivity.commandBlocks(widget);
  const lines = [
    'Weighing whether another search attempt is worthwhile.',
    'bash',
    'for repo in EveOS Council-Hud; do',
    'echo "$repo"',
    'done',
    'Output',
    '=== EveOS/main ===',
    '200'
  ];
  assert.deepEqual(commandActivity.stripCommandLines(lines, commands), [
    'Weighing whether another search attempt is worthwhile.'
  ]);
});

test('Claude command activity chooses the nearest command surface and formats code fences', () => {
  const { widget } = commandFixture();
  const root = { parentElement: null };
  widget.parentElement = root;
  const summary = {
    innerText: 'Ran a command',
    textContent: 'Ran a command',
    parentElement: widget,
    querySelectorAll() { return []; }
  };
  assert.equal(commandActivity.commandSurfaceForSummary(summary, root), widget);

  const formatted = commandActivity.formatCommandBlocks(commandActivity.commandBlocks(widget));
  assert.match(formatted, /```bash\nfor repo in EveOS Council-Hud/);
  assert.match(formatted, /Output\n```text\n=== EveOS\/main ===\n200/);
});

test('Claude aggregate Ran N commands summary is always header-only', () => {
  const statusRow = {
    innerText: [
      'Ran 3 commands',
      'Ran a command',
      'bash',
      'echo first',
      'Output',
      'first',
      'Final Claude answer must not be swallowed.'
    ].join('\n'),
    textContent: '',
    parentElement: null,
    querySelectorAll() { return []; }
  };
  const root = { parentElement: null };
  statusRow.parentElement = root;
  const summary = {
    innerText: 'Ran 3 commands',
    textContent: 'Ran 3 commands',
    parentElement: statusRow,
    querySelectorAll() { return []; },
    closest(selector) { return selector === '.row-start-1' ? statusRow : null; }
  };

  assert.equal(commandActivity.isAggregateCommandSummary('Ran 3 commands'), true);
  assert.equal(commandActivity.commandSurfaceForSummary(summary, root), summary);
});

test('Claude grouped commands enumerate each nested Ran a command card separately', () => {
  const { root } = groupedCommandFixture();
  const cards = commandActivity.commandCardEntries(root);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((entry) => entry.blocks[0]), [
    { language: 'bash', command: 'echo first', output: 'first' },
    { language: 'bash', command: 'echo second', output: 'second' },
    { language: 'bash', command: 'echo third', output: 'third' }
  ]);
});
