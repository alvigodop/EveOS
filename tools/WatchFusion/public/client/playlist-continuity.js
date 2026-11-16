/* v13.10.5: bounded Play-intent continuity for linked playlist transitions.
 * Operates only on the authoritative linked tab; never changes room authority.
 * A deliberate pause wins: a room/toolbar pause outside a transition, or a
 * pause in the source tab that persists on the same video. A pause produced by
 * WatchFusion's own preview load during a transition is not a deliberate pause.
 * A browser autoplay restriction is not bypassed: at most 2 Play requests.
 */
(() => {
  'use strict';
  const GRACE_MS = 1100, RETRY_MS = 2600, TIMEOUT_MS = 12000, MAX_ATTEMPTS = 2;
  const STABLE_MS = 6000, TRANSITION_MS = 6000, PREVIEW_MS = 4500, SOURCE_PAUSE_MS = 2500;
  let lastUrl = '', lastPlayingAt = -Infinity, lastPauseAt = -Infinity, pendingPause = null;
  let plan = null, outcome = 'idle', totalAttempts = 0, lastTransitionAt = -Infinity;
  let previewId = '', previewLoadedAt = -Infinity, previewPauseGuarded = false;
  const clock = () => Date.now();
  const note = (kind, detail = {}) => globalThis.watchFusionRoomSyncLog?.note?.(kind, detail);
  const inTransition = now => now - Math.max(lastTransitionAt, previewLoadedAt) < TRANSITION_MS;
  function manualPause(now = clock(), explicit = false) {
    // Only a classified preview echo may defer a pause. Explicit room commands win.
    if (!explicit && plan && inTransition(now)) { plan.previewEchoAt = now; outcome = 'pause-deferred'; note('playlist-pause-deferred'); return false; }
    lastPauseAt = now; pendingPause = null; plan = null; outcome = 'explicit-pause-preserved';
    note('playlist-pause-preserved');
    return true;
  }
  function onTransition(previous, next, {eligible = false, now = clock()} = {}) {
    const oldUrl = String(previous?.pageUrl || ''), nextUrl = String(next?.pageUrl || '');
    if (!nextUrl || oldUrl === nextUrl) return false;
    pendingPause = null; // a pause sample right before a track change is the change, not a choice
    const wasPlaying = lastPlayingAt > lastPauseAt && (previous?.paused === false || now - lastPlayingAt < 15000);
    lastUrl = nextUrl; lastTransitionAt = now; plan = null;
    outcome = wasPlaying && eligible ? 'transition-grace' : 'transition-paused';
    note('playlist-transition', {reason:outcome});
    if (!wasPlaying || !eligible) return false;
    // Armed even when the new video already plays: a late preview echo can still pause it.
    plan = {url:nextUrl,at:now,lastAttemptAt:-Infinity,attempts:0,hadPlayed:false,previewEchoAt:-Infinity};
    return true;
  }
  function observe(sample, {eligible = false, connected = false, pending = false,
    send = null, now = clock()} = {}) {
    const url = String(sample?.pageUrl || '');
    if (!url) return false;
    if (lastUrl && lastUrl !== url) { plan = null; pendingPause = null; outcome = 'source-changed'; }
    lastUrl = url;
    if (sample?.paused === false && !sample?.ended) {
      lastPlayingAt = now; pendingPause = null;
      if (plan && plan.url === url) { plan.hadPlayed = true; plan.previewEchoAt = -Infinity; }
      if (plan && now - plan.at >= STABLE_MS) { note('playlist-resume-confirmed', {attempts:plan.attempts}); plan = null; }
      outcome = plan ? 'playing-verifying' : 'playing'; return false;
    }
    // A new source-tab Pause after the new video was observed PLAYING is a user
    // decision unless we know an actual preview echo caused it. Never auto-Play it.
    if (plan && plan.hadPlayed && sample?.paused === true && !sample?.ended &&
        plan.previewEchoAt === -Infinity) {
      lastPauseAt = now; plan = null; pendingPause = null; outcome = 'source-pause-preserved';
      note('playlist-pause-preserved'); return false;
    }
    if (sample?.paused === true && !sample?.ended && !plan && !inTransition(now)) {
      // A pause made in the source tab itself: deliberate once it persists on this video.
      if (!pendingPause || pendingPause.url !== url) pendingPause = {url, at:now};
      else if (now - pendingPause.at >= SOURCE_PAUSE_MS) { lastPauseAt = pendingPause.at; pendingPause = null; outcome = 'source-pause-preserved'; }
    }
    if (!plan || plan.url !== url) return false;
    if (sample?.ended || now - plan.at > TIMEOUT_MS) {
      outcome = 'resume-expired'; note('playlist-resume-expired',{attempts:plan.attempts}); plan = null;
      return false;
    }
    if (!eligible || !connected || sample?.buffering || pending || !send ||
        now - plan.at < GRACE_MS || now - plan.lastAttemptAt < RETRY_MS) return false;
    if (plan.attempts >= MAX_ATTEMPTS) {
      outcome = 'resume-blocked'; note('playlist-resume-blocked',{attempts:plan.attempts});plan = null;
      return false;
    }
    plan.attempts++; totalAttempts++; plan.lastAttemptAt = now;
    outcome = 'resume-attempt'; note('playlist-resume-attempt',{attempts:plan.attempts});
    try { return send() === true; } catch { return false; }
  }
  function guardPreviewEvent(playerState, metadata, playerId, sourceId, now = clock()) {
    if (playerId && playerId !== previewId) { previewId = String(playerId); previewLoadedAt = now; previewPauseGuarded = false; }
    // A preview re-cue/prime/load is not a deliberate click on the linked source.
    const guarded = !previewPauseGuarded && playerState === 2 && !!sourceId &&
      now - previewLoadedAt < PREVIEW_MS && (plan !== null || metadata?.paused === false);
    if (guarded) { previewPauseGuarded = true; note('playlist-preview-guarded'); }
    return guarded;
  }
  function reset() {
    lastUrl = ''; lastPlayingAt = lastPauseAt = lastTransitionAt = previewLoadedAt = -Infinity;
    plan = null; pendingPause = null; previewId = ''; previewPauseGuarded = false; outcome = 'idle';
  }
  const diagnostics = () => ({outcome, attempts:plan?.attempts ?? 0, totalAttempts, active:!!plan});
  globalThis.WatchFusionPlaylistContinuity = {onTransition,observe,manualPause,guardPreviewEvent,reset,diagnostics,version:'v13.10.6'};
})();
