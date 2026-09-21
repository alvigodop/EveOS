(() => {
  const MAX_NOTE_CHARS = 1600;

  function clean(value, max = MAX_NOTE_CHARS) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  }

  function store(room) {
    if (!room || typeof room !== 'object') return {};
    if (!room.agentCheckpoints || typeof room.agentCheckpoints !== 'object' || Array.isArray(room.agentCheckpoints)) {
      room.agentCheckpoints = {};
    }
    return room.agentCheckpoints;
  }

  function checkpointFor(room, memberId) {
    const value = room?.agentCheckpoints?.[String(memberId || '')];
    if (!value?.note) return null;
    return {
      memberId: String(value.memberId || memberId || ''),
      memberName: clean(value.memberName, 48) || null,
      providerId: clean(value.providerId, 80) || null,
      note: clean(value.note),
      at: Number.isFinite(Date.parse(value.at || '')) ? value.at : null
    };
  }

  function writeCheckpoint(room, member, note, at = new Date().toISOString()) {
    if (!room || !member?.id) return { ok: false, code: 'DEX_CHECKPOINT_BAD_MEMBER', message: 'Checkpoint requires a valid room member.' };
    const text = clean(note);
    if (!text) return { ok: false, code: 'DEX_CHECKPOINT_EMPTY', message: 'Checkpoint note cannot be empty.' };
    const value = {
      memberId: String(member.id),
      memberName: clean(member.name, 48) || 'Agent',
      providerId: clean(member.binding?.providerId, 80) || null,
      note: text,
      at
    };
    store(room)[String(member.id)] = value;
    room.updatedAt = at;
    return { ok: true, checkpoint: { ...value } };
  }

  function clearCheckpoint(room, memberId) {
    const key = String(memberId || '');
    if (!room?.agentCheckpoints || !key || !room.agentCheckpoints[key]) return false;
    delete room.agentCheckpoints[key];
    room.updatedAt = new Date().toISOString();
    return true;
  }

  function roomCheckpoints(room) {
    return (room?.members || []).map((member) => checkpointFor(room, member.id)).filter(Boolean);
  }

  function compact(checkpoint) {
    if (!checkpoint) return null;
    return {
      memberId: checkpoint.memberId,
      memberName: checkpoint.memberName,
      providerId: checkpoint.providerId,
      note: clean(checkpoint.note, 600),
      at: checkpoint.at
    };
  }

  function onboardingGuidance(room, member, provider = null) {
    const features = provider?.agentFeatures || {};
    const native = [];
    if (features.persistentCloudComputer) native.push('Use provider-native persistent files/workspace for detailed private working notes, reusable skills, and project artifacts; keep the Dex checkpoint concise and cross-provider.');
    if (features.backgroundTasks) native.push('Before launching provider-native background work, checkpoint the objective and important invariants; checkpoint the durable result when it finishes.');
    if (features.approvals) native.push('Preserve provider approval boundaries; never treat Dex routing authority as permission to bypass provider-native approvals.');
    if (features.proactiveMessages) native.push('Use proactive messages for meaningful completion/blocker events, not routine polling.');
    return {
      checkpoint: compact(checkpointFor(room, member?.id)),
      providerFeatures: { ...features },
      providerNativeGuidance: native,
      continuityRules: [
        'Before a long autonomous task, save a concise checkpoint when the plan or current state becomes expensive to reconstruct.',
        'Checkpoint only durable facts: goal, completed work, current blocker, exact next action, and important invariants. Do not paste full transcripts.',
        'After a restart or context reset, read the checkpoint and room status before exploring the repo or repeating completed work.',
        'Known transport, quota, target, and recovery failures belong to deterministic tooling. Escalate only novel evidence.',
        'Keep checkpoints provider-neutral so the room can move the role to another provider/session without losing continuity.',
        'After onboarding, report provider-native persistence/background capabilities or constraints that Dex should account for instead of assuming them.'
      ]
    };
  }

  const api = {
    MAX_NOTE_CHARS, clean, store, checkpointFor, writeCheckpoint,
    clearCheckpoint, roomCheckpoints, compact, onboardingGuidance
  };
  globalThis.BrowserAiBridgeDexAgentContinuity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();