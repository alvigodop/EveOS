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
  let scope = '', player = null, probe = null, tried = false, playingSince = 0, reason = 'idle';
  function button() {
    let node = document.getElementById(ID);
    if (node) return node;
    const anchor = document.getElementById('syncStatus'); if (!anchor?.parentNode) return null;
    node = document.createElement('button'); node.id = ID; node.type = 'button'; node.className = 'secondary';
    node.textContent = 'Enable room audio'; node.hidden = true; node.title = 'This browser needs one tap before it can play sound';
    node.addEventListener('click', () => {
      userGesturePrimeUsed = true; autoplayWasBlocked = false;
      try { applyRoomAudioState(ytPlayer, true); if (state?.playback && !state.playback.paused && ytPlayer?.getPlayerState?.() !== 1) ytPlayer.playVideo?.(); } catch {}
      node.hidden = true; reason = 'unlocked-by-tap';
    });
    anchor.parentNode.insertBefore(node, anchor.nextSibling); return node;
  }
  function tick() {
    const audio = typeof authoritativeRoomAudio === 'function' ? authoritativeRoomAudio() : null;
    const ui = button();
    const next = roomId && audio && state?.source?.videoId && !isHost() ? [roomId, state.source.videoId, state.presentationEpoch].join(':') : '';
    // v13.10.8: a decoder rebuild or reload makes a new player that starts at its own default audio
    // (Drift's TV lost the room volume after a reload). A new player instance gets its own attempt.
    if (next !== scope || ytPlayer !== player) { scope = next; player = ytPlayer; probe = null; tried = false; playingSince = 0; }
    const at = performance.now();
    if (probe) { // while probing, applyRoomAudioState() keeps the room volume because autoplayWasBlocked is lowered
      if (ui) ui.hidden = true;
      if (!next) { probe = null; return; }
      if (at - probe.at < VERIFY_MS) return;
      const ok = ytPlayer?.getPlayerState?.() === 1 && !ytPlayer.isMuted?.();
      probe = null;
      if (ok) { reason = 'room-audio-allowed'; window.watchFusionRoomSyncLog?.note?.('room-audio-unlocked', {}); return; }
      autoplayWasBlocked = true; reason = 'browser-requires-tap';
      try { window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); ytPlayer?.mute?.(); if (state?.playback && !state.playback.paused) ytPlayer?.playVideo?.(); } catch {}
      return;
    }
    const needed = !!next && !audio.muted && autoplayWasBlocked && !userGesturePrimeUsed;
    if (ui) ui.hidden = !needed || !tried;
    if (!needed || !ytPlayer || !ytPlayerReady || playerInitializing || primingPlayer) { if (!needed && next) reason = 'room-audio-applied'; return; }
    const playing = ytPlayer.getPlayerState?.() === 1;
    if (!playing) { playingSince = 0; return; }
    if (!playingSince) playingSince = at;
    if (tried || at - playingSince < START_GRACE_MS) return;
    tried = true; probe = {at}; autoplayWasBlocked = false;
    try { ytPlayer.setVolume?.(audio.volume); ytPlayer.unMute?.(); reason = 'trying-room-audio'; } catch { probe = null; autoplayWasBlocked = true; reason = 'unmute-failed'; }
  }
  setInterval(() => { try { tick(); } catch { reason = 'room-audio-error'; } }, 400);
  window.WatchFusionRoomAudioUnlock = {version: 'v13.10.8', diagnostics: () => ({reason, tried, probing: !!probe})};
})();
