window.EveMatrixDatapackPhoneBridge = (function () {
    'use strict';

    var REQUEST_TYPE = 'eve:matrix-phone:request-snapshot';
    var RESPONSE_TYPE = 'eve:matrix-phone:snapshot';
    var UPDATE_REQUEST_TYPE = 'eve:matrix-phone:update-bookmark';
    var UPDATE_RESPONSE_TYPE = 'eve:matrix-phone:bookmark-updated';
    var INVALIDATED_TYPE = 'eve:matrix-phone:state-changed';
    var REQUEST_TIMEOUT_MS = 4000;
    var requestSequence = 0;
    var pending = new Map();
    var pendingUpdates = new Map();
    var subscribers = new Set();

    function text(value, fallback) {
        var normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function disconnectedSnapshot() {
        return {
            connected: false,
            scope: null,
            scopeLabel: 'No EveOS connection',
            uniqueBookmarkCount: 0,
            workspaces: [],
            cards: [],
            bookmarks: [],
            capturedAt: Date.now()
        };
    }

    function getCandidates() {
        var candidates = [];
        if (window.parent && window.parent !== window) candidates.push(window.parent);
        if (window.opener && !window.opener.closed) candidates.push(window.opener);
        return candidates;
    }

    function getDirectHost() {
        var candidates = getCandidates();
        for (var index = 0; index < candidates.length; index += 1) {
            try {
                if (typeof candidates[index].EveMatrixWorkshop?.captureDatapackSnapshot === 'function') {
                    return candidates[index];
                }
            } catch (error) {
                // file:// parents are intentionally opaque; postMessage handles them.
            }
        }
        return null;
    }

    function postRequest(requestId) {
        getCandidates().forEach(function (candidate) {
            try {
                candidate.postMessage({
                    type: REQUEST_TYPE,
                    requestId: requestId
                }, '*');
            } catch (error) {
                // Continue to any remaining parent/opener candidate.
            }
        });
    }

    function capture() {
        var directHost = getDirectHost();
        if (directHost) {
            try {
                return Promise.resolve(
                    directHost.EveMatrixWorkshop.captureDatapackSnapshot(
                        directHost.EveMatrixWorkshop.getScope?.()
                    )
                );
            } catch (error) {
                // Fall through to the file-safe message bridge.
            }
        }

        var candidates = getCandidates();
        if (!candidates.length) return Promise.resolve(disconnectedSnapshot());
        requestSequence += 1;
        var requestId = 'matrix-phone-' + Date.now() + '-' + requestSequence;
        return new Promise(function (resolve) {
            var timer = window.setTimeout(function () {
                pending.delete(requestId);
                resolve(disconnectedSnapshot());
            }, REQUEST_TIMEOUT_MS);
            pending.set(requestId, {
                resolve: resolve,
                timer: timer
            });
            postRequest(requestId);
        });
    }

    function updateBookmark(sourceId, patch) {
        var directHost = getDirectHost();
        if (directHost) {
            try {
                return Promise.resolve(
                    directHost.EveMatrixWorkshop.updateDatapackBookmark(sourceId, patch)
                );
            } catch (error) {
                // Fall through to the file-safe message bridge.
            }
        }

        var candidates = getCandidates();
        if (!candidates.length) {
            return Promise.resolve({ ok: false, message: 'No EveOS connection.' });
        }
        requestSequence += 1;
        var requestId = 'matrix-phone-update-' + Date.now() + '-' + requestSequence;
        return new Promise(function (resolve) {
            var timer = window.setTimeout(function () {
                pendingUpdates.delete(requestId);
                resolve({ ok: false, message: 'EveOS did not respond.' });
            }, REQUEST_TIMEOUT_MS);
            pendingUpdates.set(requestId, { resolve: resolve, timer: timer });
            candidates.forEach(function (candidate) {
                try {
                    candidate.postMessage({
                        type: UPDATE_REQUEST_TYPE,
                        requestId: requestId,
                        sourceId: sourceId,
                        patch: patch
                    }, '*');
                } catch (error) {
                    // Continue to any remaining parent/opener candidate.
                }
            });
        });
    }

    function isCandidateSource(source) {
        return getCandidates().some(function (candidate) {
            return candidate === source;
        });
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== 'null' && event.origin !== window.location.origin) return;
        if (!isCandidateSource(event.source)) return;
        var data = event.data || {};
        if (data.type === RESPONSE_TYPE) {
            var requestId = text(data.requestId, '');
            var request = pending.get(requestId);
            if (!request) return;
            window.clearTimeout(request.timer);
            pending.delete(requestId);
            request.resolve(data.snapshot || disconnectedSnapshot());
            return;
        }
        if (data.type === UPDATE_RESPONSE_TYPE) {
            var updateId = text(data.requestId, '');
            var updateRequest = pendingUpdates.get(updateId);
            if (!updateRequest) return;
            window.clearTimeout(updateRequest.timer);
            pendingUpdates.delete(updateId);
            updateRequest.resolve(data.result || {
                ok: false,
                message: 'EveOS returned no update result.'
            });
            return;
        }
        if (data.type === INVALIDATED_TYPE) {
            subscribers.forEach(function (callback) {
                try {
                    callback(data);
                } catch (error) {
                    console.warn('[Matrix Phone] State subscriber failed.', error);
                }
            });
        }
    });

    function subscribe(callback) {
        if (typeof callback !== 'function') return function () {};
        subscribers.add(callback);
        return function () {
            subscribers.delete(callback);
        };
    }

    return {
        capture: capture,
        getHost: getDirectHost,
        subscribe: subscribe,
        updateBookmark: updateBookmark
    };
})();
