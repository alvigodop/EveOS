/* v13.10.7 (+v13.10.8 segment-stable dwell): Terminal recovery for a wedged TV decoder (replaces the v13.10 one-shot rescue).
 * Drift's trace: the TV exhausted its 3-step stall ladder, then sat in BUFFERING for ~60 s and fell
 * 86 s behind while laptop and phone stayed Locked. Only a manual page reload fixed it. The old rescue
 * never fired: it required PLAYING (not BUFFERING) and its dwell restarted every time the linked source
 * status blinked to "frozen" for one report.
 * Ladder, per video segment, only on this device, never moving the room or the other members:
 *   1. one decoder reload at the live room position (loadVideoById)
 *   2. if still wedged, one rebuild of the YouTube player (what the manual reload did)
 * Then it stops and says so. Never runs while the room reference itself is frozen or buffering.
 */
(() => {
  'use strict';
  if (typeof window === 'undefined') return;
  const STALL_DWELL_MS = 6000, BUFFER_DWELL_MS = 9000, MIN_DRIFT_SEC = 2.5, RETRY_AFTER_MS = 15000;
  const TRUST_GRACE_MS = 6000, MAX_REBUILDS_PER_10_MIN = 2;
  // R14v: decoder health is not proof of 0 ms room/speaker phase.  The TV in
  // the November 21 physical run advanced for >3 minutes with a stable ~170 ms
  // player-timeline offset. Give ONE additional decoder budget after a full
  // minute of actual, steady progress; never interpret this as audible lock.
  const HEALED_MS = 60000, HEALTH_PHASE_SEC = .25, HEALTH_PROGRESS_MS = 45000, HEALTH_GAP_MS = 4000;
  const HEALTH_JITTER_SEC = .04, HEAL_REARM_WINDOW_MS = 600000;
  // R14s: a genuinely long room pause may grant ONE new bounded terminal attempt
  // in 10 minutes. Segment churn and brief pause/play cycles never refill this budget.
  const PAUSE_REARM_MS = 20000, REARM_QUIET_MS = 60000, REARM_WINDOW_MS = 600000;
  let scope = '', since = 0, steps = 0, lastStepAt = -Infinity, outcome = 'idle', liveSeenAt = -Infinity, healthySince = 0;
  let healthyAt = -1, healthyPosition = null, healthyProgressMs = 0;
  let pausedAt = -1, wasRoomPaused = false, resumeRearms = [], rearmCount = 0, lastRearmDwellMs = null;
  let healthOffsets = [], healRearms = [], healCount = 0;
  let manualRestartAt = -Infinity;
  const rebuilds = [];
  // v13.10.8: the caller's scope is room:video:epoch:playoutSegment. The playout segment bumps on every
  // room transport rewrite (a frozen linked source re-mirrored once a second in Drift's trace), so it must
  // not restart the dwell or refill the budget. Dwell and budget belong to room:video:epoch; the budget
  // refills only after the player has been healthy for 30 s.
  const dwellScope = raw => String(raw ?? '').split(':').slice(0, 3).join(':');
  function enterScope(next) {
    if (next === scope) return;
    scope = next; since = 0; steps = 0; lastStepAt = -Infinity; liveSeenAt = -Infinity;
    healthySince = 0; healthyAt = -1; healthyPosition = null; healthyProgressMs = 0;
    healthOffsets = [];
    pausedAt = -1; wasRoomPaused = false; outcome = 'scope-change';
  }
  // Called for TV followers from playback-sync, even while the room is paused.
  // It does not command the player and cannot rearm during a playing segment.
  function observeTransport({scope: raw, nowMs, paused} = {}) {
    const next = raw ? dwellScope(raw) : '';
    if (!next || !Number.isFinite(nowMs)) return false;
    enterScope(next);
    if (paused === true) {
      if (!wasRoomPaused) { pausedAt = nowMs; wasRoomPaused = true; }
      return false;
    }
    if (!wasRoomPaused || paused !== false) return false;
    const dwell = nowMs - pausedAt;
    wasRoomPaused = false; pausedAt = -1;
    resumeRearms = resumeRearms.filter(t => nowMs - t < REARM_WINDOW_MS);
    healRearms = healRearms.filter(t => nowMs - t < HEAL_REARM_WINDOW_MS);
    if (steps !== 2 || dwell < PAUSE_REARM_MS || nowMs - lastStepAt < REARM_QUIET_MS ||
        resumeRearms.length >= 1 || healRearms.length >= 1 || document.hidden) return false;
    steps = 0; since = 0; lastStepAt = -Infinity;
    healthySince = 0; healthyAt = -1; healthyPosition = null; healthyProgressMs = 0;
    healthOffsets = [];
    resumeRearms.push(nowMs); rearmCount++; lastRearmDwellMs = Math.round(dwell);
    outcome = 'long-pause-resume-budget-rearmed';
    window.watchFusionRoomSyncLog?.note?.('tv-resume-rearmed', {pauseMs: Math.round(dwell), count: rearmCount});
    return true;
  }
  // Never replenish decoder-reload budgets just because YT reports PLAYING.
  // Qualify healing from actual progress and near-room phase across 30 seconds.
  function observeHealth(input, nowMs, wedged) {
    const position = Number(input.position), drift = Number(input.drift);
    const healthy = !wedged && input.playing && !input.buffering && !input.exhausted
      && input.trusted && !input.sourceBuffering && Number.isFinite(nowMs)
      && Number.isFinite(position) && Number.isFinite(drift) && Math.abs(drift) <= HEALTH_PHASE_SEC;
    if (!healthy || document.hidden) { healthySince = 0; healthyAt = -1; healthyPosition = null;
      healthyProgressMs = 0; healthOffsets = []; return; }
    if (healthyAt < 0) healthySince = nowMs;
    else {
      const elapsed = nowMs - healthyAt, advanced = position - healthyPosition;
      if (elapsed <= 0 || elapsed > HEALTH_GAP_MS || advanced < -.08 || advanced > elapsed / 1000 * 1.8 + .3) {
        healthySince = nowMs; healthyProgressMs = 0; healthOffsets = [];
      } else if (advanced > .05) healthyProgressMs += Math.min(elapsed, advanced * 1000);
    }
    healthyAt = nowMs; healthyPosition = position;
    healthOffsets.push({at:nowMs, drift});
    healthOffsets = healthOffsets.filter(sample => nowMs - sample.at <= HEALED_MS);
    healRearms = healRearms.filter(t => nowMs - t < HEAL_REARM_WINDOW_MS);
    const spread = healthOffsets.length ? Math.max(...healthOffsets.map(x=>x.drift)) -
      Math.min(...healthOffsets.map(x=>x.drift)) : Infinity;
    // Separate decoder continuity from room-clock and speaker alignment.
    // Recovery budget refill is rate-limited even when the player keeps healing.
    resumeRearms = resumeRearms.filter(t => nowMs - t < REARM_WINDOW_MS);
    if (steps && healRearms.length === 0 && resumeRearms.length === 0 &&
        nowMs - healthySince >= HEALED_MS &&
        healthyProgressMs >= HEALTH_PROGRESS_MS && spread <= HEALTH_JITTER_SEC &&
        nowMs - lastStepAt >= HEALED_MS) {
      steps = 0; lastStepAt = -Infinity; outcome = 'healed-advancing-stable-offset';
      healRearms.push(nowMs); healCount++;
      window.watchFusionRoomSyncLog?.note?.('tv-decoder-recovered',
        {progressMs: Math.round(healthyProgressMs), offsetMs: Math.round(drift*1000)});
    }
  }
  function restartAfterSync(input, nowMs, wedged) {
    if (!scope || steps < 2 || !wedged || document.hidden || !Number.isFinite(nowMs) ||
        input.trusted !== true || input.sourceBuffering || typeof input.rebuild !== 'function' ||
        (input.buffering && !(Math.abs(input.drift) >= MIN_DRIFT_SEC))) return false;
    if (nowMs - manualRestartAt < RETRY_AFTER_MS) return true;
    manualRestartAt = lastStepAt = nowMs;
    since = 0;
    try {
      input.rebuild();
      outcome = 'manual-player-rebuilt';
      window.watchFusionRoomSyncLog?.note?.('tv-decoder-manual-restart', {reason:outcome});
    } catch { outcome = 'manual-restart-failed'; }
    return true;
  }
  function consider(input = {}) {
    const nextScope = input.scope ? dwellScope(input.scope) : '';
    enterScope(nextScope);
    const nowMs = Number(input.nowMs);
    if (input.trusted) liveSeenAt = nowMs;
    const wedged = input.buffering ? true : !!(input.exhausted && input.playing);
    if (input.manual) return restartAfterSync(input, nowMs, wedged);
    observeHealth(input, nowMs, wedged);
    if (!scope || !wedged || document.hidden || !Number.isFinite(nowMs)) { since = 0; return false; }
    // A one-report "frozen" blink of the linked source is not a frozen room.
    if (input.sourceBuffering || nowMs - liveSeenAt > TRUST_GRACE_MS) { since = 0; outcome = 'room-reference-not-live'; return false; }
    if (!(input.exhausted && input.playing && !input.buffering) && !(Math.abs(Number(input.drift)) >= MIN_DRIFT_SEC)) { since = 0; outcome = 'within-buffer-guard'; return false; }
    // A stale exhausted label alone is not a new freeze; the startup sensor
    // must still confirm a prolonged lack of playback progress.
    if (input.exhausted && input.playing && !input.buffering &&
        Number.isFinite(input.stalledMs) && input.stalledMs < STALL_DWELL_MS) {
      since = 0; outcome = 'freeze-unverified'; return false;
    }
    if (!since) { since = nowMs; outcome = 'confirming-wedged-decoder'; return false; }
    if (nowMs - since < (input.buffering ? BUFFER_DWELL_MS : STALL_DWELL_MS)) return false;
    if (steps >= 2) {
      if (outcome !== 'terminal-recovery-spent') input.onSpent?.();
      outcome = 'terminal-recovery-spent'; return false;
    }
    if (steps === 1 && nowMs - lastStepAt < RETRY_AFTER_MS) { outcome = 'verifying-decoder-reload'; return false; }
    const recent = rebuilds.filter(t => nowMs - t < 600000);
    const rebuild = steps === 1 && recent.length < MAX_REBUILDS_PER_10_MIN && typeof input.rebuild === 'function';
    if (steps === 1 && !rebuild) { steps = 2; outcome = 'rebuild-budget-spent'; return false; }
    steps++; lastStepAt = nowMs; since = 0;
    try {
      if (rebuild) { rebuilds.push(nowMs); input.rebuild(); outcome = 'player-rebuilt-once'; }
      else { input.reload(); outcome = 'one-decoder-reload'; }
      window.watchFusionRoomSyncLog?.note?.('tv-decoder-' + (rebuild ? 'rebuild' : 'reload'), {positionMs: Math.round(Number(input.drift) * 1000)});
      return true;
    } catch { outcome = 'recovery-failed'; return false; }
  }
  // The same thing a manual URL reload does for the player, without leaving the room.
  function rebuildPlayer(videoId, startSeconds) {
    if (!videoId || typeof ensurePlayer !== 'function') throw Error('rebuild unavailable');
    // Nova R14r, selectively retained: retire ownership of the OLD iframe
    // before destroying it. A stale lease must not block the new player.
    try { window.WatchFusionLinkedTrackOwnership?.invalidate?.(ytPlayer); } catch {}
    try { ytPlayer?.destroy?.(); } catch {}
    ytPlayer = null; ytPlayerReady = false; playerPrimed = false; playerInitializing = false;
    ensurePlayer(videoId, startSeconds);
  }
  window.WatchFusionDecoderRescue = {version: 'v13.10.8-r14s', consider, observeTransport, rebuildPlayer,
    diagnostics: () => ({scope, attempted: steps > 0, steps, outcome, healthyProgressMs: Math.round(healthyProgressMs),
      rearmCount, healCount, lastRearmDwellMs, pauseObserved: wasRoomPaused})};
})();
