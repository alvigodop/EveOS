/* WatchFusion: evidence-gated, rate-first catch-up for non-host YouTube viewers.
 * Do not use arbitrary YouTube playback rates: the API may silently round them.
 * A small, stable drift must never cause a network-backed seek by itself.
 */
(() => {
  'use strict';
  function createGentleCatchup() {
    let scope = '', samples = [], active = null;
    let cooldownUntil = 0, rejoined = false, fallbackSince = -1, lastResult = 'idle';
    const BASE_TOLERANCE = .20, STOP = .16;
    const rejectedRates = new Set();
    const BURST_MAX_MS = 6000, BURST_COOLDOWN_MS = 7500;
    const RETRY_COOLDOWN_MS = 22000;
    const numbers = entries => entries.map(s => s.drift).sort((a, b) => a - b);
    function reset(next = '') {
      scope = next; samples = []; active = null;
      cooldownUntil = 0; rejoined = false; rejectedRates.clear(); fallbackSince = -1; lastResult = 'new-room-or-source';
    }
    function output(baseRate, reason, hold = false, bufferedRejoin = false, rate = baseRate) {
      lastResult = reason;
      return {rate, hold, bufferedRejoin, reason, active: !!active};
    }
    function supportedRate(player, baseRate, direction) {
      const all = player?.getAvailablePlaybackRates?.();
      if (!Array.isArray(all)) return null;
      const eligible = all.filter(value => Number.isFinite(value) && value > 0 && !rejectedRates.has(value) &&
        (direction > 0 ? value > baseRate + .001 && value <= baseRate * 1.26
                       : value < baseRate - .001 && value >= baseRate * .74));
      return eligible.sort((a, b) => Math.abs(a - baseRate) - Math.abs(b - baseRate))[0] ?? null;
    }
    function plan({scope:next, nowMs, drift, baseRate, player, playable, buffering}) {
      if (next !== scope) reset(next);
      if (!Number.isFinite(nowMs) || !Number.isFinite(drift) || !Number.isFinite(baseRate) || baseRate <= 0)
        return output(baseRate, 'invalid-phase-sample');
      if (!playable || buffering) {
        if (active) cooldownUntil = nowMs + BURST_COOLDOWN_MS;
        active = null; samples = []; fallbackSince = -1;
        return output(baseRate, 'waiting-for-advancing-buffered-player');
      }
      if (active) {
        const elapsed = nowMs - active.at;
        const measuredRate = Number(player?.getPlaybackRate?.());
        if (elapsed > 1400 && (!Number.isFinite(measuredRate) || Math.abs(measuredRate - active.rate) > .015)) {
          rejectedRates.add(active.rate);
          active = null; samples = []; cooldownUntil = nowMs + RETRY_COOLDOWN_MS;
          return output(baseRate, 'rate-not-accepted-backoff', true);
        }
        if (Math.abs(drift) <= STOP || Math.sign(drift) !== active.direction ||
            elapsed >= BURST_MAX_MS || Math.abs(drift) > Math.abs(active.startDrift) + .23) {
          const improved = Math.abs(drift) + .07 < Math.abs(active.startDrift);
          if (!improved) rejectedRates.add(active.rate);
          active = null; samples = [];
          cooldownUntil = nowMs + (improved ? BURST_COOLDOWN_MS : RETRY_COOLDOWN_MS);
          return output(baseRate, improved ? 'rate-catchup-improved' : 'rate-catchup-rejected', true);
        }
        return output(baseRate, 'gentle-rate-converging', true, false, active.rate);
      }
      if (Math.abs(drift) <= BASE_TOLERANCE) {
        samples = []; fallbackSince = -1; rejoined = false;
        return output(baseRate, 'near-synchronized', true);
      }
      if (Math.abs(drift) > 1.5 && supportedRate(player,baseRate,Math.sign(drift)) === null) {
        fallbackSince = -1;
        return output(baseRate,'large-lag-existing-guarded-recovery');
      }
      // Avoid counting duplicate timer ticks or stale intervals as corroboration.
      if (!samples.length || nowMs > samples.at(-1).at + 150) samples.push({at:nowMs, drift});
      samples = samples.filter(item => nowMs - item.at <= 3500).slice(-12);
      if (nowMs < cooldownUntil) return output(baseRate, 'catchup-cooldown', true);
      if (samples.length < 3 || samples.at(-1).at - samples[0].at < 900)
        return output(baseRate, 'observing-sustained-200ms-drift', true);
      const values = numbers(samples);
      const median = values[Math.floor(values.length / 2)];
      const stable = values.at(-1) - values[0] <= .18 &&
        values.every(value => Math.sign(value) === Math.sign(median));
      if (!stable) { samples = []; fallbackSince = -1; return output(baseRate, 'rejecting-unstable-phase', true); }
      const rate = supportedRate(player, baseRate, Math.sign(median));
      if (rate !== null) {
        fallbackSince = -1; active = {at:nowMs, startDrift:drift, direction:Math.sign(median), rate};
        samples = [];
        return output(baseRate, 'gentle-rate-converging', true, false, rate);
      }
      // A player without a usable speed gets one buffered seek until it
      // reaches the tolerance band or the room starts a new segment.
      if (fallbackSince < 0) fallbackSince = nowMs;
      const rejoin = !rejoined && Math.abs(median) >= .75 && nowMs - fallbackSince >= 5200;
      return output(baseRate, rejoin ? 'buffered-rejoin-eligible' : 'rate-unavailable-keep-playing', true, rejoin);
    }
    return {plan, reset, noteBufferedRejoin: () => { rejoined = true; }, snapshot: () => ({scope, active:!!active, reason:lastResult, cooldownUntil})};
  }
  globalThis.WatchFusionGentleCatchup = {createGentleCatchup};
  globalThis.watchFusionGentleCatchup = createGentleCatchup();
})();
