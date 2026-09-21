(() => {
  const ACTIONS = new Set(['add_agent', 'spawn_agent', 'despawn_agent']);

  function managedBinding(binding, managed = false) {
    return managed ? { ...binding, managedByDex: true, managedAt: new Date().toISOString() } : binding;
  }

  function add({
    action, state, room, selectedMember, command,
    roomBusy, targetForCommand, bindingFromTarget, bindingFingerprint,
    clean, uid, persist, renderAll, log, roomSummary
  }) {
    if (roomBusy(state, room)) {
      return { ok: false, code: 'DEX_CONTROL_ROOM_BUSY', message: `Dex room ${room.name} is busy. Stop the relay before changing participants.` };
    }
    const managed = action === 'spawn_agent';
    const target = managed ? command.spawnedTarget : targetForCommand(state, command);
    if (!target) {
      return {
        ok: false,
        code: managed ? 'DEX_CONTROL_SPAWN_TARGET_MISSING' : 'DEX_CONTROL_TARGET_NOT_FOUND',
        message: managed
          ? 'Managed worker creation did not supply a verified spawned target.'
          : 'That visible Dex target is unavailable. Run action targets and choose an exact targetId.'
      };
    }
    if (managed && String(target.providerId || '') !== String(command.providerId || '')) {
      return { ok: false, code: 'DEX_CONTROL_SPAWN_TARGET_MISMATCH', message: 'Spawned target provider does not match the requested managed worker provider.' };
    }
    const targetClassId = managed ? 'online-origin' : command.targetClassId;
    const binding = managedBinding(bindingFromTarget(targetClassId, target), managed);
    if ((room.members || []).some((entry) => bindingFingerprint(entry.binding) === bindingFingerprint(binding))) {
      return { ok: false, code: 'DEX_CONTROL_DUPLICATE_AGENT', message: 'That exact chat/session is already a participant in this room.' };
    }
    const added = {
      id: typeof uid === 'function' ? uid('agent') : `agent-${Date.now().toString(36)}`,
      name: clean(command.name || target.providerName || target.title || 'Agent', 48),
      binding,
      relayEnabled: command.relayEnabled !== false
    };
    room.members.push(added);
    room.updatedAt = new Date().toISOString();
    persist();
    renderAll();
    log?.(`Provider control added ${added.name} to ${room.name}${managed ? ' as a managed worker' : ''}.`);
    return {
      ok: true,
      action,
      message: managed ? `Spawned managed worker ${added.name} in ${room.name}.` : `Added ${added.name} to ${room.name}.`,
      data: { ...roomSummary(room, selectedMember, true), addedMemberId: added.id, managedByDex: managed }
    };
  }

  function despawn({
    room, selectedMember, command, roomBusy, resolveMember,
    persist, renderAll, log, roomSummary
  }) {
    if (roomBusy({}, room)) {
      return { ok: false, code: 'DEX_CONTROL_ROOM_BUSY', message: `Dex room ${room.name} is busy. Stop the relay before changing participants.` };
    }
    const resolved = resolveMember(room, command.member);
    if (!resolved.member) return { ok: false, code: 'DEX_CONTROL_MEMBER_NOT_FOUND', message: resolved.error };
    const member = resolved.member;
    if (member.binding?.managedByDex !== true || member.binding?.targetClassId !== 'online-origin') {
      return { ok: false, code: 'DEX_CONTROL_NOT_MANAGED', message: 'That participant is not a Dex-managed browser worker.' };
    }
    if ((room.members || []).length <= 1) {
      return { ok: false, code: 'DEX_CONTROL_LAST_AGENT', message: 'Cannot despawn the final participant from a room.' };
    }
    room.members = room.members.filter((entry) => entry.id !== member.id);
    if (room.agentCheckpoints) delete room.agentCheckpoints[member.id];
    room.updatedAt = new Date().toISOString();
    persist();
    renderAll();
    log?.(`Provider control removed managed worker ${member.name} from ${room.name}.`);
    return {
      ok: true,
      action: 'despawn_agent',
      message: `Removed managed worker ${member.name} from ${room.name}; its browser tab is being closed.`,
      data: {
        ...roomSummary(room, selectedMember, true),
        removedMemberId: member.id,
        managedTarget: {
          targetId: member.binding.targetId,
          providerId: member.binding.providerId,
          url: member.binding.url || ''
        }
      }
    };
  }

  function handle(context) {
    if (!ACTIONS.has(context.action)) return null;
    if (context.action === 'despawn_agent') return despawn(context);
    return add(context);
  }

  const api = { ACTIONS, managedBinding, add, despawn, handle };
  globalThis.BrowserAiBridgeDexProviderParticipants = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
