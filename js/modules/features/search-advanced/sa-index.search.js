window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexSearchRuntime) return;

    function create(deps) {
        const shared = deps?.shared || {};
        const runtimeIntegrity = deps?.runtimeIntegrity || {};
        const ensureFresh = deps?.ensureFresh;
        const loadPersistedSnapshot = deps?.loadPersistedSnapshot;
        const {
            SNAPSHOT_MAX_AGE_MS,
            state,
            now,
            text,
            normalizeText,
            toArray,
            computeFreshness
        } = shared;
        const {
            matchesScope,
            computeVisibility,
            computeHealth,
            diagnoseRecord
        } = runtimeIntegrity;

        function looseFuzzyMatch(haystack, needle) {
            if (!haystack || !needle || needle.length < 3) return false;
            let h = 0;
            let n = 0;
            while (h < haystack.length && n < needle.length) {
                if (haystack[h] === needle[n]) n += 1;
                h += 1;
            }
            return n === needle.length;
        }

        function tokenizeSearchText(value) {
            return normalizeText(value)
                .split(/[^a-z0-9]+/i)
                .map(function (token) { return text(token, ''); })
                .filter(Boolean);
        }

        function buildAcronym(value) {
            return tokenizeSearchText(value).map(function (token) {
                return token.charAt(0);
            }).join('');
        }

        function getTypoDistanceLimit(token) {
            const length = String(token || '').length;
            if (length < 4) return 0;
            if (length <= 6) return 1;
            return 2;
        }

        function boundedEditDistance(left, right, maxDistance) {
            const a = text(left, '');
            const b = text(right, '');
            const limit = Number(maxDistance || 0);
            if (!a || !b) return limit + 1;
            if (a === b) return 0;
            if (Math.abs(a.length - b.length) > limit) return limit + 1;

            let previous = new Array(b.length + 1);
            let current = new Array(b.length + 1);
            for (let j = 0; j <= b.length; j += 1) previous[j] = j;

            for (let i = 1; i <= a.length; i += 1) {
                current[0] = i;
                let rowMin = current[0];
                for (let j = 1; j <= b.length; j += 1) {
                    const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                    const value = Math.min(
                        previous[j] + 1,
                        current[j - 1] + 1,
                        previous[j - 1] + cost
                    );
                    current[j] = value;
                    if (value < rowMin) rowMin = value;
                }
                if (rowMin > limit) return limit + 1;
                const temp = previous;
                previous = current;
                current = temp;
            }

            return previous[b.length];
        }

        function tokenMatchScore(fieldTokens, queryTokens) {
            if (!fieldTokens.length || !queryTokens.length) return 0;
            let score = 0;
            let matched = 0;

            queryTokens.forEach(function (queryToken) {
                let best = 0;
                fieldTokens.forEach(function (fieldToken) {
                    if (fieldToken === queryToken) best = Math.max(best, 42);
                    else if (fieldToken.startsWith(queryToken)) best = Math.max(best, 34);
                    else if (fieldToken.includes(queryToken) && queryToken.length >= 3) best = Math.max(best, 24);
                    else {
                        const typoLimit = getTypoDistanceLimit(queryToken);
                        if (typoLimit > 0 && boundedEditDistance(fieldToken, queryToken, typoLimit) <= typoLimit) {
                            best = Math.max(best, typoLimit === 1 ? 30 : 22);
                        }
                    }
                });
                if (best > 0) {
                    matched += 1;
                    score += best;
                }
            });

            if (matched === queryTokens.length && queryTokens.length > 1) score += 24;
            return score;
        }

        function scoreField(value, query, options) {
            if (!value || !query) return 0;
            if (value === query) return 140;
            if (value.startsWith(query)) return 110;
            if (value.includes(query)) return 75;
            const tokens = tokenizeSearchText(value);
            const queryTokens = tokenizeSearchText(query);
            const tokenScore = tokenMatchScore(tokens, queryTokens);
            if (tokenScore) return Math.min(96, tokenScore);
            if (options?.acronym) {
                const acronym = buildAcronym(value);
                if (acronym && acronym === query) return 70;
                if (acronym && query.length >= 2 && acronym.startsWith(query)) return 44;
            }
            if (looseFuzzyMatch(value, query)) return 18;
            return 0;
        }

        function computeScore(record, query, scope) {
            const q = normalizeText(query);
            if (!q) return 0;

            let score = 0;
            const title = normalizeText(record?.title);
            const description = normalizeText(record?.description);
            const displayUrl = normalizeText(record?.displayUrl || record?.url);
            const pathLabel = normalizeText(record?.path?.pathLabel);
            const provider = normalizeText(record?.provider);
            const searchText = normalizeText(record?.searchableText);

            const titleScore = scoreField(title, q, { acronym: true });
            const pathScore = scoreField(pathLabel, q);
            score += titleScore;
            score += Math.floor(pathScore * 0.75);
            score += Math.floor(scoreField(displayUrl, q) * 0.45);
            score += Math.floor(scoreField(description, q) * 0.35);
            score += Math.floor(scoreField(provider, q) * 0.2);

            if (!score && searchText.includes(q)) score += 26;
            if (!score && looseFuzzyMatch(searchText.replace(/\s+/g, ''), q.replace(/\s+/g, ''))) score += 12;
            if (score <= 0) return 0;

            if (titleScore >= 140) score += 70;
            if (pathScore >= 140) score += 48;
            if (titleScore >= 96 && record?.type !== 'cached') score += 24;
            if (pathScore >= 96 && record?.type !== 'cached') score += 20;

            if (scope?.workspaceId && matchesScope(record, { workspaceId: scope.workspaceId })) score += 14;
            if (scope?.categoryName && text(record?.categoryName, '') === text(scope.categoryName, '')) score += 18;
            if (record?.type === 'card') score += 22;
            if (record?.type === 'smartView') score += 20;
            if (record?.type === 'folder') score += 18;
            if (record?.type === 'bookmark') score += 16;
            if (record?.type === 'library') score += 14;
            if (record?.library?.linked) score += 8;
            if (record?.provenance?.done) score -= 4;

            return score;
        }

        function parseQueryIntent(query) {
            const raw = text(query, '');
            const filters = {};
            const phrases = [];
            const excludedTerms = [];
            const requiredTerms = [];
            const terms = [];
            const phrasePattern = /"([^"]+)"/g;
            let remainder = raw.replace(phrasePattern, function (_, phrase) {
                const normalizedPhrase = normalizeText(phrase);
                if (normalizedPhrase) phrases.push(normalizedPhrase);
                return ' ';
            });

            remainder.split(/\s+/).map(function (token) {
                return text(token, '');
            }).filter(Boolean).forEach(function (token) {
                const negative = token.charAt(0) === '-';
                const required = token.charAt(0) === '+';
                const cleanToken = negative || required ? token.slice(1) : token;
                const separatorIndex = cleanToken.indexOf(':');
                if (separatorIndex > 0) {
                    const key = normalizeText(cleanToken.slice(0, separatorIndex));
                    const value = normalizeText(cleanToken.slice(separatorIndex + 1));
                    if (value && ['type', 'provider', 'tab', 'workspace', 'card', 'health', 'visibility', 'freshness', 'flag'].includes(key)) {
                        if (!filters[key]) filters[key] = [];
                        filters[key].push(value);
                        return;
                    }
                }
                const normalizedToken = normalizeText(cleanToken);
                if (!normalizedToken) return;
                if (negative) excludedTerms.push(normalizedToken);
                else if (required) requiredTerms.push(normalizedToken);
                else terms.push(normalizedToken);
            });

            const searchText = phrases.concat(requiredTerms).concat(terms).join(' ');
            return {
                raw: raw,
                searchText: searchText,
                phrases: phrases,
                requiredTerms: requiredTerms,
                terms: terms,
                excludedTerms: excludedTerms,
                filters: filters,
                hasFilters: Object.keys(filters).length > 0
            };
        }

        function recordSearchHaystack(record) {
            return normalizeText([
                record?.title,
                record?.description,
                record?.url,
                record?.displayUrl,
                record?.provider,
                record?.categoryName,
                record?.path?.workspaceLabel,
                record?.path?.pathLabel,
                record?.searchableText
            ].join(' '));
        }

        function matchesAnyFilterValue(value, filters) {
            const normalizedValue = normalizeText(value);
            return toArray(filters).some(function (filterValue) {
                const normalizedFilter = normalizeText(filterValue);
                return normalizedValue === normalizedFilter || normalizedValue.includes(normalizedFilter);
            });
        }

        function matchesFlagFilter(record, visibility, health, freshness, filters) {
            if (!toArray(filters).length) return true;
            return toArray(filters).some(function (filterValue) {
                const flag = normalizeText(filterValue);
                if (flag === 'orphaned') return !!record?.provenance?.orphaned;
                if (flag === 'broken') return visibility?.state === 'broken' || health?.state === 'broken';
                if (flag === 'hidden') return visibility?.state === 'hidden';
                if (flag === 'done') return !!record?.provenance?.done;
                if (flag === 'stale') return freshness?.state === 'stale';
                if (flag === 'warning') return health?.state === 'warning';
                return false;
            });
        }

        function matchesQueryIntent(record, intent, visibility, health, freshness) {
            const filters = intent?.filters || {};
            const haystack = recordSearchHaystack(record);
            if (toArray(intent?.excludedTerms).some(function (term) { return haystack.includes(term); })) return false;
            if (toArray(intent?.phrases).some(function (phrase) { return !haystack.includes(phrase); })) return false;
            if (toArray(intent?.requiredTerms).some(function (term) { return !haystack.includes(term); })) return false;
            if (filters.type && !matchesAnyFilterValue(record?.type, filters.type)) return false;
            if (filters.provider && !matchesAnyFilterValue(record?.provider, filters.provider)) return false;
            if (filters.tab && !matchesAnyFilterValue(record?.path?.workspaceLabel || record?.workspaceId, filters.tab)) return false;
            if (filters.workspace && !matchesAnyFilterValue(record?.workspaceId || record?.path?.workspaceLabel, filters.workspace)) return false;
            if (filters.card && !matchesAnyFilterValue(record?.categoryName, filters.card)) return false;
            if (filters.health && !matchesAnyFilterValue(health?.state + ' ' + health?.label, filters.health)) return false;
            if (filters.visibility && !matchesAnyFilterValue(visibility?.state + ' ' + visibility?.label, filters.visibility)) return false;
            if (filters.freshness && !matchesAnyFilterValue(freshness?.state + ' ' + freshness?.label, filters.freshness)) return false;
            if (filters.flag && !matchesFlagFilter(record, visibility, health, freshness, filters.flag)) return false;
            return true;
        }

        function buildFacets(records) {
            const facets = {
                tabs: {},
                cards: {},
                sourceTypes: {},
                providers: {},
                freshness: {},
                visibility: {},
                health: {},
                flags: {}
            };

            records.forEach(function (record) {
                const workspaceLabel = text(record?.path?.workspaceLabel, record?.workspaceId);
                const cardLabel = text(record?.categoryName, 'Unsorted');
                const typeLabel = text(record?.type, 'result');
                const providerLabel = text(record?.provider, 'unknown');
                const freshnessLabel = text(record?.freshness?.label, 'Unknown');
                const visibilityLabel = text(record?.visibility?.label, 'Visible');
                const healthLabel = text(record?.health?.label, 'Healthy');

                facets.tabs[workspaceLabel] = (facets.tabs[workspaceLabel] || 0) + 1;
                facets.cards[cardLabel] = (facets.cards[cardLabel] || 0) + 1;
                facets.sourceTypes[typeLabel] = (facets.sourceTypes[typeLabel] || 0) + 1;
                facets.providers[providerLabel] = (facets.providers[providerLabel] || 0) + 1;
                facets.freshness[freshnessLabel] = (facets.freshness[freshnessLabel] || 0) + 1;
                facets.visibility[visibilityLabel] = (facets.visibility[visibilityLabel] || 0) + 1;
                facets.health[healthLabel] = (facets.health[healthLabel] || 0) + 1;

                if (record?.provenance?.orphaned) facets.flags.Orphaned = (facets.flags.Orphaned || 0) + 1;
                if (record?.health?.state === 'broken' || record?.visibility?.state === 'broken') {
                    facets.flags['Broken Path'] = (facets.flags['Broken Path'] || 0) + 1;
                }
            });

            return facets;
        }

        function buildAllowedTypes(settings) {
            const allowedTypes = new Set();
            const hasExplicitVectors = !!(settings?.activeVectors && typeof settings.activeVectors === 'object');
            const vectors = hasExplicitVectors
                ? settings.activeVectors
                : { bookmarks: true, knowledge: true, cachedResults: true };
            if (vectors.bookmarks) {
                allowedTypes.add('bookmark');
                allowedTypes.add('card');
                allowedTypes.add('folder');
                allowedTypes.add('smartView');
                allowedTypes.add('library');
            }
            if (vectors.knowledge) allowedTypes.add('knowledge');
            if (vectors.cachedResults) allowedTypes.add('cached');
            return allowedTypes;
        }

        function compareRankedRecords(left, right) {
            return Number(right.score || 0) - Number(left.score || 0)
                || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
                || text(left.title, '').localeCompare(text(right.title, ''));
        }

        async function search(query, scope, settings) {
            const snapshot = await ensureFresh();
            const intent = parseQueryIntent(query);
            const q = normalizeText(intent.searchText);
            if (!q && !intent.hasFilters) return { records: [], facets: {}, stats: {}, snapshot: snapshot };

            const allowedTypes = buildAllowedTypes(settings);
            const records = [];
            snapshot.records.forEach(function (record) {
                if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
                const visibility = computeVisibility(record);
                const freshness = computeFreshness(record.updatedAt);
                const health = computeHealth(record);
                if (!matchesQueryIntent(record, intent, visibility, health, freshness)) return;
                const score = q ? computeScore(record, q, scope) : 1;
                if (score <= 0) return;
                const diagnostic = typeof diagnoseRecord === 'function'
                    ? diagnoseRecord(record)
                    : {
                        visibility: visibility,
                        health: health,
                        freshness: freshness,
                        severity: 'ok',
                        reasons: []
                    };
                records.push(Object.assign({}, record, {
                    score: score,
                    visibility: visibility,
                    visibilityState: visibility.state,
                    freshness: freshness,
                    freshnessState: freshness.state,
                    health: health,
                    healthState: health.state,
                    diagnostic: diagnostic
                }));
            });

            records.sort(compareRankedRecords);

            return {
                records: records,
                facets: buildFacets(records),
                stats: snapshot.stats || {},
                snapshot: snapshot,
                queryIntent: intent
            };
        }

        function buildSuggestionSubtitle(record) {
            return text(record?.path?.pathLabel, '')
                || text(record?.displayUrl || record?.url, '')
                || text(record?.provider, '')
                || text(record?.categoryName, '');
        }

        function buildSuggestionRecord(record, score) {
            const visibility = computeVisibility(record);
            const freshness = computeFreshness(record?.updatedAt);
            const health = computeHealth(record);
            return {
                id: text(record?.id, ''),
                type: text(record?.type, 'result'),
                title: text(record?.title, 'Untitled'),
                subtitle: buildSuggestionSubtitle(record),
                insertText: text(record?.title, ''),
                score: score,
                updatedAt: Number(record?.updatedAt || 0),
                workspaceId: text(record?.workspaceId, ''),
                categoryName: text(record?.categoryName, ''),
                provider: text(record?.provider, ''),
                path: record?.path || null,
                visibilityState: visibility.state,
                healthState: health.state,
                freshnessState: freshness.state
            };
        }

        async function getSuggestionSnapshot() {
            await loadPersistedSnapshot();
            const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
            if (state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) return state.snapshot;
            return ensureFresh();
        }

        async function suggest(query, scope, settings) {
            const snapshot = await getSuggestionSnapshot();
            const q = normalizeText(query);
            if (!q || q.length < 2) {
                return { suggestions: [], stats: snapshot?.stats || {}, snapshot: snapshot };
            }

            const allowedTypes = buildAllowedTypes(settings);
            const maxSuggestions = Math.max(1, Math.min(20, Number(settings?.maxSuggestions || 8)));
            const suggestions = [];

            toArray(snapshot?.records).forEach(function (record) {
                if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
                const score = computeScore(record, q, scope);
                if (score <= 0) return;

                suggestions.push(buildSuggestionRecord(record, score));
                if (suggestions.length > maxSuggestions) {
                    suggestions.sort(compareRankedRecords);
                    suggestions.length = maxSuggestions;
                }
            });

            suggestions.sort(compareRankedRecords);

            return {
                suggestions: suggestions,
                stats: snapshot?.stats || {},
                snapshot: snapshot
            };
        }

        return {
            search,
            suggest,
            computeScore,
            parseQueryIntent,
            buildFacets
        };
    }

    ns.IndexSearchRuntime = { create };
})();
