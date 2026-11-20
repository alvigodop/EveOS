// The room owns the media timeline. Reports describe a player or a compositor, never a speaker.
const MAX_AGE = 4500;
const MAX_HOLDBACK = 350;
const MAX_PHASE = 1200;
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function createPlayoutCoordinator() {
  let segment = 0, anchor = null, reference = null, holdbackMs = 0;
  let sourceStall = {sequence:0, buffering:false, firstAt:-1, lastAt:-1};
  const history = new Map(), latestReport = new Map();

  function transport(playback, discontinuity = false, softMirror = false) {
    const rate = playback.paused || playback.ended ? 0 : playback.rate;
    const next = {rate, at:playback.updatedAt, positionMs:playback.position * 1000};
    const predicted = anchor && anchor.positionMs + (next.at - anchor.at) * anchor.rate;
    if (discontinuity || !anchor || anchor.rate !== rate || Math.abs(next.positionMs - predicted) > (softMirror && rate > 0 ? 1500 : 500)) {
      segment++;
      history.clear();
      latestReport.clear();
      reference = null;
      holdbackMs = 0;
    } else if (predicted !== next.positionMs) {
      const shift = next.positionMs - predicted;
      for (const entry of history.values()) for (const item of entry.readings) item.phase -= shift;
      if (reference) reference.phase -= shift;
      for (const item of latestReport.values()) if (item.coarse !== null) item.coarse -= shift;
    }
    anchor = next;
    return segment;
  }

  function position(at) {
    return Math.max(0, anchor.positionMs + (at - anchor.at) * anchor.rate);
  }

  function observe(id, report, receivedAt) {
    const fresh = finite(report.sampledAt, receivedAt - 1500, receivedAt + 50);
    const previousReport = latestReport.get(id);
    if (!fresh || (previousReport && report.sampledAt <= previousReport.sampledAt)) return;
    // Only independent linked-source buffering can establish a source-stall episode.
    if (id === 'linked') {
      if (report.buffering === true) {
        if (!sourceStall.buffering) { sourceStall.sequence++; sourceStall.firstAt=receivedAt; }
        sourceStall.lastAt=receivedAt; sourceStall.buffering=true;
      } else sourceStall.buffering=false;
    }
    // A viewer under active correction (rate burst, scheduled hold) stays visible as
    // telemetry but can never vote for, or become, the room reference.
    const correcting = report.correcting === true;
    // Coarse source evidence (no precise clock needed): seconds-scale agreement with the anchor.
    const coarse = anchor?.rate > 0 && finite(report.positionMs, 0, 1e10) ? report.positionMs - position(report.sampledAt) : null;
    const live = report.ready === true && report.playing === true && report.buffering !== true;
    const agrees = live && coarse !== null && Math.abs(coarse) <= MAX_PHASE;
    // PLAYING alone is not progress: a frozen timeline must not corroborate the room, even inside
    // MAX_PHASE. Require the media position itself to advance by a quarter of the expected amount.
    const dt = previousReport ? report.sampledAt - previousReport.sampledAt : 0;
    const advanced = !previousReport || !Number.isFinite(previousReport.positionMs) || dt < 100
      ? (previousReport?.advanced ?? true)
      : report.positionMs - previousReport.positionMs >= dt * anchor.rate * .25;
    latestReport.set(id, {at:receivedAt, sampledAt:report.sampledAt, buffering:report.buffering === true, output:report.outputSession, correcting,
      live, coarse, positionMs:coarse !== null ? report.positionMs : null, advanced,
      agreed:agrees && advanced ? (previousReport?.agreed || 0) + 1 : 0});
    let samples = history.get(id);
    const valid = !correcting && anchor?.rate > 0 && Number.isFinite(receivedAt) && report.ready && report.playing && !report.buffering &&
      finite(report.positionMs, 0, 1e10) && finite(report.uncertaintyMs, 0, 150);
    const routeChanged = previousReport && previousReport.output !== report.outputSession;
    if (reference?.authority === id && routeChanged) reference = null;
    if (!valid || routeChanged) {
      history.delete(id);
      samples = null;
    }
    if (!valid) return;
    if (!samples) {
      samples = {readings:[]};
      history.set(id, samples);
    }
    const previous = samples.readings.at(-1);
    if (previous && report.sampledAt - previous.at > 2400) samples.readings = [];
    const phase = report.positionMs - position(report.sampledAt);
    samples.readings.push({at:report.sampledAt, phase, uncertaintyMs:report.uncertaintyMs,
      bufferedUntilMs:report.bufferedUntilMs, hasDeviceOffset: Math.abs(report.adjustmentMs || 0) >= 1});
    samples.readings = samples.readings.filter(item => report.sampledAt - item.at <= MAX_AGE).slice(-8);
  }

  function estimate(id, now) {
    const items = history.get(id)?.readings;
    if (!items || items.length < 4 || now - items.at(-1).at > 2000 || items.at(-1).at - items[0].at < 1000) return null;
    const phase = median(items.map(item => item.phase));
    const inliers = items.filter(item => Math.abs(item.phase - phase) <= Math.max(35, item.uncertaintyMs));
    if (inliers.length < 4 || inliers.length < items.length * .75 || Math.abs(phase) > MAX_PHASE) return null;
    const first = inliers[0], last = inliers.at(-1);
    const span = last.at - first.at;
    if (span < 1000 || now - last.at > 2200) return null;
    // A phase estimate is invalid while the anchor is moving faster/slower than the player.
    if (Math.abs(last.phase - first.phase) > Math.max(45, span * .035)) return null;
    const jitter = Math.max(...inliers.map(item => Math.abs(item.phase - phase)));
    return {phase, at:last.at, uncertaintyMs:Math.ceil(jitter + Math.max(...inliers.map(item => item.uncertaintyMs)))};
  }

  // Use agreement between *independent*, steady room players only when a linked
  // source has no trustworthy phase. Outliers or buffered players cannot vote.
  function peerCohort(now, viewers) {
    const candidates = [...viewers].filter(id => !history.get(id)?.readings.at(-1)?.hasDeviceOffset && !latestReport.get(id)?.correcting)
      .map(id => estimate(id, now)).filter(value => value && value.uncertaintyMs <= 105);
    let best = null;
    for (let i=0;i<candidates.length;i++) for(let j=i+1;j<candidates.length;j++) {
      const a=candidates[i], b=candidates[j], spread=Math.abs(a.phase-b.phase);
      if (spread > 140) continue;
      const uncertainty=Math.ceil(Math.max(a.uncertaintyMs,b.uncertaintyMs) + spread/2);
      if (uncertainty > 125) continue;
      if (!best || spread < best.spread) best={phase:(a.phase+b.phase)/2,
        at:Math.min(a.at,b.at),uncertaintyMs:uncertainty,spread};
    }
    return best ? {phase:best.phase,at:best.at,uncertaintyMs:best.uncertaintyMs,
      authority:'linked',origin:'peer-cohort'} : null;
  }

  function coordinate({now, authority, viewers, allowHoldback}) {
    for (const [id, entry] of history) {
      if ((!viewers.has(id) && id !== authority) || now - entry.readings.at(-1).at > MAX_AGE) history.delete(id);
    }
    for (const [id, entry] of latestReport) if ((!viewers.has(id) && id !== authority) || now - entry.at > MAX_AGE) latestReport.delete(id);
    const authoritySample = latestReport.get(authority);
    const authorityBuffering = authoritySample?.buffering === true && now - authoritySample.at < 1700;
    if (reference && reference.authority !== authority) reference = null;
    const observed = estimate(authority, now);
    if (observed && observed.uncertaintyMs <= 125) {
      if (!reference || reference.origin === 'peer-cohort' || Math.abs(observed.phase - reference.phase) > Math.max(20, observed.uncertaintyMs)) reference = {...observed, authority};
      else reference = {...reference, at:observed.at, uncertaintyMs:observed.uncertaintyMs};
    } else if (reference && now - reference.at > MAX_AGE) reference = null;
    if (authority === 'linked' && (!observed || observed.uncertaintyMs > 125)) {
      const cohort = peerCohort(now, viewers);
      if (cohort && (!reference || reference.origin === 'peer-cohort')) {
        // Keep one stable room target; do not oscillate with minor peer jitter.
        reference = !reference || Math.abs(cohort.phase-reference.phase) > 250
          ? cohort : {...reference,at:cohort.at,uncertaintyMs:cohort.uncertaintyMs};
      }
    }

    // Is the room timeline independently corroborated by its audible source right now?
    // Viewers follow the room, so their agreement is circular and never counts here.
    const source = !authoritySample ? 'none' : now - authoritySample.at > 1700 ? 'stale' : authoritySample.buffering ? 'buffering'
      : !authoritySample.live || anchor?.rate <= 0 ? 'not-playing' : !authoritySample.advanced ? 'frozen'
      : !(authoritySample.agreed >= 2) ? 'off-phase' : 'live';

    if (!allowHoldback) holdbackMs = 0;
    if (allowHoldback && observed && observed.uncertaintyMs <= 125 && reference && !authorityBuffering && viewers.size >= 2) {
      const limits = [...viewers].map(id => {
        const entry = estimate(id, now);
        const readings = history.get(id)?.readings.slice(-3);
        if (!entry || !readings.every(item => finite(item.bufferedUntilMs, 0, 1e10))) return null;
        // Estimate the shared playable frontier only from stable live buffer observations.
        return median(readings.map(item => item.bufferedUntilMs - position(item.at)));
      });
      if (limits.every(value => value !== null)) {
        const deficit = reference.phase + 180 * anchor.rate - Math.min(...limits);
        const next = Math.min(MAX_HOLDBACK, Math.max(0, Math.ceil(deficit / anchor.rate / 50) * 50));
        // A one-way allowance per transport segment avoids re-seeking when a member joins/leaves.
        if (next >= holdbackMs + 75) holdbackMs = next;
      }
    }
    const sourceRecovery = source === 'live' && authority === 'linked'
      && !sourceStall.buffering && sourceStall.sequence > 0
      && sourceStall.lastAt >= sourceStall.firstAt
      && now-sourceStall.lastAt >= 900 && now-sourceStall.lastAt <= 15000
      ? {sequence:sourceStall.sequence, ageMs:Math.round(now-sourceStall.lastAt)} : null;
    return {
      sourceRecovery,
      segment, reference:reference ? (reference.origin === 'peer-cohort' ? 'peer-cohort' : authority === 'linked' ? 'linked-tab' : 'host-player') : 'room-clock',
      phaseMs:Math.round(reference?.phase ?? 0), uncertaintyMs:reference?.uncertaintyMs ?? null,
      holdbackMs, authorityBuffering, source, sourcePhaseMs:Number.isFinite(authoritySample?.coarse) ? Math.round(authoritySample.coarse) : null, outputTiming:'speaker-unmeasured',
      // The absolute reference timeline, so a viewer never combines a new room
      // anchor with a phase that was computed against the previous one.
      anchorPositionMs:anchor ? Math.round(anchor.positionMs) : null, anchorAt:anchor?.at ?? null, rate:anchor?.rate ?? null,
      correcting:[...latestReport.values()].filter(item => item.correcting).length
    };
  }

  return {transport, observe, coordinate, segment:() => segment};
}
