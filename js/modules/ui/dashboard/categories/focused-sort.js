window.DashboardCategories = window.DashboardCategories || {};

(function (DashboardCategories) {
    function normalizeSortBy(rawValue) {
        var value = String(rawValue || 'none');
        var allowed = ['none', 'active', 'unified', 'personal', 'api_weighted', 'api_average', 'confidence'];
        return allowed.includes(value) ? value : 'none';
    }

    function normalizeSortOrder(rawValue) {
        var value = String(rawValue || 'desc');
        return value === 'asc' ? 'asc' : 'desc';
    }

    function normalizeNumber(value) {
        var numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : null;
    }

    function getLinkedLibraryEntry(linkId) {
        return window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(linkId || ''))?.entry || null;
    }

    function getSortValueForEntry(entry, sortBy) {
        if (!entry || sortBy === 'none') return null;

        var ratingsApi = window.EveLibrary?.Ratings;
        if (ratingsApi?.applyDerivedRatings) {
            ratingsApi.applyDerivedRatings(entry);
        }

        var derived = entry.derivedRatings || {};
        if (sortBy === 'active') {
            return ratingsApi?.getRatingValue ? normalizeNumber(ratingsApi.getRatingValue(entry)) : normalizeNumber(derived.hybrid10);
        }
        if (sortBy === 'unified') return normalizeNumber(derived.hybrid10);
        if (sortBy === 'personal') return normalizeNumber(derived.personal10);
        if (sortBy === 'api_weighted') return normalizeNumber(derived.apiWeighted10);
        if (sortBy === 'api_average') return normalizeNumber(derived.apiAverage10);
        if (sortBy === 'confidence') return normalizeNumber(derived.confidence);
        return null;
    }

    function compareLinkedItems(a, b, sortOrder) {
        var aValue = a.value;
        var bValue = b.value;

        if (aValue === null && bValue === null) return a.index - b.index;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (aValue !== bValue) {
            return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return a.index - b.index;
    }

    DashboardCategories.getFocusedEntriesSortBy = function () {
        return normalizeSortBy(config?.focusedEntriesSortBy || 'none');
    };

    DashboardCategories.getFocusedEntriesSortOrder = function () {
        return normalizeSortOrder(config?.focusedEntriesSortOrder || 'desc');
    };

    DashboardCategories.setFocusedEntriesSortBy = function (sortBy) {
        var nextSortBy = normalizeSortBy(sortBy);
        if (String(config?.focusedEntriesSortBy || 'none') === nextSortBy) return;
        config.focusedEntriesSortBy = nextSortBy;
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    };

    DashboardCategories.setFocusedEntriesSortOrder = function (sortOrder) {
        var nextSortOrder = normalizeSortOrder(sortOrder);
        if (String(config?.focusedEntriesSortOrder || 'desc') === nextSortOrder) return;
        config.focusedEntriesSortOrder = nextSortOrder;
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    };

    DashboardCategories.sortFocusedLinks = function (links) {
        var input = Array.isArray(links) ? links.slice() : [];
        var sortBy = DashboardCategories.getFocusedEntriesSortBy();
        if (sortBy === 'none') return input;

        var sortOrder = DashboardCategories.getFocusedEntriesSortOrder();
        var linkedItems = [];
        var linkedIndexById = new Map();

        input.forEach(function (link, index) {
            var linkId = String(link?.id || '');
            var entry = getLinkedLibraryEntry(linkId);
            if (!entry) return;

            var item = {
                index: index,
                link: link,
                value: getSortValueForEntry(entry, sortBy)
            };
            linkedItems.push(item);
            linkedIndexById.set(linkId, true);
        });

        if (!linkedItems.length) return input;

        linkedItems.sort(function (a, b) {
            return compareLinkedItems(a, b, sortOrder);
        });

        var sortedLinkedLinks = linkedItems.map(function (item) { return item.link; });
        var linkedCursor = 0;

        return input.map(function (link) {
            var linkId = String(link?.id || '');
            if (!linkedIndexById.has(linkId)) return link;
            var nextLinked = sortedLinkedLinks[linkedCursor];
            linkedCursor += 1;
            return nextLinked || link;
        });
    };
})(window.DashboardCategories);
