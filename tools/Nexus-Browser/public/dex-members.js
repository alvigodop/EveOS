(() => {
  function memberFingerprint(binding = {}) {
    return binding.targetClassId === 'online-origin'
      ? `online:${binding.providerId}:${binding.url || binding.targetId}`
      : `local:${binding.providerId}:${binding.targetId}`;
  }

  function stableMemberId(binding) {
    const text = memberFingerprint(binding);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return `agent-${(hash >>> 0).toString(16)}`;
  }

  function bindingFromSource(targetClassId, source = {}) {
    if (targetClassId === 'online-origin') {
      return {
        targetClassId,
        targetId: source.id,
        providerId: source.providerId,
        providerName: source.providerName,
        url: source.url,
        title: source.title
      };
    }
    return {
      targetClassId,
      targetId: source.id,
      targetTypeId: source.targetTypeId,
      providerId: source.providerId,
      providerName: source.providerName,
      title: source.title
    };
  }

  function memberTypeId(binding = {}) {
    return binding.targetClassId === 'local-origin'
      ? binding.targetTypeId || ''
      : binding.providerId || '';
  }

  function availableTargetId(binding = {}, tabs = [], localTargets = []) {
    if (binding.targetClassId === 'local-origin') {
      return String(localTargets.find((target) => target.id === binding.targetId)?.id || '');
    }
    const target = tabs.find((tab) => String(tab.id) === String(binding.targetId) && tab.providerId === binding.providerId)
      || tabs.find((tab) => tab.providerId === binding.providerId && binding.url && tab.url === binding.url);
    return target ? String(target.id) : '';
  }

  function hasBindingConflict(members = [], binding, exceptMemberId = null) {
    const fingerprint = memberFingerprint(binding);
    return members.some((member) => member.id !== exceptMemberId && memberFingerprint(member.binding) === fingerprint);
  }

  function rebindMember(member, name, binding, relayEnabled = member?.relayEnabled !== false) {
    return { ...member, id: member.id, name, binding, relayEnabled };
  }

  function createController({ state, el, protocol, activeRoom, persist, log, renderAll, uid }) {
    let editingMemberId = null;

    function mutationBlocked(room) {
      return !room || !!room.relay?.active || !!room.relay?.waitingFor || !!room.pendingTurn || !!room.recovery;
    }

    function clear() {
      editingMemberId = null;
      el.dexMemberName.value = '';
      el.dexMemberRelayEnabled.checked = true;
    }

    function renderBuilder(preferred = {}) {
      const room = activeRoom();
      if (!room) return;
      const targetClass = preferred.targetClassId || el.dexMemberClass.value || 'online-origin';
      el.dexMemberClass.value = targetClass;
      const previousType = preferred.typeId ?? el.dexMemberType.value;
      const previousTarget = preferred.targetId ?? el.dexMemberTarget.value;
      el.dexMemberType.replaceChildren();
      const typeOptions = targetClass === 'online-origin'
        ? (state.providers.length ? state.providers : [...new Map(state.tabs.map((tab) => [tab.providerId, { id: tab.providerId, name: tab.providerName }])).values()])
        : state.localTypes;
      for (const type of typeOptions) el.dexMemberType.add(new Option(type.name, type.id));
      if ([...el.dexMemberType.options].some((option) => option.value === previousType)) {
        el.dexMemberType.value = previousType;
      }
      el.dexMemberTarget.replaceChildren();
      const selectedType = el.dexMemberType.value;
      const targets = targetClass === 'online-origin'
        ? state.tabs.filter((tab) => tab.providerId === selectedType)
        : state.localTargets.filter((target) => !selectedType || target.targetTypeId === selectedType);
      for (const target of targets) {
        const label = targetClass === 'online-origin'
          ? `${target.title || target.providerName} — ${target.url}`
          : target.title;
        el.dexMemberTarget.add(new Option(label, String(target.id)));
      }
      if ([...el.dexMemberTarget.options].some((option) => option.value === previousTarget)) {
        el.dexMemberTarget.value = previousTarget;
      } else if (editingMemberId) {
        el.dexMemberTarget.add(new Option('Choose replacement chat / agent…', ''), 0);
        el.dexMemberTarget.value = '';
      }
    }

    function beginEdit(room, member) {
      if (mutationBlocked(room)) return log('Stop the relay before editing participants.');
      editingMemberId = member.id;
      const binding = member.binding || {};
      el.dexMemberName.value = member.name;
      el.dexMemberRelayEnabled.checked = member.relayEnabled !== false;
      renderBuilder({
        targetClassId: binding.targetClassId || 'online-origin',
        typeId: memberTypeId(binding),
        targetId: availableTargetId(binding, state.tabs, state.localTargets)
      });
      renderAll();
    }

    function renderMembers(room) {
      el.dexMemberList.replaceChildren();
      for (const member of room?.members || []) {
        const row = document.createElement('div');
        row.className = `dex-member${member.id === editingMemberId ? ' editing' : ''}`;
        const text = document.createElement('div');
        text.innerHTML = `<strong></strong><span></span>`;
        text.querySelector('strong').textContent = member.name;
        const binding = member.binding || {};
        text.querySelector('span').textContent = ` ${binding.targetClassId === 'local-origin' ? 'Local' : 'Online'} · ${binding.providerName || binding.providerId} · ${member.relayEnabled === false ? 'Observer · ' : ''}${binding.title || binding.url || binding.targetId}`;
        const actions = document.createElement('div');
        actions.className = 'dex-member-actions';
        const edit = document.createElement('button');
        edit.className = 'secondary';
        edit.textContent = 'Edit';
        edit.disabled = mutationBlocked(room);
        edit.addEventListener('click', () => beginEdit(room, member));
        const remove = document.createElement('button');
        remove.className = 'secondary';
        remove.textContent = 'Remove';
        remove.disabled = mutationBlocked(room);
        remove.addEventListener('click', () => {
          if (mutationBlocked(room)) return log('Stop the relay before changing participants.');
          room.members = room.members.filter((item) => item.id !== member.id);
          if (room.agentCheckpoints) delete room.agentCheckpoints[member.id];
          if (editingMemberId === member.id) clear();
          persist();
          renderAll();
        });
        actions.append(edit, remove);
        row.append(text, actions);
        el.dexMemberList.append(row);
      }
    }

    function saveParticipant() {
      const room = activeRoom();
      if (mutationBlocked(room)) return;
      const targetClassId = el.dexMemberClass.value;
      const targetId = el.dexMemberTarget.value;
      const source = targetClassId === 'online-origin'
        ? state.tabs.find((tab) => String(tab.id) === targetId)
        : state.localTargets.find((target) => target.id === targetId);
      if (!source) return log('Choose an available target first.');
      const binding = bindingFromSource(targetClassId, source);
      const existing = room.members.find((member) => member.id === editingMemberId) || null;
      if (hasBindingConflict(room.members, binding, existing?.id || null)) {
        return log('That exact chat/agent target is already bound to another participant in this room.');
      }
      const name = protocol.cleanName(
        el.dexMemberName.value,
        existing?.name || source.providerName || 'Agent'
      );
      const relayEnabled = el.dexMemberRelayEnabled.checked;
      if (existing) {
        Object.assign(existing, rebindMember(existing, name, binding, relayEnabled));
        if (room.agentCheckpoints?.[existing.id]) Object.assign(room.agentCheckpoints[existing.id], { memberName: name, providerId: binding.providerId || null });
        log(`${name} participant binding updated without resetting room history.`);
      } else {
        room.members.push({ id: typeof uid === 'function' ? uid('agent') : stableMemberId(binding), name, binding, relayEnabled });
      }
      clear();
      persist();
      renderAll();
    }

    function render(room) {
      if (editingMemberId && !room?.members.some((member) => member.id === editingMemberId)) clear();
      renderMembers(room);
      renderBuilder();
      const blocked = mutationBlocked(room);
      el.dexAddMember.textContent = editingMemberId ? 'Save participant' : 'Add agent';
      el.dexAddMember.disabled = blocked;
      el.dexCancelMemberEdit.hidden = !editingMemberId;
      el.dexCancelMemberEdit.disabled = blocked;
    }

    el.dexMemberClass.addEventListener('change', () => renderBuilder({ targetClassId: el.dexMemberClass.value }));
    el.dexMemberType.addEventListener('change', () => renderBuilder({ typeId: el.dexMemberType.value }));
    el.dexAddMember.addEventListener('click', saveParticipant);
    el.dexCancelMemberEdit.addEventListener('click', () => { clear(); renderAll(); });

    return {
      render,
      renderBuilder,
      clear,
      isEditing: () => !!editingMemberId
    };
  }

  const api = {
    memberFingerprint,
    stableMemberId,
    bindingFromSource,
    memberTypeId,
    availableTargetId,
    hasBindingConflict,
    rebindMember,
    createController
  };
  globalThis.BrowserAiBridgeDexMembers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();