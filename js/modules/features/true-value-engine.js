// --- True Value Approximation Sorting Engine ---
// Blends bookmark positional numbering with library/API rating signals
// to produce fractional position scores for sorting.
window.EveTrueValue = (function () {

    function buildScopeKey(wsId, category) {
        return String(wsId || 'main').trim() + '::' + String(category || 'Unsorted').trim();
    }

    // --- Toggle ---

    function isEnabled(wsId, category) {
        var key = buildScopeKey(wsId, category);
        return Array.isArray(config.trueValueEnabled) && config.trueValueEnabled.includes(key);
    }

    function toggle(wsId, category) {
        var key = buildScopeKey(wsId, category);
        if (!Array.isArray(config.trueValueEnabled)) config.trueValueEnabled = [];
        if (config.trueValueEnabled.includes(key)) {
            config.trueValueEnabled = config.trueValueEnabled.filter(function (k) { return k !== key; });
        } else {
            config.trueValueEnabled.push(key);
        }
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    // --- Settings ---

    function getSettings(wsId, category) {
        var key = buildScopeKey(wsId, category);
        var perScope = (config.trueValueSettings && config.trueValueSettings[key]) || {};
        return {
            ratingScale: perScope.ratingScale || 'hybrid',     // hybrid | personal | api_weighted | api_average | confidence
            influenceWeight: typeof perScope.influenceWeight === 'number' ? perScope.influenceWeight : 0.5,  // 0.0–1.0
            ratingMax: 10  // rating scale ceiling
        };
    }

    // --- Library Resolution ---

    function resolveLibraryEntry(linkId) {
        var ConnectionsAPI = window.EveLibrary && window.EveLibrary.ConnectionsAPI;
        var ConnectionsCore = window.EveLibrary && window.EveLibrary.ConnectionsCore;
        var Derived = window.EveLibrary && window.EveLibrary.RatingsEngineDerived;
        if (!ConnectionsCore && !ConnectionsAPI) return null;

        // Find connection for this bookmark
        var findConn = (ConnectionsCore && ConnectionsCore.findConnectionByLinkId)
            || (ConnectionsAPI && ConnectionsAPI.findConnectionByLinkId);
        if (!findConn) return null;

        var conn = findConn(linkId);
        if (!conn) return null;

        // Resolve the library entry
        var findEntry = (ConnectionsCore && ConnectionsCore.findEntryByConnection)
            || (ConnectionsAPI && ConnectionsAPI.findEntryByConnection);
        if (!findEntry) return null;

        var result = findEntry(conn);
        if (!result || !result.entry) return null;

        var entry = result.entry;

        // Compute derived ratings if not already present
        if (Derived && Derived.computeDerivedRatings && !entry.derivedRatings) {
            entry.derivedRatings = Derived.computeDerivedRatings(entry);
        }

        return entry;
    }

    function getRatingValue(entry, scale) {
        if (!entry) return null;

        var Derived = window.EveLibrary && window.EveLibrary.RatingsEngineDerived;
        if (Derived && Derived.getRatingValue) {
            var val = Derived.getRatingValue(entry, scale);
            return (val !== null && val !== undefined && !isNaN(val)) ? val : null;
        }

        // Fallback: try direct fields
        var derived = entry.derivedRatings || {};
        switch (scale) {
            case 'personal': return typeof derived.personal10 === 'number' ? derived.personal10 : null;
            case 'api_average': return typeof derived.apiAverage10 === 'number' ? derived.apiAverage10 : null;
            case 'api_weighted': return typeof derived.apiWeighted10 === 'number' ? derived.apiWeighted10 : null;
            case 'confidence': return typeof derived.confidence === 'number' ? derived.confidence : null;
            case 'hybrid':
            default:
                return typeof derived.hybrid10 === 'number' ? derived.hybrid10 : null;
        }
    }

    // --- Core Computation ---

    function computeTrueValues(links, wsId, category) {
        if (!isEnabled(wsId, category) || !Array.isArray(links) || !links.length) return {};

        var settings = getSettings(wsId, category);
        var customOrderApi = window.EveCustomOrder;
        var customEnabled = customOrderApi && customOrderApi.isEnabled(wsId, category);
        var results = {};

        // Step 1: Assign base positions
        // Prefer link._basePos (pre-stamped before sorting for stability)
        links.forEach(function (link, index) {
            var linkId = String(link.id);
            var basePos;
            if (typeof link._basePos === 'number') {
                // Use pre-stamped stable position
                basePos = link._basePos;
            } else if (customEnabled) {
                basePos = customOrderApi.getNumber(wsId, category, linkId);
                if (basePos === null) basePos = index + 1;
            } else {
                basePos = index + 1;
            }

            // Step 2: Resolve library entry
            var entry = resolveLibraryEntry(linkId);

            if (!entry) {
                // No library link — permanently locked at integer position
                results[linkId] = {
                    basePos: basePos,
                    truePos: basePos,
                    locked: true,
                    rating: null,
                    influence: 0,
                    percent: 100
                };
                return;
            }

            // Step 3: Get rating value
            var rating = getRatingValue(entry, settings.ratingScale);

            if (rating === null || rating <= 0) {
                // Has library link but no valid rating — treat as locked
                results[linkId] = {
                    basePos: basePos,
                    truePos: basePos,
                    locked: true,
                    rating: 0,
                    influence: 0,
                    percent: 100
                };
                return;
            }

            // Step 4: Compute influence
            // influence: 0.0 (no effect) to 1.0 (maximum displacement)
            var rawInfluence = rating / settings.ratingMax;   // 0.0 to 1.0
            var influence = rawInfluence * settings.influenceWeight;  // apply weight cap

            // Step 5: Compute approximated position
            // Higher rating → position moves toward 0 (top)
            // truePos = basePos * (1 - influence)
            // With influence=1.0 and rating=10: truePos = 0
            // With influence=0.5 and rating=10: truePos = basePos * 0.5
            // With influence=0 or rating=0: truePos = basePos
            var truePos = basePos * (1 - influence);

            // Percent of true value from user's perspective:
            // 100% = exactly at base position (no change)
            // >100% = moved up (high rating = more meritorious)
            // <100% = moved down
            var percent = truePos > 0 && basePos > 0 ? (basePos / truePos) * 100 : 100;

            results[linkId] = {
                basePos: basePos,
                truePos: Math.round(truePos * 10000) / 10000,  // 4 decimal precision
                locked: false,
                rating: Math.round(rating * 100) / 100,
                influence: Math.round(influence * 1000) / 1000,
                percent: Math.round(percent * 10) / 10
            };
        });

        return results;
    }

    // --- Display Formatting ---

    function formatTrueValue(data, allData) {
        if (!data) return '#?';
        if (data.locked) return '#' + data.basePos;

        var pos = data.truePos;

        // Find neighbors with similar values for precision
        var neighbors = [];
        if (allData) {
            Object.keys(allData).forEach(function (id) {
                var d = allData[id];
                if (!d.locked && Math.abs(d.truePos - pos) < 1) {
                    neighbors.push(d.truePos);
                }
            });
        }

        // Determine required precision
        var precision = 1; // minimum 1 decimal
        if (neighbors.length > 1) {
            // Need enough precision to distinguish
            for (var p = 1; p <= 4; p++) {
                var factor = Math.pow(10, p);
                var rounded = neighbors.map(function (v) { return Math.round(v * factor); });
                var unique = new Set(rounded);
                if (unique.size === neighbors.length) {
                    precision = p;
                    break;
                }
                precision = p + 1;
            }
        }

        // Format with smart ellipsis
        var formatted = pos.toFixed(Math.min(precision, 4));

        // Remove trailing zeros but keep at least 1 decimal
        formatted = formatted.replace(/0+$/, '');
        if (formatted.endsWith('.')) formatted += '0';

        // If more than 2 decimal digits, use ellipsis notation
        var parts = formatted.split('.');
        if (parts[1] && parts[1].length > 2) {
            formatted = parts[0] + '.' + parts[1].charAt(0) + '..' + parts[1].charAt(parts[1].length - 1);
        }

        return '#' + formatted;
    }

    // --- Sorting ---

    function applySorting(links, trueValues, sortMode) {
        if (!trueValues || !Object.keys(trueValues).length) return links;

        var sorted = links.slice();
        var dir = (sortMode === 'desc') ? -1 : 1;
        sorted.sort(function (a, b) {
            var va = trueValues[String(a.id)];
            var vb = trueValues[String(b.id)];
            var posA = va ? va.truePos : 9999;
            var posB = vb ? vb.truePos : 9999;
            return (posA - posB) * dir;
        });
        return sorted;
    }

    return {
        buildScopeKey: buildScopeKey,
        isEnabled: isEnabled,
        toggle: toggle,
        getSettings: getSettings,
        resolveLibraryEntry: resolveLibraryEntry,
        computeTrueValues: computeTrueValues,
        formatTrueValue: formatTrueValue,
        applySorting: applySorting
    };
})();
