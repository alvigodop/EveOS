window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    const REQUEST_TYPE = 'eve:matrix-phone:request-snapshot';
    const RESPONSE_TYPE = 'eve:matrix-phone:snapshot';
    const UPDATE_REQUEST_TYPE = 'eve:matrix-phone:update-bookmark';
    const UPDATE_RESPONSE_TYPE = 'eve:matrix-phone:bookmark-updated';
    const PLAY_AUDIO_REQUEST_TYPE = 'eve:matrix-phone:play-audio';
    const PLAY_AUDIO_RESPONSE_TYPE = 'eve:matrix-phone:audio-played';
    const INVALIDATED_TYPE = 'eve:matrix-phone:state-changed';
    let mutationTimer = 0;

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    async function playAudioflixItem(audioType, audioId) {
        try {
            await window.EveAudioflixLinks?.play?.(audioType, audioId);
            return { ok: true, audioType: text(audioType, 'music'), audioId: text(audioId, '') };
        } catch (error) {
            return {
                ok: false,
                audioType: text(audioType, 'music'),
                audioId: text(audioId, ''),
                message: error?.message || 'Audioflix playback failed.'
            };
        }
    }

    function getTrustedClientWindows() {
        const windows = [];
        const frameWindow = document.getElementById('matrix-workshop-frame')?.contentWindow;
        const detachedWindow = ns.getDetachedWindow?.();
        if (frameWindow) windows.push(frameWindow);
        if (detachedWindow && !detachedWindow.closed) windows.push(detachedWindow);
        return windows;
    }

    function isTrustedClient(source) {
        return !!source && getTrustedClientWindows().some(function (candidate) {
            return candidate === source;
        });
    }

    function postToClient(client, payload) {
        if (!client || client.closed) return;
        try {
            const targetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
            client.postMessage(payload, targetOrigin);
        } catch (error) {
            console.warn('[MatrixWorkshop] Could not send datapack message.', error);
        }
    }

    function broadcastInvalidated(reason) {
        getTrustedClientWindows().forEach(function (client) {
            postToClient(client, {
                type: INVALIDATED_TYPE,
                reason: text(reason, 'state-mutated'),
                scope: ns.getScope?.() || null
            });
        });
    }

    window.addEventListener('message', async function (event) {
        if (event.origin !== 'null' && event.origin !== window.location.origin) return;
        if (!isTrustedClient(event.source)) return;
        if (event.data?.type === REQUEST_TYPE) {
            postToClient(event.source, {
                type: RESPONSE_TYPE,
                requestId: text(event.data.requestId, ''),
                snapshot: ns.captureDatapackSnapshot?.(ns.getScope?.())
            });
            return;
        }
        if (event.data?.type === UPDATE_REQUEST_TYPE) {
            let result = {
                ok: false,
                sourceId: text(event.data.sourceId, ''),
                message: 'Bookmark update service is unavailable.'
            };
            try {
                if (typeof ns.updateDatapackBookmark === 'function') {
                    result = await ns.updateDatapackBookmark(event.data.sourceId, event.data.patch);
                }
            } catch (error) {
                console.error('[MatrixWorkshop] Bookmark update failed.', error);
                result.message = error?.message || 'Bookmark update failed.';
            }
            postToClient(event.source, {
                type: UPDATE_RESPONSE_TYPE,
                requestId: text(event.data.requestId, ''),
                result
            });
            return;
        }
        if (event.data?.type === PLAY_AUDIO_REQUEST_TYPE) {
            const result = await playAudioflixItem(event.data.audioType, event.data.audioId);
            postToClient(event.source, {
                type: PLAY_AUDIO_RESPONSE_TYPE,
                requestId: text(event.data.requestId, ''),
                result
            });
        }
    });

    window.addEventListener('eve:state-mutated', function () {
        clearTimeout(mutationTimer);
        mutationTimer = window.setTimeout(function () {
            broadcastInvalidated('state-mutated');
        }, 250);
    });

    Object.assign(ns, {
        playAudioflixItem,
        broadcastDatapackInvalidated: broadcastInvalidated
    });
})(window.EveMatrixWorkshop);
