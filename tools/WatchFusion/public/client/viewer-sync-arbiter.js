/* WatchFusion viewer synchronization arbiter (v13).
 *
 * The single owner of every *automatic* seek, playback-rate and hold decision
 * for one YouTube viewer. Other modules supply observations (target, player
 * state) and intents (transport change, Sync me); only this arbiter actuates.
 *
 * Model: error = authoritative target - device-reported media position. It is
 * only sampled while the player is demonstrably advancing. Speaker latency is
 * not observable through the IFrame API and is never inferred here.
 *
 * Correction strategies, chosen from *verified* device capability:
 *  - rate:     open-loop burst at a supported rate whose effect was measured.
 *  - hold:     device ahead -> pause for the measured lead, then release.
 *  - rejoin:   device behind on a fixed-rate player -> pause, seek AHEAD of the
 *              room by a learned lead, wait for the landing, then release at the
 *              instant the room timeline reaches the landed frame. Keyframe
 *              snapping and slow starts are absorbed by the scheduled release
 *              instead of being chased with further seeks.
 * Release latency, keyframe landing error and rate honesty are learned per
 * device and persisted, so a TV does not re-fail on every room transition.
 */
(() => {
  'use strict';
  const MODEL_KEY = 'watchfusion.viewerSyncModel.v1';
  const LOCK_SEC = .15, UNLOCK_SEC = .25, MAX_AUTO_SEC = 30;
  const WINDOW_MS = 2200, MIN_SAMPLES = 6, MIN_SPAN_MS = 1400, MAX_SPREAD_SEC = .35;
  const SETTLE_MS = 1000, LANDING_TIMEOUT_MS = 12000, RATE_PROBE_MS = 1600;
  const BACKOFF_MS = [6000, 12000, 24000, 45000];
  // Consecutive failed corrections before automatic correction stops for this
  // segment (a seek loop is worse than a stable offset); a transport intent or
  // Sync me re-arms it.
  const MAX_FAILURES = 3, GROSS_SEC = 2, GROSS_MIN_SAMPLES = 3, GROSS_SPAN_MS = 500;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const median = values => { const v = values.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };

  function defaultModel() {
    return {releaseLatencySec: .25, leadSec: 1.5, landingErrorSec: 0, landingSec: .5, rateHonored: null, rateGain: 1, rejoins: 0};
  }

  function createViewerSyncArbiter({store = null, timers = globalThis} = {}) {
    let model = load();
    let scope = '', phase = 'observe', samples = [], last = null, reason = 'idle', job = null;
    let lockedAt = -1, locked = false, failures = 0, cooldownUntil = 0, lastCorrection = null;
    // getCurrentTime() is a cached, sample-and-hold value on many players (the
    // IFrame API relays it by message; TV browsers update it coarsely). Track
    // when the value last changed so a held reading is projected, not trusted.
    let held = {value: null, since: 0};
    const stats = {corrections: 0, rejoins: 0, holds: 0, rateBursts: 0, seeks: 0, failures: 0, rateRejected: 0};

    function load() {
      try { return {...defaultModel(), ...(JSON.parse(store?.get?.(MODEL_KEY) || 'null') || {})}; } catch { return defaultModel(); }
    }
    function save() { try { store?.set?.(MODEL_KEY, JSON.stringify(model)); } catch {} }

    function cancelJob(io, restoreRate = true) {
      if (job?.timer) timers.clearTimeout(job.timer);
      const wasRate = job?.kind === 'rate';
      job = null;
      if (restoreRate && wasRate && io) io.rate(io.baseRate);
    }

    function reset(next = '', why = 'scope-change', io = null) {
      cancelJob(io);
      scope = next; phase = 'observe'; samples = []; last = null; reason = why;
      locked = false; lockedAt = -1; failures = 0; cooldownUntil = 0; lastCorrection = null;
    }

    // A transport change, Sync me or scrub invalidates the evidence but not the device model.
    function intent(kind, io = null) {
      cancelJob(io);
      phase = 'observe'; samples = []; last = null; locked = false; reason = 'intent-' + kind;
      if (kind !== 'pause') { failures = 0; cooldownUntil = 0; }
    }

    function owns() { return !!job; }

    function observePosition(nowMs, value) {
      if (!Number.isFinite(value)) return;
      if (value !== held.value) held = {value, since: nowMs};
    }
    function projected(nowMs, value, baseRate) {
      observePosition(nowMs, value);
      const age = (nowMs - held.since) / 1000;
      return age > 0 && age < 1.2 ? value + age * baseRate : value;
    }

    function sample(nowMs, current, target, baseRate) {
      const drift = target - current;
      let note = 'observing';
      // A long gap (warming, a held tab) makes the previous sample stale, not a reference move.
      if (last && nowMs - last.nowMs > 1000) { samples = []; last = null; }
      if (last) {
        const dt = (nowMs - last.nowMs) / 1000;
        const expectedTarget = last.target + dt * baseRate;
        // The room reference moved (rebase, reference promotion): re-observe, never chase.
        if (Math.abs(target - expectedTarget) > .08) { samples = []; note = 'reference-moved-reobserve'; }
        const advanced = current - last.current;
        // Coarse TV clocks may repeat a value for one tick; never trust >1.8x progress.
        if (dt > 0 && (advanced < -.05 || advanced > dt * baseRate * 1.8 + .3)) { samples = []; note = 'discontinuous-player-position'; }
      }
      last = {nowMs, current, target};
      samples.push({nowMs, drift, current});
      samples = samples.filter(item => nowMs - item.nowMs <= WINDOW_MS);
      const spanMs = samples.at(-1).nowMs - samples[0].nowMs;
      // A gross, consistent displacement (seconds off) needs less evidence than a fine one.
      const gross = samples.length >= GROSS_MIN_SAMPLES && spanMs >= GROSS_SPAN_MS
        && samples.every(item => Math.abs(item.drift) > GROSS_SEC && Math.sign(item.drift) === Math.sign(drift));
      if (!gross && (samples.length < MIN_SAMPLES || spanMs < MIN_SPAN_MS)) { reason = note; return null; }
      // Require real progress across the window: PLAYING without moving frames is not evidence.
      const progress = samples.at(-1).current - samples[0].current;
      const span = (samples.at(-1).nowMs - samples[0].nowMs) / 1000;
      if (progress < span * baseRate * .5) { reason = 'playing-without-progress'; return null; }
      const values = samples.map(item => item.drift);
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > MAX_SPREAD_SEC) { reason = 'unstable-phase'; return null; }
      return median(values);
    }

    function rateFor(io, error) {
      if (model.rateHonored === false) return null;
      const rates = io.availableRates();
      if (!Array.isArray(rates)) return null;
      const wanted = error > 0 ? rates.filter(r => r > io.baseRate * 1.01 && r <= io.baseRate * 1.26)
        : rates.filter(r => r < io.baseRate * .99 && r >= io.baseRate * .74);
      return wanted.sort((a, b) => Math.abs(a - io.baseRate) - Math.abs(b - io.baseRate))[0] ?? null;
    }

    function begin(kind, nowMs, error, io, extra = {}) {
      stats.corrections++;
      lastCorrection = {kind, before: error, at: nowMs};
      phase = kind; samples = []; last = null; locked = false;
      job = {kind, startedAt: nowMs, before: error, ...extra};
      reason = kind + '-started';
    }

    function finish(nowMs, why) {
      if (job?.timer) timers.clearTimeout(job.timer);
      job = null; phase = 'verify'; samples = []; last = null; reason = why;
      cooldownUntil = Math.max(cooldownUntil, nowMs + SETTLE_MS);
    }

    function startRate(nowMs, error, io, rate) {
      const effective = Math.abs(rate - io.baseRate) * clamp(model.rateGain, .5, 1.5);
      const durationMs = clamp(Math.abs(error) / effective * 1000, 300, 12000);
      begin('rate', nowMs, error, io, {rate, durationMs, probe: {nowMs, current: io.current()}});
      stats.rateBursts++;
      io.rate(rate);
      job.dueAt = nowMs + durationMs;
      job.timer = timers.setTimeout(() => endRate(io), durationMs);
    }
    function endRate(io) {
      if (job?.kind !== 'rate') return;
      io.rate(io.baseRate);
      finish(io.now(), 'rate-burst-complete');
    }

    function startHold(nowMs, error, io) {
      // Device ahead: freeze for the lead, release early by the learned start latency.
      const holdMs = Math.max(0, (-error / io.baseRate - model.releaseLatencySec) * 1000);
      begin('hold', nowMs, error, io);
      stats.holds++;
      io.pause();
      job.dueAt = nowMs + holdMs;
      job.timer = timers.setTimeout(() => release(io, 'hold-released'), holdMs);
    }

    function startRejoin(nowMs, error, io, why = 'rejoin') {
      const lead = clamp(model.leadSec, .35, 10);
      const requested = io.target(nowMs) + lead;
      begin('rejoin', nowMs, error, io, {requested, lead, why, landedAt: -1, stableReads: 0, landed: null});
      stats.rejoins++; stats.seeks++; model.rejoins++;
      io.pause();
      io.seek(requested, !io.buffered(requested));
    }

    function release(io, why) {
      if (!job) return;
      io.play();
      const scheduled = why === 'rejoin-released' || why === 'hold-released';
      const kind = scheduled ? job.kind : 'unscheduled';
      finish(io.now(), why);
      lastCorrection = {...lastCorrection, kind, releasedAt: io.now()};
    }

    // Wait for a paused seek to land, then schedule the release on the room clock.
    function superviseRejoin(nowMs, io) {
      const state = io.state();
      if (nowMs - job.startedAt > LANDING_TIMEOUT_MS) {
        failures++; stats.failures++;
        release(io, 'landing-timeout-released');
        cooldownUntil = nowMs + BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, failures - 1)];
        return;
      }
      if (state === 3) { job.stableReads = 0; reason = 'rejoin-awaiting-landing'; return; }
      if (state === 1) io.pause();
      const position = io.current();
      if (job.landed !== null && Math.abs(position - job.landed) < .02) job.stableReads++;
      else { job.landed = position; job.stableReads = 0; }
      if (job.stableReads < 1 || job.dueAt !== undefined) return;
      const landed = job.landed, landingError = job.requested - landed;
      // Keep the worst recent keyframe snap and landing time: the lead must cover
      // the snap, the room time that passes while landing, and the release latency.
      model.landingErrorSec = clamp(Math.max(model.landingErrorSec * .97, landingError), 0, 6);
      model.landingSec = clamp(Math.max(model.landingSec * .9, (nowMs - job.startedAt) / 1000), .1, 8);
      const needed = () => model.landingErrorSec + model.landingSec * io.baseRate + model.releaseLatencySec * io.baseRate + .3;
      const waitMs = ((landed - io.target(nowMs)) / io.baseRate - model.releaseLatencySec) * 1000;
      if (waitMs < 60) {
        // Landed behind the room: the lead was too short for this player's keyframes.
        model.leadSec = clamp(Math.max(model.leadSec + .5, needed()), .35, 10);
        save();
        release(io, 'rejoin-landed-short');
        return;
      }
      model.leadSec = clamp(needed(), .35, 10);
      save();
      reason = 'rejoin-scheduled-release';
      job.dueAt = nowMs + waitMs;
      job.timer = timers.setTimeout(() => release(io, 'rejoin-released'), waitMs);
    }

    function superviseRate(nowMs, io) {
      if (io.state() !== 1) { cancelJob(io); phase = 'observe'; samples = []; reason = 'rate-burst-interrupted'; return; }
      const probe = job.probe;
      if (!job.verified && nowMs - probe.nowMs >= RATE_PROBE_MS) {
        const measured = (io.current() - probe.current) / ((nowMs - probe.nowMs) / 1000);
        job.verified = true;
        const honored = Math.abs(measured - job.rate) < Math.abs(measured - io.baseRate);
        if (!honored) {
          // The player accepted the rate but decodes at 1x (common on TVs).
          model.rateHonored = false; save(); stats.rateRejected++;
          cancelJob(io); phase = 'observe'; samples = []; reason = 'rate-not-honored-switch-to-rejoin';
          return;
        }
        model.rateHonored = true; save();
      }
      reason = 'rate-converging';
    }

    // Learn from the residual after a correction: it measures this device's
    // release latency (rejoin/hold) or the rate effectiveness (rate).
    function learn(residual) {
      const c = lastCorrection;
      if (!c) return;
      if ((c.kind === 'rejoin' || c.kind === 'hold') && Math.abs(residual) < 1.2) {
        model.releaseLatencySec = clamp(model.releaseLatencySec + residual * .8, 0, 2);
      } else if (c.kind === 'rate' && Math.abs(c.before) > .05) {
        const achieved = (c.before - residual) / c.before;
        if (achieved > .2) model.rateGain = clamp(model.rateGain * achieved, .5, 1.5);
      }
      save();
    }

    function decide(nowMs, error, io) {
      const absolute = Math.abs(error);
      if (phase === 'verify') {
        const before = lastCorrection?.before ?? error;
        learn(error);
        phase = 'observe';
        if (Math.abs(error) <= LOCK_SEC) { failures = 0; }
        else if (lastCorrection?.kind !== 'unscheduled' && Math.abs(error) > Math.abs(before) * .7) {
          failures++; stats.failures++;
          cooldownUntil = nowMs + BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, failures - 1)];
          reason = 'correction-did-not-improve-backoff';
          return;
        }
      }
      if (absolute <= (locked ? UNLOCK_SEC : LOCK_SEC)) {
        if (!locked) lockedAt = nowMs;
        locked = true; reason = 'locked'; return;
      }
      locked = false;
      if (failures >= MAX_FAILURES) { phase = 'suspended'; reason = 'auto-correction-suspended'; return; }
      if (nowMs < cooldownUntil) { reason = 'correction-cooldown'; return; }
      if (absolute > MAX_AUTO_SEC) { reason = 'displacement-needs-transport-seek'; return; }
      const rate = absolute <= 2.5 ? rateFor(io, error) : null;
      if (rate !== null) return startRate(nowMs, error, io, rate);
      if (error < 0 && absolute <= 4) return startHold(nowMs, error, io);
      return startRejoin(nowMs, error, io);
    }

    // io: {now, target(nowMs), current, state, baseRate, availableRates, buffered, seek, pause, play, rate}
    function tick(next, nowMs, io) {
      if (next !== scope) reset(next, 'scope-change', io);
      // Timers give precision; the tick is the backstop when timers are throttled.
      if (job?.dueAt !== undefined && nowMs >= job.dueAt) {
        if (job.kind === 'rate') endRate(io); else release(io, job.kind + '-released');
      }
      if (job?.kind === 'rejoin' && job.dueAt === undefined) superviseRejoin(nowMs, io);
      else if (job?.kind === 'rate') superviseRate(nowMs, io);
      if (job) return {owned: true, reason, phase};
      const state = io.state();
      // While the reference source itself buffers, the target is not trustworthy.
      if (state === 1 && io.sourceBuffering?.()) { samples = []; last = null; reason = 'source-buffering'; return {owned: false, reason, phase}; }
      if (state !== 1) { samples = []; last = null; reason = state === 3 ? 'buffering' : 'awaiting-playing'; return {owned: false, reason, phase}; }
      const current = projected(nowMs, io.current(), io.baseRate), target = io.target(nowMs);
      if (!Number.isFinite(current) || !Number.isFinite(target)) { reason = 'invalid-sample'; return {owned: false, reason, phase}; }
      if (phase === 'verify' && nowMs < cooldownUntil) { last = {nowMs, current, target}; return {owned: false, reason: 'settling', phase}; }
      const error = sample(nowMs, current, target, io.baseRate);
      if (error !== null) decide(nowMs, error, io);
      return {owned: !!job, reason, phase};
    }

    // Sync me / transport rejoin while the room is playing: same landing-aware path.
    function rejoinNow(nowMs, io, why = 'manual') {
      intent(why, io);
      const error = io.target(nowMs) - projected(nowMs, io.current(), io.baseRate);
      if (Math.abs(error) <= LOCK_SEC && io.state() === 1) { reason = 'already-aligned'; return false; }
      // A small transport hop (e.g. a republished source anchor) is ordinary
      // drift: observe it and pick the gentlest verified strategy instead.
      // A freshly hydrated source has no evidence yet and is aligned outright.
      if ((why === 'transport' || why === 'reclaim') && Math.abs(error) <= 2.5) { reason = 'transport-hop-observe'; return false; }
      const rate = why === 'manual' && Math.abs(error) <= 2.5 ? rateFor(io, error) : null;
      if (rate !== null) startRate(nowMs, error, io, rate);
      else if (error < 0 && Math.abs(error) <= 4) startHold(nowMs, error, io);
      else startRejoin(nowMs, error, io, why);
      return true;
    }

    function snapshot() {
      return {phase, reason, locked, lockedForMs: locked && lockedAt >= 0 ? null : 0, failures,
        model: {releaseLatencyMs: Math.round(model.releaseLatencySec * 1000), leadMs: Math.round(model.leadSec * 1000),
          landingErrorMs: Math.round(model.landingErrorSec * 1000), landingMs: Math.round(model.landingSec * 1000), rateHonored: model.rateHonored, rateGain: Math.round(model.rateGain * 100) / 100},
        ...stats, owned: !!job};
    }

    return {tick, intent, reset, owns, rejoinNow, snapshot, observePosition, correcting: () => !!job};
  }

  globalThis.WatchFusionViewerSyncArbiter = {createViewerSyncArbiter, MODEL_KEY};
  globalThis.watchFusionViewerArbiter = createViewerSyncArbiter({
    store: typeof storage === 'object' ? storage : null,
    timers: {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}
  });
})();
