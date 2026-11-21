/* WatchFusion v13.10.8e: say what a player timing sample is, and what it is not.
 * A YouTube IFrame position is relayed by message and can be held between updates; the attached
 * source tab is muted at tab level, so the room clock it drives is silent. Neither is speaker time.
 * Read-only: this module never seeks, rate-adjusts, mutes or calibrates anything. */
(() => {
  'use strict';
  const root = typeof window === 'undefined' ? globalThis : window;
  if (root.WatchFusionSensorProvenance) return;
  const POLL_MS = 50, KEEP = 24;
  let player = null, videoId = null, held = {value: null, since: -Infinity}, changes = [];
  // R14j: separate DOM sampling cadence from forward progress at the expected rate.
  // This describes the iframe's media clock, NOT decoded frames or speaker output.
  const MOTION_WINDOW_MS = 2400, MAX_POLL_GAP_MS = 500;
  let timeline = [], jumpedAt = -Infinity;
  function freshPoll(now, last) {
    return !!last && Number.isFinite(now) && now >= last.at && now - last.at <= MAX_POLL_GAP_MS;
  }
  function timelineMotion(now) {
    if (timeline.length < 3) return {timelineState:'unverified', timelineRatePct:null};
    const first=timeline[0], last=timeline[timeline.length-1], dt=last.at-first.at;
    if (!freshPoll(now, last) || dt < 1200) return {timelineState:'unverified',timelineRatePct:null};
    const expected=dt/1000*Math.max(.25,Math.min(2.1,last.rate||1));
    const moved=last.value-first.value, pct=Math.max(0,Math.min(300,Math.round(100*moved/expected)));
    const state=last.at-jumpedAt <= MOTION_WINDOW_MS ? 'jumped'
      : pct >= 70 && pct <= 135 ? 'advancing' : pct < 12 ? 'held' : 'slow';
    return {timelineState:state,timelineRatePct:pct};
  }

  function poll(now, value, playing, rate = 1) {
    if (!playing || !Number.isFinite(value) || !Number.isFinite(now)) {
      held = {value: null, since: -Infinity}; changes = []; timeline = []; jumpedAt = -Infinity; return;
    }
    const previous=timeline[timeline.length-1];
    if (previous && !freshPoll(now, previous)) {
      timeline = []; changes = []; jumpedAt = -Infinity; held = {value:null, since:now};
    } else if (previous) {
      const dt=Math.max(0,now-previous.at), moved=value-previous.value;
      // A seek/keyframe jump invalidates this window; do not treat it as smooth playback.
      if (moved < -.25 || moved > Math.max(1,dt/1000*Math.max(.25,rate)*3+.35)) {
        timeline=[]; jumpedAt=now;
      }
    }
    timeline.push({at:now,value,rate});
    timeline=timeline.filter(s=>now-s.at<=MOTION_WINDOW_MS).slice(-80);
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
  // Clock: every exchange brackets the true server offset within ±rtt/2 whatever the path asymmetry, so the median of
  // the exchanges used is within ±max(rtt used)/2, plus oscillator drift since the newest one. That is a bound, not a
  // measured accuracy: the asymmetry inside it stays unknown. Minimum RTT/2 under-states it and is never reported.
  // Offsets further apart than the bound allows mean the clock moved or reset: 'unstable'. Diagnostic only.
  function clockBound(c) {
    if (!c || !Number.isFinite(c.boundMs) || !Number.isFinite(c.ageMs)) return {clockBoundMs: null, clockState: 'unknown'};
    const clockBoundMs = Math.ceil(c.boundMs + Math.max(0, c.ageMs) * 1e-4) + 1;
    const clockState = c.ageMs > 15000 ? 'stale' : !c.precise ? 'coarse' : !(c.samples >= 3) ? 'thin'
      : !(c.spreadMs <= 2 * c.boundMs + 2) ? 'unstable' : 'bounded';
    return {clockBoundMs, clockState};
  }
  // input: {direct, media, now, clock, source}: clock is watchPartyClock.offsetBound(); source is the linked tab's
  // metadata when this device publishes one.
  function describe(input = {}) {
    const {direct = false, media = null, now = performance.now(), clock = null, source = null} = input;
    let playerAudible = null;
    try {
      const volume = direct ? Number(media?.volume) : Number(media?.getVolume?.()) / 100;
      const muted = direct ? media?.muted === true : media?.isMuted?.();
      if (Number.isFinite(volume) && typeof muted === 'boolean') playerAudible = volume > .01 && !muted;
    } catch {}
    const tracked = !direct && media && media === player && currentVideo(media) === videoId &&
      held.value !== null && freshPoll(now, timeline.at(-1));
    return {
      domain: direct ? 'media-element' : 'player-timeline',
      heldMs: tracked ? Math.max(0, Math.round(now - held.since)) : null,
      cadenceMs: tracked ? cadence() : null,
      ...clockBound(clock),
      ...(tracked ? timelineMotion(now) : {timelineState:'unverified',timelineRatePct:null}),
      audibleOutput: audibleOutput({playerAudible, source})
    };
  }
  function currentVideo(media) {
    try { return media?.getVideoData?.()?.video_id || null; } catch { return null; }
  }
  function track(nextPlayer, now, value, playing, rate = 1) {
    const nextVideo = currentVideo(nextPlayer);
    if (nextPlayer !== player || nextVideo !== videoId) {
      player = nextPlayer; videoId = nextVideo;
      held = {value:null, since:-Infinity}; changes = []; timeline = []; jumpedAt = -Infinity;
    }
    poll(now, value, playing, rate);
  }
  if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(() => {
    try {
      const yt = typeof ytPlayer === 'undefined' ? null : ytPlayer;
      track(yt, performance.now(), Number(yt?.getCurrentTime?.()), yt?.getPlayerState?.() === 1,
        Number(yt?.getPlaybackRate?.()) || 1);
    } catch {}
  }, POLL_MS);
  root.WatchFusionSensorProvenance = {describe, track, audibleOutput, cadence, clockBound};
})();
