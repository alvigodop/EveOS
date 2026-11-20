/* WatchFusion 8x-r6: pure timeline mathematics and per-viewer drift evidence.
 * No playback commands, DOM mutations, network calls, or speaker-phase inference.
 */
(() => {
  'use strict';
  const median = values => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  function createDriftSensor({windowSize, minSamples, minAgeMs, maxSpreadSec, toleranceSec}) {
    let samples = [];
    const empty = action => ({rawDriftSec:0, filteredDriftSec:0, spreadSec:0,
      sampleCount:0, stable:false, action});
    function reset(action = 'reset') { samples = []; return empty(action); }
    function sample(rawDrift, nowMs, action) {
      samples.push({drift:rawDrift, at:nowMs});
      if (samples.length > windowSize) samples.shift();
      const values = samples.map(item => item.drift);
      const filtered = median(values);
      const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
      const age = samples.length > 1 ? samples.at(-1).at - samples[0].at : 0;
      const sameDirection = values.every(value => Math.abs(value) <= toleranceSec || Math.sign(value) === Math.sign(filtered));
      const stable = values.length >= minSamples && age >= minAgeMs
        && spread <= maxSpreadSec && sameDirection;
      return {rawDriftSec:rawDrift, filteredDriftSec:filtered, spreadSec:spread,
        sampleCount:values.length, stable, action};
    }
    return {reset, sample};
  }

  function chooseRate(io, error, rateHonored) {
    if (rateHonored === false) return null;
    const rates = io.availableRates();
    if (!Array.isArray(rates)) return null;
    const wanted = error > 0 ? rates.filter(r => r > io.baseRate * 1.01 && r <= io.baseRate * 1.26)
      : rates.filter(r => r < io.baseRate * .99 && r >= io.baseRate * .74);
    return wanted.sort((a,b) => Math.abs(a-io.baseRate)-Math.abs(b-io.baseRate))[0] ?? null;
  }
  function observePosition(nowMs, value, held) {
    if (!Number.isFinite(value) || value === held.value) return held;
    return {value, since:nowMs};
  }
  function projectedPosition(nowMs, value, baseRate, held) {
    const age = (nowMs - held.since) / 1000;
    return age > 0 && age < 1.2 ? value + age * baseRate : value;
  }
  function normalizeDelay(value, stepMs, limitMs) {
    const steps = Math.round((Number(value) || 0) / stepMs);
    return Math.max(-limitMs, Math.min(limitMs, steps * stepMs));
  }
  globalThis.WatchFusionTimelineMath = Object.freeze({
    createDriftSensor, chooseRate, observePosition, projectedPosition, normalizeDelay
  });
})();
