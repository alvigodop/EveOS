/* In-memory, redacted room-timing trace. No microphone, URLs, tokens or automatic uploads. */
(() => {
  const panel = document.getElementById('syncRoomLog');
  const area = document.getElementById('syncRoomLogText');
  if (!panel || !area) return;
  const copy = document.getElementById('syncRoomLogCopy');
  const clear = document.getElementById('syncRoomLogClear');
  const count = document.getElementById('syncRoomLogCount');
  const MAX_ENTRIES = 240, MAX_AGE = 600000;
  let entries = [], events = [], roomScope = '', lastPeers = new Map(), lastKey = '', lastAt = 0, requestAt = -Infinity;
  let lastRendered = '', lastSegmentKey = '', segmentSequence = 0;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const memberName = id => (state?.members || []).find(m => m.id === id)?.name || 'Viewer';
  // Keep one trace across consecutive songs within the same room; no room IDs exported.
  const currentScope = () => roomId && session ? [roomId,session.memberId].join(':') : '';
  function recover(peer) {
    const d=peer.hostRecovery;if(!d)return null;
    const reasons=/^[a-z-]{1,42}$/;
    return {outcome:reasons.test(d.outcome)?d.outcome:null,stage:reasons.test(d.stage)?d.stage:null,
      reference:reasons.test(d.reference)?d.reference:null,attempts:finite(d.attempts),witnesses:finite(d.witnesses),peerCount:finite(d.peerCount),
      peerSpreadMs:finite(d.peerSpreadMs),hostErrorMs:finite(d.hostErrorMs),peerErrorMs:finite(d.peerErrorMs),
      gapMs:finite(d.gapMs),dwellMs:finite(d.dwellMs),verifyMs:finite(d.verifyMs)};
  }
  function recordSegment() {
    const key=state?.presentationEpoch!=null&&state?.playoutSegment!=null
      ? String(state.presentationEpoch)+':'+String(state.playoutSegment) : '';
    if(!key||key===lastSegmentKey)return;
    if(lastSegmentKey)events.push({at:new Date().toISOString(),kind:'playback-segment-transition',sequence:segmentSequence+1});
    lastSegmentKey=key;segmentSequence++;prune();
  }
  function strip(peer, now) {
    const rawPhase = finite(peer.positionMs - peer.roomPositionMs);
    const targetError = Number.isFinite(peer.targetPositionMs) ? finite(peer.positionMs - peer.targetPositionMs) : null;
    const phase = targetError ?? rawPhase;
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
      reportAgeMs:finite(now - peer.sampledAt), playerOffsetMs:rawPhase,
      rawOffsetMs:rawPhase, targetErrorMs:targetError, adjustmentMs:finite(peer.adjustmentMs),
      rttMs:finite(peer.rttMs), sourceAgeMs:finite(peer.sourceAgeMs), startupWaitMs:finite(peer.startupWaitMs),
      corrections, action:peer.recentCorrection || null, hostRecovery:recover(peer) || (peer.member===state?.hostId && typeof isHost==='function' && isHost() ? recover({hostRecovery:window.WatchFusionHostPeerRecovery?.diagnostics?.()}) : null),
      filteredDriftMs:finite(peer.filteredDriftMs),
      seekHealth:peer.seekHealth || null,
      signals};
  }
  function render() {
    if (!panel.open) return;
    refreshScope();
    prune();
    const recent = entries.slice(-15).map(item => {
      const peers = item.peers.map(p => `${p.device}: ${p.targetErrorMs === null ? 'room ' + (p.rawOffsetMs ?? '?') : 'target ' + p.targetErrorMs}ms · startup ${p.startupWaitMs ?? '?'}ms · ${p.corrections ?? '-'} seeks${p.signals.length ? ' [' + p.signals.join(',') + ']' : ''}`).join(' / ');
      return `${item.at.slice(11,19)} #${item.segmentSequence||'?'} ${item.ref || 'room-clock'}${item.source ? ' src:' + item.source : ''} | ${peers}`;
    }).join('\n');
    const transitions = events.slice(-10).map(e => `${e.at.slice(11,19)} #${e.segmentSequence||'?'} ! ${e.kind}${e.reason?' · '+e.reason:''}`).join('\n');
    const display = [recent,transitions].filter(Boolean).join('\n');
    if (display !== lastRendered) {area.value = display || 'Gathering room timing…'; lastRendered = display;}
    if (count) count.textContent = entries.length + ' snapshots · ' + events.length + ' transitions';
  }
  function emit(now, peers, coordination) {
    recordSegment();
    const rows = peers.map(p => strip(p, now)).sort((a,b) => a.device.localeCompare(b.device));
    const ref = coordination?.reference || window.watchFusionPlayout?.status?.()?.reference || 'room-clock';
    const phaseMs = finite(coordination?.phaseMs);
    const row = {at:new Date().toISOString(), segmentSequence, ref, referencePhaseMs:phaseMs,
      uncertaintyMs:finite(coordination?.uncertaintyMs), sourceBuffering:!!coordination?.authorityBuffering,
      source:coordination?.source || null, sourcePhaseMs:finite(coordination?.sourcePhaseMs),
      peers:rows};
    const key = JSON.stringify([ref,phaseMs,rows.map(p => [p.device,p.playerOffsetMs,p.corrections,p.action,p.buffering,p.seekHealth?.recoveryAttempts,p.signals])]);
    // Source-trust transitions (live/stale/off-phase/...) are acceptance evidence: record them at once.
    const changed = key !== lastKey && rows.some(p=>p.signals.length) || ref !== (entries.at(-1)?.ref) ||
      row.source !== (entries.at(-1)?.source ?? null) || row.segmentSequence !== entries.at(-1)?.segmentSequence;
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
    lastKey = lastRendered = '';lastSegmentKey='';segmentSequence=0;
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
    if(!roomScope || !/^(?:source-(?:play|pause|volume|track-transition|seek-confirmed|seek-unconfirmed|seek-retry|transport-unconfirmed|transport-retry|command-timeout|volume-unconfirmed)|embedded-control|mirror-(?:request|applied)|room-transition|host-rejoin-(?:gated|triggered|accepted|rejected|settled|incomplete|verifying|retry-armed|budget-exhausted))$/.test(kind)) return;
    recordSegment();
    const fields={};
    for(const key of ['action','reason','playing','paused','positionMs','sampleAgeMs','sourceAgeMs','volumePct','rate','sequence','ackLatencyMs','roundTripMs','reference','hostErrorMs','peerErrorMs','gapMs','peerCount','peerSpreadMs','dwellMs','attempts']) {
      const v=detail[key];
      if(typeof v==='boolean' || typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e9 ||
          typeof v==='string' && /^[a-z-]{1,35}$/.test(v)) fields[key]=v;
    }
    events.push({at:new Date().toISOString(),kind,segmentSequence,...fields});prune();render();
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
    return JSON.stringify({format:'WatchFusion room sync trace v3',generatedAt:new Date().toISOString(),windowMs:MAX_AGE,
      disclosure:'Player timing, local controller gates and redacted transitions only; no audio, URLs, titles, tokens or microphone measurements',
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
