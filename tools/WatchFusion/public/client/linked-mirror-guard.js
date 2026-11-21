/* v13.10.8: gate for the linked tab's room mirror (host handoff, 401/403 storms, frozen-source rewinds).
 * Design adapted from Eve's v13.10.8 host-link-guard proposal; server authorization is unchanged.
 * Drift's traces:
 *  - after a host handoff, 240 identical mirror requests and 734 HTTP 403s: a rejected mirror never set the
 *    mirror anchor, so every metadata tick retried it as 'initial'.
 *  - a linked tab stuck at one position while still reporting PLAYING was re-mirrored as 'drift' about once
 *    per second (43 room segment transitions in 171 s): every member was pulled back a second, every second.
 * Rules:
 *  - in a room, only the current host whose linked source the room still holds publishes mirrors;
 *  - a 401/403/409 stops automatic mirrors until the room authority changes (host, link, source, binding)
 *    or the user presses Reconnect; one request per authority, never a loop;
 *  - an expired sample waits briefly for fresh metadata; other failures back off 3 s -> 30 s;
 *  - when the original host gets the host role back (after a handoff seen in this room) and the room dropped the link but still plays the same
 *    video, one protected rebind is attempted (the server still checks ownership);
 *  - a frozen source (same currentTime) is mirrored once per stall; the next mirror waits until it moves.
 * Nothing here logs tokens, URLs, room ids or member ids.
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionLinkedMirrorGuard) return;
  const DENIED = new Set([401, 403, 409]), BACKOFF_MS = [3000, 6000, 12000, 24000, 30000], STALL_EPS_SEC = .15;
  let authority = '', deniedFor = '', rebindFor = '', softFails = 0, quietUntil = 0, lastHost = null, reason = 'idle', stall = null, handoffRoom = '';
  const counts = {held: 0, denied: 0, backoff: 0, rebinds: 0, stallHeld: 0};
  const note = (kind, detail = {}) => window.watchFusionRoomSyncLog?.note?.(kind, detail);
  const now = () => performance.now();
  function keyOf(c) { return [c.roomId, c.linkId, c.hostId, c.linkedActive ? 1 : 0, c.sourceKey].join('|'); }
  function hold(why, say) {
    counts.held++;
    if (why !== reason && say) say(why);
    reason = why; return {allow: false, reason: why};
  }
  // c: {roomId, linkId, hostId, host, linkedActive, proof, sourceKey, sourceMatches, say}
  function gate(c = {}) {
    if (!c.roomId) { reason = 'solo'; return {allow: true, reason}; }
    const key = keyOf(c);
    if (key !== authority) { authority = key; softFails = 0; quietUntil = 0; }
    const host = c.host === true;
    if (lastHost === true && !host) { handoffRoom = c.roomId; note('host-link-lost', {reason: 'host-transferred'}); }
    if (lastHost === false && host) note('host-link-resumed', {reason: 'host-returned'});
    lastHost = host;
    if (!c.proof) return hold('link-not-in-room');
    if (!host) return hold('not-current-host', c.say);
    if (deniedFor === key) return hold('ownership-denied');
    if (now() < quietUntil) return hold('transport-backoff');
    if (!c.linkedActive) {
      if (c.sourceMatches && handoffRoom === c.roomId && rebindFor !== key) {
        rebindFor = key; counts.rebinds++; note('host-link-restore-attempt', {reason: 'same-source'});
        reason = 'rebinding'; return {allow: false, rebind: true, reason};
      }
      return hold('room-link-detached', c.say);
    }
    reason = 'authorized'; return {allow: true, reason};
  }
  function result(ok, status = 0, say) {
    if (ok) { softFails = 0; quietUntil = 0; return; }
    const code = Number(status) || 0;
    if (DENIED.has(code)) {
      if (deniedFor !== authority) { counts.denied++; note('host-link-denied', {status: code}); say?.('ownership-denied'); }
      deniedFor = authority; reason = 'ownership-denied'; return;
    }
    if (code === 408) { quietUntil = now() + 500; reason = 'sample-expired'; return; }
    const wait = BACKOFF_MS[Math.min(softFails, BACKOFF_MS.length - 1)];
    softFails++; quietUntil = now() + wait; counts.backoff++; reason = 'transport-backoff';
    if (softFails === 1 || softFails % 5 === 0) note('host-link-suppressed', {status: code, backoffMs: wait});
  }
  // true = skip this publish: the source is still frozen where the last mirror already put the room.
  function stalledRepeat(plan, metadata = {}, page = '') {
    if (!plan?.publish) return false;
    const t = Number(metadata.currentTime);
    if (plan.reason !== 'drift' || metadata.paused || metadata.ended || !Number.isFinite(t)) { stall = null; return false; }
    if (stall && stall.page === page && Math.abs(t - stall.t) < STALL_EPS_SEC) {
      if (!stall.noted) { stall.noted = true; note('source-stall-held', {positionMs: Math.round(t * 1000)}); }
      counts.stallHeld++; return true;
    }
    stall = {page, t, noted: false}; return false;
  }
  function reset() { deniedFor = ''; rebindFor = ''; softFails = 0; quietUntil = 0; stall = null; reason = 'manual-reconnect'; }
  window.WatchFusionLinkedMirrorGuard = {version: 'v13.10.8', gate, result, stalledRepeat, reset,
    diagnostics: () => ({reason, ...counts, softFails, backoffMs: Math.max(0, Math.round(quietUntil - now())), host: lastHost})};
})();
