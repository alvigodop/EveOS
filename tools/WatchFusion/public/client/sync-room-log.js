/* In-memory, redacted room-timing trace. No microphone, URLs, tokens or automatic uploads. */
(() => {
  const panel = document.getElementById('syncRoomLog');
  const area = document.getElementById('syncRoomLogText');
  if (!panel || !area) return;
  const copy = document.getElementById('syncRoomLogCopy');
  const clear = document.getElementById('syncRoomLogClear');
  const count = document.getElementById('syncRoomLogCount');
  const MAX_ENTRIES = 90, MAX_AGE = 180000;
  let entries = [], events = [], roomScope = '', lastPeers = new Map(), lastKey = '', lastAt = 0, requestAt = -Infinity;
  let lastRendered = '';
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const memberName = id => (state?.members || []).find(m => m.id === id)?.name || 'Viewer';
  const currentScope = () => roomId && session && state?.presentationEpoch != null
    ? [roomId, session.memberId, state.presentationEpoch].join(':') : '';
  function strip(peer, now) {
    const phase = finite(peer.positionMs - peer.roomPositionMs);
    const last = lastPeers.get(peer.member);
    const corrections = finite(peer.corrections);
    const recoveries = peer.seekHealth?.recoveryAttempts ?? 0;
    const signals = [];
    if (!peer.ready || (phase !== null && Math.abs(phase) > 10000)) signals.push('UNTRUSTED_PLAYER_OFFSET');
    if (now - peer.sampledAt > 2700) signals.push('STALE_PLAYER_REPORT');
    if (peer.buffering) signals.push('BUFFERING');
    const expectedRate = Number(state?.playback?.rate);
    if (peer.playing && expectedRate > 0 && Number(peer.rate) > 0 &&
        Math.abs(peer.rate - expectedRate) > .06) signals.push('PLAYBACK_RATE_MISMATCH');
    const attached = window.watchFusionLinkedTab?.metadata?.();
    if (peer.playing && peer.audible && peer.member === state?.hostId &&
        state?.linkedSourceActive && attached?.tabMuted === false && attached?.paused === false)
      signals.push('POSSIBLE_DOUBLE_LAPTOP_AUDIO');
    const recovery = recoveries > (last?.recoveries ?? 0);
    if (recovery) {
      const kind = peer.seekHealth.lastRecoveryBiasMs > 0 ? 'KEYFRAME_RECOVERY_' : 'RECOVERY_ATTEMPT_';
      signals.push(kind + recoveries);
    }
    if (!recovery && peer.seekHealth?.failures >= 2 && phase !== null && Math.abs(phase) >= 1500)
      signals.push('RECOVERY_BUDGET_EXHAUSTED');
    if (last && last.corrections !== null && corrections !== null && corrections > last.corrections)
      signals.push('SEEK_COUNT_INCREASED_' + (corrections - last.corrections));
    if (last && last.phase !== null && phase !== null && Math.abs(phase - last.phase) > 900)
      signals.push('PLAYER_PHASE_JUMP');
    lastPeers.set(peer.member, {phase, corrections, recoveries});
    return {device:memberName(peer.member), playing:peer.playing, buffering:peer.buffering,
      reportAgeMs:finite(now - peer.sampledAt), playerOffsetMs:phase,
      rttMs:finite(peer.rttMs), sourceAgeMs:finite(peer.sourceAgeMs),
      corrections, action:peer.recentCorrection || null,
      filteredDriftMs:finite(peer.filteredDriftMs),
      seekHealth:peer.seekHealth || null,
      signals};
  }
  function render() {
    if (!panel.open) return;
    refreshScope();
    prune();
    const recent = entries.slice(-15).map(item => {
      const peers = item.peers.map(p => `${p.device}: ${p.playerOffsetMs === null ? '?' : p.playerOffsetMs + 'ms'} · ${p.corrections ?? '-'} seeks${p.signals.length ? ' [' + p.signals.join(',') + ']' : ''}`).join(' / ');
      return `${item.at.slice(11,19)} ${item.ref || 'room-clock'} | ${peers}`;
    }).join('\n');
    const transitions = events.slice(-10).map(e => `${e.at.slice(11,19)} ! ${e.kind}${e.reason?' · '+e.reason:''}`).join('\n');
    const display = [recent,transitions].filter(Boolean).join('\n');
    if (display !== lastRendered) {area.value = display || 'Gathering room timing…'; lastRendered = display;}
    if (count) count.textContent = entries.length + ' snapshots · ' + events.length + ' transitions';
  }
  function emit(now, peers, coordination) {
    const rows = peers.map(p => strip(p, now)).sort((a,b) => a.device.localeCompare(b.device));
    const ref = coordination?.reference || window.watchFusionPlayout?.status?.()?.reference || 'room-clock';
    const phaseMs = finite(coordination?.phaseMs);
    const row = {at:new Date().toISOString(), ref, referencePhaseMs:phaseMs,
      uncertaintyMs:finite(coordination?.uncertaintyMs), sourceBuffering:!!coordination?.authorityBuffering,
      peers:rows};
    const key = JSON.stringify([ref,phaseMs,rows.map(p => [p.device,p.playerOffsetMs,p.corrections,p.action,p.buffering,p.seekHealth?.recoveryAttempts,p.signals])]);
    const changed = key !== lastKey && rows.some(p=>p.signals.length) || ref !== (entries.at(-1)?.ref);
    if (!changed && now - lastAt < 4500) return;
    lastKey = key; lastAt = now;
    entries.push(row); prune();
    render();
  }
  function refreshScope() {
    const scope = currentScope();
    if (scope === roomScope) return;
    roomScope = scope;
    entries = []; events = [];
    lastPeers.clear();
    lastKey = lastRendered = '';
    lastAt = 0;
    requestAt = -Infinity;
    area.value = '';
  }
  function prune() {
    entries = entries.filter(row => Date.now() - Date.parse(row.at) < MAX_AGE).slice(-MAX_ENTRIES);
    events = events.filter(row => Date.now()-Date.parse(row.at) < MAX_AGE).slice(-MAX_ENTRIES);
  }
  function note(kind, detail={}) {
    refreshScope();
    if(!roomScope || !/^(?:source-(?:play|pause|volume)|embedded-control|mirror-request|room-transition)$/.test(kind)) return;
    const fields={};
    for(const key of ['action','reason','playing','paused','positionMs','sampleAgeMs','volumePct','rate','segment']) {
      const v=detail[key];
      if(typeof v==='boolean' || typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e9 ||
          typeof v==='string' && /^[a-z-]{1,35}$/.test(v)) fields[key]=v;
    }
    events.push({at:new Date().toISOString(),kind,...fields});prune();render();
  }
  function wantsSample() {
    refreshScope();
    const now = performance.now();
    return !!roomScope && now - requestAt >= 2300;
  }
  function observe(peers, coordination) {
    refreshScope();
    if (!roomScope) return;
    requestAt = performance.now();
    if (peers.length) emit(estimatedServerNow(), peers, coordination);
    else render();
  }
  function exported() {
    refreshScope();
    prune();
    return JSON.stringify({format:'WatchFusion room sync trace v2', generatedAt:new Date().toISOString(),
      disclosure:'Player timing only; microphone/speaker output not measured',
      snapshots:entries,events},null,2);
  }
  async function copyLog() {
    const content = exported();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else {
        area.value=content;area.focus();area.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
      }
      copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy log',1500);
    } catch {area.value=content;area.focus();area.select();copy.textContent='Select to copy';}
  }
  copy?.addEventListener('click', () => void copyLog());
  clear?.addEventListener('click', () => {entries=[];events=[];lastPeers.clear();lastKey='';lastRendered='';render();});
  panel.addEventListener('toggle', render);
  window.watchFusionRoomSyncLog = {export:exported, wantsSample, observe, note};
})();
