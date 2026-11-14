/* WatchFusion: one correction must demonstrate progress before another is trusted. */
(() => {
  function createSeekHealth() {
    let scope = '', pending = null, cooldownUntil = 0, failures = 0;
    let previous = null, advancingSince = -1, reason = 'new-source';
    let overshoots = 0, rejected = 0, corrections = 0;
    let phaseAt = -1, phaseBias = null, phaseWindow = [], referenceHoldUntil = 0;
    // keyframe-recovery-v5: recover from a real multi-second lag after the old
    // seek governor exhausts its budget, but never restart an uncontrolled loop.
    let largeLagSamples = [], failedLandingSec = 0;
    let lastRescueAt = -Infinity, rescueCount = 0, rescueBiasSec = 0;
    // Use a separate, limited budget for sustained residual drift below the hard-seek threshold.
    let fineCount = 0, lastFineAt = -Infinity, landingResidualSec = 0;
    const FINE_MIN = .7, FINE_MAX = 1.5, FINE_GAP_MS = 15000;
    function reset(nextScope = '') {
      scope = nextScope; pending = previous = null; cooldownUntil = 0;
      advancingSince = -1; failures = overshoots = rejected = corrections = 0;
      phaseAt = -1; phaseBias = null; phaseWindow = []; referenceHoldUntil = 0;
      largeLagSamples = []; failedLandingSec = 0;
      lastRescueAt = -Infinity; rescueCount = 0; rescueBiasSec = 0;
      fineCount = 0; lastFineAt = -Infinity; landingResidualSec = 0;
      reason = 'new-source';
    }
    function observe({scope:next, nowMs, current, drift, target, rate = 1, playing, buffering}) {
      if (next !== scope) reset(next);
      if (![nowMs, current, drift].every(Number.isFinite)) { reason = 'invalid-player-sample'; return; }
      if (pending && Number.isFinite(target) && Math.abs(target - pending.target - (nowMs - pending.at) * rate / 1000) > .25) pending = null;
      if (pending && nowMs - pending.at >= 9000) {
        if (playing && !buffering) learnLanding(drift);
        fail(nowMs, 'unconfirmed-seek-backoff', 18000);
      }
      if (buffering || !playing) {
        largeLagSamples = [];
        // A buffering transition invalidates the previous phase baseline.
        if (buffering || previous) { phaseAt = -1; phaseBias = null; phaseWindow = []; }
        previous = null; advancingSince = -1;
        if (pending) pending.playingAfter = false;
        if (nowMs >= cooldownUntil) reason = buffering ? 'buffering' : 'not-playing';
        return;
      }
      const elapsed = previous ? nowMs - previous.at : Infinity;
      if (elapsed === 0) return;
      const delta = previous ? current - previous.current : 0;
      const progressing = elapsed > 0 && elapsed <= 1500 && delta > 0.001 && delta < elapsed / 1000 * 1.8 + .08;
      if (progressing) {
        if (advancingSince < 0) advancingSince = previous.at;
        if (pending && nowMs - advancingSince >= 650) pending.playingAfter = true;
      } else { advancingSince = -1; if (pending) pending.playingAfter = false; }
      // Target-position jumps without a changed room segment can be a transient
      // reference rebasing, not physical viewer lag. Never chase them immediately.
      if (previous && progressing && Number.isFinite(target) && Number.isFinite(previous.target)) {
        const expected = previous.target + (nowMs - previous.at) * rate / 1000;
        if (Math.abs(target - expected) > .32) {
          referenceHoldUntil = nowMs + 7000;
          phaseBias = null; phaseWindow = []; reason = 'room-reference-jump-hold';
        }
      }
      previous = {at:nowMs, current, target};
      // A TV can have a stable, genuinely bad 2-3 second offset. v4 correctly
      // protects small phase biases, but may never retry after two failed seeks.
      if (progressing && !pending && nowMs >= referenceHoldUntil &&
          Math.abs(drift) >= 1.5 && Math.abs(drift) <= 8) {
        largeLagSamples.push({at:nowMs, drift});
        largeLagSamples = largeLagSamples.filter(s => nowMs - s.at <= 9000).slice(-32);
      } else if (elapsed > 0) largeLagSamples = [];
      if (phaseAt < 0) phaseAt = nowMs;
      if (progressing && !pending && nowMs >= referenceHoldUntil) {
        phaseWindow.push({at:nowMs, drift});
        phaseWindow = phaseWindow.filter(item => nowMs - item.at <= 3500).slice(-12);
        if (phaseBias === null && phaseWindow.length >= 5 &&
            phaseWindow.at(-1).at - phaseWindow[0].at >= 850) {
          const values = phaseWindow.map(item => item.drift).sort((a,b)=>a-b);
          const median = values[Math.floor(values.length / 2)];
          if (values.at(-1) - values[0] <= .16 && Math.abs(median) <= .65) {
            phaseBias = median; reason = 'post-resume-phase-locked';
          } else if (values.at(-1) - values[0] <= .16 && Math.abs(median) >= FINE_MIN && Math.abs(median) < FINE_MAX
              && fineCount >= 2 && nowMs >= cooldownUntil) {
            reason = 'residual-budget-used';
          }
        }
      }
      if (!pending && failures && Math.abs(drift) < .09 && advancingSince >= 0 && nowMs - advancingSince >= 2500) failures = 0;
      if (pending && nowMs - pending.at >= 2100 && pending.playingAfter) {
        const before = Math.abs(pending.before), after = Math.abs(drift);
        const opposite = Math.sign(drift) !== Math.sign(pending.before) && after >= .20;
        const improved = after <= Math.max(.14, before * .60);
        if (improved && !opposite) {
          learnFineLanding(drift);
          failures = 0; cooldownUntil = Math.max(cooldownUntil, nowMs + 6500);
          reason = 'correction-improved'; pending = null; failedLandingSec = 0;
        } else if (opposite || nowMs - pending.at >= 4200) {
          learnFineLanding(drift);
          learnLanding(drift);
          overshoots += Number(opposite);
          fail(nowMs, opposite ? 'seek-overshoot-backoff' : 'ineffective-seek-backoff', 12000);
        }
      }
    }
    function learnFineLanding(drift) {
      if (!pending.fine) return;
      landingResidualSec = pending.before > 0 && drift >= FINE_MIN && drift <= 2
        && drift < pending.before * 1.3 ? drift : 0;
    }
    function learnLanding(drift) {
      if (pending.playingAfter && !pending.recovery && pending.before > 0 && drift >= 1.5 && drift <= 5) {
        failedLandingSec = drift;
      } else if (!pending.recovery || drift < 0) {
        failedLandingSec = 0;
      }
    }
    function fail(nowMs, outcome, minimum) {
      failures = Math.min(3, failures + 1);
      cooldownUntil = Math.max(cooldownUntil, nowMs + Math.min(45000, minimum * 2 ** (failures - 1)));
      reason = outcome;
      pending = null;
    }
    function credibleLargeLag(nowMs, drift) {
      if (failures < 2 || pending || nowMs < cooldownUntil || nowMs - lastRescueAt < 90000 ||
          nowMs < referenceHoldUntil || Math.abs(drift) < 1.5 || Math.abs(drift) > 8) return false;
      const recent = largeLagSamples.filter(s => nowMs - s.at <= 9000).slice(-18);
      if (recent.length < 6 || nowMs - recent.at(-1).at > 750 || recent.at(-1).at - recent[0].at < 2500) return false;
      const values = recent.map(s => s.drift), sign = Math.sign(drift);
      return values.every(v => Math.sign(v) === sign && Math.abs(v - drift) < .22) &&
        Math.max(...values) - Math.min(...values) <= .22;
    }
    function credibleFineLag(nowMs, drift) {
      if (pending || nowMs < cooldownUntil || nowMs < referenceHoldUntil ||
          fineCount >= 2 || nowMs - lastFineAt < FINE_GAP_MS ||
          phaseAt < 0 || nowMs - phaseAt < 5000 ||
          advancingSince < 0 || nowMs - advancingSince < 2000 ||
          Math.abs(drift) < FINE_MIN || Math.abs(drift) >= FINE_MAX) return false;
      const recent = phaseWindow.filter(item => nowMs - item.at <= 3500).slice(-12);
      if (recent.length < 6 || nowMs - recent.at(-1).at > 750 || recent.at(-1).at - recent[0].at < 1750) return false;
      const values = recent.map(item => item.drift), sign = Math.sign(drift);
      return values.every(value => Math.sign(value) === sign && Math.abs(value - drift) <= .16) &&
        Math.max(...values) - Math.min(...values) <= .16;
    }
    function canRetry(nowMs) {
      const normal = failures === 1 && !pending && nowMs >= cooldownUntil &&
        advancingSince >= 0 && nowMs - advancingSince >= 2500;
      return normal || credibleLargeLag(nowMs, largeLagSamples.at(-1)?.drift ?? 0) ||
        credibleFineLag(nowMs, phaseWindow.at(-1)?.drift ?? 0);
    }
    function fineAction(action) {
      return action === 'stable-seek' || action === 'buffered-seek';
    }
    function seekTarget({nowMs, current, target, action}) {
      const drift = target - current;
      if (fineAction(action) && fineCount === 1 && credibleFineLag(nowMs, drift) && drift > 0 && landingResidualSec >= FINE_MIN) {
        // Only compensate a same-direction residual observed after an earlier seek.
        // No speculative lead on the first attempt, and never chase small offsets.
        return target + Math.min(.9, landingResidualSec * .65);
      }
      if (action !== 'hard-seek' || !credibleLargeLag(nowMs, drift)) return target;
      const residual = target - current;
      // YouTube's seekTo can land at the preceding keyframe. Only a confirmed
      // failed, same-direction landing warrants a bounded lead compensation.
      if (residual <= 0 || failedLandingSec < 1.5) return target;
      return target + Math.min(2.5, failedLandingSec * .85);
    }
    function permit({scope:next, nowMs, current, target, action}) {
      if (next !== scope) reset(next);
      if (![nowMs, current, target].every(Number.isFinite) || Math.abs(target - current) > 1800) {
        rejected++; reason = 'implausible-player-position'; return false;
      }
      const drift = target - current;
      const recovering = action === 'hard-seek' && credibleLargeLag(nowMs, drift);
      const refining = fineAction(action) && credibleFineLag(nowMs, drift);
      if (pending || nowMs < cooldownUntil || (failures >= 2 && !recovering && !refining)) {
        rejected++; return false;
      }
      if (nowMs < referenceHoldUntil) {
        rejected++; reason = 'untrusted-reference-transition'; return false;
      }
      if (Math.abs(drift) >= .65 && Math.abs(drift) < FINE_MIN) {
        rejected++; reason = 'near-aligned-no-seek'; return false;
      }
      if (Math.abs(drift) >= FINE_MIN && Math.abs(drift) < FINE_MAX && !refining) {
        rejected++; reason = fineCount >= 2 ? 'residual-budget-used' : 'residual-awaiting-safe-window'; return false;
      }
      if (refining) return true;
      if (Math.abs(drift) < FINE_MIN && phaseBias !== null) {
        // A stable sub-second bias after Pause->Play may already sound aligned.
        // Without acoustic evidence, seeking toward that bias can destroy sync.
        const delta = drift - phaseBias;
        const recent = phaseWindow.slice(-3);
        const confirmed = recent.length === 3 && recent.every(item => nowMs - item.at <= 1500 &&
          Math.abs(item.drift - phaseBias) >= .45 && Math.sign(item.drift - phaseBias) === Math.sign(delta));
        if (Math.abs(delta) < .45 || !confirmed) {
          rejected++; reason = 'stable-post-resume-phase'; return false;
        }
      } else if (Math.abs(drift) < FINE_MIN && (phaseAt < 0 || nowMs - phaseAt < 5000)) {
        rejected++; reason = 'post-resume-observation'; return false;
      }
      if (action !== 'hard-seek' && (advancingSince < 0 || nowMs - advancingSince < 650)) {
        rejected++; reason = 'awaiting-steady-progress'; return false;
      }
      return true;
    }
    function record({scope:next, nowMs, current, target, action, requested}) {
      if (next !== scope) reset(next);
      if (action === 'manual-sync') {
        pending = null; cooldownUntil = 0; failures = 0; largeLagSamples = []; failedLandingSec = 0;
        phaseAt = nowMs; phaseBias = null; phaseWindow = []; referenceHoldUntil = 0;
        fineCount = 0; lastFineAt = -Infinity; landingResidualSec = 0;
        reason = 'explicit-sync'; return;
      }
      const recovery = action === 'hard-seek' && credibleLargeLag(nowMs, target - current);
      if (recovery) {
        rescueBiasSec = (requested ?? seekTarget({nowMs, current, target, action})) - target;
        lastRescueAt = nowMs; rescueCount++;
      }
      const fine = fineAction(action) && credibleFineLag(nowMs, target - current);
      if (fine) {
        fineCount++; lastFineAt = nowMs;
        phaseBias = null; phaseWindow = []; phaseAt = nowMs;
      }
      largeLagSamples = [];
      pending = {at:nowMs, before:target-current, target, playingAfter:false, recovery, fine};
      cooldownUntil = Math.max(cooldownUntil, nowMs + 6500);
      corrections++; reason = fine ? 'fine-rejoin-awaiting-proof' : 'seek-awaiting-proof';
    }
    function snapshot(nowMs = (typeof performance === 'object' ? performance.now() : 0)) {
      return {reason, pending:!!pending, attempts:corrections, failures, overshoots,
        rejected, recoveryAttempts:rescueCount, lastRecoveryBiasMs:Math.round(rescueBiasSec*1000),
        fineAttempts:fineCount, lastFineAtMs:lastFineAt >= 0 ? Math.round(lastFineAt) : null,
        landingResidualMs:Math.round(landingResidualSec * 1000),
        pendingRecovery:credibleLargeLag(nowMs, largeLagSamples.at(-1)?.drift ?? 0),
        phaseBiasMs: phaseBias === null ? null : Math.round(phaseBias * 1000),
        referenceHoldMs:Math.max(0,Math.round(referenceHoldUntil-nowMs)),
        cooldownRemainingMs:Math.max(0, Math.round(cooldownUntil - nowMs))};
    }
    return {reset, observe, permit, record, snapshot, canRetry, seekTarget};
  }
  globalThis.WatchFusionSeekHealth = {createSeekHealth};
  globalThis.watchFusionSeekHealth = createSeekHealth();
})();
