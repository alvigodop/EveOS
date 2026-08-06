// When to stop asking a failing native bridge, for the live PCM lane only.
//
// The realtime lane deliberately ignores the ordinary bridge-down cooldown: chunks arrive every
// ~40ms and one transient failure must not mute the router mid-sentence. But there was no handling
// for a bridge that fails EVERY time -- a stale output device, or a server running older code --
// and each chunk then awaits a full HTTP round-trip before it can be scheduled for playback. The
// scheduler starves between bursts, the queue drains to zero, and the voice breaks into 40ms
// fragments. That is the chop: the audio path was gated on a dead endpoint.
//
// So: tolerate a few failures (the original intent), then go quiet briefly. The window is short
// because the bridge genuinely may come back -- restarting the EveOS server is the common fix --
// and being 3s late to notice is far cheaper than stalling every chunk in the meantime.
window.EveAudioflixNativeBackoff = window.EveAudioflixNativeBackoff || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixNativeBackoff;
    if (ns.ready) return;

    // Roughly three chunks: long enough that a lone hiccup still retries immediately, short enough
    // that a dead bridge stops gating playback within ~120ms of audio.
    const FAIL_TOLERANCE = 3;
    const QUIET_MS = 3000;

    let failStreak = 0;
    let quietUntil = 0;

    function shouldSkipRealtime() {
        return Date.now() < quietUntil;
    }

    function noteRealtimeResult(ok) {
        if (ok) {
            failStreak = 0;
            quietUntil = 0;
            return;
        }
        failStreak += 1;
        if (failStreak >= FAIL_TOLERANCE) {
            quietUntil = Date.now() + QUIET_MS;
            // Re-arm rather than latch: after the window one attempt decides again, so a bridge
            // that recovers is picked up on the next chunk instead of staying shunned.
            failStreak = 0;
        }
    }

    function reset() {
        failStreak = 0;
        quietUntil = 0;
    }

    Object.assign(ns, {
        ready: true,
        FAIL_TOLERANCE,
        QUIET_MS,
        shouldSkipRealtime,
        noteRealtimeResult,
        reset,
        getQuietUntil: () => quietUntil
    });
})();
