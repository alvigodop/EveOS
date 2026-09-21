const test = require('node:test');
const assert = require('node:assert/strict');
const { TARGET_PREFIX, sendPrompt } = require('../local-targets/antigravity-existing');

test('final ready snapshot replaces stale partial stitching when the injected prompt is still visible', async () => {
  const before = 'Earlier\n>\n? for shortcuts';
  const snapshots = [
    { ok: true, text: before },
    {
      ok: true,
      text: [
        '> format report',
        'lines).',
        '• Focused Suite: 12 / 12 pass',
        '• Full Test Suite: 302 / 302'
      ].join('\n')
    },
    {
      ok: true,
      text: [
        '> format report',
        '▸ Thought for 7s',
        '  preparing final response...',
        '### Verification Report: Compact ChatGPT List Formatting',
        '',
        'The patch has been pulled, verified, and qualified clean.',
        '',
        '#### Results',
        '',
        '• HEAD: 6f4c8414e061bbe8098440b566c3f8f241f822bb',
        '• Focused Suite: 12 / 12 pass',
        '• Full Test Suite: 302 / 302 pass',
        '• VERIFY Gate: exit 0 clean',
        '',
        '#### Next Action',
        '',
        '1. Reload extension.',
        '2. Refresh Eve.',
        '3. Refresh Dex UI.',
        '>',
        '────────────────────────────────────────────────────',
        '● [17:56:59] node server.js running',
        '? for shortcuts              Gemini 3.8 Flash · high'
      ].join('\n')
    }
  ];
  const events = [];
  let clock = 0;
  const code = await sendPrompt({
    requestId: 'format-final',
    text: 'format report',
    target: {
      id: `${TARGET_PREFIX}4242`,
      pid: 4242,
      providerId: 'local-antigravity-existing',
      providerName: 'Antigravity CLI'
    },
    emit: (event) => events.push(event),
    snapshotImpl: () => snapshots.shift() || snapshots.at(-1),
    sendImpl: () => ({ ok: true }),
    sleepImpl: async () => {},
    nowImpl: () => ++clock,
    timeoutMs: 30,
    pollMs: 0,
    stableMs: 0
  });

  assert.equal(code, 0);
  const final = events.find((event) => event.type === 'response_final');
  assert.ok(final);
  assert.equal(final.text, [
    '### Verification Report: Compact ChatGPT List Formatting',
    '',
    'The patch has been pulled, verified, and qualified clean.',
    '',
    '#### Results',
    '',
    '• HEAD: 6f4c8414e061bbe8098440b566c3f8f241f822bb',
    '• Focused Suite: 12 / 12 pass',
    '• Full Test Suite: 302 / 302 pass',
    '• VERIFY Gate: exit 0 clean',
    '',
    '#### Next Action',
    '',
    '1. Reload extension.',
    '2. Refresh Eve.',
    '3. Refresh Dex UI.'
  ].join('\n'));
  assert.equal(final.text.includes('lines).'), false);
  assert.equal(final.text.includes('Thought for 7s'), false);
  assert.equal(final.text.includes('node server.js running'), false);
});

test('structured ready recovery supersedes stale partials when the prompt scrolled off', async () => {
  const before = 'Earlier\n>\n? for shortcuts';
  const snapshots = [
    { ok: true, text: before },
    {
      ok: true,
      text: [
        '• No Artifacts: Zero orphan bullet lines.',
        '• Authoritative HEAD: 9620009911b18795840e725f638b6880f24962a7',
        '• Verification Gat'
      ].join('\n')
    },
    {
      ok: true,
      text: [
        '▸ Thought for 4s',
        '  auditing round three...',
        '● Bash(powershell -NoProfile -Command "Get-Process...")',
        '### Live Formatting Verification Confirmed (Round 3)',
        '',
        'Round three arrived 100% clean and compact in the Dex room relay:',
        '',
        '- Single-Line Bullets: Every item and its text are rendered on the exact same line.',
        '- No Artifacts: Zero orphan bullet lines, zero phantom line breaks, and no extra vertical gaps.',
        '- Authoritative HEAD: 9620009911b18795840e725f638b6880f24962a7 captured cleanly inline.',
        '- Verification Gate: 304 / 304 pass on full test suite & VERIFY.bat exited 0.',
        '- Process Continuity: Existing Session PID 86660 running continuously since 7:12:28 AM.',
        '',
        'The wrapped list formatting fix is fully qualified and proven live end-to-end.',
        '>',
        '────────────────────────────────────────────────────',
        '● [18:16:50] node server.js running',
        '? for shortcuts              Gemini 3.8 Flash · high'
      ].join('\n')
    }
  ];
  const events = [];
  let clock = 0;
  const code = await sendPrompt({
    requestId: 'round-three-final',
    text: 'Safe Paste instruction for round three payload',
    target: {
      id: `${TARGET_PREFIX}4242`,
      pid: 4242,
      providerId: 'local-antigravity-existing',
      providerName: 'Antigravity CLI'
    },
    emit: (event) => events.push(event),
    snapshotImpl: () => snapshots.shift() || snapshots.at(-1),
    sendImpl: () => ({ ok: true }),
    sleepImpl: async () => {},
    nowImpl: () => ++clock,
    timeoutMs: 30,
    pollMs: 0,
    stableMs: 0
  });

  assert.equal(code, 0);
  const final = events.find((event) => event.type === 'response_final');
  assert.ok(final);
  assert.equal(final.text, [
    '### Live Formatting Verification Confirmed (Round 3)',
    '',
    'Round three arrived 100% clean and compact in the Dex room relay:',
    '',
    '- Single-Line Bullets: Every item and its text are rendered on the exact same line.',
    '- No Artifacts: Zero orphan bullet lines, zero phantom line breaks, and no extra vertical gaps.',
    '- Authoritative HEAD: 9620009911b18795840e725f638b6880f24962a7 captured cleanly inline.',
    '- Verification Gate: 304 / 304 pass on full test suite & VERIFY.bat exited 0.',
    '- Process Continuity: Existing Session PID 86660 running continuously since 7:12:28 AM.',
    '',
    'The wrapped list formatting fix is fully qualified and proven live end-to-end.'
  ].join('\n'));
  assert.equal(final.text.includes('• Verification Gat'), false);
  assert.equal(final.text.startsWith('• No Artifacts'), false);
  assert.equal(final.text.includes('Thought for 4s'), false);
  assert.equal(final.text.includes('Bash(powershell'), false);
  assert.equal(final.text.includes('node server.js running'), false);
  assert.equal(final.text.includes('? for shortcuts'), false);
});


test('final selection preserves complete earlier reply sections before a later tool widget', async () => {
  const before = 'Earlier\n>\n? for shortcuts';
  const early = [
    'Eve — live probe of https://muse.ai/* completed immediately.',
    '',
    '### Live Probe Fact',
    '',
    '• Target: Tab 116807188 (https://muse.ai/)',
    '• Code: HOST_ACCESS_REQUIRED',
    '',
    '### Diagnosis',
    '',
    'Chrome is still withholding extension site access for muse.ai.'
  ];
  const snapshots = [
    { ok: true, text: before },
    { ok: true, text: early.join('\n') },
    {
      ok: true,
      text: [
        ...early,
        '● Bash(node -e "const { WebSocket } = require(...)")',
        '  probe completed...',
        '### Next Action for Drift',
        '',
        '1. Permit muse.ai in Chrome extension Site access.',
        '>',
        '────────────────────────────────────────────────────',
        '● [00:47:50] node server.js running',
        '? for shortcuts              Gemini 3.8 Flash · medium'
      ].join('\n')
    }
  ];
  const events = [];
  let clock = 0;
  const code = await sendPrompt({
    requestId: 'preserve-pre-tool-sections',
    text: 'probe Muse and report',
    target: {
      id: `${TARGET_PREFIX}4242`,
      pid: 4242,
      providerId: 'local-antigravity-existing',
      providerName: 'Antigravity CLI'
    },
    emit: (event) => events.push(event),
    snapshotImpl: () => snapshots.shift() || snapshots.at(-1),
    sendImpl: () => ({ ok: true }),
    sleepImpl: async () => {},
    nowImpl: () => ++clock,
    timeoutMs: 30,
    pollMs: 0,
    stableMs: 0
  });

  assert.equal(code, 0);
  const final = events.find((event) => event.type === 'response_final');
  assert.ok(final);
  assert.equal(final.text, [
    ...early,
    '',
    '### Next Action for Drift',
    '',
    '1. Permit muse.ai in Chrome extension Site access.'
  ].join('\n'));
  assert.match(final.text, /### Live Probe Fact/);
  assert.match(final.text, /### Diagnosis/);
  assert.match(final.text, /### Next Action for Drift/);
  assert.equal(final.text.includes('Bash(node -e'), false);
  assert.equal(final.text.includes('probe completed...'), false);
});
