/* v13.10.7: Linked-tab auto sync with no room.
 * Before this, a solo preview only re-seeked when it was more than 1.25 s away from the linked tab, so it
 * could sit hundreds of ms off forever. Same policy as rooms: <=50 ms Locked (then a gentle walk toward 0),
 * 50 ms .. 1 s soft rate pulses, a stable >0.9 s gap gets one quiet rejoin per video. The source tab stays
 * authoritative; nothing here is ever sent back to it (rate pulses and rejoins are echo-suppressed).
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionSoloLinkSync) return;
  const PERIOD = 250, MAX_AGE = 900, WINDOW_MS = 2400, MIN_SAMPLES = 6, MIN_SPAN = 1200, COOLDOWN = 1800;
  const ZERO_MS = 16, LOCK_MS = 50, REJOIN_SEC = .9, MAX_FAIL = 3;
  let scope = '', points = [], pulse = null, cooldownUntil = 0, rejoins = 0, fail = 0, lastAt = -Infinity, pending = null;
  let reason = 'idle', lastErrorMs = null, medianMs = null;
  const now = () => performance.now();
  const median = v => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const readRate = () => { try { return Number(ytPlayer?.getPlaybackRate?.()); } catch { return NaN; } };
  function release(why = 'rate-complete') {
    const p = pulse; if (!p) return;
    pulse = null; clearTimeout(p.timer); lastAt = now(); cooldownUntil = lastAt + COOLDOWN;
    try { if (Math.abs(readRate() - p.rate) < .015) { window.watchFusionLinkedTab?.suppressPlaybackEcho?.(); ytPlayer.setPlaybackRate(p.base); } } catch {}
    reason = why;
  }
  function reset(next) { release('scope-ended'); scope = next; points = []; rejoins = 0; fail = 0; pending = null; cooldownUntil = 0; lastErrorMs = medianMs = null; reason = next ? 'new-source' : 'idle'; }
  const isApplying = () => !!pulse || now() - lastAt < 700;
  function display() {
    let node = document.getElementById('watchfusionSoloLinkStatus');
    if (!node) {
      const host = document.getElementById('syncStatus'); if (!host?.parentNode) return;
      node = document.createElement('small'); node.id = 'watchfusionSoloLinkStatus'; node.style.marginLeft = '8px';
      node.setAttribute('role', 'status'); host.parentNode.insertBefore(node, host.nextSibling);
    }
    node.hidden = !scope || !!roomId; if (node.hidden) return;
    const e = medianMs ?? lastErrorMs, a = Math.abs(e ?? 0);
    const label = e === null ? 'Measuring' : a <= LOCK_MS ? 'Locked' : a <= 100 ? 'Refining' : 'Correcting';
    node.textContent = 'Linked tab sync: ' + label + (e === null ? '' : ' (' + (e > 0 ? '+' : '') + Math.round(e) + ' ms)');
  }
  function step() {
    const linked = window.watchFusionLinkedTab, metadata = linked?.metadata?.();
    const on = linked?.active?.() && !roomId && ytPlayer && ytPlayerReady && !playerInitializing && !primingPlayer && metadata?.pageUrl;
    const id = on ? window.parseYoutubeInput?.(metadata.pageUrl) : '';
    const next = on && id && (state?.source?.videoId || pendingVideoId) === id ? id : '';
    if (next !== scope) reset(next);
    display();
    const at = now();
    if (pulse) { if (at - pulse.at >= 350 && Math.abs(readRate() - pulse.rate) > .015) { release('rate-rejected'); fail = MAX_FAIL; } return; }
    if (!next || document.hidden || metadata.paused !== false || metadata.ended || metadata.buffering === true || ytPlayer.getPlayerState?.() !== 1 ||
        ytPlayer.getVideoData?.()?.video_id !== next || linked.applying?.() || linked.pendingControl?.('seek') || linked.pendingControl?.('rate')) { points = []; return; }
    const age = Date.now() - Number(metadata.sampledAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE) { points = []; reason = 'stale-source-sample'; return; }
    const base = Math.min(2, Math.max(.25, Number(metadata.rate) || 1));
    if (Math.abs(readRate() - base) > .015) { points = []; reason = 'awaiting-source-rate'; return; }
    const target = window.WatchFusionLinkedPlaybackSync?.projectedPosition?.(metadata, Date.now());
    const position = Number(ytPlayer.getCurrentTime?.());
    if (!Number.isFinite(target) || !Number.isFinite(position)) { points = []; return; }
    const error = target - position; lastErrorMs = Math.round(error * 1000);
    if (at < cooldownUntil) { points = []; reason = 'settling'; return; }
    points.push({at, error}); points = points.filter(p => at - p.at <= WINDOW_MS);
    if (points.length < MIN_SAMPLES || at - points[0].at < MIN_SPAN) { reason = 'measuring'; return; }
    const values = points.map(p => p.error), m = median(values), abs = Math.abs(m);
    const mad = median(values.map(v => Math.abs(v - m)));
    medianMs = Math.round(m * 1000); display();
    if (pending) { if (abs > Math.abs(pending) * .85 && abs * 1000 > ZERO_MS) fail++; else fail = 0; pending = null; }
    if (abs * 1000 <= ZERO_MS) { reason = 'solo-zero-band'; return; }
    if (mad > Math.max(.012, abs * .25)) { reason = 'source-sample-jitter'; return; }
    if (abs > REJOIN_SEC) {
      if (rejoins >= 1) { reason = 'solo-rejoin-spent'; return; }
      rejoins++; lastAt = at; cooldownUntil = at + 4000; points = [];
      try { linked.suppressPlaybackEcho?.(); ytPlayer.seekTo(target + .15 * base, true); reason = 'solo-one-rejoin';
        window.watchFusionRoomSyncLog?.note?.('solo-sync-one-rejoin', {positionMs: Math.round(m * 1000)}); } catch { reason = 'seek-unavailable'; }
      return;
    }
    if (fail >= MAX_FAIL) { reason = 'solo-rate-not-effective'; return; }
    const rates = (ytPlayer.getAvailablePlaybackRates?.() || []).filter(r => Number.isFinite(r) && Math.sign(r - base) === Math.sign(m)
      && Math.abs(r - base) >= .03 && Math.abs(r - base) <= .26).sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
    if (!rates.length) { reason = 'fixed-rate-preview'; return; }
    const rate = rates[0], ms = Math.max(60, Math.min(abs > .1 ? 3000 : 420, abs * .75 / Math.abs(rate - base) * 1000));
    try { linked.suppressPlaybackEcho?.(); ytPlayer.setPlaybackRate(rate); } catch { fail = MAX_FAIL; reason = 'rate-unavailable'; return; }
    pulse = {rate, base, at, timer: setTimeout(() => release(), ms)}; lastAt = at; pending = m; points = [];
    reason = abs * 1000 <= LOCK_MS ? 'solo-zero-walk' : 'solo-rate-refining';
  }
  setInterval(() => { try { step(); } catch { reason = 'solo-controller-error'; } }, PERIOD);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(''); });
  window.WatchFusionSoloLinkSync = {version: 'v13.10.7', isApplying,
    diagnostics: () => ({active: !!scope, reason, rejoins, fail, errorMs: lastErrorMs, medianMs, rateActive: !!pulse})};
})();
