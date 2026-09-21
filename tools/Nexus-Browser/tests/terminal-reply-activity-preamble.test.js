const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanReplyLines,
  mergeVisibleReply
} = require('../local-targets/terminal-reply-parser');

test('terminal reply parser drops tool/thought preamble before the final markdown answer', () => {
  const lines = [
    '● Bash(node --test tests/chatgpt-error-wiring.test...)',
    '  wiring.test...)',
    '● Bash(powershell -NoProfile -Command "Get-Process...)',
    '▸ Thought for 3s',
    '  The request involves several steps, including...',
    '  ### Pre-Flight Qualification Report: Robust',
    '  ChatGPT Submission & Input Verification',
    '',
    '  Target Commit: Browser-AI-Bridge-POC',
    '  Repository Test Suite: 299/299 pass',
    '>',
    '────────────────────────────────────────────────────',
    '● [17:23:29] node server.js running',
    '? for shortcuts'
  ];

  assert.deepEqual(cleanReplyLines(lines), [
    '  ### Pre-Flight Qualification Report: Robust',
    '  ChatGPT Submission & Input Verification',
    '',
    '  Target Commit: Browser-AI-Bridge-POC',
    '  Repository Test Suite: 299/299 pass'
  ]);
});

test('transient activity residue cannot be permanently stitched ahead of a later final report', () => {
  const provisional = [
    "['extens...) r...)  r...)",
    '● Bash(node --test tests/chatgpt-error-wiring.test...)',
    'Target Commit: Browser-AI-Bridge-POC'
  ].join('\n');
  const finalReply = [
    '### Pre-Flight Qualification Report: Robust ChatGPT Submission & Input Verification',
    '',
    'Target Commit: Browser-AI-Bridge-POC',
    'Repository Test Suite: 299/299 pass'
  ].join('\n');

  assert.equal(mergeVisibleReply(provisional, finalReply), finalReply);
});
