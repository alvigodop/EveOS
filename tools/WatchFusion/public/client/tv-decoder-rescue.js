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
  const HEALED_MS = 30000;
  let scope = '', since = 0, steps = 0, lastStepAt = -Infinity, outcome = 'idle', liveSeenAt = -Infinity, healthySince = 0;
  const rebuilds = [];
  // v13.10.8: the caller's scope is room:video:epoch:playoutSegment. The playout segment bumps on every
  // room transport rewrite (a frozen linked source re-mirrored once a second in Drift's trace), so it must
  // not restart the dwell or refill the budget. Dwell and budget belong to room:video:epoch; the budget
  // refills only after the player has been healthy for 30 s.
  const dwellScope = raw => String(raw ?? '').split(':').slice(0, 3).join(':');
  function consider(input = {}) {
    const nextScope = input.scope ? dwellScope(input.scope) : '';
    if (nextScope !== scope) { scope = nextScope; since = 0; steps = 0; lastStepAt = -Infinity; liveSeenAt = -Infinity; healthySince = 0; outcome = 'scope-change'; }
    const nowMs = Number(input.nowMs);
    if (input.trusted) liveSeenAt = nowMs;
    const wedged = input.buffering ? true : !!(input.exhausted && input.playing);
    if (!wedged && input.playing && Number.isFinite(nowMs)) {
      if (!healthySince) healthySince = nowMs;
      if (steps && nowMs - healthySince >= HEALED_MS) { steps = 0; lastStepAt = -Infinity; outcome = 'healed'; }
    } else healthySince = 0;
    if (!scope || !wedged || document.hidden || !Number.isFinite(nowMs)) { since = 0; return false; }
    // A one-report "frozen" blink of the linked source is not a frozen room.
    if (input.sourceBuffering || nowMs - liveSeenAt > TRUST_GRACE_MS) { since = 0; outcome = 'room-reference-not-live'; return false; }
    if (!(Math.abs(Number(input.drift)) >= MIN_DRIFT_SEC)) { since = 0; outcome = 'within-buffer-guard'; return false; }
    if (!since) { since = nowMs; outcome = 'confirming-wedged-decoder'; return false; }
    if (nowMs - since < (input.buffering ? BUFFER_DWELL_MS : STALL_DWELL_MS)) return false;
    if (steps >= 2) { outcome = 'terminal-recovery-spent'; return false; }
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
  function rebuildPlayer(videoId) {
    if (!videoId || typeof ensurePlayer !== 'function') throw Error('rebuild unavailable');
    try { ytPlayer?.destroy?.(); } catch {}
    ytPlayer = null; ytPlayerReady = false; playerPrimed = false; playerInitializing = false;
    ensurePlayer(videoId);
  }
  window.WatchFusionDecoderRescue = {version: 'v13.10.8', consider, rebuildPlayer,
    diagnostics: () => ({scope, attempted: steps > 0, steps, outcome})};
})();
