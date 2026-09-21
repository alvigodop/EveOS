const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../public/dex-protocol.js');

function room() {
  return {
    id: 'room-context',
    name: 'Context Room',
    settings: { contextMessages: 8 },
    members: [
      { id: 'eve', name: 'Eve', binding: { targetClassId: 'online-origin', providerName: 'ChatGPT' } },
      { id: 'astro', name: 'Astro', binding: { targetClassId: 'local-origin', providerName: 'Antigravity CLI' } }
    ],
    messages: []
  };
}

test('context projection gives newest messages priority when the character budget fills', () => {
  const messages = [
    { senderKind: 'user', senderName: 'Drift', text: `old-${'x'.repeat(1500)}` },
    { senderKind: 'agent', senderName: 'Eve', text: `middle-${'y'.repeat(1500)}` },
    { senderKind: 'user', senderName: 'Drift', text: 'newest-user' },
    { senderKind: 'agent', senderName: 'Astro', text: 'newest-agent' }
  ];
  const projected = protocol.boundedContext(messages, 8, 2200);

  assert.match(projected, /newest-user/);
  assert.match(projected, /newest-agent/);
  assert.doesNotMatch(projected, /old-/);
});

test('quoted Dex transport is collapsed in prior context while keeping useful surrounding text', () => {
  const quoted = [
    'Please inspect this earlier payload.',
    '[DEX ROOM RELAY]',
    'Room: giant-room',
    `Recent room context:\n${'transport-noise '.repeat(450)}`,
    'Final concern: keep the room lightweight.'
  ].join('\n');
  const value = protocol.projectContextText(quoted, 1800);

  assert.match(value, /Please inspect this earlier payload/);
  assert.match(value, /Quoted Dex transport envelope omitted/);
  assert.match(value, /Final concern: keep the room lightweight/);
  assert.doesNotMatch(value, /transport-noise transport-noise transport-noise transport-noise transport-noise/);
});

test('ordinary oversized prior messages keep head and tail with an explicit projection marker', () => {
  const source = `HEAD-${'a'.repeat(2200)}-TAIL`;
  const value = protocol.projectContextText(source, 900);

  assert.equal(value.length <= 900, true);
  assert.match(value, /^HEAD-/);
  assert.match(value, /message shortened by Dex context projection/);
  assert.match(value, /-TAIL$/);
});

test('current source message remains unabridged even when it contains a Dex relay envelope', () => {
  const value = room();
  const sourceText = `Please inspect this exact payload.\n[DEX ROOM RELAY]\n${'z'.repeat(6000)}\nEND-SOURCE`;
  const sourceMessage = { id: 'm-source', senderKind: 'user', senderName: 'Drift', text: sourceText };
  value.messages.push(
    { id: 'm-old', senderKind: 'agent', senderId: 'eve', senderName: 'Eve', text: 'Earlier context.' },
    sourceMessage
  );

  const prompt = protocol.buildRelayPrompt({
    room: value,
    recipient: value.members[1],
    sourceMessage,
    requestId: 'dex-unabridged'
  });
  const current = prompt.split('\nCurrent message:\n')[1];

  assert.equal(current, `${sourceText}\n\n- From User (Drift)`);
  assert.doesNotMatch(current, /Quoted Dex transport envelope omitted/);
  assert.doesNotMatch(current, /message shortened by Dex context projection/);
});

test('relay prompt labels projected history separately from authoritative current message', () => {
  const value = room();
  const sourceMessage = { id: 'm2', senderKind: 'user', senderName: 'Drift', text: 'HELLOOOO' };
  value.messages.push(
    { id: 'm1', senderKind: 'agent', senderId: 'eve', senderName: 'Eve', text: 'Previous short note.' },
    sourceMessage
  );

  const prompt = protocol.buildRelayPrompt({
    room: value,
    recipient: value.members[0],
    sourceMessage,
    requestId: 'dex-context-label'
  });

  assert.match(prompt, /Recent room context \(projected\):/);
  assert.match(prompt, /Current message is the authoritative unabridged source/);
  assert.match(prompt, /Current message:\nHELLOOOO\n\n- From User \(Drift\)$/);
});