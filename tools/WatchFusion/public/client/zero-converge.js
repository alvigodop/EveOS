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
    if (c && Number.isFinite(c.uncertaintyMs) && c.uncertaintyMs > MAX_REF_UNCERTAINTY_MS) return 'reference-too-uncertain';
    return '';
  }
  function tick() {
    const p = state?.playback;
    const next = roomId && p && state?.source?.videoId ? [roomId, state.source.videoId, state.presentationEpoch, state.playoutSegment].join(':') : '';
    if (next !== scope) reset(next, 'new-scope');
    const at = now();
    if (pulse) {
      if (at - pulse.at > 300 && Math.abs(readRate() - pulse.rate) > .015) { release('rate-not-accepted'); strikes = MAX_STRIKES; }
      return;
    }
    const blocked = eligible();
    if (blocked) { samples = []; reason = blocked; return; }
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
    if (pending) { // verify the previous pulse: it must have moved the offset toward 0
      if (Math.abs(m) > Math.abs(pending.before) * .85 && Math.abs(m) > ENTER_MS) strikes++; else strikes = 0;
      pending = null;
    }
    if (strikes >= MAX_STRIKES) { reason = 'paused-rate-not-effective'; return; }
    if (Math.abs(m) <= ENTER_MS) { reason = 'zero-band'; return; }
    if (Math.abs(m) > OUTER_MS) { reason = 'outside-fine-band'; return; }
    if (mad > MAX_MAD_MS || Math.max(...values) - Math.min(...values) > MAX_SPREAD_MS) { reason = 'measurement-jitter'; return; }
    const rates = (ytPlayer.getAvailablePlaybackRates?.() || []).filter(r => Number.isFinite(r) && Math.sign(r - base) === Math.sign(m)
      && Math.abs(r - base) >= .03 && Math.abs(r - base) <= .26).sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
    if (!rates.length) { reason = 'fixed-rate-player'; return; }
    const rate = rates[0], durationMs = Math.round(Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, Math.abs(m) * GAIN / Math.abs(rate - base))));
    try { ytPlayer.setPlaybackRate(rate); } catch { strikes = MAX_STRIKES; reason = 'rate-change-failed'; return; }
    pulse = {rate, base, at, timer: setTimeout(() => release('pulse-complete'), durationMs)};
    pending = {before: m}; samples = []; pulses++; lastAt = at; reason = 'converging-to-zero';
    if (at - notedAt > 15000) { notedAt = at; window.watchFusionRoomSyncLog?.note?.('zero-converge-pulse', {positionMs: Math.round(m)}); }
  }
  setInterval(() => { try { tick(); } catch { reset('', 'converge-error'); } }, PERIOD_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset('', 'page-hidden'); });
  window.WatchFusionZeroConverge = {version: 'v13.10.7', isApplying,
    diagnostics: () => ({reason, pulses, strikes, errorMs: lastErrorMs, medianMs, madMs, active: !!pulse})};
})();
