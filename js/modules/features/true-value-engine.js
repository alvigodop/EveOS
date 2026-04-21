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
        var scale = perScope.ratingScale || 'hybrid';
        return {
            ratingScale: scale,     // hybrid | personal | api_weighted | api_average | confidence
            influenceWeight: typeof perScope.influenceWeight === 'number' ? perScope.influenceWeight : 0.5,  // 0.0–1.0
            ratingMax: scale === 'confidence' ? 1 : 10  // auto-detect ceiling
        };
    }

    // --- Library Resolution ---

    function resolveLibraryEntry(linkId) {
        var ConnectionsAPI = window.EveLibrary && window.EveLibrary.ConnectionsAPI;
        var ConnectionsCore = window.EveLibrary && window.EveLibrary.ConnectionsCore;
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

        return result.entry;
    }

    // --- Score Refresh ---

    /**
     * Re-derive ratings for a library entry from its sources + apiRatings.
     * Ensures derived ratings reflect the latest available data.
     */
    function refreshEntryRatings(entry) {
        if (!entry) return;
        var Ratings = window.EveLibrary && window.EveLibrary.Ratings;
        if (Ratings && typeof Ratings.applyDerivedRatings === 'function') {
            Ratings.applyDerivedRatings(entry);
            return;
        }
        // Fallback: use RatingsEngineDerived directly
        var Derived = window.EveLibrary && window.EveLibrary.RatingsEngineDerived;
        if (Derived && typeof Derived.computeDerivedRatings === 'function') {
            entry.derivedRatings = Derived.computeDerivedRatings(entry);
        }
    }

    /**
     * For a category, re-compute derived ratings for all linked library entries.
     * Pulls the latest scores from the library entry sources and apiRatings fields.
     * Returns the count of entries that were refreshed.
     */
    function refreshScoresForCategory(wsId, category) {
        var categoryLinks = getCategoryLinks(wsId, category);
        var refreshed = 0;
        categoryLinks.forEach(function (link) {
            var entry = resolveLibraryEntry(String(link.id));
            if (!entry) return;

            // Re-extract apiRatings from sources if sources exist
            var Ratings = window.EveLibrary && window.EveLibrary.Ratings;
            if (Ratings && entry.sources && Array.isArray(entry.sources) && entry.sources.length) {
                var extracted = Ratings.extractApiRatingsFromSources
                    ? Ratings.extractApiRatingsFromSources(entry.sources)
                    : null;
                if (extracted) {
                    // Merge: prefer newly extracted scores over existing
                    var merged = Ratings.mergeApiRatings
                        ? Ratings.mergeApiRatings(entry.apiRatings || {}, extracted)
                        : extracted;
                    entry.apiRatings = merged;
                }
                // Also merge source signals
                if (Ratings.extractSourceSignalsFromSources && Ratings.mergeSourceSignals) {
                    var newSignals = Ratings.extractSourceSignalsFromSources(entry.sources);
                    entry.sourceSignals = Ratings.mergeSourceSignals(entry.sourceSignals || {}, newSignals);
                }
            }

            refreshEntryRatings(entry);
            refreshed++;
        });
        return refreshed;
    }

    function getCategoryLinks(wsId, category) {
        var allLinks = typeof window.getLiveLinks === 'function'
            ? window.getLiveLinks()
            : ((window.eveState && window.eveState.links) || (typeof links !== 'undefined' ? links : []));
        var targetWs = String(wsId || 'main').trim();
        var targetCat = String(category || 'Unsorted').trim();
        return (Array.isArray(allLinks) ? allLinks : []).filter(function (link) {
            return String(link.workspace || 'main').trim() === targetWs
                && String(link.category || 'Unsorted').trim() === targetCat;
        });
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

    /**
     * Compute true value positions for a set of links.
     * Can also be called standalone by passing links not yet in a card context:
     *   computeTrueValues(links, wsId, category)
     *
     * Options object (3rd or 4th arg):
     *   forceEnabled: bool — skip the isEnabled check (for use in non-card views)
     *
     * Math model (bidirectional, neutral-midpoint):
     *   midpoint = ratingMax / 2  (e.g. 5 for a 0–10 scale)
     *   deviation = (rating - midpoint) / midpoint → range [-1, +1]
     *   displacement = deviation * influenceWeight → capped [-weight, +weight]
     *   truePos = basePos * (1 - displacement)
     *
     *   rating 10/10, weight 0.5  → deviation +1.0, displace +0.5  → truePos = base * 0.5 (moves UP)
     *   rating  5/10, weight 0.5  → deviation  0.0, displace  0.0  → truePos = base * 1.0 (neutral)
     *   rating  0/10, weight 0.5  → deviation -1.0, displace -0.5  → truePos = base * 1.5 (moves DOWN)
     */
    function computeTrueValues(links, wsId, category, options) {
        var opts = options || {};
        if (!opts.forceEnabled && !isEnabled(wsId, category)) return {};
        if (!Array.isArray(links) || !links.length) return {};

        var settings = getSettings(wsId, category);
        var customOrderApi = window.EveCustomOrder;
        var customEnabled = customOrderApi && customOrderApi.isEnabled(wsId, category);
        var midpoint = settings.ratingMax / 2;  // neutral rating (5 for 0–10 scale)
        var results = {};

        // Step 1: Assign base positions
        links.forEach(function (link, index) {
            var linkId = String(link.id);
            var basePos;
            if (typeof link._basePos === 'number') {
                basePos = link._basePos;
            } else if (customEnabled) {
                basePos = customOrderApi.getNumber(wsId, category, linkId);
                if (basePos === null) basePos = index + 1;
            } else {
                basePos = index + 1;
            }

            // Step 2: Resolve library entry and ensure fresh derived ratings
            var entry = resolveLibraryEntry(linkId);

            if (!entry) {
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

            refreshEntryRatings(entry);

            // Step 3: Get rating value
            var rating = getRatingValue(entry, settings.ratingScale);

            if (rating === null) {
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

            // Step 4: Bidirectional influence
            // deviation: -1.0 (worst) to +1.0 (best), 0 = neutral
            var deviation = midpoint > 0 ? (rating - midpoint) / midpoint : 0;
            // displacement: capped by influence weight
            var displacement = deviation * settings.influenceWeight;

            // Step 5: Compute approximated position
            // displacement > 0 → position moves UP (lower number = higher rank)
            // displacement < 0 → position moves DOWN (higher number = lower rank)
            // displacement = 0 → no change (neutral rating)
            var truePos = basePos * (1 - displacement);

            // Floor: position can never go below 0.1
            if (truePos < 0.1) truePos = 0.1;

            // Percent: how far from base position (100% = no change)
            // > 100% = moved up, < 100% = moved down
            var percent = basePos > 0 ? (basePos / truePos) * 100 : 100;

            results[linkId] = {
                basePos: basePos,
                truePos: Math.round(truePos * 10000) / 10000,
                locked: false,
                rating: Math.round(rating * 100) / 100,
                influence: Math.round(displacement * 1000) / 1000,
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
        refreshEntryRatings: refreshEntryRatings,
        refreshScoresForCategory: refreshScoresForCategory,
        computeTrueValues: computeTrueValues,
        formatTrueValue: formatTrueValue,
        applySorting: applySorting
    };
})();
