window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.sharedUiReady) return;

    if (typeof ns.isLibraryFieldsCollapsed !== 'boolean') {
        ns.isLibraryFieldsCollapsed = false;
    }

    ns.getLibraryFormToggle = function () {
        return document.getElementById('linkLibraryToggle');
    };

    ns.getLibraryFieldsContainer = function () {
        return document.getElementById('linkLibraryFields');
    };

    ns.getLibraryCollapseButton = function () {
        return document.getElementById('linkLibraryCollapseBtn');
    };

    ns.setLibraryFieldsVisibility = function (isVisible) {
        const container = ns.getLibraryFieldsContainer();
        const collapseBtn = ns.getLibraryCollapseButton();
        if (collapseBtn) {
            collapseBtn.style.display = isVisible ? 'inline-flex' : 'none';
            collapseBtn.textContent = isVisible
                ? (ns.isLibraryFieldsCollapsed ? 'Expand' : 'Collapse')
                : 'Collapse';
            collapseBtn.setAttribute('aria-expanded', (isVisible && !ns.isLibraryFieldsCollapsed) ? 'true' : 'false');
        }
        if (container) {
            container.style.display = (isVisible && !ns.isLibraryFieldsCollapsed) ? 'block' : 'none';
        }
    };

    ns.setLibraryFieldsCollapsed = function (isCollapsed) {
        ns.isLibraryFieldsCollapsed = !!isCollapsed;
        const toggle = ns.getLibraryFormToggle();
        ns.setLibraryFieldsVisibility(!!toggle?.checked);
    };

    ns.formatLibraryTimestamp = function (value) {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '-';
        return parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    ns.isAutoSourceSummary = function (summaryValue) {
        if (!summaryValue) return false;
        return /^Source:\s*https?:\/\//i.test(String(summaryValue).trim());
    };

    ns.sharedUiReady = true;
})(window.EveLinkForm);
