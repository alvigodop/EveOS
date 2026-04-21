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

        return { openEntry, openEntryDirect };
    };
})();
