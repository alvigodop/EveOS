/* In-memory, redacted room-timing trace. No microphone, URLs, tokens or automatic uploads. */
(() => {
  const panel = document.getElementById('syncRoomLog');
  const area = document.getElementById('syncRoomLogText');
  if (!panel || !area) return;
  const copy = document.getElementById('syncRoomLogCopy');
  const clear = document.getElementById('syncRoomLogClear');
  const count = document.getElementById('syncRoomLogCount');
  const MAX_ENTRIES = 420, MAX_AGE = 600000;
  // v13.10.8g: a correction opens a short, capped burst of denser snapshots (500 ms, 6 s) so a landing and its
  // rebound are visible; local ring only, nothing is uploaded. Normal cadence stays 4.5 s.
  const BURST = /^(?:host-source-(?:rejoin-accepted|landing-incomplete|backoff|settled)|host-rejoin-accepted|rejoin-landing|zero-converge-pulse)$/;
  let burstUntil = -Infinity, lastHealthKey = '', lastHealthCritical = false;
  let entries = [], events = [], roomScope = '', lastPeers = new Map(), lastKey = '', lastAt = 0, requestAt = -Infinity;
  let lastRendered = '', lastSegmentKey = '', segmentSequence = 0;
  let observedSong = 0, lastSongKey = '';
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const memberName = id => (state?.members || []).find(m => m.id === id)?.name || 'Viewer';
  // Explicit opt-in title in copied diagnostics, never a URL, artwork, token, or full metadata blob.
  const title = value => typeof value === 'string' ? value.replace(/(?:https?:\/\/|www\.)\S+/gi,'[link]').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,110)||null : null;
  const timeMs = sec => Number.isFinite(sec) && sec>=0 && sec<43200 ? Math.round(sec*1000) : null;
  function song() {
    const m=window.watchFusionLinkedTab?.metadata?.()||{}, linked=window.watchFusionLinkedTab?.active?.()===true;
    const key=String(m.pageUrl||m.title||(!linked?state?.source?.videoId:'')||'')+'|'+(Number.isInteger(m.index)?m.index:'');
    if (key!=='|' && key!==lastSongKey) {observedSong++;lastSongKey=key;}
    const dur=timeMs(Number(m.duration)),pos=timeMs(Number(m.currentTime));
    const idx=Number.isInteger(m.index)&&m.index>=0?m.index+1:null;
    const total=Array.isArray(m.queue)?m.queue.length:Number(m.queueLength??m.totalTracks);
    return {observedSong:observedSong||null,playlistIndex:idx,playlistTotal:Number.isInteger(total)&&total>0&&total<=10000?total:null,
      title:title(m.title||state?.source?.title),durationMs:dur,elapsedMs:pos,remainingMs:dur!==null&&pos!==null?Math.max(0,dur-pos):null};
  }
  const clock = ms => Number.isFinite(ms)?Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0'):'?';
  // Keep one trace across consecutive songs within the same room; no room IDs exported.
  const currentScope = () => roomId && session ? [roomId,session.memberId].join(':') : '';
  function recover(peer) {
    const d=peer.hostRecovery;if(!d)return null;
    const reasons=/^[a-z-]{1,42}$/;
    return {outcome:reasons.test(d.outcome)?d.outcome:null,stage:reasons.test(d.stage)?d.stage:null,
      reference:reasons.test(d.reference)?d.reference:null,attempts:finite(d.attempts),witnesses:finite(d.witnesses),peerCount:finite(d.peerCount),
      peerSpreadMs:finite(d.peerSpreadMs),hostErrorMs:finite(d.hostErrorMs),peerErrorMs:finite(d.peerErrorMs),
      gapMs:finite(d.gapMs),dwellMs:finite(d.dwellMs),verifyMs:finite(d.verifyMs),linkedSource:linked(d.linkedSource)};
  }
  // v13.10.8e: the source-led host controller (host-source-converge.js) was dropped at every hop before this.
  function linked(d) {
    if(!d||typeof d!=='object')return null;
    const reasons=/^[a-z-]{1,42}$/;
    return {outcome:reasons.test(d.outcome)?d.outcome:null,stage:reasons.test(d.stage)?d.stage:null,attempts:finite(d.attempts),
      witnesses:finite(d.witnesses),errorMs:finite(d.errorMs),verifyMs:finite(d.verifyMs),
      beforeMs:finite(d.beforeMs),residualMs:finite(d.residualMs),progressMs:finite(d.progressMs),contradictedMs:finite(d.contradictedMs)};
  }
  function sensor(d) {
    if(!d||typeof d!=='object')return null;
    return {domain:/^[a-z-]{1,20}$/.test(d.domain)?d.domain:null,heldMs:finite(d.heldMs),cadenceMs:finite(d.cadenceMs),
      clockBoundMs:finite(d.clockBoundMs),clockState:/^[a-z]{1,10}$/.test(d.clockState)?d.clockState:'unknown',audibleOutput:/^[a-z-]{1,12}$/.test(d.audibleOutput)?d.audibleOutput:'unknown'};
  }
  // Explicit whitelist for exported peer diagnostics: no opaque JSON or free text.
  function decoder(v) {
    if(!v||typeof v!=='object'||Array.isArray(v))return null;
    const word=x=>typeof x==='string'&&/^[a-z][a-z-]{0,41}$/.test(x)?x:null;
    const count=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=600000?Math.round(x):null;
    return {outcome:word(v.outcome),steps:count(v.steps),healthyProgressMs:count(v.healthyProgressMs),
      stallMs:count(v.stallMs),stallSteps:count(v.stallSteps),arbiterReason:word(v.arbiterReason),replayLoads:count(v.replayLoads)};
  }
  const localRecovery = () => ({hostRecovery:{...(window.WatchFusionHostPeerRecovery?.diagnostics?.()??{}),
    linkedSource:window.WatchFusionHostSourceConverge?.diagnostics?.()??null}});
  // Player-vs-player only from two or more fresh, playing, trusted rows whose own player is audible. A muted room
  // player still has a valid timeline, but when the laptop's sound comes from the source tab that timeline is not
  // what anyone hears, so it is never a witness here. groupPhase is player-timeline agreement, never speaker sync.
  // The bound is the two widest clock bounds; a stale, thin, coarse or unstable clock leaves it unbounded.
  function outputIdentity(fresh) {
    const outs=fresh.map(p=>p.sensor?.audibleOutput||'unknown');
    return !outs.length?null:outs.includes('both')?'double-audio':outs.includes('source-tab')?'source-tab-audible':
      outs.includes('unknown')?'unknown':outs.every(o=>o==='none')?'none-audible':'room-players';
  }
  function group(rows) {
    const fresh=rows.filter(p=>p.playing&&!p.buffering&&p.targetErrorMs!==null&&p.reportAgeMs!==null&&p.reportAgeMs<=2700&&
      !p.signals.includes('UNTRUSTED_PLAYER_OFFSET'));
    const usable=fresh.filter(p=>['player','both'].includes(p.sensor?.audibleOutput)),outputs=outputIdentity(fresh);
    if(usable.length<2)return {playerCount:usable.length,groupSpreadMs:null,commonModeMs:null,groupUncertaintyMs:null,
      groupPhase:'unmeasured-'+(usable.length?'single-player':'no-player'),outputs};
    const errors=usable.map(p=>p.targetErrorMs).sort((a,b)=>a-b),clocks=usable.map(p=>p.sensor?.clockState==='bounded'?p.sensor.clockBoundMs:NaN);
    const spread=errors.at(-1)-errors[0],middle=errors[Math.floor(errors.length/2)];
    const uncertainty=clocks.every(Number.isFinite)?clocks.sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0):null;
    const phase=uncertainty===null?'unmeasured-clock':
      spread<=Math.max(40,uncertainty)?(Math.abs(middle)>=80?'common-mode-offset':'aligned'):'players-disagree';
    return {playerCount:usable.length,groupSpreadMs:spread,commonModeMs:middle,groupUncertaintyMs:uncertainty,groupPhase:phase,outputs};
  }
  function recordSegment() {
    const key=state?.presentationEpoch!=null&&state?.playoutSegment!=null
      ? String(state.presentationEpoch)+':'+String(state.playoutSegment) : '';
    if(!key||key===lastSegmentKey)return;
    if(lastSegmentKey)events.push({at:new Date().toISOString(),kind:'playback-segment-transition',sequence:segmentSequence+1});
    lastSegmentKey=key;segmentSequence++;prune();
  }
  function strip(peer, now, coordination) {
    const rawPhase = finite(peer.positionMs - peer.roomPositionMs);
    const targetError = Number.isFinite(peer.targetPositionMs) ? finite(peer.positionMs - peer.targetPositionMs) : null;
    const reportAge=finite(now-peer.sampledAt),live=peer.playing&&!peer.buffering&&peer.ready&&reportAge!==null&&reportAge>=0&&reportAge<=1500;
    const phase = live ? targetError ?? rawPhase : null; // paused/stale residuals are not live sync error
    const last = lastPeers.get(peer.member);
    const corrections = finite(peer.corrections);
    const recoveries = peer.seekHealth?.recoveryAttempts ?? 0;
    const decoderSteps = peer.decoderRecovery?.steps ?? null;
    const signals = [];
    if (!peer.ready || (phase !== null && Math.abs(phase) > 10000)) signals.push('UNTRUSTED_PLAYER_OFFSET');
    if (now - peer.sampledAt > 2700) signals.push('STALE_PLAYER_REPORT');
    if (peer.buffering) signals.push('BUFFERING');
    if (decoderSteps != null && decoderSteps > (last?.decoderSteps ?? 0)) signals.push('DECODER_RECOVERY_STEP_' + decoderSteps);
    if (peer.playing && !peer.buffering && peer.sensor?.heldMs > 300) signals.push('POSITION_HELD');
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
    lastPeers.set(peer.member, {phase, corrections, recoveries, decoderSteps});
    return {device:memberName(peer.member), playing:peer.playing, buffering:peer.buffering,
      reportAgeMs:reportAge, playerOffsetMs:live?rawPhase:null,
       rawOffsetMs:rawPhase, targetErrorMs:live?targetError:null, adjustmentMs:finite(peer.adjustmentMs),
       timingQuality:!peer.playing?'paused-residual':!live?'stale-or-buffering':peer.sensor?.clockState==='bounded'?'bounded-player-only':'thin-clock-estimate',
      rttMs:finite(peer.rttMs), sourceAgeMs:finite(peer.sourceAgeMs), startupWaitMs:finite(peer.startupWaitMs),
      corrections, action:peer.recentCorrection || null, hostRecovery:recover(peer) || (peer.member===state?.hostId && typeof isHost==='function' && isHost() ? recover(localRecovery()) : null),
      audible:typeof peer.audible==='boolean'?peer.audible:null, sensor:sensor(peer.sensor),
      filteredDriftMs:finite(peer.filteredDriftMs),
      seekHealth:peer.seekHealth || null, decoderRecovery:decoder(peer.decoderRecovery),
      freeze: (peer.member === session?.publicId || (!session?.publicId && peer.member === state?.hostId && typeof isHost === 'function' && isHost()))
        ? window.WatchFusionFreezeTelemetry?.capture?.(peer, coordination) ?? null : null,
      signals};
  }
  function render() {
    if (!panel.open) return;
    refreshScope();
    prune();
    const recent = entries.slice(-15).map(item => {
      const peers = item.peers.map(p => `${p.device}: ${p.targetErrorMs === null ? 'room ' + (p.rawOffsetMs ?? '?') : 'target ' + p.targetErrorMs}ms · startup ${p.startupWaitMs ?? '?'}ms · ${p.corrections ?? '-'} seeks${p.signals.length ? ' [' + p.signals.join(',') + ']' : ''}`).join(' / ');
      const h=item.peers.find(p=>p.freeze)?.freeze;
      return `${item.at.slice(11,19)} #${item.segmentSequence||'?'} song${item.song?.playlistIndex||item.song?.observedSong||'?'} ${item.song?.title||'title unavailable'} ${clock(item.song?.elapsedMs)}/${clock(item.song?.durationMs)} (-${clock(item.song?.remainingMs)}) ${item.ref || 'room-clock'}${item.source ? ' src:' + item.source : ''}${item.groupPhase ? ' · ' + item.groupPhase : ''} | ${peers}${h ? ' · host:'+h.state+(h.guard ? ' ('+h.guard+')' : '') : ''}`;
    }).join('\n');
    const transitions = events.slice(-10).map(e => `${e.at.slice(11,19)} #${e.segmentSequence||'?'} ! ${e.kind}${e.reason?' · '+e.reason:''}`).join('\n');
    const display = [recent,transitions].filter(Boolean).join('\n');
    if (display !== lastRendered) {area.value = display || 'Gathering room timing…'; lastRendered = display;}
    if (count) count.textContent = entries.length + ' snapshots · ' + events.length + ' transitions';
  }
  function emit(now, peers, coordination, roster) {
    recordSegment();
    const rows = peers.map(p => strip(p, now, coordination)).sort((a,b) => a.device.localeCompare(b.device));
    const relative = group(rows), members = finite(roster?.members), reporting = finite(roster?.reporting);
    const rejections = roster?.rejections && typeof roster.rejections === 'object' ? Object.fromEntries(Object.entries(roster.rejections)
      .filter(([k,v]) => /^[a-z-]{1,20}$/.test(k) && Number.isFinite(v)).slice(0,8).map(([k,v]) => [k,Math.round(v)])) : null;
    const ref = coordination?.reference || window.watchFusionPlayout?.status?.()?.reference || 'room-clock';
    const phaseMs = finite(coordination?.phaseMs);
    const row = {at:new Date().toISOString(), segmentSequence, ref, referencePhaseMs:phaseMs,
      uncertaintyMs:finite(coordination?.uncertaintyMs), sourceBuffering:!!coordination?.authorityBuffering,
      source:coordination?.source || null, sourcePhaseMs:finite(coordination?.sourcePhaseMs),song:song(),
      ...relative, speakerPhase:'not-measured', roster:members===null?null:{members,reporting,rejections},
      peers:rows};
    const key = JSON.stringify([ref,phaseMs,relative.groupPhase,members,reporting,rows.map(p => [p.device,p.playerOffsetMs,p.corrections,p.action,p.buffering,p.seekHealth?.recoveryAttempts,p.signals])]);
    // Source-trust transitions (live/stale/off-phase/...) are acceptance evidence: record them at once.
    const changed = rows.some(p=>p.freeze?.transition) || key !== lastKey && rows.some(p=>p.signals.length) || ref !== (entries.at(-1)?.ref) ||
      row.source !== (entries.at(-1)?.source ?? null) || row.segmentSequence !== entries.at(-1)?.segmentSequence ||
      row.groupPhase !== entries.at(-1)?.groupPhase || row.outputs !== entries.at(-1)?.outputs || row.roster?.reporting !== entries.at(-1)?.roster?.reporting;
    if (!changed && now - lastAt < (performance.now() < burstUntil ? 500 : lastHealthCritical ? 1100 : 4500)) return;
    lastKey = key; lastAt = now;
    entries.push(row); prune();
    const local=rows.find(p=>p.freeze), health=local?.freeze;
    const healthKey=health ? [health.state,health.guard,health.owner].join(':') : '';
    if (healthKey && healthKey !== lastHealthKey) note('sync-health-state', {reason:health.state, guard:health.guard || 'none', owner:health.owner, playerErrorMs:health.playerErrorMs, heldMs:health.heldMs});
    lastHealthKey=healthKey; lastHealthCritical=!!health && ['buffering','arbiter-owned','reported-position-held','host-seek-blocked','source-evidence-unverified','rate-capability-unavailable'].includes(health.state);
    render();
  }
  function refreshScope() {
    const scope = currentScope();
    if (scope === roomScope) return;
    roomScope = scope;
    entries = []; events = [];
    lastPeers.clear();
    lastKey = lastRendered = '';lastSegmentKey='';segmentSequence=0;lastHealthKey='';lastHealthCritical=false;observedSong=0;lastSongKey='';
    window.WatchFusionFreezeTelemetry?.reset?.();
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
    if(!roomScope || !/^(?:ui-intent|source-(?:play|pause|volume|track-transition|seek-confirmed|seek-unconfirmed|seek-retry|transport-unconfirmed|transport-retry|command-timeout|volume-unconfirmed)|embedded-control|mirror-(?:request|applied)|room-transition|host-rejoin-(?:gated|triggered|accepted|rejected|settled|incomplete|verifying|retry-armed|budget-exhausted|drift-returned)|playlist-(?:transition|resume-attempt|resume-confirmed|resume-blocked|resume-expired|pause-preserved|pause-deferred|preview-guarded)|solo-sync-one-rejoin|zero-converge-pulse|host-zero-pulse-gated|tv-decoder-(?:reload|rebuild|rearmed|recovered|budget-spent)|room-audio-(?:unlocked|reapplied|needs-tap)|source-stall-held|host-link-(?:lost|resumed|restore-attempt|denied|suppressed)|host-source-(?:rejoin-triggered|rejoin-accepted|rejoin-refused|settled|landing-incomplete|backoff|contradicted)|mirror-drift-observing|rejoin-landing|sync-health-state)$/.test(kind)) return;
    recordSegment();
    const fields={};
    for(const key of ['action','reason','playing','paused','positionMs','sampleAgeMs','sourceAgeMs','volumePct','rate','sequence','ackLatencyMs','roundTripMs','reference','hostErrorMs','peerErrorMs','gapMs','peerCount','observedPeerCount','observedPeerErrorMs','peerSpreadMs','dwellMs','attempts','status','backoffMs','muted','generation','step','errorMs','driftMs','beforeMs','residualMs','progressMs','leadMs','landedShortMs','releaseLeadMs','releaseErrMs','holdMs','startLatencyMs','mirrorDriftMs','sourcePhaseMs','clockGapMs','clockEvidence','durationMs','playerErrorMs','heldMs','owner','guard']) {
      const v=detail[key];
      if(typeof v==='boolean' || typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e9 ||
          typeof v==='string' && /^[a-z-]{1,35}$/.test(v)) fields[key]=v;
    }
    if (BURST.test(kind)) burstUntil = performance.now() + 6000;
    events.push({at:new Date().toISOString(),kind,segmentSequence,song:song(),...fields});prune();render();
  }
  function wantsSample() {
    refreshScope();
    const now = performance.now();
    return !!roomScope && now - requestAt >= (performance.now() < burstUntil ? 650 : lastHealthCritical ? 1000 : 2300);
  }
  function observe(peers, coordination, roster) {
    refreshScope();
    if (!roomScope) return;
    requestAt = performance.now();
    if (peers.length) emit(estimatedServerNow(), peers, coordination, roster);
    else render();
  }
  function exported() {
    refreshScope();
    prune();
    return JSON.stringify({format:'WatchFusion room sync trace v3',generatedAt:new Date().toISOString(),windowMs:MAX_AGE,
      disclosure:'Player timing, source-supplied song titles and durations, user control intents and redacted transitions only; no audio, URLs, tokens or microphone measurements. Titles are included only when the user copies this local log. Player target error does not measure speaker-output latency; clock bounds include unknown asymmetry.',
      diagnosticsVersion:'v13.10.8i',snapshots:entries,events},null,2);
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
  clear?.addEventListener('click', () => {entries=[];events=[];lastPeers.clear();lastKey='';lastRendered='';observedSong=0;lastSongKey='';render();});
  panel.addEventListener('toggle', render);
  window.watchFusionRoomSyncLog = {export:exported, wantsSample, observe, note};
})();
