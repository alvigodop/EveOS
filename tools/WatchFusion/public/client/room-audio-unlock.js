/* v13.10.7: A member that joins starts at the host's room audio, not muted.
 * Members start muted when priming could not prove unmuted autoplay (slow TVs often miss the 2.5 s priming
 * window even when the browser would allow sound). Once playback is running, try the host's room volume once
 * and verify that it stays playing. If the browser really needs a tap, go back to muted playback, keep sync
 * intact, and show one "Enable room audio" button: a real tap is the only thing that can unlock sound.
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionRoomAudioUnlock) return;
  const ID = 'watchfusionEnableRoomAudio', VERIFY_MS = 900, START_GRACE_MS = 1500;
  const MISMATCH_DWELL_MS = 800, RECHECK_COOLDOWN_MS = 10000, VOLUME_TOLERANCE = 2;
  let scope = '', player = null, probe = null, tried = false, playingSince = 0, reason = 'idle';
  let mismatchSince = 0, nextRecheckAt = 0, needsTap = false, audioKey = '';
  const safeVolume = () => { try { return Number(ytPlayer?.getVolume?.()); } catch { return NaN; } };
  const audioTelemetryAvailable = () => typeof ytPlayer?.getVolume === 'function'
    && typeof ytPlayer?.isMuted === 'function' && Number.isFinite(safeVolume());
  const audioMatches = target => {
    try { return ytPlayer?.isMuted?.() === false && Math.abs(safeVolume() - target.volume) <= VOLUME_TOLERANCE; }
    catch { return false; }
  };
  function button() {
    let node = document.getElementById(ID);
    if (node) return node;
    const anchor = document.getElementById('syncStatus'); if (!anchor?.parentNode) return null;
    node = document.createElement('button'); node.id = ID; node.type = 'button'; node.className = 'secondary';
    node.textContent = 'Enable room audio'; node.hidden = true; node.title = 'This browser needs one tap before it can play sound';
    node.addEventListener('click', () => {
      if (!scope || !ytPlayer) return;
      userGesturePrimeUsed = true; autoplayWasBlocked = false; needsTap = false;
      try { applyRoomAudioState(ytPlayer, true); if (state?.playback && !state.playback.paused && ytPlayer?.getPlayerState?.() !== 1) ytPlayer.playVideo?.(); } catch { needsTap = true; }
      probe = needsTap ? null : {at: performance.now(), kind:'tap'};
      node.hidden = true; reason = needsTap ? 'audio-tap-failed' : 'audio-tap-verifying';
    });
    anchor.parentNode.insertBefore(node, anchor.nextSibling); return node;
  }
  function tick() {
    const audio = typeof authoritativeRoomAudio === 'function' ? authoritativeRoomAudio() : null;
    const ui = button();
    const next = roomId && audio && state?.source?.videoId && !isHost() ? [roomId, state.source.videoId, state.presentationEpoch].join(':') : '';
    // v13.10.8: a decoder rebuild or reload makes a new player that starts at its own default audio
    // (Drift's TV lost the room volume after a reload). A new player instance gets its own attempt.
    if (next !== scope || ytPlayer !== player) {
      scope = next; player = ytPlayer; probe = null; tried = false; playingSince = 0;
      mismatchSince = 0; nextRecheckAt = 0; needsTap = false; audioKey = '';
    }
    const expectedKey = audio ? `${audio.volume}:${audio.muted}` : '';
    if (expectedKey !== audioKey) { audioKey = expectedKey; mismatchSince = 0; needsTap = false; nextRecheckAt = 0; }
    const at = performance.now();
    if (state?.playback?.paused) { probe = null; mismatchSince = 0; if (ui) ui.hidden = true; return; }
    if (probe) { // while probing, applyRoomAudioState() keeps the room volume because autoplayWasBlocked is lowered
      if (ui) ui.hidden = true;
      if (!next) { probe = null; return; }
      if (at - probe.at < VERIFY_MS) return;
      // Buffering during a decoder reload is not an audio failure. A new PAUSED
      // state after unmuting, however, can mean the browser blocked autoplay.
      const playerState = ytPlayer?.getPlayerState?.();
      if (probe.kind === 'recheck' && playerState === 3) { probe.at = at; return; }
      if (probe.kind === 'recheck' && playerState !== 1 && at - probe.at < 1600) return;
      const ok = ytPlayer?.getPlayerState?.() === 1 && audioMatches(audio), wasStartup = probe.kind === 'startup';
      probe = null;
      if (ok) {
        mismatchSince = 0; needsTap = false; reason = 'room-audio-allowed';
        window.watchFusionRoomSyncLog?.note?.('room-audio-unlocked', {}); return;
      }
      needsTap = true; tried = true; reason = 'browser-requires-tap';
      // The startup probe may trigger a browser play-block; keep the video playing muted.
      // An ordinary volume mismatch must NOT cause a new mute or transport command.
      if (wasStartup) {
        autoplayWasBlocked = true;
        try { window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); ytPlayer?.mute?.();
          if (state?.playback && !state.playback.paused) ytPlayer?.playVideo?.(); } catch {}
      }
      window.watchFusionRoomSyncLog?.note?.('room-audio-needs-tap', {reason: wasStartup ? 'autoplay' : 'audio-recheck'});
      return;
    }
    const wanted = !!next && !audio.muted && audio.volume > 0;
    const initialBlocked = wanted && autoplayWasBlocked && !userGesturePrimeUsed;
    if (ui) ui.hidden = !wanted || !(needsTap || (initialBlocked && tried));
    if (!wanted || !ytPlayer || !ytPlayerReady || playerInitializing || primingPlayer || state?.playback?.paused) {
      mismatchSince = 0; if (!wanted && next) reason = 'room-audio-applied'; return;
    }
    if (ytPlayer.getPlayerState?.() !== 1) { playingSince = 0; mismatchSince = 0; return; }
    if (!playingSince) playingSince = at;
    if (needsTap) return; // user gesture only: no automatic loop after failed verification
    if (initialBlocked) {
      if (tried || at - playingSince < START_GRACE_MS) return;
      tried = true; probe = {at, kind:'startup'}; autoplayWasBlocked = false;
      try { ytPlayer.setVolume?.(audio.volume); ytPlayer.unMute?.(); reason = 'trying-room-audio'; }
      catch { probe = null; autoplayWasBlocked = true; needsTap = true; reason = 'unmute-failed'; }
      return;
    }
    if (!audioTelemetryAvailable()) { mismatchSince = 0; reason = 'room-audio-telemetry-unavailable'; return; }
    // A decoder reload may reuse the SAME player object, and a browser may mute mid-play.
    // The initial one-shot check does not cover either case. Reapply the host's audio
    // locally after stable mismatch, with no seek, pause, play, or room publication.
    if (audioMatches(audio)) { mismatchSince = 0; reason = 'room-audio-applied'; return; }
    if (!mismatchSince) mismatchSince = at;
    if (at - mismatchSince < MISMATCH_DWELL_MS || at - playingSince < START_GRACE_MS || at < nextRecheckAt) return;
    nextRecheckAt = at + RECHECK_COOLDOWN_MS; mismatchSince = 0; tried = true;
    probe = {at, kind:'recheck'}; reason = 'room-audio-rechecking';
    window.watchFusionRoomSyncLog?.note?.('room-audio-reapplied', {volumePct: Math.round(audio.volume), reason:'audio-recheck'});
    try { if (applyRoomAudioState(ytPlayer, true) !== true) throw Error('room audio unavailable'); }
    catch { probe = null; needsTap = true; reason = 'room-audio-recheck-failed'; }
  }
  setInterval(() => { try { tick(); } catch { reason = 'room-audio-error'; } }, 400);
  window.WatchFusionRoomAudioUnlock = {version: 'v13.10.8a', diagnostics: () => ({reason, tried, probing: !!probe, needsTap, recheckCooldownMs:Math.max(0,Math.round(nextRecheckAt-performance.now()))})};
})();
