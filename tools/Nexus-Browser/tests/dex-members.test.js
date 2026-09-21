const test = require('node:test');
const assert = require('node:assert/strict');
const members = require('../public/dex-members.js');

function online(id, url, providerId = 'chatgpt', providerName = 'ChatGPT') {
  return {
    id,
    providerId,
    providerName,
    title: `Chat ${id}`,
    url
  };
}

test('new participant IDs are stable for the same binding', () => {
  const binding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/one'));
  assert.equal(members.stableMemberId(binding), members.stableMemberId({ ...binding }));
});

test('online fingerprints prefer provider plus conversation URL over transient tab id', () => {
  const first = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/one'));
  const reopened = members.bindingFromSource('online-origin', online(99, 'https://chatgpt.com/c/one'));
  assert.equal(members.memberFingerprint(first), members.memberFingerprint(reopened));
});

test('rebind preserves the logical participant id while replacing target metadata', () => {
  const oldBinding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/old'));
  const oldMember = { id: members.stableMemberId(oldBinding), name: 'Eve', binding: oldBinding };
  const newBinding = members.bindingFromSource('online-origin', online(22, 'https://chatgpt.com/c/new'));
  const rebound = members.rebindMember(oldMember, 'Eve', newBinding);

  assert.equal(rebound.id, oldMember.id);
  assert.equal(rebound.name, 'Eve');
  assert.equal(rebound.binding.url, 'https://chatgpt.com/c/new');
  assert.notEqual(rebound.binding.url, oldMember.binding.url);
});

test('duplicate-target guard ignores the participant currently being edited', () => {
  const firstBinding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/one'));
  const secondBinding = members.bindingFromSource('online-origin', online(20, 'https://chatgpt.com/c/two'));
  const roomMembers = [
    { id: 'eve', name: 'Eve', binding: firstBinding },
    { id: 'reviewer', name: 'Reviewer', binding: secondBinding }
  ];

  assert.equal(members.hasBindingConflict(roomMembers, firstBinding, 'eve'), false);
  assert.equal(members.hasBindingConflict(roomMembers, secondBinding, 'eve'), true);
});

test('stored online binding resolves a reopened tab by exact provider and URL', () => {
  const binding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/one'));
  const tabs = [online(77, 'https://chatgpt.com/c/one')];
  assert.equal(members.availableTargetId(binding, tabs, []), '77');
});

test('controller can allocate participant identity independently from its target binding', () => {
  const binding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/old'));
  const rebound = members.rebindMember({ id: 'agent-logical', name: 'Eve', binding }, 'Eve',
    members.bindingFromSource('online-origin', online(11, 'https://chatgpt.com/c/new')));

  assert.equal(rebound.id, 'agent-logical');
  assert.notEqual(members.memberFingerprint(rebound.binding), members.memberFingerprint(binding));
});

test('local participant bindings can be replaced while keeping the room identity', () => {
  const oldBinding = members.bindingFromSource('local-origin', {
    id: 'local:old',
    targetTypeId: 'antigravity-existing',
    providerId: 'antigravity',
    providerName: 'Antigravity CLI',
    title: 'PID 100'
  });
  const newBinding = members.bindingFromSource('local-origin', {
    id: 'local:new',
    targetTypeId: 'antigravity-existing',
    providerId: 'antigravity',
    providerName: 'Antigravity CLI',
    title: 'PID 200'
  });
  const member = members.rebindMember({ id: 'astro', name: 'Astro', binding: oldBinding }, 'Astro', newBinding);

  assert.equal(member.id, 'astro');
  assert.equal(member.binding.targetId, 'local:new');
});

test('rebind preserves or explicitly changes relay participation without changing logical identity', () => {
  const binding = members.bindingFromSource('online-origin', online(10, 'https://chatgpt.com/c/one'));
  const member = { id: 'agent-eve', name: 'Eve', binding, relayEnabled: false };
  const preserved = members.rebindMember(member, 'Eve', binding);
  const enabled = members.rebindMember(member, 'Eve', binding, true);
  assert.equal(preserved.id, 'agent-eve');
  assert.equal(preserved.relayEnabled, false);
  assert.equal(enabled.relayEnabled, true);
});
