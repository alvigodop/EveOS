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
  let plateauScope = '', plateauSamples = [];
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
      clockBoundMs:finite(d.clockBoundMs),clockState:/^[a-z]{1,10}$/.test(d.clockState)?d.clockState:'unknown',
      timelineState:/^(?:advancing|slow|held|jumped|unverified)$/.test(d.timelineState)?d.timelineState:null,
      timelineRatePct:Number.isFinite(d.timelineRatePct)&&d.timelineRatePct>=0&&d.timelineRatePct<=300?finite(d.timelineRatePct):null,audibleOutput:/^[a-z-]{1,12}$/.test(d.audibleOutput)?d.audibleOutput:'unknown'};
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
    // R14u adds a separate AUDIO-INDEPENDENT player-timeline comparison.
    // Never silently promote it to groupPhase: source-tab audio is not this player's speaker.
    const timelineErrors=fresh.map(p=>p.targetErrorMs).sort((a,b)=>a-b);
    const timelineSpreadMs=timelineErrors.length>=2 ? timelineErrors.at(-1)-timelineErrors[0] : null;
    const timelinePhase=timelineSpreadMs===null?'no-peer-comparison':timelineSpreadMs<=50?'player-timelines-within-50':
      timelineSpreadMs<=75?'player-timelines-near-50':'player-timelines-differ';
    const timeline={timelinePlayerCount:fresh.length,timelineSpreadMs,timelinePhase};
    if(usable.length<2)return {playerCount:usable.length,groupSpreadMs:null,commonModeMs:null,groupUncertaintyMs:null,
      groupPhase:'unmeasured-'+(usable.length?'single-player':'no-player'),outputs,...timeline};
    const errors=usable.map(p=>p.targetErrorMs).sort((a,b)=>a-b),clocks=usable.map(p=>p.sensor?.clockState==='bounded'?p.sensor.clockBoundMs:NaN);
    const spread=errors.at(-1)-errors[0],middle=errors[Math.floor(errors.length/2)];
    const uncertainty=clocks.every(Number.isFinite)?clocks.sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0):null;
    const phase=uncertainty===null?'unmeasured-clock':
      spread<=Math.max(50,uncertainty)?(Math.abs(middle)>=80?'common-mode-offset':'aligned'):
      spread<=Math.max(75,uncertainty+20)?'near-alignment':'players-disagree';
    return {playerCount:usable.length,groupSpreadMs:spread,commonModeMs:middle,groupUncertaintyMs:uncertainty,groupPhase:phase,outputs,...timeline};
  }
  // A linked source remains a timeline authority even when the host embedded
  // YouTube iframe is unembeddable. Native tab mute is reported by the extension;
  // the page cannot claim it was muted without a recent publisher confirmation.
  function linkedSourceEvidence(peers, coordination, now) {
    if(state?.linkedSourceActive!==true) return null;
    const sourceAgeMs=Number.isFinite(coordination?.sourceReferenceAt)?finite(now-coordination.sourceReferenceAt):null;
    const live=coordination?.source==='live'&&coordination?.reference==='linked-tab'&&
      coordination?.authorityBuffering!==true && sourceAgeMs!==null && sourceAgeMs>=0 && sourceAgeMs<=1500 &&
      Number.isFinite(coordination?.uncertaintyMs)&&coordination.uncertaintyMs<=125;
    const host=peers.find(p=>p.member===state?.hostId);
    const metadata=window.watchFusionLinkedTab?.active?.()===true ? window.watchFusionLinkedTab?.metadata?.() : null;
    const sampleAt=Number(metadata?.sampledAt);
    const muteAgeMs=Number.isFinite(sampleAt)&&sampleAt>0?finite(Date.now()-sampleAt):null;
    const tabMuted=muteAgeMs!==null&&muteAgeMs>=0&&muteAgeMs<=2000&&typeof metadata?.tabMuted==='boolean'
      ?metadata.tabMuted:null;
    const hostPlaying=host?.playing===true&&!host.buffering;
    const audioRoute=tabMuted===false&&hostPlaying?'double-audio-risk':tabMuted===false&&!hostPlaying?'source-tab-fallback':
      tabMuted===true&&hostPlaying?'room-player':tabMuted===true&&!hostPlaying?'host-player-unavailable':'unverified';
    return {mode:live?'live-linked-source':'unverified-source-reference',sourceAgeMs,
      uncertaintyMs:finite(coordination?.uncertaintyMs),hostPlayerPlaying:host?.playing??null,
      tabMuted,muteSampleAgeMs:muteAgeMs,audioRoute};
  }
  // R14v: plateau is longitudinal evidence that two advancing video/player
  // timelines have a stable separation.  It is NOT an audio calibration or a
  // new correction target.  Retain the measured 170 ms from the physical run.
  function plateauEvidence(rows, timeline, coordination, now) {
    const scope = [state?.presentationEpoch, state?.source?.videoId, state?.playoutSegment].join(':');
    if (scope !== plateauScope) { plateauScope = scope; plateauSamples = []; }
    const qualified = rows.filter(p=>p.playing&&!p.buffering&&p.targetErrorMs!==null&&
      p.reportAgeMs!==null&&p.reportAgeMs>=0&&p.reportAgeMs<=1500&&
      ['decoder-confirmed','fine-locked'].includes(p.startupPhase)&&
      !['unstable','stale','unknown'].includes(p.sensor?.clockState)&&
      p.sensor?.timelineState==='advancing' &&
      (p.sensor?.heldMs==null || p.sensor.heldMs<=300) &&
      Number.isFinite(p.sensor?.clockBoundMs)&&p.sensor.clockBoundMs<=100);
    const sourceFresh = coordination?.source==='live' && coordination?.authorityBuffering!==true &&
      Number.isFinite(coordination?.sourceReferenceAt) &&
      now - coordination.sourceReferenceAt >= 0 && now - coordination.sourceReferenceAt <= 1500;
    if (qualified.length < 2 || !sourceFresh || timeline.timelineSpreadMs===null || timeline.timelineSpreadMs>600) {
      plateauSamples = [];
      return {state:'insufficient-evidence',targetBand:null,medianSpreadMs:null,jitterMs:null,observedMs:0,
        samples:0,speakerPhase:'not-measured'};
    }
    const spread=timeline.timelineSpreadMs;
    // A 4.5-second ordinary diagnostic cadence must not reset sustained progress.
    if (plateauSamples.length && (now <= plateauSamples.at(-1).at || now - plateauSamples.at(-1).at > 6500))
      plateauSamples=[];
    plateauSamples.push({at:now,spread});
    plateauSamples=plateauSamples.filter(sample => now-sample.at <= 30000).slice(-40);
    const sorted=plateauSamples.map(p=>p.spread).sort((a,b)=>a-b);
    const jitter=sorted.at(-1)-sorted[0],observed=now-plateauSamples[0].at;
    const stable=plateauSamples.length>=5&&observed>=20000&&jitter<=35;
    const median=sorted[Math.floor(sorted.length/2)];
    return {state:stable?'stable-timeline-offset':jitter>80?'unstable-timeline-offset':'qualifying',
      targetBand:stable?(median<=50?'within-50':'outside-50'):null,
      medianSpreadMs:stable?median:null,jitterMs:jitter,
      observedMs:Math.round(observed),samples:plateauSamples.length,speakerPhase:'not-measured'};
  }
  function recordSegment() {
    const key=state?.presentationEpoch!=null&&state?.playoutSegment!=null
      ? String(state.presentationEpoch)+':'+String(state.playoutSegment) : '';
    if(!key||key===lastSegmentKey)return;
    if(lastSegmentKey)events.push({at:new Date().toISOString(),kind:'playback-segment-transition',sequence:segmentSequence+1});
    lastSegmentKey=key;segmentSequence++;prune();
  }
  // R14t: decoder progress is distinct from fresh network-clock calibration.
  // Preserve raw positions for diagnosis; do not certify a room-sync phase while
  // the startup gate reports stalled/unverified decoding or recovery ownership.
  function decoderProgressUnverified(peer) {
    return ['decoder-stalled','decoder-buffering','decoder-warming','decoder-advancing','awaiting-play','awaiting-first-frame'].includes(peer.startupPhase)
      || /^(?:viewer-stalled-while-playing|viewer-warming-after-play|stall-recovery-exhausted|auto-correction-suspended|rejoin-|stall-kick|settling)/.test(peer.recentCorrection || '')
      || peer.decoderRecovery?.outcome === 'terminal-recovery-spent';
  }
  function strip(peer, now, coordination) {
    const rawPhase = finite(peer.positionMs - peer.roomPositionMs);
    const targetError = Number.isFinite(peer.targetPositionMs) ? finite(peer.positionMs - peer.targetPositionMs) : null;
    const reportAge=finite(now-peer.sampledAt),live=peer.playing&&!peer.buffering&&peer.ready&&reportAge!==null&&reportAge>=0&&reportAge<=1500;
    const unverifiedDecoder = decoderProgressUnverified(peer);
    const phase = live && !unverifiedDecoder ? targetError ?? rawPhase : null; // paused/stale residuals are not live sync error
    const last = lastPeers.get(peer.member);
    const corrections = finite(peer.corrections);
    const recoveries = peer.seekHealth?.recoveryAttempts ?? 0;
    const decoderSteps = peer.decoderRecovery?.steps ?? null;
    const signals = [];
    if (!peer.ready || (phase !== null && Math.abs(phase) > 10000)) signals.push('UNTRUSTED_PLAYER_OFFSET');
    if (now - peer.sampledAt > 2700) signals.push('STALE_PLAYER_REPORT');
    if (peer.buffering) signals.push('BUFFERING');
    if (peer.playing && unverifiedDecoder) signals.push('DECODER_PROGRESS_UNVERIFIED');
    if(peer.playing && ['held','slow','jumped'].includes(peer.sensor?.timelineState))
      signals.push('TIMELINE_MOTION_UNVERIFIED');
    if (peer.audioReadiness === 'needs-gesture') signals.push('AUDIO_GESTURE_REQUIRED');
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
    const hostInBand=peer.member===state?.hostId && live && !unverifiedDecoder &&
      Number.isFinite(targetError) && Math.abs(targetError)<=50;
    const recoveryMeaning=peer.hostRecovery?.outcome==='no-healthy-peer-witness'
      ? (hostInBand?'not-needed-host-in-band':'no-qualified-peer-witness') : null;
    return {device:memberName(peer.member), role:peer.member===state?.hostId?'host':'viewer',
      hostRecoveryMeaning:recoveryMeaning, playing:peer.playing, buffering:peer.buffering,
      reportAgeMs:reportAge, playerOffsetMs:live&&!unverifiedDecoder?rawPhase:null,
       rawOffsetMs:rawPhase, targetErrorMs:live&&!unverifiedDecoder?targetError:null, sourceErrorMs:peer.sensor?.clockState==='bounded' ? window.watchFusionPlayout?.sourceErrorMs?.(peer, coordination, now) ?? null : null, adjustmentMs:finite(peer.adjustmentMs),
       timingQuality:!peer.playing?'paused-residual':!live?'stale-or-buffering':unverifiedDecoder?'decoder-progress-unverified':peer.sensor?.clockState==='bounded'?'bounded-player-only':'thin-clock-estimate',
      playerRate:Number.isFinite(peer.rate)?Math.round(peer.rate*1000)/1000:null,
      rttMs:finite(peer.rttMs), sourceAgeMs:finite(peer.sourceAgeMs), startupWaitMs:finite(peer.startupWaitMs),
      startupPhase:/^[a-z-]{1,30}$/.test(peer.startupPhase)?peer.startupPhase:null, audioReadiness:/^[a-z-]{1,30}$/.test(peer.audioReadiness)?peer.audioReadiness:null,
      corrections, action:peer.recentCorrection || null,
      correctionOwner:/^(?:tv-decoder-first|decoder-(?:recovery|manual-restart))/.test(peer.recentCorrection||'')?'bounded-decoder-rescue':
        /^(?:tv-post-release-duplicate-blocked|tv-healthy-plateau-no-speaker-proof|tv-motion-|tv-reference-)/.test(peer.recentCorrection||'')?'observe-only':
        /^(?:rejoin-|stall-kick|rate-|track-start-qualified-rejoin|late-release-retry-started)/.test(peer.recentCorrection||'')?'viewer-arbiter':null, hostRecovery:recover(peer) || (peer.member===state?.hostId && typeof isHost==='function' && isHost() ? recover(localRecovery()) : null),
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
    const relative = group(rows), linkedSource = linkedSourceEvidence(peers,coordination,now);
    const playbackPlateau = plateauEvidence(rows,relative,coordination,now);
    const host=rows.find(p=>p.role==='host' && p.targetErrorMs!==null);
    for(const peer of rows) peer.relativeToHostMs=host && peer.targetErrorMs!==null
      ? peer.targetErrorMs-host.targetErrorMs:null;
    const members = finite(roster?.members), reporting = finite(roster?.reporting);
    const rejections = roster?.rejections && typeof roster.rejections === 'object' ? Object.fromEntries(Object.entries(roster.rejections)
      .filter(([k,v]) => /^[a-z-]{1,20}$/.test(k) && Number.isFinite(v)).slice(0,8).map(([k,v]) => [k,Math.round(v)])) : null;
    const ref = coordination?.reference || window.watchFusionPlayout?.status?.()?.reference || 'room-clock';
    const phaseMs = finite(coordination?.phaseMs);
    const row = {at:new Date().toISOString(), segmentSequence, ref, referencePhaseMs:phaseMs,
      timingVersion:/^v[0-9a-z.-]{1,24}$/.test(coordination?.timingVersion) ? coordination.timingVersion : null,
      uncertaintyMs:finite(coordination?.uncertaintyMs), sourceBuffering:!!coordination?.authorityBuffering,
      sourceReferenceAgeMs:Number.isFinite(coordination?.sourceReferenceAt)?finite(now-coordination.sourceReferenceAt):null,
      source:coordination?.source || null, sourcePhaseMs:finite(coordination?.sourcePhaseMs),song:song(),
      mirrorClock:(()=>{const c=window.WatchFusionMirrorConvergenceGate?.diagnostics?.()?.clockEvidence;return c?{gapMs:finite(c.gapMs),sourcePhaseMs:finite(c.sourcePhaseMs),sampleAgeMs:finite(c.sampleAgeMs),classification:/^[a-z-]{1,35}$/.test(c.classification)?c.classification:null}:null;})(),
      ...relative, linkedSourceEvidence:linkedSource, playbackPlateau, speakerPhase:'not-measured', roster:members===null?null:{members,reporting,rejections},
      peers:rows};
    const key = JSON.stringify([ref,phaseMs,relative.groupPhase,relative.timelinePhase,playbackPlateau.state,linkedSource?.audioRoute,members,reporting,
      rows.map(p => [p.device,p.playerOffsetMs,p.corrections,p.action,p.buffering,p.startupPhase,p.audioReadiness,p.seekHealth?.recoveryAttempts,p.signals])]);
    // Source-trust transitions (live/stale/off-phase/...) are acceptance evidence: record them at once.
    const changed = rows.some(p=>p.freeze?.transition) || key !== lastKey && rows.some(p=>p.signals.length) || ref !== (entries.at(-1)?.ref) ||
      row.source !== (entries.at(-1)?.source ?? null) || row.segmentSequence !== entries.at(-1)?.segmentSequence ||
      row.groupPhase !== entries.at(-1)?.groupPhase || row.timelinePhase !== entries.at(-1)?.timelinePhase ||
      row.linkedSourceEvidence?.audioRoute !== entries.at(-1)?.linkedSourceEvidence?.audioRoute ||
      row.linkedSourceEvidence?.mode !== entries.at(-1)?.linkedSourceEvidence?.mode ||
      row.outputs !== entries.at(-1)?.outputs || row.roster?.reporting !== entries.at(-1)?.roster?.reporting || rows.some(p=>{const q=entries.at(-1)?.peers?.find(x=>x.device===p.device);return q&&(q.startupPhase!==p.startupPhase||q.audioReadiness!==p.audioReadiness);});
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
    lastKey = lastRendered = '';lastSegmentKey='';segmentSequence=0;lastHealthKey='';lastHealthCritical=false;observedSong=0;lastSongKey='';plateauScope='';plateauSamples=[];
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
    if(!roomScope || !/^(?:ui-intent|source-(?:play|pause|volume|track-transition|seek-confirmed|seek-unconfirmed|seek-retry|transport-unconfirmed|transport-retry|command-timeout|volume-unconfirmed)|embedded-control|mirror-(?:request|applied|expired|anchor-rebased)|room-transition|host-rejoin-(?:gated|triggered|accepted|rejected|settled|incomplete|verifying|retry-armed|budget-exhausted|drift-returned)|playlist-(?:transition|resume-attempt|resume-confirmed|resume-blocked|resume-expired|pause-preserved|pause-deferred|preview-guarded)|solo-sync-one-rejoin|zero-converge-pulse|host-zero-(?:pulse-gated|rate-recheck-verified)|host-hold-(?:started|result)|tv-next-release-model-adjusted|tv-decoder-(?:reload|rebuild|rearmed|recovered|budget-spent|manual-restart)|room-audio-(?:unlocked|reapplied|needs-tap)|source-stall-held|host-link-(?:lost|resumed|restore-attempt|denied|suppressed)|host-source-(?:rejoin-triggered|rejoin-accepted|rejoin-refused|settled|landing-incomplete|backoff|contradicted)|mirror-drift-observing|rejoin-landing|sync-health-state)$/.test(kind)) return;
    recordSegment();
    const fields={};
    for(const key of ['action','reason','playing','paused','positionMs','sampleAgeMs','sourceAgeMs','volumePct','rate','sequence','ackLatencyMs','roundTripMs','reference','hostErrorMs','peerErrorMs','gapMs','peerCount','observedPeerCount','observedPeerErrorMs','peerSpreadMs','dwellMs','attempts','status','backoffMs','muted','generation','step','errorMs','driftMs','beforeMs','residualMs','progressMs','expectedMs','leadMs','landedShortMs','releaseLeadMs','releaseErrMs','holdMs','startLatencyMs','mirrorDriftMs','sourcePhaseMs','clockGapMs','clockEvidence','durationMs','playerErrorMs','heldMs','owner','guard']) {
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
      diagnosticsVersion:'v13.10.8x-room-recovery',snapshots:entries,events},null,2);
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
