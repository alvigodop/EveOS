/* v13.10.5 precision thresholds (Drift policy: <=50 Locked, 50-100 Refining, >100 must act) and independent peer corroboration.
 * This is player-timeline precision, not a measurement of speaker audio output.
 */
(() => {
  'use strict';
  const LOCK_MS = 50, ACTION_MS = 100, HARD_REJOIN_MS = 160;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function witness(peer, localOffsetMs) {
    if (!peer || peer.count < 2 || !finite(peer.offsetMs) || !finite(peer.spreadMs) ||
        !finite(peer.ageMs) || peer.ageMs > 1500 || peer.ageMs < 0 || peer.spreadMs > 110 ||
        Math.abs(peer.offsetMs) > 70 || !finite(localOffsetMs)) return null;
    const gapMs = localOffsetMs - peer.offsetMs;
    const confidenceMs = Math.max(45, peer.spreadMs / 2 + 20); // never claim better than the measured peer spread allows
    return { gapMs, confidenceMs, independent: Math.abs(gapMs) > confidenceMs,
      peerCount:peer.count, peerSpreadMs:peer.spreadMs };
  }
  function trustedHostReference(coordination, peer, hostOffsetMs) {
    if (!coordination || coordination.authorityBuffering || coordination.source !== 'live' ||
        !finite(coordination.uncertaintyMs) || coordination.uncertaintyMs > 125) return null;
    if (!['peer-cohort','room-clock','linked-source'].includes(coordination.reference)) return null;
    const peers = witness(peer, hostOffsetMs);
    if (peers && peers.independent) return {
      kind:'peer-corroborated', precisionMs:Math.min(coordination.uncertaintyMs, peers.confidenceMs), peers
    };
    if (coordination.uncertaintyMs <= 45 && coordination.reference !== 'room-clock') return {
      kind:'source-verified',precisionMs:coordination.uncertaintyMs,peers:null
    };
    return null;
  }
  function zone(errorMs) {
    if (!finite(errorMs)) return 'unmeasured';
    const magnitude = Math.abs(errorMs);
    return magnitude <= LOCK_MS + .5 ? 'locked' : magnitude <= ACTION_MS + .5 ? 'refining' : 'correcting';
  }
  function label({ready,buffering,playing,correcting,errorMs,reason}={}) {
    if (!ready) return 'Loading';
    if (buffering) return 'Buffering';
    if (!playing) return 'Paused';
    if (correcting) return 'Correcting';
    const state = zone(errorMs);
    if (state === 'unmeasured') return 'Timing unavailable';
    if (state === 'locked') return 'Locked';
    if (state === 'refining') return 'Refining';
    if (/^(?:rate-converging|rate-started|rejoin-started|host-peer-rejoin|host-rejoin-verifying|corroborating-host-drift|correction-cooldown|stall-kick-started|hold-started|host-zero-centering|decoder-reload-once|fine-drift-awaiting-capability)$/.test(reason || '')) return 'Correcting';
    return 'Recovery needed';
  }
  globalThis.WatchFusionPrecisionPolicy = Object.freeze({
    version:'v13.10.5', LOCK_MS, ACTION_MS, HARD_REJOIN_MS,
    witness, trustedHostReference, zone, label
  });
})();
