// --- Unidex View Core Entry Action Helpers ---
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createCoreEntryActions) return;

    window.UnidexViewModules.createCoreEntryActions = function createCoreEntryActions(deps) {
        const helpers = deps.helpers;
        const openFromDashboard = typeof deps?.openFromDashboard === 'function'
            ? deps.openFromDashboard
            : (typeof openBookmarkFromDashboard === 'function' ? openBookmarkFromDashboard : null);
        const normalizeEntryUrl = typeof deps?.normalizeEntryUrl === 'function'
            ? deps.normalizeEntryUrl
            : function (url) {
                return typeof normalizeUrl === 'function' ? normalizeUrl(url) : url;
            };
        const openUrl = typeof deps?.openUrl === 'function'
            ? deps.openUrl
            : function (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            };

        function openEntry(linkIdParam, event) {
            if (event?.preventDefault) event.preventDefault();
            if (event?.stopPropagation) event.stopPropagation();
            const linkId = helpers.decodeParam(linkIdParam);
            if (!linkId) return false;
            if (openFromDashboard) {
                return openFromDashboard(event, linkId);
            }
            const link = typeof helpers.resolveLinkById === 'function'
                ? helpers.resolveLinkById(linkId)
                : helpers.getAllLinks().find(function (item) {
                    return String(item.id) === String(linkId);
                });
            if (link?.url) {
                openUrl(normalizeEntryUrl(link.url));
            }
            return false;
        }

        function openEntryDirect(linkIdParam, event) {
            if (event?.preventDefault) event.preventDefault();
            if (event?.stopPropagation) event.stopPropagation();
            const linkId = helpers.decodeParam(linkIdParam);
            if (!linkId) return false;
            const link = typeof helpers.resolveLinkById === 'function'
                ? helpers.resolveLinkById(linkId)
                : helpers.getAllLinks().find(function (item) {
                    return String(item.id) === String(linkId);
                });
            if (!link?.url) return false;
            openUrl(normalizeEntryUrl(link.url));
            return false;
        }

        function getLinkApi() {
            return window.EveOS?.NebulaJsonLink
                || window.EveOS?.SearchAdvanced?.NebulaJsonLink
                || window.NebulaJsonLink
                || null;
        }

        function getEntryJsonLink(linkIdParam) {
            const linkId = helpers.decodeParam(linkIdParam);
            if (!linkId) return '';
            const link = typeof helpers.resolveLinkById === 'function'
                ? helpers.resolveLinkById(linkId)
                : helpers.getAllLinks().find(function (item) {
                    return String(item.id) === String(linkId);
                });
            const api = getLinkApi();
            return link && api?.createLink ? api.createLink(link) : '';
        }

        function runJsonLinkAction(linkIdParam, event, actionId) {
            if (event?.preventDefault) event.preventDefault();
            if (event?.stopPropagation) event.stopPropagation();
            const api = getLinkApi();
            const entityLink = getEntryJsonLink(linkIdParam);
            if (!api?.executeAction || !entityLink) {
                if (typeof showToast === 'function') showToast('Unidex JSON link is not available for this bookmark.', 'warning');
                return false;
            }
            const outcome = api.executeAction(actionId, entityLink);
            if (actionId === 'validate') {
                if (outcome?.valid || outcome?.ok) {
                    if (typeof showToast === 'function') showToast('Unidex entity link is valid.', 'success');
                } else if (typeof showToast === 'function') {
                    showToast('Unidex entity link issue: ' + ((outcome?.errors || outcome?.warnings || []).join(', ') || 'invalid link'), 'warning');
                }
            } else if (!outcome?.ok && typeof showToast === 'function') {
                showToast('Could not open JSON State from Unidex.', 'warning');
            }
            return false;
        }

        function openEntryJsonState(linkIdParam, event) {
            return runJsonLinkAction(linkIdParam, event, 'open-json-state');
        }

        function validateEntryJsonLink(linkIdParam, event) {
            return runJsonLinkAction(linkIdParam, event, 'validate');
        }

        return { openEntry, openEntryDirect, openEntryJsonState, validateEntryJsonLink };
    };
})();
