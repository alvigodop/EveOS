// Identity check for the Audioflix native bridge.
//
// The bridge finds EveOS by trying a list of likely ports. That list is a GUESS, and those ports
// belong to whatever happens to be listening on this machine: with another project's HUD on 8770
// and a dev server on 3000, "find the bridge" turned into POSTing raw PCM at unrelated local
// services -- which is how foreign CORS failures ended up in the EveOS console.
//
// So a candidate must identify itself before it is allowed to carry any payload. EveOS answers
// /api/status with service: "eveos-local-server"; nothing else does. Split out of
// audioflix.native.js to keep that file under the project line cap.
window.EveAudioflixNativeIdentity = window.EveAudioflixNativeIdentity || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixNativeIdentity;
    if (ns.ready) return;

    const BRIDGE_SERVICE = 'eveos-local-server';
    const PROBE_TIMEOUT_MS = 800;
    // Rejections expire so a port that only later hosts EveOS is not blacklisted for the session.
    const REJECT_TTL_MS = 30000;

    const verified = new Set();
    const rejectedUntil = new Map();

    async function isEveOsBridge(base) {
        if (!base) return false;
        if (verified.has(base)) return true;
        if ((rejectedUntil.get(base) || 0) > Date.now()) return false;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        try {
            const response = await fetch(`${base}/api/status`, {
                cache: 'no-store',
                signal: controller.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (payload && payload.service === BRIDGE_SERVICE) {
                verified.add(base);
                rejectedUntil.delete(base);
                return true;
            }
        } catch (error) {
            // Unreachable, or a foreign service that refuses the read. Either way: not ours.
        } finally {
            clearTimeout(timer);
        }
        rejectedUntil.set(base, Date.now() + REJECT_TTL_MS);
        return false;
    }

    // Drop cached verdicts — used when the bridge is stopped, so a restart is re-checked instead of
    // trusting a base that has since gone away or changed hands.
    function reset() {
        verified.clear();
        rejectedUntil.clear();
    }

    Object.assign(ns, {
        ready: true,
        BRIDGE_SERVICE,
        isEveOsBridge,
        reset,
        isVerified: (base) => verified.has(base)
    });
})();
