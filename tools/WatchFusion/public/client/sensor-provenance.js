/* WatchFusion v13.10.8e: say what a player timing sample is, and what it is not.
 * A YouTube IFrame position is relayed by message and can be held between updates; the attached
 * source tab is muted at tab level, so the room clock it drives is silent. Neither is speaker time.
 * Read-only: this module never seeks, rate-adjusts, mutes or calibrates anything. */
(() => {
  'use strict';
  const root = typeof window === 'undefined' ? globalThis : window;
  if (root.WatchFusionSensorProvenance) return;
  const POLL_MS = 50, KEEP = 24;
  let player = null, held = {value: null, since: -Infinity}, changes = [];

  function poll(now, value, playing) {
    if (!playing || !Number.isFinite(value)) { held = {value: null, since: -Infinity}; changes = []; return; }
    if (value === held.value) return;
    if (held.value !== null) { changes.push(now); if (changes.length > KEEP) changes.shift(); }
    held = {value, since: now};
  }
  function cadence() {
    if (changes.length < 4) return null;
    const gaps = changes.slice(1).map((at, i) => at - changes[i]).sort((a, b) => a - b);
    return Math.round(gaps[Math.floor(gaps.length / 2)]);
  }
  function audibleOutput({playerAudible, source}) {
    const sourceAudible = source && source.tabMuted === false && source.paused !== true && !(Number(source.volume) <= .01);
    const sourceKnown = !source || typeof source.tabMuted === 'boolean';
    if (playerAudible === null || !sourceKnown) return 'unknown';
    return playerAudible && sourceAudible ? 'both' : playerAudible ? 'player' : sourceAudible ? 'source-tab' : 'none';
  }
  // input: {direct, media, now, rttMs, source}: source is the linked tab's metadata when this device publishes one.
  function describe(input = {}) {
    const {direct = false, media = null, now = performance.now(), rttMs = null, source = null} = input;
    let playerAudible = null;
    try {
      const volume = direct ? Number(media?.volume) : Number(media?.getVolume?.()) / 100;
      const muted = direct ? media?.muted === true : media?.isMuted?.();
      if (Number.isFinite(volume) && typeof muted === 'boolean') playerAudible = volume > .01 && !muted;
    } catch {}
    const tracked = !direct && media && media === player && held.value !== null;
    return {
      domain: direct ? 'media-element' : 'player-timeline',
      heldMs: tracked ? Math.max(0, Math.round(now - held.since)) : null,
      cadenceMs: tracked ? cadence() : null,
      clockUncertaintyMs: Number.isFinite(rttMs) ? Math.round(rttMs / 2) : null,
      audibleOutput: audibleOutput({playerAudible, source})
    };
  }
  function track(nextPlayer, now, value, playing) {
    if (nextPlayer !== player) { player = nextPlayer; held = {value: null, since: -Infinity}; changes = []; }
    poll(now, value, playing);
  }
  if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(() => {
    try {
      const yt = typeof ytPlayer === 'undefined' ? null : ytPlayer;
      track(yt, performance.now(), Number(yt?.getCurrentTime?.()), yt?.getPlayerState?.() === 1);
    } catch {}
  }, POLL_MS);
  root.WatchFusionSensorProvenance = {describe, track, audibleOutput, cadence};
})();
