const test = require('node:test');
const assert = require('node:assert/strict');
const claudeActivity = require('../extension/content/claude-activity.js');

test('Claude visible activity recognizes current web-search and memory summaries', () => {
  assert.equal(claudeActivity.summaryLabel('Read 2 pages, searched the web'), 'Read 2 pages, searched the web');
  assert.equal(claudeActivity.summaryLabel('Searched the web, read a page'), 'Searched the web, read a page');
  assert.equal(claudeActivity.summaryLabel('Recalled memory'), 'Recalled memory');
  assert.equal(claudeActivity.summaryLabel('Added to memory'), 'Added to memory');
  assert.equal(claudeActivity.summaryLabel('Ran 2 commands'), 'Ran 2 commands');
  assert.equal(claudeActivity.summaryLabel('Ran a command'), 'Ran a command');
  assert.equal(claudeActivity.summaryLabel('Normal final answer text'), '');
});

test('Claude tool widget preserves expanded visible steps and failures', () => {
  const widget = {
    innerText: [
      'Read 2 pages, searched the web',
      'Exploring several repositories to understand their contents.',
      'Failed to fetch: https://github.com/driftai/EveOS',
      'Failed',
      'Checking whether fetched links can be used for further lookups.',
      'Locating the correct repository page online.'
    ].join('\n'),
    textContent: '',
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 100, height: 100 }; }
  };
  const event = claudeActivity.eventForWidget(widget);
  assert.ok(event);
  assert.equal(event.type, 'thought');
  assert.equal(event.label, 'Read 2 pages, searched the web');
  assert.match(event.text, /Failed to fetch/);
  assert.match(event.text, /Locating the correct repository page online/);
});

test('Claude activity does not treat ordinary answer text as a tool summary', () => {
  const widget = {
    innerText: 'Here is the final answer with no visible tool activity.',
    textContent: '',
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 100, height: 100 }; }
  };
  assert.equal(claudeActivity.eventForWidget(widget), null);
});

test('Claude activity anchors an outer summary to the outer row-start-1 tool panel', () => {
  const header = {
    innerText: 'Searched the web\ngithub.com/driftai/Council-Hud\nSearching for repository readme content.',
    textContent: '',
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { width: 500, height: 300 }; }
  };
  const summary = {
    innerText: 'Searched the web',
    textContent: 'Searched the web',
    parentElement: header,
    closest(selector) { return selector === '.row-start-1' ? header : null; },
    getBoundingClientRect() { return { width: 120, height: 24 }; }
  };
  const root = { contains(node) { return node === header || node === summary; } };
  assert.equal(claudeActivity.widgetRootForSummary(summary, root), header);
});

test('Claude nested search stage can select the richer nearby tool surface', () => {
  const rich = {
    innerText: [
      'Searched the web "Platinum Monorepo Command Center" Council-Hud github',
      'github.com',
      'Download and installation',
      'www.github.com',
      'command center',
      'github.com'
    ].join('\n'),
    textContent: '',
    parentElement: null,
    querySelectorAll(selector) {
      if (selector.includes('group/row')) return [{}, {}];
      if (selector.includes('favicon')) return [{}, {}, {}];
      return [];
    },
    closest(selector) { return selector === '.row-start-2' ? {} : null; },
    matches() { return false; },
    getBoundingClientRect() { return { width: 600, height: 300 }; }
  };
  const summary = {
    innerText: 'Searched the web',
    textContent: 'Searched the web',
    parentElement: rich,
    querySelectorAll() { return []; },
    closest(selector) { return selector === '.row-start-1' ? rich : null; },
    getBoundingClientRect() { return { width: 120, height: 24 }; }
  };
  const root = { contains() { return true; } };
  assert.equal(claudeActivity.widgetRootForSummary(summary, root), rich);
  assert.ok(claudeActivity.toolSurfaceScore(rich) > 0);
});

test('Claude search result parsing works with favicon row title/domain siblings', () => {
  const title = { innerText: 'Download and installation', textContent: 'Download and installation', querySelector() { return null; } };
  const domain = { innerText: 'www.github.com', textContent: 'www.github.com', querySelector() { return null; } };
  const iconBox = { innerText: '', textContent: '', querySelector() { return {}; } };
  const row = {
    children: [iconBox, title, domain],
    querySelector(selector) { return selector.includes('truncate') ? title : null; },
    closest() { return null; }
  };
  const iconParent = { parentElement: row };
  const image = { parentElement: iconParent };
  iconBox.querySelector = () => image;
  const widget = {
    querySelectorAll(selector) {
      if (selector.includes('favicon')) return [image];
      return [];
    }
  };
  const results = claudeActivity.toolResultRows(widget);
  assert.deepEqual(results, [{ title: 'Download and installation', domain: 'www.github.com', href: '' }]);
});

test('Claude search result parsing survives A/B rows with no favicon alt', () => {
  const title = { innerText: 'command center', textContent: 'command center', querySelector() { return null; } };
  const domain = { innerText: 'github.com', textContent: 'github.com', parentElement: null };
  const row = {
    children: [title, domain],
    querySelector(selector) { return selector.includes('truncate') ? title : null; },
    closest() { return null; },
    parentElement: null
  };
  domain.parentElement = row;
  const widget = {
    querySelectorAll(selector) {
      if (selector.includes('favicon')) return [];
      if (selector.includes('text-text-400')) return [domain];
      return [];
    }
  };
  const results = claudeActivity.toolResultRows(widget);
  assert.deepEqual(results, [{ title: 'command center', domain: 'github.com', href: '' }]);
});

test('Claude command activity preserves command and output text', () => {
  const widget = {
    innerText: [
      'Ran 2 commands',
      'Searching for the repository details another way.',
      'Ran a command',
      'bash',
      'curl -s https://api.github.com/users/driftai/repos | head -200',
      'Output',
      '{"message":"API rate limit exceeded"}'
    ].join('\n'),
    textContent: '',
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 500, height: 300 }; }
  };
  const event = claudeActivity.eventForWidget(widget);
  assert.equal(event.label, 'Ran 2 commands');
  assert.match(event.text, /curl -s https:\/\/api\.github\.com/);
  assert.match(event.text, /API rate limit exceeded/);
});

test('Claude statusHeaders keeps only outer top-level activity rows', () => {
  const rowBody = {};
  const outer = {
    closest(selector) { return selector === '.row-start-2' ? null : null; },
    getBoundingClientRect() { return { width: 100, height: 100 }; }
  };
  const nested = {
    closest(selector) { return selector === '.row-start-2' ? rowBody : null; },
    getBoundingClientRect() { return { width: 100, height: 100 }; }
  };
  const root = { querySelectorAll(selector) { return selector === '.row-start-1' ? [outer, nested] : []; } };
  assert.deepEqual(claudeActivity.statusHeaders(root), [outer]);
});
