/* YouTube room sync preserves the room rate and verifies recovery from bounded seeks. */
(() => {
  const SYNC_TOLERANCE_SEC = 0.15;
  const SEEK_DRIFT_SEC = 0.42;
  const BUFFERED_DRIFT_SEC = 0.18;
  const HARD_DRIFT_SEC = 1.5;
  const SEEK_COOLDOWN_MS = 2500;
  const TICK_MS = 250;
  const SENSOR_WINDOW = 7;
  const SENSOR_MIN_SAMPLES = 5;
  const SENSOR_MIN_AGE_MS = 900;
  const SENSOR_MAX_SPREAD_SEC = 0.22;
  const DEVICE_TIMING_KEY = 'watchfusion.youtubePlaybackDelayMs';
  const DEVICE_TIMING_STEP_MS = 5;
  const DEVICE_TIMING_LIMIT_MS = 1000;
  let deviceDelayMs = normalizeDeviceDelay(storage.get(DEVICE_TIMING_KEY));
  let draftDeviceDelayMs = deviceDelayMs;
  const autoGovernor = window.WatchFusionLinkedPlaybackSync?.createAutoRoomGovernor?.(); const tvSeekGuard = window.watchFusionSeekHealth;
  let anchorKey = '';
  let anchorPosition = 0;
  let anchorServerTime = 0;
  let anchorRate = 0;
  let seekCooldownUntil = 0;
  let awaitingSeekRecovery = false;
  let viewerWasBuffering = false;
  let viewerScope = '', viewerProgress = null, hostPositionSample = null;
  let correctiveSeeks = 0;
  let replayLoads = 0;
  let viewerSawEnded = false;
  let replayKey = '', transportSeekPending = false, viewerPausedPosition = null, lastRateRequest = null;
  let driftSamples = [];
  let diagnostics = {
    rawDriftSec: 0,
    filteredDriftSec: 0,
    spreadSec: 0,
    sampleCount: 0,
    stable: false,
    action: 'idle'
  };
  function normalizeDeviceDelay(value) {
    const steps = Math.round((Number(value) || 0) / DEVICE_TIMING_STEP_MS);
    return Math.max(-DEVICE_TIMING_LIMIT_MS, Math.min(DEVICE_TIMING_LIMIT_MS, steps * DEVICE_TIMING_STEP_MS));
  }
  function hasDeviceTiming() {
    return !!roomId && !!state?.source?.videoId && followsRoomPlayback() && !isHost();
  }
  function formatDeviceDelay(value) {
    return value ? Math.abs(value) + ' ms ' + (value < 0 ? 'earlier' : 'later') : '0 ms';
  }
  function renderDeviceTiming() {
    const controls = $('devicePlaybackTiming');
    if (!controls) return;
    controls.hidden = !hasDeviceTiming();
    if (controls.hidden) {
      controls.open = false;
      draftDeviceDelayMs = deviceDelayMs;
      return;
    }
    $('deviceTimingSummary').textContent = deviceDelayMs ? formatDeviceDelay(deviceDelayMs) : 'No override';
    $('deviceTimingValue').textContent = formatDeviceDelay(draftDeviceDelayMs);
    window.watchFusionSyncCenter?.renderOffset(draftDeviceDelayMs, formatDeviceDelay(draftDeviceDelayMs));
    $('deviceTimingEarlier').disabled = draftDeviceDelayMs <= -DEVICE_TIMING_LIMIT_MS;
    $('deviceTimingLater').disabled = draftDeviceDelayMs >= DEVICE_TIMING_LIMIT_MS;
    const earlierFine = $('deviceTimingEarlierFine');
    const laterFine = $('deviceTimingLaterFine');
    if (earlierFine) earlierFine.disabled = draftDeviceDelayMs <= -DEVICE_TIMING_LIMIT_MS;
    if (laterFine) laterFine.disabled = draftDeviceDelayMs >= DEVICE_TIMING_LIMIT_MS;
    $('deviceTimingApply').disabled = draftDeviceDelayMs === deviceDelayMs;
    $('deviceTimingReset').disabled = !deviceDelayMs && !draftDeviceDelayMs;
  }
  function stageDeviceDelay(value) {
    draftDeviceDelayMs = normalizeDeviceDelay(value);
    renderDeviceTiming();
  }
  function applyDeviceDelay(value) {
    if (!hasDeviceTiming()) return;
    draftDeviceDelayMs = normalizeDeviceDelay(value);
    if (draftDeviceDelayMs !== deviceDelayMs) {
      deviceDelayMs = draftDeviceDelayMs;
      storage.set(DEVICE_TIMING_KEY, String(deviceDelayMs)); window.watchFusionPresentation?.useManualTiming?.();
      if (!state.playback?.paused && !state.playback?.ended) syncPlayer({ force: true });
    }
    renderDeviceTiming();
  }
  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function resetDriftSensor(action = 'reset') {
    driftSamples = [];
    diagnostics = {
      rawDriftSec: 0,
      filteredDriftSec: 0,
      spreadSec: 0,
      sampleCount: 0,
      stable: false,
      action
    };
  }
  function syncStateKey() {
    const p = state?.playback;
    if (!p) return '';
    const sourceId = state?.source?.videoId || state?.source?.url || state?.source?.streamId || '';
    return [roomId, sourceId, p.updatedAt, p.rate, p.paused, p.ended].join('|');
  }
  function refreshAnchor(force = false) {
    if (!state?.playback) return;
    const key = syncStateKey();
    if (!force && key && key === anchorKey) return;
    const p = state.playback;
    const position = Number(p.position) || 0;
    const at = Number(p.projectedAt) || Number(state.serverTime) || Date.now();
    const rate = p.paused || p.ended ? 0 : Number(p.rate) || 1;
    if (key !== anchorKey) {
      const changedRate = anchorRate !== rate;
      const jumpThreshold = rate === 0 ? SYNC_TOLERANCE_SEC : HARD_DRIFT_SEC;
      const jumped = Math.abs(position - projectAnchor(at)) >= jumpThreshold;
      if (anchorKey && (changedRate || jumped)) {
        resetDriftSensor('new-anchor');
        resetSeekRecovery();
        autoGovernor?.reset(viewerScope); tvSeekGuard?.reset(viewerScope, !anchorRate && rate > 0 && Math.abs(position - anchorPosition) < .75);
      }
    }
    anchorKey = key;
    anchorPosition = position;
    anchorServerTime = at;
    anchorRate = rate;
  }
  function projectAnchor(at) {
    return Math.max(0, anchorPosition + Math.max(0, at - anchorServerTime) / 1000 * anchorRate);
  }
  function youtubeTarget(at, duration) {
    const position = projectAnchor(at), delay = anchorRate && hasDeviceTiming() ? (window.watchFusionPresentation?.adjustmentMs?.() ?? deviceDelayMs) * anchorRate / 1000 : 0;
    return Math.max(0, Math.min(duration > 0 ? duration : Infinity, (window.watchFusionPlayout?.position(position, 'youtube') ?? position) - delay));
  }
  function resetSeekRecovery() {
    awaitingSeekRecovery = false;
    seekCooldownUntil = 0;
  }
  function sampleDrift(rawDrift, nowMs) {
    driftSamples.push({ drift: rawDrift, at: nowMs });
    if (driftSamples.length > SENSOR_WINDOW) driftSamples.shift();
    const values = driftSamples.map(sample => sample.drift);
    const filtered = median(values);
    const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
    const age = driftSamples.length > 1 ? driftSamples.at(-1).at - driftSamples[0].at : 0;
    const sameDirection = values.every(value => Math.abs(value) <= SYNC_TOLERANCE_SEC || Math.sign(value) === Math.sign(filtered));
    const stable = values.length >= SENSOR_MIN_SAMPLES
      && age >= SENSOR_MIN_AGE_MS
      && spread <= SENSOR_MAX_SPREAD_SEC
      && sameDirection;
    diagnostics = {
      rawDriftSec: rawDrift,
      filteredDriftSec: filtered,
      spreadSec: spread,
      sampleCount: values.length,
      stable,
      action: diagnostics.action
    };
    return diagnostics;
  }

  function connectedStatus() {
    return isTryCloudflare ? 'Connected (remote sync)' : 'Connected';
  }

  function markStable() {
    if (($('syncStatus')?.textContent || '') !== connectedStatus()) setStatus(connectedStatus());
    diagnostics.action = 'steady';
  }

  function setViewerRate(rate) {
    const available = ytPlayer.getAvailablePlaybackRates?.();
    if (available?.length && !available.includes(rate)) return;
    if (Math.abs((Number(ytPlayer.getPlaybackRate?.()) || rate) - rate) > .001) {
      const now = performance.now();
      if (lastRateRequest?.player === ytPlayer && lastRateRequest.rate === rate && now - lastRateRequest.at < 1500) return;
      lastRateRequest = {player:ytPlayer,rate,at:now};
      window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); ytPlayer.setPlaybackRate?.(rate);
    }
  }

  function restartViewerFromEnded(target, baseRate) {
    const key = syncStateKey();
    if (!key || key === replayKey) return false;
    replayKey = key;
    viewerSawEnded = false;
    try {
      const startSeconds = Math.max(0, Number(target) || 0);
      window.watchFusionLinkedTab?.suppressPlaybackEcho?.();
      if (typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById({ videoId: state.source.videoId, startSeconds });
        replayLoads++;
      } else {
        ytPlayer.seekTo?.(startSeconds, true);
      }
      setViewerRate(baseRate);
      awaitSeekRecovery(performance.now());
      autoGovernor?.reset(viewerScope);
      requestViewerPlayback();
      resetDriftSensor('replay');
      return true;
    } catch {
      return false;
    }
  }

  function awaitSeekRecovery(nowMs, reclaim = false) {
    window.watchFusionYouTubeStartup?.seekIssued?.(reclaim);
    awaitingSeekRecovery = true;
    seekCooldownUntil = nowMs + SEEK_COOLDOWN_MS;
  }
  function seekViewer(target, baseRate, nowMs, action = 'seek', allowNetwork = true) {
    const attempt = {scope:viewerScope, nowMs, current:Number(ytPlayer.getCurrentTime?.()), target, action};
    const intentional = ['manual-sync','transport-seek','viewer-reclaim'].includes(action);
    if (!intentional && tvSeekGuard && !tvSeekGuard.permit(attempt)) { diagnostics.action = 'seek-guard-hold'; return false; }
    try {
      setViewerRate(baseRate);
      window.watchFusionLinkedTab?.suppressPlaybackEcho?.();
      const proposed = tvSeekGuard?.seekTarget(attempt) ?? target;
      const requested = Math.max(0, Math.min(Number(ytPlayer.getDuration?.()) || Infinity, proposed));
      ytPlayer.seekTo(requested, allowNetwork);
      correctiveSeeks++; tvSeekGuard?.record({...attempt, requested});
    } catch { return false; }
    awaitSeekRecovery(nowMs, action === 'viewer-reclaim');
    if (intentional) autoGovernor?.reset(viewerScope);
    autoGovernor?.onSeek(nowMs);
    resetDriftSensor(action);
    setStatus('Catching up…');
    return true;
  }

  function applyViewerCorrection(force = false, bufferedOnly = false, explicitSync = false) {
    if (!roomId || !state?.source?.videoId || !ytPlayer || !ytPlayerReady || !followsRoomPlayback()) return;
    if (playerInitializing || primingPlayer) return;
    const scope = [roomId, state.source.videoId, state.presentationEpoch, state.playoutSegment].join(':');
    const roomPaused = !!(state.playback.paused || state.playback.ended);
    const sameSource = viewerScope && scope.slice(0, scope.lastIndexOf(':')) === viewerScope.slice(0, viewerScope.lastIndexOf(':'));
    const ordinaryResume = viewerPausedPosition !== null && !roomPaused && Math.abs(Number(state.playback.position) - viewerPausedPosition) < .75;
    viewerPausedPosition = roomPaused ? Number(state.playback.position) : null;
    if (scope !== viewerScope) {
      transportSeekPending = !!sameSource && !roomPaused && !ordinaryResume;
      viewerScope = scope; viewerProgress = null;
      autoGovernor?.reset(scope); tvSeekGuard?.reset(scope, !!sameSource && ordinaryResume);
      viewerWasBuffering = false;
      viewerSawEnded = !!sameSource && viewerSawEnded;
      resetSeekRecovery();
      replayKey = '';
      correctiveSeeks = 0;
      replayLoads = 0;
      resetDriftSensor('source-changed');
    }
    applyRoomAudioState();
    refreshAnchor(false);
    const baseRate = Math.min(2, Math.max(0.25, Number(state.playback.rate) || 1));
    const current = Number(ytPlayer.getCurrentTime?.()); if (!Number.isFinite(current)) return false;
    const duration = Number(ytPlayer.getDuration?.()) || 0;
    const target = youtubeTarget(estimatedServerNow(), duration);
    const rawDrift = target - current;
    const absRaw = Math.abs(rawDrift), nowMs = performance.now();
    const playerState = ytPlayer.getPlayerState?.();
    const buffering = playerState === (window.YT?.PlayerState?.BUFFERING ?? 3);
    const playerEnded = playerState === (window.YT?.PlayerState?.ENDED ?? 0); tvSeekGuard?.observe({scope, nowMs, current, drift:rawDrift, target, rate:baseRate, playing:!roomPaused && playerState === 1, buffering});
    const transport = {roomId, videoId:state.source.videoId, epoch:state.presentationEpoch, segment:state.playoutSegment};
    const startup = roomPaused ? null : window.watchFusionYouTubeStartup?.running({...transport, nowMs, current, playing:playerState===1, buffering, drift:rawDrift, rate:baseRate});
    const catchup = !isHost() && window.watchFusionGentleCatchup;
    const sourceBuffering = !!window.watchFusionPlayout?.sourceBuffering();
    const canAdjust = !roomPaused && !force && !transportSeekPending && !startup?.reclaim && !awaitingSeekRecovery
      && playerState === 1 && startup?.ready === true && !tvSeekGuard?.manualStable(nowMs,rawDrift)
      && !(tvSeekGuard?.snapshot(nowMs)?.referenceHoldMs > 0);
    const gentle = catchup?.plan?.({scope,nowMs,drift:rawDrift,baseRate,player:ytPlayer,playable:canAdjust,buffering:buffering || sourceBuffering});
    try { setViewerRate(gentle?.rate ?? baseRate); } catch {}
    if (roomPaused) {
      viewerSawEnded = !!state.playback.ended;
      const bufferedEnd = duration * (Number(ytPlayer.getVideoLoadedFraction?.()) || 0);
      const warmPause = !state.playback.ended && target > current && bufferedEnd >= target + .25;
      const pause = window.watchFusionYouTubeStartup?.paused({...transport, position:target, current, buffering:buffering || playerState === 1, force:force && !bufferedOnly, alignBuffered:warmPause, explicitSync});
      try {
        if (pause?.seek) { window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); awaitSeekRecovery(nowMs); ytPlayer.seekTo?.(target, pause.allowNetwork); }
        if (pause?.manual || pause?.reclaim) tvSeekGuard?.record({scope,nowMs,action:pause.manual ? 'manual-sync' : 'viewer-reclaim'});
        if (!playerEnded && playerState !== (window.YT?.PlayerState?.PAUSED ?? 2)
            && (!buffering || !awaitingSeekRecovery)) {
          window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); ytPlayer.pauseVideo?.();
        }
      } catch {}
      viewerProgress = null; resetDriftSensor('paused');
      if (pause && !pause.seek) resetSeekRecovery();
      markStable(); return true;
    }
    if (!force && (buffering || sourceBuffering)) {
      if (!viewerWasBuffering) resetDriftSensor('buffering');
      viewerProgress = null;
      autoGovernor?.observe({nowMs, current, drift:rawDrift, buffering:true});
      viewerWasBuffering = true;
      return true;
    }
    if (viewerWasBuffering) {
      viewerWasBuffering = false;
      resetDriftSensor('settling');
    }
    if (!force && playerEnded && duration > 0 && target >= duration - SYNC_TOLERANCE_SEC) return true;
    if (viewerSawEnded && target <= 1.5 && restartViewerFromEnded(target, baseRate)) return true;
    viewerSawEnded = false;
    if (playerState !== (window.YT?.PlayerState?.PLAYING ?? 1)) { diagnostics.action = startup?.reason || 'viewer-awaiting-play'; requestViewerPlayback(); return true; }
    if (!force && startup?.ready === false) { sampleDrift(rawDrift, nowMs); diagnostics.action = startup.reason; return true; }
    if (force || transportSeekPending || startup?.reclaim) {
      if (bufferedOnly) {
        const bufferedEnd = duration * (Number(ytPlayer.getVideoLoadedFraction?.()) || 0);
        if (buffering || awaitingSeekRecovery || absRaw < .01 || bufferedEnd < Math.max(current, target) + 1) return false;
      }
      const action = explicitSync ? 'manual-sync' : transportSeekPending || force ? 'transport-seek' : 'viewer-reclaim';
      if (explicitSync && absRaw < .18) { tvSeekGuard?.record({scope,nowMs,action}); transportSeekPending = false; }
      else if (seekViewer(target, baseRate, nowMs, action, explicitSync ? absRaw >= 1.5 : !bufferedOnly)) transportSeekPending = false;
      requestViewerPlayback();
      return true;
    }
    const sensor = sampleDrift(rawDrift, nowMs);
    const filteredAbs = Math.abs(sensor.filteredDriftSec);
    const playing = playerState === (window.YT?.PlayerState?.PLAYING ?? 1);
    const governorDecision = autoGovernor?.observe({nowMs, current,
      drift:sensor.filteredDriftSec, playing, buffering, stable:sensor.stable});
    const advancing = playing && viewerProgress && current > viewerProgress.current
      && current - viewerProgress.current < 1 && nowMs > viewerProgress.nowMs && nowMs - viewerProgress.nowMs <= 1000;
    if (playing && (!viewerProgress || current !== viewerProgress.current)) viewerProgress = {current, nowMs};
    if (awaitingSeekRecovery) {
      if (governorDecision?.settled || (nowMs >= seekCooldownUntil && (governorDecision?.retry || tvSeekGuard?.canRetry(nowMs)))) {
        resetSeekRecovery();
        if (governorDecision.settled) {
          resetDriftSensor('aligned'); markStable();
          requestViewerPlayback(); return true;
        }
      } else {
        diagnostics.action = governorDecision?.reason || 'waiting-for-player';
        const message = nowMs < seekCooldownUntil ? 'Catching up…'
          : filteredAbs >= SEEK_DRIFT_SEC ? 'Playback is behind · use Sync me to catch up' : 'Connected · playback timing is settling';
        if ($('syncStatus')?.textContent !== message) setStatus(message);
        requestViewerPlayback();
        return true;
      }
    }
    if (gentle?.hold || (gentle && !canAdjust && absRaw <= 1.5 && !tvSeekGuard?.manualStable(nowMs,rawDrift))) {
      if (gentle.bufferedRejoin && duration * (Number(ytPlayer.getVideoLoadedFraction?.()) || 0) >= Math.max(current,target) + 1.5 &&
          seekViewer(target,baseRate,nowMs,'buffered-seek',false)) catchup.noteBufferedRejoin();
      if (!awaitingSeekRecovery) { markStable(); diagnostics.action = gentle.reason; }
      requestViewerPlayback(); return true;
    }
    const hardConsistent = sensor.sampleCount >= 2
      && driftSamples.slice(-2).every(sample => Math.sign(sample.drift) === Math.sign(sensor.filteredDriftSec));
    if (filteredAbs >= HARD_DRIFT_SEC && hardConsistent && !awaitingSeekRecovery) {
      seekViewer(target, baseRate, nowMs, 'hard-seek');
    } else if (sensor.stable && filteredAbs >= SEEK_DRIFT_SEC && !awaitingSeekRecovery) {
      seekViewer(target, baseRate, nowMs, 'stable-seek');
    } else if (!awaitingSeekRecovery && advancing && sensor.stable && sensor.spreadSec <= .09
        && filteredAbs >= (window.watchFusionPlayout?.bufferedThreshold() ?? BUFFERED_DRIFT_SEC)
        && duration * (Number(ytPlayer.getVideoLoadedFraction?.()) || 0) >= Math.max(current, target) + 1) {
      seekViewer(target, baseRate, nowMs, 'buffered-seek', false);
    } else {
      markStable();
    }

    requestViewerPlayback();
    return true;
  }
  window.applyAdaptiveViewerSync = applyViewerCorrection;
  window.watchFusionYouTubeTarget = (at, duration) => { refreshAnchor(false); return youtubeTarget(at, duration); };
  window.watchFusionSyncDiagnostics = () => ({
    ...diagnostics,
    correctiveSeeks,
    replayLoads,
    autoSync: autoGovernor?.snapshot() || null, seekGuard: tvSeekGuard?.snapshot() || null,
    deviceDelayMs: hasDeviceTiming() ? deviceDelayMs : 0,
    revision: state?.revision ?? null,
    playerState: ytPlayer?.getPlayerState?.() ?? null,
    host: isHost(),
    sourceLinked: state?.linkedSourceActive === true,
    startup: window.watchFusionYouTubeStartup?.snapshot?.() || null,
    clockOffsetMs: window.watchPartyClock?.offsetMs?.() ?? null,
    clockRttMs: window.watchPartyClock?.rttMs?.() ?? null,
    playerRate: Number(ytPlayer?.getPlaybackRate?.()) || null,
    authoritativeRate: Number(state?.playback?.rate) || null
  });

  const originalRender = render;
  render = function watchPartyAdaptiveRender() {
    refreshAnchor(true);
    const result = originalRender();
    renderDeviceTiming();
    return result;
  };

  $('deviceTimingEarlier')?.addEventListener('click', () => stageDeviceDelay(draftDeviceDelayMs - 25));
  $('deviceTimingEarlierFine')?.addEventListener('click', () => stageDeviceDelay(draftDeviceDelayMs - 5));
  $('deviceTimingSlider')?.addEventListener('input', event => stageDeviceDelay(Number(event.target?.value || 0)));
  $('deviceTimingLaterFine')?.addEventListener('click', () => stageDeviceDelay(draftDeviceDelayMs + 5));
  $('deviceTimingLater')?.addEventListener('click', () => stageDeviceDelay(draftDeviceDelayMs + 25));
  window.watchFusionSyncCenter?.bindOffset(stageDeviceDelay, () => draftDeviceDelayMs);
  $('deviceTimingApply')?.addEventListener('click', () => applyDeviceDelay(draftDeviceDelayMs));
  $('deviceTimingReset')?.addEventListener('click', () => applyDeviceDelay(0));


  function publishHostSeek() {
    if (!roomId || !ytPlayerReady || !state?.source?.videoId || followsRoomPlayback()
        || window.watchFusionLinkedTab?.active?.() || primingPlayer || playerInitializing || applyingRemote) {
      hostPositionSample = null;
      return;
    }
    const playerState = ytPlayer?.getPlayerState?.();
    if (playerState !== 1 && playerState !== 2) return;
    if (state.playback.paused !== (playerState === 2) || state.playback.ended) {
      hostPositionSample = null;
      return;
    }
    const position = Number(ytPlayer.getCurrentTime?.()), at = performance.now();
    if (!Number.isFinite(position)) return;
    const rate = Number(ytPlayer.getPlaybackRate?.()) || 1;
    const scope = roomId + ':' + state.source.videoId;
    const previous = hostPositionSample;
    hostPositionSample = {scope, position, at, rate, playing:playerState === 1};
    if (previous?.scope === scope && previous.playing === hostPositionSample.playing && previous.rate === rate
        && window.WatchFusionLinkedPlaybackSync.positionJumped(position, previous, at)) {
      void command('seek', { position, paused: playerState === 2 }).catch(() => setStatus('Room playback is reconnecting…'));
    }
  }

  setInterval(() => {
    try {
      if (roomId && !followsRoomPlayback()) publishHostSeek();
      else { hostPositionSample = null; applyViewerCorrection(false); }
    } catch {}
  }, TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAnchor(true);
      if (roomId) applyViewerCorrection(false);
    }
  });
})();
