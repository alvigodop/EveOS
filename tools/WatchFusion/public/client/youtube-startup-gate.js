/* WatchFusion: keep a paused YouTube decoder warm and prove playback after resume. */
(() => {
  function createStartupGate() {
    let sourceKey = '', pauseKey = '', wasPaused = false, hadPlayed = false, pausedSeekTolerance = null;
    let activeSegment = '', observedAt = -1, firstPlayingAt = -1;
    let lastPosition = null, lastProgressAt = -1, advancingSince = -1, progressProbe = null;
    let pausedPosition = null, pausedReclaimed = false, manualPause = false;
    let pausedSince = -1, pausedPrefetched = false;
    let playingSample = null, viewerDisplaced = false, runningReclaimed = false;
    let startDelayMs = null, pauseSeeks = 0, startupDeferrals = 0, reason = 'idle', stalledMs = 0;

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
      lastPosition = progressProbe = null;
      lastProgressAt = advancingSince = -1;
    }

    function paused({roomId, videoId, epoch, segment, position, current, buffering, force, alignBuffered, explicitSync, nowMs}) {
      source(roomId, videoId, epoch);
      const key = String(segment ?? position);
      if (key !== pauseKey || !wasPaused) {
        const coldJoin = !hadPlayed && !pauseKey && !buffering;
        pausedSeekTolerance = wasPaused && !!pauseKey ? .15 : coldJoin ? 1.5 : alignBuffered && hadPlayed ? 2 : null;
        pauseKey = key; pausedPosition = null; pausedReclaimed = manualPause = false;
        pausedSince = Number.isFinite(nowMs) ? nowMs : -1; pausedPrefetched = false;
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
      // v13.7: a viewer left >2 s off its paused room has no useful buffer to preserve:
      // its resume would be a network seek into a cold decoder (Nov 15 log 2: TV paused
      // 8.8 s behind for 20 s, then froze 14 s on resume). After a settled 1.5 s pause,
      // fetch the paused position once so the resume starts warm.
      const prefetch = !pausedPrefetched && pausedSince >= 0 && Number.isFinite(nowMs)
        && nowMs - pausedSince >= 1500 && drift > 2;
      const seek = reclaim || prefetch || (pausedSeekTolerance !== null && (pausedSeekTolerance !== 2 || alignBuffered)
        && drift > pausedSeekTolerance);
      if (seek) pausedPrefetched = true;
      const manual = manualPause;
      pausedSeekTolerance = null; manualPause = false;
      pausedPosition = current; pausedReclaimed ||= reclaim;
      if (seek) pauseSeeks++;
      reason = reclaim ? 'viewer-room-position-reclaim' : prefetch && !manual ? 'paused-prefetch-align' : seek ? 'paused-position-change' : 'paused-buffer-preserved';
      return {seek, manual, reclaim, allowNetwork: prefetch || (!alignBuffered && (!manual || drift >= 1.5))};
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
        resetProgress(); stalledMs = 0;
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
      // YouTube may jitter or step BACKWARD while its decoder is stopped. Mere
      // inequality is not playback progress: it previously reset the stall clock
      // indefinitely on TVs, leaving "warming" while the room ran away at 1 s/s.
      // Observe short windows independently of the last *verified* progress so
      // real playback can resume after a long frozen cold start.
      if (lastPosition === null) {
        lastPosition = current; lastProgressAt = nowMs;
        progressProbe = {value:current, at:nowMs};
      } else {
        const span = nowMs - progressProbe.at;
        const delta = current - progressProbe.value;
        const roomRate = Math.min(2, Math.max(.25, Number(rate) || 1));
        const minAdvance = Math.max(.12, span / 1000 * roomRate * .30);
        const maxAdvance = span / 1000 * roomRate * 1.8 + .08;
        if (span > 0 && span <= 1500 && delta >= minAdvance && delta <= maxAdvance
            && current >= lastPosition + minAdvance) {
          if (advancingSince < 0) advancingSince = progressProbe.at;
          lastPosition = current; lastProgressAt = nowMs;
          progressProbe = {value:current, at:nowMs};
        } else if (span <= 0 || span >= 1000 || delta < -.18 || delta > maxAdvance) {
          // Re-baseline noisy/jumped samples without blessing them as movement.
          // Crucially, never refresh lastProgressAt here.
          progressProbe = {value:current, at:nowMs};
          if (Math.abs(current - lastPosition) > 3) {
            // A real seek/discontinuity establishes a new position; small
            // backward/forward API jitter must never replenish the stall timer.
            lastPosition = current; lastProgressAt = nowMs; advancingSince = -1;
          }
        }
        if (nowMs - lastProgressAt > 750) advancingSince = -1;
      }
      const dwellMs = Math.abs(drift) > 4 ? 1100 : 2400;
      const ready = advancingSince >= 0 && nowMs - advancingSince >= dwellMs && nowMs - lastProgressAt <= 750;
      reason = ready ? 'viewer-playing-stable' : 'viewer-warming-after-play';
      if (!ready) startupDeferrals++;
      // PLAYING while the reported position has not moved: evidence for the
      // arbiter's bounded stall recovery (the gate itself never actuates).
      stalledMs = !ready && lastProgressAt >= 0 && nowMs - lastProgressAt > 750 ? Math.round(nowMs - lastProgressAt) : 0;
      if (stalledMs) reason = 'viewer-stalled-while-playing';
      return {ready, reason, stalledMs, reclaim:ready && viewerDisplaced && !runningReclaimed && Math.abs(drift) > 8};
    }

    function seekIssued(reclaim) {
      pausedPosition = playingSample = null;
      viewerDisplaced = false;
      runningReclaimed ||= reclaim;
    }

    function snapshot() {
      return {reason, startDelayMs, pausedRepositions:pauseSeeks, startupDeferrals, stalledMs};
    }
    return {paused, running, seekIssued, snapshot};
  }
  globalThis.watchFusionYouTubeStartup = createStartupGate();
  globalThis.WatchFusionYouTubeStartup = {createStartupGate};
})();
