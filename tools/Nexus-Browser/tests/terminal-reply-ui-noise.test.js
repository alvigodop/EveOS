const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTerminalWidgetLine,
  cleanReplyLines,
  extractVisibleReply
} = require('../local-targets/terminal-reply-parser');

test('terminal reply parser filters transient agent UI statuses and server status bars', () => {
  assert.equal(isTerminalWidgetLine('Thinking'), true);
  assert.equal(isTerminalWidgetLine('● Thinking...'), true);
  assert.equal(isTerminalWidgetLine('Worked for 33s'), true);
  assert.equal(isTerminalWidgetLine('● [16:18:01] node server.js running'), true);
  assert.equal(isTerminalWidgetLine('Relay confirmed 100%, Eve!'), false);
});

test('terminal reply parser stops at the returned empty prompt before later pane noise', () => {
  const lines = [
    'Relay confirmed 100%, Eve!',
    '>',
    '────────────────────────────────────────────────────',
    '● [16:18:01] node server.js running',
    '? for shortcuts'
  ];
  assert.deepEqual(cleanReplyLines(lines), ['Relay confirmed 100%, Eve!']);
});

test('standalone greater-than reply content is not mistaken for a returned prompt without footer evidence', () => {
  const lines = [
    'First reply line.',
    '>',
    'Continuation after a literal markdown marker.'
  ];
  assert.deepEqual(cleanReplyLines(lines), lines);
});

test('existing-session capture cannot turn post-response terminal chrome into the agent reply', () => {
  const before = 'Earlier\n>\n? for shortcuts';
  const after = [
    '> hello Eve',
    'Relay confirmed 100%, Eve!',
    '>',
    '────────────────────────────────────────────────────',
    '● [16:18:01] node server.js running',
    '? for shortcuts'
  ].join('\n');
  assert.equal(
    extractVisibleReply(before, after, 'hello Eve'),
    'Relay confirmed 100%, Eve!'
  );
});
