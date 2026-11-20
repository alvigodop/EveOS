/* v13.10.7: Locked is the outer bound, 0 ms is the goal.
 * Inside the 100 ms band, every room member (host included) walks its own measured offset toward 0 ms
 * with tiny, verified playback-rate pulses. Never a seek, never a pause, never on a fixed-rate player.
 *
 * Why this is gated on the device's OWN measurement stability and not on the room reference uncertainty:
 * every member computes its target from the same shared reference, so the reference uncertainty is common
 * to all of them. It limits absolute accuracy, not how closely members match each other (which is what is
 * heard). Drift's 10-minute trace: host steady at -50 +/-2 ms, phone +30..+60, while the reference was
 * +/-75..115 ms; the old gate (error > reference uncertainty) parked both at the edges, ~95 ms apart.
 * This is player-timeline alignment, not a speaker-latency measurement.
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionZeroConverge) return;
  const PERIOD_MS = 250, WINDOW_MS = 2400, MIN_SAMPLES = 8, MIN_SPAN_MS = 1800;
  const ENTER_MS = 16, OUTER_MS = 100, MAX_MAD_MS = 9, MAX_SPREAD_MS = 40;
  const GAIN = .7, MIN_PULSE_MS = 60, MAX_PULSE_MS = 420, SETTLE_MS = 2200, MAX_STRIKES = 3, MAX_REF_UNCERTAINTY_MS = 125;
  let scope = '', samples = [], pulse = null, settleUntil = 0, lastAt = -Infinity, strikes = 0, pending = null;
  let reason = 'idle', pulses = 0, lastErrorMs = null, medianMs = null, madMs = null, notedAt = -Infinity;
  // A rejection is per device; test capability once on a new video, never blindly.
  let hostProbeVideo = '', hostProbeUsed = false, hostProbeProven = false;
  const now = () => performance.now();
  const median = v => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function readRate() { try { return Number(ytPlayer?.getPlaybackRate?.()); } catch { return NaN; } }
  function release(why) {
    const p = pulse; if (!p) return;
    pulse = null; clearTimeout(p.timer); lastAt = now(); settleUntil = lastAt + SETTLE_MS;
    try { if (Math.abs(readRate() - p.rate) < .015) ytPlayer.setPlaybackRate(p.base); } catch {}
    reason = why;
  }
  function reset(next, why) { release('interrupted'); scope = next; samples = []; strikes = 0; pending = null; pulses = 0; settleUntil = 0; medianMs = madMs = null; reason = why; }
  const isApplying = () => !!pulse || now() - lastAt < 600;
  function eligible() {
    if (document.hidden || !roomId || !state?.source?.videoId || !state.playback || state.playback.paused || state.playback.ended) return 'not-playing';
    if (!ytPlayer || !ytPlayerReady || playerInitializing || primingPlayer) return 'player-not-ready';
    if (ytPlayer.getPlayerState?.() !== 1 || ytPlayer.getVideoData?.()?.video_id !== state.source.videoId) return 'player-not-playing';
    if (window.watchFusionViewerArbiter?.owns?.() || window.watchFusionHostZeroCenter?.isApplying?.()) return 'other-correction-active';
    if (window.watchFusionPlayout?.sourceBuffering?.()) return 'source-buffering';
    const c = window.watchFusionPlayout?.status?.();
    if (state.linkedSourceActive === true && (!c || c.source !== 'live' || c.authorityBuffering)) return 'reference-not-live';
    if (c?.mirrorContradicted || window.WatchFusionMirrorConvergenceGate?.contradicted?.()) return 'mirror-contradicted';
    if (c && Number.isFinite(c.uncertaintyMs) && c.uncertaintyMs > MAX_REF_UNCERTAINTY_MS) return 'reference-too-uncertain';
    // Only the linked-source laptop host: do not disturb an established lock or use a rejected rate capability.
    if (typeof isHost === 'function' && isHost() && state.linkedSourceActive === true) {
      const a = window.watchFusionViewerArbiter?.snapshot?.();
      if (hostProbeVideo !== state.source.videoId) { hostProbeVideo = state.source.videoId; hostProbeUsed = false; hostProbeProven = false; }
      if (a?.model?.rateHonored === false && hostProbeUsed && !hostProbeProven && !pending?.hostProbe) return 'host-rate-rejected';
      // Locked-band pulses are considered later, only after agreement with the arbiter's independent clock.
    }
    return '';
  }
  function tick() {
    const p = state?.playback;
    const next = roomId && p && state?.source?.videoId ? [roomId, state.source.videoId, state.presentationEpoch, state.playoutSegment].join(':') : '';
    if (next !== scope) reset(next, 'new-scope');
    const at = now();
    if (pulse) {
      // The exploratory host pulse must stop if the source or clock becomes unsafe.
      if (pulse.hostProbe && (state?.playback?.paused || state?.playback?.ended ||
          window.watchFusionPlayout?.sourceBuffering?.() ||
          window.WatchFusionMirrorConvergenceGate?.contradicted?.() === true)) {
        release('host-rate-recheck-interrupted'); pending=null; strikes=MAX_STRIKES; return;
      }
      if (at - pulse.at > 300 && Math.abs(readRate() - pulse.rate) > .015) { release('rate-not-accepted'); strikes = MAX_STRIKES; }
      return;
    }
    const blocked = eligible();
    if (blocked) {
      if (blocked.startsWith('host-') && blocked !== reason)
        window.watchFusionRoomSyncLog?.note?.('host-zero-pulse-gated', {reason:blocked});
      samples = []; reason = blocked; return;
    }
    const base = Math.min(2, Math.max(.25, Number(p.rate) || 1));
    if (Math.abs(readRate() - base) > .015) { samples = []; reason = 'manual-or-foreign-rate'; return; }
    const position = Number(ytPlayer.getCurrentTime?.());
    const target = Number(window.watchFusionYouTubeTarget?.(estimatedServerNow(), ytPlayer.getDuration?.()));
    if (!Number.isFinite(position) || !Number.isFinite(target)) { samples = []; reason = 'no-target'; return; }
    const errorMs = (target - position) * 1000; lastErrorMs = Math.round(errorMs);
    if (at < settleUntil) { samples = []; reason = 'settling'; return; }
    samples.push({at, e: errorMs}); samples = samples.filter(s => at - s.at <= WINDOW_MS);
    if (samples.length < MIN_SAMPLES || at - samples[0].at < MIN_SPAN_MS) { reason = 'measuring'; return; }
    const values = samples.map(s => s.e), m = median(values), mad = median(values.map(v => Math.abs(v - m)));
    medianMs = Math.round(m); madMs = Math.round(mad);
    if (pending) { // verify real phase improvement; a rate getter alone cannot prove the actuator.
      if (pending.hostProbe) {
        const improved = Math.abs(pending.before) - Math.abs(m);
        hostProbeProven = improved >= 25 && Math.abs(m) <= Math.abs(pending.before) * .7
          && window.WatchFusionMirrorConvergenceGate?.contradicted?.() !== true;
        strikes = hostProbeProven ? 0 : MAX_STRIKES;
        window.watchFusionRoomSyncLog?.note?.('host-zero-rate-recheck-verified',
          {result:hostProbeProven?'measured-improvement':'rejected',beforeMs:Math.round(pending.before),afterMs:Math.round(m)});
      } else if (Math.abs(m) > Math.abs(pending.before) * .85 && Math.abs(m) > ENTER_MS) strikes++; else strikes = 0;
      pending = null;
    }
    if (strikes >= MAX_STRIKES) { reason = 'paused-rate-not-effective'; return; }
    if (Math.abs(m) <= ENTER_MS) { reason = 'zero-band'; return; }
    // Never chase a different clock domain: the primary arbiter must agree in
    // direction and within 20ms of this controller's median, on the same tick.
    if (typeof isHost === 'function' && isHost() && state.linkedSourceActive === true) {
      const a = window.watchFusionViewerArbiter?.snapshot?.();
      if (a?.locked && a.lockedForMs >= 1800) {
        const c = window.watchFusionPlayout?.status?.(), age=at-Number(a.timelineObservedAtMs);
        if (Math.abs(m)<24 || Math.abs(m)>50 || a.model?.rateHonored===false ||
            c?.reference!=='linked-tab' || c?.source!=='live' ||
            !Number.isFinite(c.uncertaintyMs) || c.uncertaintyMs>25 ||
            window.WatchFusionMirrorConvergenceGate?.contradicted?.()===true ||
            !Number.isFinite(a.timelineErrorMs) || !Number.isFinite(a.timelineObservedAtMs) ||
            age<0 || age>600 || Math.sign(a.timelineErrorMs)!==Math.sign(m) ||
            Math.abs(a.timelineErrorMs-m)>20) {reason='host-locked-dual-clock-unverified';return;}
      }
    }
    if (Math.abs(m) > OUTER_MS) { reason = 'outside-fine-band'; return; }
    if (mad > MAX_MAD_MS || Math.max(...values) - Math.min(...values) > MAX_SPREAD_MS) { reason = 'measurement-jitter'; return; }
    const rates = (ytPlayer.getAvailablePlaybackRates?.() || []).filter(r => Number.isFinite(r) && Math.sign(r - base) === Math.sign(m)
      && Math.abs(r - base) >= .03 && Math.abs(r - base) <= .26).sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
    const a = typeof isHost === 'function' && isHost() && state.linkedSourceActive === true
      ? window.watchFusionViewerArbiter?.snapshot?.() : null;
    const hostProbe = a?.model?.rateHonored === false && !hostProbeProven;
    if (!rates.length) { if (hostProbe) hostProbeUsed=true; reason = hostProbe?'host-rate-recheck-unavailable':'fixed-rate-player'; return; }
    if (hostProbe && (hostProbeUsed || window.WatchFusionMirrorConvergenceGate?.contradicted?.() === true)) {
      reason = hostProbeUsed?'host-rate-recheck-exhausted':'host-mirror-contradicted'; return;
    }
    // A 420ms trial must be capable of at least 30ms progress; no pointless tiny rate perturbation.
    const rate = hostProbe ? rates.find(r => Math.abs(r-base)*MAX_PULSE_MS >= 30) : rates[0];
    if (rate == null) { if (hostProbe) hostProbeUsed=true; reason='host-rate-recheck-unavailable'; return; }
    const durationMs = Math.round(Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, Math.abs(m) * GAIN / Math.abs(rate - base))));
    if (hostProbe) hostProbeUsed = true;
    try { ytPlayer.setPlaybackRate(rate); } catch { strikes = MAX_STRIKES; reason = 'rate-change-failed'; return; }
    pulse = {rate, base, at, hostProbe, timer: setTimeout(() => release('pulse-complete'), durationMs)};
    pending = {before: m, hostProbe}; samples = []; pulses++; lastAt = at; reason = hostProbe?'host-rate-recheck-pulse':'converging-to-zero';
    if (at - notedAt > 15000) { notedAt = at; window.watchFusionRoomSyncLog?.note?.('zero-converge-pulse', {errorMs: Math.round(m), rate, durationMs}); } // v13.10.8g: m is the error, never a position
  }
  setInterval(() => { try { tick(); } catch { reset('', 'converge-error'); } }, PERIOD_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset('', 'page-hidden'); });
  window.WatchFusionZeroConverge = {version: 'v13.10.7', isApplying,
    diagnostics: () => ({reason, pulses, strikes, errorMs: lastErrorMs, medianMs, madMs, active: !!pulse,
      hostRateRecheck: {used:hostProbeUsed,measuredImprovement:hostProbeProven}})};
})();
