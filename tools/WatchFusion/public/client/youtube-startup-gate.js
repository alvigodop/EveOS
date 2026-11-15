/* WatchFusion: keep a paused YouTube decoder warm and prove playback after resume. */
(() => {
  function createStartupGate() {
    let sourceKey = '', pauseKey = '', wasPaused = false, hadPlayed = false, pausedSeekTolerance = null;
    let activeSegment = '', observedAt = -1, firstPlayingAt = -1;
    let lastPosition = null, lastProgressAt = -1, advancingSince = -1;
    let pausedPosition = null, pausedReclaimed = false, manualPause = false;
    let playingSample = null, viewerDisplaced = false, runningReclaimed = false;
    let startDelayMs = null, pauseSeeks = 0, startupDeferrals = 0, reason = 'idle';

    function source(roomId, videoId, epoch) {
      const next = `${roomId || ''}:${videoId || ''}:${epoch ?? ''}`;
      if (next !== sourceKey) {
        sourceKey = next; pauseKey = ''; wasPaused = hadPlayed = false; pausedSeekTolerance = null;
        resetProgress();
        activeSegment = ''; observedAt = firstPlayingAt = -1;
        pausedPosition = null; pausedReclaimed = manualPause = false;
        playingSample = null; runningReclaimed = viewerDisplaced = false;
        startDelayMs = null; pauseSeeks = startupDeferrals = 0;
        reason = 'new-source';
      }
    }

    function resetProgress() {
      lastPosition = null;
      lastProgressAt = advancingSince = -1;
    }

    function paused({roomId, videoId, epoch, segment, position, current, buffering, force, alignBuffered, explicitSync}) {
      source(roomId, videoId, epoch);
      const key = String(segment ?? position);
      if (key !== pauseKey || !wasPaused) {
        const coldJoin = !hadPlayed && !pauseKey && !buffering;
        pausedSeekTolerance = wasPaused && !!pauseKey ? .15 : coldJoin ? 1.5 : alignBuffered && hadPlayed ? 2 : null;
        pauseKey = key; pausedPosition = null; pausedReclaimed = manualPause = false;
      }
      wasPaused = true;
      if (force) {
        pausedSeekTolerance = .15;
        manualPause = explicitSync === true;
      }
      if (buffering || !Number.isFinite(current) || !Number.isFinite(position)) {
        reason = 'paused-buffering'; return null;
      }
      const drift = Math.abs(position - current);
      const reclaim = !pausedReclaimed && pausedPosition !== null && Math.abs(current - pausedPosition) > 3 && drift > 3;
      const seek = reclaim || (pausedSeekTolerance !== null && (pausedSeekTolerance !== 2 || alignBuffered)
        && drift > pausedSeekTolerance);
      const manual = manualPause;
      pausedSeekTolerance = null; manualPause = false;
      pausedPosition = current; pausedReclaimed ||= reclaim;
      if (seek) pauseSeeks++;
      reason = reclaim ? 'viewer-room-position-reclaim' : seek ? 'paused-position-change' : 'paused-buffer-preserved';
      return {seek, manual, reclaim, allowNetwork: !alignBuffered && (!manual || drift >= 1.5)};
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
        playingSample = null; runningReclaimed = viewerDisplaced = false;
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
      // Keep the last moving position across buffering, so a scrub can be
      // distinguished from a player that merely stayed behind while buffering.
      if (playingSample && nowMs > playingSample.at && nowMs - playingSample.at <= 8000 &&
          Math.abs(drift) > 8 && Math.abs(drift - playingSample.drift) > 8 &&
          Math.abs(current - playingSample.current) > 3) viewerDisplaced = true;
      playingSample = {at:nowMs, current, drift};
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
      return {ready, reason, reclaim:ready && viewerDisplaced && !runningReclaimed && Math.abs(drift) > 8};
    }

    function seekIssued(reclaim) {
      pausedPosition = playingSample = null;
      viewerDisplaced = false;
      runningReclaimed ||= reclaim;
    }

    function snapshot() {
      return {reason, startDelayMs, pausedRepositions:pauseSeeks, startupDeferrals};
    }
    return {paused, running, seekIssued, snapshot};
  }
  globalThis.watchFusionYouTubeStartup = createStartupGate();
  globalThis.WatchFusionYouTubeStartup = {createStartupGate};
})();
