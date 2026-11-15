/* WatchFusion: keep a paused YouTube decoder warm and prove playback after resume. */
(() => {
  function createStartupGate() {
    let sourceKey = '', pauseKey = '', wasPaused = false, hadPlayed = false, pausedSeekTolerance = null;
    let activeSegment = '', observedAt = -1, firstPlayingAt = -1;
    let lastPosition = null, lastProgressAt = -1, advancingSince = -1;
    let startDelayMs = null, pauseSeeks = 0, startupDeferrals = 0, reason = 'idle';

    function source(roomId, videoId, epoch) {
      const next = `${roomId || ''}:${videoId || ''}:${epoch ?? ''}`;
      if (next !== sourceKey) {
        sourceKey = next; pauseKey = ''; wasPaused = hadPlayed = false; pausedSeekTolerance = null;
        resetProgress();
        activeSegment = ''; observedAt = firstPlayingAt = -1;
        startDelayMs = null; pauseSeeks = startupDeferrals = 0;
        reason = 'new-source';
      }
    }

    function resetProgress() {
      lastPosition = null;
      lastProgressAt = advancingSince = -1;
    }

    function paused({roomId, videoId, epoch, segment, position, current, buffering, force = false, alignBuffered = false}) {
      source(roomId, videoId, epoch);
      const key = String(segment ?? position);
      if (key !== pauseKey || !wasPaused) {
        const coldJoin = !hadPlayed && !pauseKey && !buffering;
        pausedSeekTolerance = wasPaused && !!pauseKey ? .15 : coldJoin ? 1.5 : alignBuffered && hadPlayed ? 2 : null;
        pauseKey = key;
      }
      wasPaused = true;
      if (force) pausedSeekTolerance = .15;
      if (buffering || !Number.isFinite(current) || !Number.isFinite(position)) {
        reason = 'paused-buffering'; return false;
      }
      const shouldSeek = pausedSeekTolerance !== null && (pausedSeekTolerance !== 2 || alignBuffered)
        && Math.abs(position - current) > pausedSeekTolerance;
      pausedSeekTolerance = null;
      if (shouldSeek) pauseSeeks++;
      reason = shouldSeek ? 'paused-position-change' : 'paused-buffer-preserved';
      return shouldSeek;
    }

    function running({roomId, videoId, epoch, segment, nowMs, current, playing, buffering, drift = 0, rate = 1}) {
      source(roomId, videoId, epoch);
      const nextSegment = String(segment ?? '');
      if (observedAt < 0 || activeSegment !== nextSegment || wasPaused) {
        resetProgress();
        pausedSeekTolerance = null;
        activeSegment = nextSegment;
        observedAt = nowMs;
        firstPlayingAt = -1;
        wasPaused = false;
        startDelayMs = null;
      }
      if (!playing || buffering) {
        resetProgress();
        reason = buffering ? 'viewer-resume-buffering' : 'viewer-awaiting-play';
        startupDeferrals++;
        return {ready: false, reason};
      }
      if (firstPlayingAt < 0) {
        firstPlayingAt = nowMs;
        startDelayMs = observedAt < 0 ? null : Math.max(0, Math.round(nowMs - observedAt));
      }
      hadPlayed = true;
      // PLAYING can precede actual advancement. Require recent movement at the room rate.
      if (lastPosition === null) {
        lastPosition = current;
        lastProgressAt = nowMs;
      } else if (current !== lastPosition) {
        const elapsed = nowMs - lastProgressAt, delta = current - lastPosition;
        if (elapsed > 0 && elapsed <= 1500 && delta > 0 && delta <= elapsed / 1000 * rate * 1.8 + .08) {
          if (advancingSince < 0) advancingSince = lastProgressAt;
        } else if (elapsed > 0) advancingSince = -1;
        if (elapsed > 0) { lastPosition = current; lastProgressAt = nowMs; }
      } else if (nowMs - lastProgressAt > 750) advancingSince = -1;
      const dwellMs = Math.abs(drift) > 4 ? 1100 : 2400;
      const ready = advancingSince >= 0 && nowMs - advancingSince >= dwellMs && nowMs - lastProgressAt <= 750;
      reason = ready ? 'viewer-playing-stable' : 'viewer-warming-after-play';
      if (!ready) startupDeferrals++;
      return {ready, reason};
    }

    function snapshot() {
      return {reason, startDelayMs, pausedRepositions:pauseSeeks, startupDeferrals};
    }
    return {paused, running, snapshot};
  }
  globalThis.watchFusionYouTubeStartup = createStartupGate();
  globalThis.WatchFusionYouTubeStartup = {createStartupGate};
})();
