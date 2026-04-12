// --- Custom Bookmark Order API ---
window.EveCustomOrder = (function () {

    function buildScopeKey(wsId, category) {
        return String(wsId || 'main').trim() + '::' + String(category || 'Unsorted').trim();
    }

    function isEnabled(wsId, category) {
        var key = buildScopeKey(wsId, category);
        return Array.isArray(config.customOrderEnabled) && config.customOrderEnabled.includes(key);
    }

    function toggle(wsId, category, links) {
        var key = buildScopeKey(wsId, category);
        if (!Array.isArray(config.customOrderEnabled)) config.customOrderEnabled = [];
        if (!config.customOrder) config.customOrder = {};

        if (config.customOrderEnabled.includes(key)) {
            // Disable
            config.customOrderEnabled = config.customOrderEnabled.filter(function (k) { return k !== key; });
            // Clean up sort mode
            if (config.customOrderSort) delete config.customOrderSort[key];
        } else {
            // Enable — initialize order from current positions if not already set
            config.customOrderEnabled.push(key);
            if (!config.customOrder[key]) {
                initializeOrder(key, links);
            }
        }
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function initializeOrder(key, links) {
        if (!config.customOrder) config.customOrder = {};
        var orderMap = {};
        if (Array.isArray(links)) {
            links.forEach(function (link, index) {
                orderMap[String(link.id)] = index + 1;
            });
        }
        config.customOrder[key] = orderMap;
    }

    function getOrderMap(wsId, category) {
        var key = buildScopeKey(wsId, category);
        if (!config.customOrder) config.customOrder = {};
        return config.customOrder[key] || {};
    }

    function getNumber(wsId, category, linkId) {
        var map = getOrderMap(wsId, category);
        var num = map[String(linkId)];
        return typeof num === 'number' ? num : null;
    }

    function setNumber(wsId, category, linkId, newNumber) {
        var key = buildScopeKey(wsId, category);
        if (!config.customOrder) config.customOrder = {};
        if (!config.customOrder[key]) config.customOrder[key] = {};

        var map = config.customOrder[key];
        var targetId = String(linkId);
        var oldNumber = map[targetId];
        newNumber = parseInt(newNumber, 10);

        if (isNaN(newNumber) || newNumber < 1) return false;
        if (newNumber === oldNumber) return false;

        // Find the link that currently has the target number and swap
        var swapId = null;
        Object.keys(map).forEach(function (id) {
            if (map[id] === newNumber) {
                swapId = id;
            }
        });

        if (swapId && swapId !== targetId) {
            // Swap: give the other link our old number
            map[swapId] = oldNumber || 1;
        }
        map[targetId] = newNumber;

        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    function ensureAllLinksHaveNumbers(wsId, category, links) {
        if (!isEnabled(wsId, category)) return;
        var key = buildScopeKey(wsId, category);
        if (!config.customOrder) config.customOrder = {};
        if (!config.customOrder[key]) config.customOrder[key] = {};

        var map = config.customOrder[key];
        var usedNumbers = new Set(Object.values(map));
        var nextNumber = 1;
        var dirty = false;

        links.forEach(function (link) {
            var id = String(link.id);
            if (typeof map[id] !== 'number') {
                // Find next available number
                while (usedNumbers.has(nextNumber)) nextNumber++;
                map[id] = nextNumber;
                usedNumbers.add(nextNumber);
                dirty = true;
                nextNumber++;
            }
        });

        if (dirty) saveConfig();
    }

    function getSortMode(wsId, category) {
        var key = buildScopeKey(wsId, category);
        if (!config.customOrderSort) return 'none';
        return config.customOrderSort[key] || 'none';
    }

    function cycleSortMode(wsId, category) {
        var key = buildScopeKey(wsId, category);
        if (!config.customOrderSort) config.customOrderSort = {};
        var modes = ['none', 'asc', 'desc'];
        var current = config.customOrderSort[key] || 'none';
        var idx = modes.indexOf(current);
        var next = modes[(idx + 1) % modes.length];
        config.customOrderSort[key] = next;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function applySorting(links, wsId, category) {
        var mode = getSortMode(wsId, category);
        if (mode === 'none') return links;

        var sorted = links.slice();

        if (isEnabled(wsId, category)) {
            // Sort by custom order numbers
            var map = getOrderMap(wsId, category);
            sorted.sort(function (a, b) {
                var na = typeof map[String(a.id)] === 'number' ? map[String(a.id)] : 9999;
                var nb = typeof map[String(b.id)] === 'number' ? map[String(b.id)] : 9999;
                return mode === 'asc' ? na - nb : nb - na;
            });
        } else {
            // Fallback: sort alphabetically by title
            sorted.sort(function (a, b) {
                var ta = String(a.title || '').toLowerCase();
                var tb = String(b.title || '').toLowerCase();
                return mode === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
            });
        }
        return sorted;
    }

    return {
        buildScopeKey: buildScopeKey,
        isEnabled: isEnabled,
        toggle: toggle,
        getOrderMap: getOrderMap,
        getNumber: getNumber,
        setNumber: setNumber,
        ensureAllLinksHaveNumbers: ensureAllLinksHaveNumbers,
        getSortMode: getSortMode,
        cycleSortMode: cycleSortMode,
        applySorting: applySorting
    };
})();
