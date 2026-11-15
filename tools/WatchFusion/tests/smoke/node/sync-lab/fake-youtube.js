// A physically plausible YouTube IFrame player. The defaults model a smart-TV
// browser: keyframe-snapped seeks, network-backed buffering, delayed start after
// PLAYING, coarse getCurrentTime() and limited playback-rate support.
export const PLAYING = 1, PAUSED = 2, BUFFERING = 3, ENDED = 0;

export function createFakeYouTube(clock, options = {}) {
  const o = {rates: [1], honorsRate: true, keyframeSec: 0, seekLatencyMs: 0, networkSeekLatencyMs: 0,
    startLatencyMs: 0, quantumMs: 0, bufferAheadSec: 30, duration: 3600, position: 0, playing: true, ...options};
  let position = o.position, last = clock.now(), mode = o.playing ? (o.stuckStartMs ? 'starting' : 'playing') : 'paused';
  let requestedRate = 1, actualRate = 1, wantPlay = o.playing, timer = null;
  const stats = {seeks: 0, networkSeeks: 0, pausedSeeks: 0, rateRequests: [], loads: 0, plays: 0, pauses: 0,
    bufferingMs: 0, frozenMs: 0, landings: []};
  let stalledUntil = 0;
  function advance() {
    const now = clock.now(), elapsed = now - last;
    if (elapsed > 0) {
      if (mode === 'playing' && now > stalledUntil) position += elapsed / 1000 * actualRate;
      else if (mode === 'buffering') stats.bufferingMs += elapsed;
      if (wantPlay && mode !== 'playing') stats.frozenMs += elapsed;
      if (mode === 'playing' && now <= stalledUntil) stats.frozenMs += elapsed;
    }
    last = now;
  }
  function schedule(ms, fn) { if (timer) clock.clearTimeout(timer); timer = ms > 0 ? clock.setTimeout(() => { timer = null; advance(); fn(); }, ms) : null; if (!(ms > 0)) fn(); }
  function startPlayback() {
    // PLAYING is reported immediately, but the timeline does not advance yet.
    mode = 'starting';
    schedule(o.startLatencyMs + (o.random ? o.random() * (o.startJitterMs || 0) : 0), () => { mode = 'playing'; });
  }
  if (o.playing && o.stuckStartMs) clock.setTimeout(() => { advance(); if (mode === 'starting') mode = 'playing'; }, o.stuckStartMs);
  const player = {
    stats, options: o,
    truePosition() { advance(); return position; },
    getPlayerState() { advance(); return mode === 'buffering' ? BUFFERING : mode === 'paused' ? PAUSED : PLAYING; },
    getCurrentTime() {
      advance();
      return o.quantumMs ? Math.floor(position * 1000 / o.quantumMs) * o.quantumMs / 1000 : position;
    },
    getDuration: () => o.duration,
    getVideoLoadedFraction() { advance(); return Math.min(1, (position + o.bufferAheadSec) / o.duration); },
    getAvailablePlaybackRates: () => o.rates.slice(),
    getPlaybackRate: () => requestedRate,
    setPlaybackRate(rate) {
      advance();
      stats.rateRequests.push(rate);
      if (!o.rates.includes(rate)) return;
      requestedRate = rate; actualRate = o.honorsRate ? rate : 1;
    },
    seekTo(target, allowSeekAhead) {
      advance();
      stats.seeks++;
      const buffered = target >= position - 1 && target <= position + o.bufferAheadSec;
      const network = !buffered;
      if (network) stats.networkSeeks++;
      if (mode === 'paused' || !wantPlay) stats.pausedSeeks++;
      const landed = o.keyframeSec > 0 ? Math.floor(Math.max(0, target) / o.keyframeSec) * o.keyframeSec : Math.max(0, target);
      stats.landings.push({requested: target, landed, network, allowSeekAhead});
      position = landed;
      const jitter = o.random ? o.random() * (o.seekJitterMs || 0) : 0;
      const latency = (network ? Math.max(o.networkSeekLatencyMs, o.seekLatencyMs) : o.seekLatencyMs) + jitter;
      mode = 'buffering';
      schedule(latency, () => { if (wantPlay) startPlayback(); else mode = 'paused'; });
    },
    playVideo() {
      advance(); stats.plays++; wantPlay = true;
      if (mode === 'paused') startPlayback();
    },
    pauseVideo() {
      advance(); stats.pauses++; wantPlay = false;
      if (mode !== 'buffering') { if (timer) clock.clearTimeout(timer); timer = null; mode = 'paused'; }
    },
    loadVideoById({startSeconds = 0} = {}) { stats.loads++; player.seekTo(startSeconds, true); wantPlay = true; },
    cueVideoById() { stats.loads++; },
    stall(ms) { advance(); stalledUntil = clock.now() + ms; mode = 'buffering'; schedule(ms, () => { mode = wantPlay ? 'playing' : 'paused'; }); },
    getVideoData: () => ({video_id: o.videoId || 'M7lc1UVf-VE'}),
    getVolume: () => 100, isMuted: () => false, setVolume() {}, mute() {}, unMute() {}
  };
  return player;
}

// Device profiles used by the reproductions.
export const PROFILES = {
  laptop: {rates: [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2], keyframeSec: 0, seekLatencyMs: 120, startLatencyMs: 40, quantumMs: 0},
  phone: {rates: [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2], keyframeSec: 0, seekLatencyMs: 250, startLatencyMs: 80, quantumMs: 0},
  // A smart TV: seeks snap back to 2 s keyframes, take a second to recover and
  // report PLAYING ~450 ms before frames move. Only 1x is offered.
  fixedTv: {rates: [1], keyframeSec: 2, seekLatencyMs: 900, networkSeekLatencyMs: 2200, startLatencyMs: 450, quantumMs: 250},
  variableTv: {rates: [.75, 1, 1.25], keyframeSec: 2, seekLatencyMs: 900, networkSeekLatencyMs: 2200, startLatencyMs: 450, quantumMs: 250},
  // Advertises rates but keeps decoding at 1x.
  lyingTv: {rates: [.75, 1, 1.25], honorsRate: false, keyframeSec: 2, seekLatencyMs: 900, networkSeekLatencyMs: 2200, startLatencyMs: 450, quantumMs: 250}
};
