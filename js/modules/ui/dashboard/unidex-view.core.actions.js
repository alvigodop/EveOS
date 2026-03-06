// --- Unidex View Core Entry Action Helpers ---
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createCoreEntryActions) return;

    window.UnidexViewModules.createCoreEntryActions = function createCoreEntryActions(deps) {
        const helpers = deps.helpers;

        function openEntry(linkIdParam, event) {
            if (event?.preventDefault) event.preventDefault();
            if (event?.stopPropagation) event.stopPropagation();
            const linkId = helpers.decodeParam(linkIdParam);
            if (!linkId) return false;
            if (typeof openBookmarkFromDashboard === 'function') {
                return openBookmarkFromDashboard(event, linkId);
            }
            const link = helpers.getAllLinks().find(function (item) {
                return String(item.id) === String(linkId);
            });
            if (link?.url) {
                const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
                window.open(safeUrl, '_blank', 'noopener,noreferrer');
            }
            return false;
        }

        function openEntryDirect(linkIdParam, event) {
            if (event?.preventDefault) event.preventDefault();
            if (event?.stopPropagation) event.stopPropagation();
            const linkId = helpers.decodeParam(linkIdParam);
            if (!linkId) return false;
            const link = helpers.getAllLinks().find(function (item) {
                return String(item.id) === String(linkId);
            });
            if (!link?.url) return false;
            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
            window.open(safeUrl, '_blank', 'noopener,noreferrer');
            return false;
        }

        return { openEntry, openEntryDirect };
    };
})();
