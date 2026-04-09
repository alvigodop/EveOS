window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

    /**
     * Normalize a source identity for comparison
     * Strips common wiki/pedia suffixes to improve grouping (e.g. narutopedia -> naruto).
     */
    /**
     * Normalize a source identity for grouping (e.g., 'Narutopedia' -> 'naruto')
     */
    ctx.normalizeSourceIdentity = function normalizeSourceIdentity(value) {
        if (!value) return '';
        const normalized = String(value)
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .replace(/\.fandom\.com$/, '')
            .replace(/\s+/g, ' ')
            .trim();

        // 1. Basic cleaning
        let stem = normalized
            .replace(/[-_]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 2. Strip common prefixes (The Naruto -> Naruto)
        stem = stem.replace(/^(the|a|an)\s+/i, '');

        // 3. Strip grouping suffixes (Narutopedia -> Naruto, Naruto Wiki -> Naruto)
        stem = stem.replace(/\s*(pedia|wiki|encyclopedia|fandom|fanon|official|data)\s*$/i, '');
        stem = stem.replace(/(pedia|wiki|encyclopedia|fanon|official|data)$/i, '');

        return stem.trim() || normalized;
    };

    /**
     * Get unique identities from a list of values
     */
    ctx.uniqueIdentities = function uniqueIdentities(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map(ctx.normalizeSourceIdentity)
            .filter(Boolean)));
    };

    /**
     * Load raw knowledge sources from storage (async)
     */
    ctx.loadSavedKnowledgeSources = async function loadSavedKnowledgeSources(categoryName) {
        const storedWikiEntries = await ctx.getScopedStorageValueAsync('wikiEntries', [], categoryName);
        const storedFandomDomains = await ctx.getScopedStorageValueAsync('fandomDomains', [], categoryName);
        const wikiEntries = Array.isArray(storedWikiEntries) ? storedWikiEntries : [];
        const fandomDomains = Array.isArray(storedFandomDomains) ? storedFandomDomains : [];
        return { wikiEntries, fandomDomains };
    };


    /**
     * Normalize and return saved Wikipedia entries for a category (async).
     */
    ctx.normalizeSavedWikipediaEntries = async function normalizeSavedWikipediaEntries(categoryName) {
        const { wikiEntries } = await ctx.loadSavedKnowledgeSources(categoryName);
        return wikiEntries.map(function (entry) {
            const title = String(entry?.title || entry?.name || entry || '').trim();
            if (!title) return null;
            return {
                title: title,
                name: String(entry?.name || title).trim()
            };
        }).filter(Boolean);
    };


    /**
     * Normalize and return saved Fandom domains for a category (async).
     */
    ctx.normalizeSavedFandomDomains = async function normalizeSavedFandomDomains(categoryName) {
        const { fandomDomains } = await ctx.loadSavedKnowledgeSources(categoryName);
        return fandomDomains.map(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return null;
            return {
                domain: domain,
                name: String(entry?.name || domain).trim()
            };
        }).filter(Boolean);
    };


    /**
     * Transform raw sources into enriched cache entries (async)
     */
    ctx.loadKnowledgeCacheEntries = async function loadKnowledgeCacheEntries(categoryName, options = {}) {
        const { wikiEntries, fandomDomains } = await ctx.loadSavedKnowledgeSources(categoryName);
        
        let wikiCacheStore, wikiDataStore;
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentContext = ctx.ensureCategoryContext(window.currentCategoryCtx || window.StorageManager?.categoryContext || '');
        
        if (resolvedCategory === currentContext && window.CacheCore) {
            wikiCacheStore = window.CacheCore.wikiCacheStore || {};
            wikiDataStore = window.CacheCore.wikiDataStore || { searchResults: {} };
        } else {
            wikiCacheStore = await ctx.getScopedStorageValueAsync('wikiCacheStore', {}, categoryName) || {};
            wikiDataStore = await ctx.getScopedStorageValueAsync('wikiDataStore', { searchResults: {} }, categoryName) || {};
        }
        
        const fandomResults = wikiDataStore.searchResults && typeof wikiDataStore.searchResults === 'object'
            ? wikiDataStore.searchResults
            : {};
        const includeUncached = options.includeUncached === true;

        const wikipedia = wikiEntries.map(function (entry) {
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return null;
            const cached = wikiCacheStore.entryResults?.[title] || wikiCacheStore[title];
            
            const searchResults = cached?.searchResults && typeof cached.searchResults === 'object'
                ? cached.searchResults
                : {};
            const itemCount = (cached?.main ? 1 : 0) + Object.keys(searchResults).length;

            let updatedAt = ctx.toTimestamp(cached?.lastUpdate || cached?.lastFetch || cached?.timestamp || cached?.main?.lastUpdate || cached?.main?.lastFetch || cached?.main?.timestamp);
            
            if (!updatedAt && itemCount > 0) updatedAt = Date.now(); 

            if (!includeUncached && !updatedAt) return null;

            return {
                scope: 'wikipedia',
                key: title,
                title: String(entry?.name || title).trim(),
                subtitle: title,
                updatedAt,
                itemCount,
                hasCache: updatedAt > 0
            };
        }).filter(Boolean).sort(function (left, right) {
            return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });

        const fandom = fandomDomains.map(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return null;
            const cached = fandomResults[domain];
            
            let updatedAt = ctx.toTimestamp(cached?.lastUpdate);
            if (!updatedAt && cached && typeof cached === 'object') {
                Object.keys(cached).forEach(function(key) {
                    if (key !== 'lastUpdate' && cached[key] && typeof cached[key] === 'object') {
                         const childTs = ctx.toTimestamp(cached[key].lastUpdate || cached[key].lastFetch || cached[key].timestamp);
                         if (childTs > updatedAt) updatedAt = childTs;
                    }
                });
            }
            if (!updatedAt && cached && Object.keys(cached).filter(k => k !== 'lastUpdate').length > 0) updatedAt = Date.now();

            // Determine count
            let itemCount = 0;
            if (cached) {
                itemCount = Object.keys(cached).filter(k => k !== 'lastUpdate').length;
            }

            if (!includeUncached && !updatedAt && itemCount === 0) return null;

            return {
                scope: 'fandom',
                key: domain,
                title: String(entry?.name || domain).trim(),
                subtitle: domain,
                updatedAt: updatedAt,
                itemCount: itemCount,
                domain: domain
            };
        }).filter(Boolean).sort(function (left, right) {
            return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });

        return { wikipedia, fandom };
    };


    /**
     * Clear caches for entire knowledge base
     */
    ctx.clearKnowledgeCaches = function clearKnowledgeCaches(categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentContext = ctx.ensureCategoryContext(window.currentCategoryCtx || window.StorageManager?.categoryContext || '');
        const { wikiEntries, fandomDomains } = ctx.loadSavedKnowledgeSources(resolvedCategory);
        
        let wikiCacheStore, wikiDataStore;
        if (resolvedCategory === currentContext && window.CacheCore) {
            wikiCacheStore = window.CacheCore.wikiCacheStore || {};
            wikiDataStore = window.CacheCore.wikiDataStore || { searchResults: {} };
        } else {
            wikiCacheStore = ctx.getScopedStorageValue('wikiCacheStore', {}, resolvedCategory) || {};
            wikiDataStore = ctx.getScopedStorageValue('wikiDataStore', { searchResults: {} }, resolvedCategory) || { searchResults: {} };
        }

        wikiEntries.forEach(function (entry) {
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return;
            if (wikiCacheStore.entryResults && wikiCacheStore.entryResults[title]) {
                delete wikiCacheStore.entryResults[title];
            }
            if (wikiCacheStore[title]) {
                delete wikiCacheStore[title];
            }
        });

        if (!wikiDataStore.searchResults || typeof wikiDataStore.searchResults !== 'object') {
            wikiDataStore.searchResults = {};
        }

        fandomDomains.forEach(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return;
            delete wikiDataStore.searchResults[domain];
        });

        ctx.saveScopedStorageValue('wikiCacheStore', wikiCacheStore, resolvedCategory);
        ctx.saveScopedStorageValue('wikiDataStore', wikiDataStore, resolvedCategory);

        if (resolvedCategory === currentContext && window.CacheCore) {
            window.CacheCore.wikiCacheStore = wikiCacheStore;
            window.CacheCore.wikiDataStore = wikiDataStore;
            if (typeof window.CacheCore.saveWikiCacheStore === 'function') window.CacheCore.saveWikiCacheStore();
            if (typeof window.CacheCore.saveWikiDataStore === 'function') window.CacheCore.saveWikiDataStore();
        }

        if (window.CacheCore && typeof window.CacheCore.clearInternalApiCache === 'function') {
            window.CacheCore.clearInternalApiCache('wiki_');
            window.CacheCore.clearInternalApiCache('wikipedia_search_');
            window.CacheCore.clearInternalApiCache('fandom_');
        }

        if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
            window.WikiManager.refreshCacheStores();
        }
    };

    /**
     * Get all identity candidates for an entry to facilitate grouping
     */
    ctx.getSourceCacheCandidates = function getSourceCacheCandidates(entry) {
        if (!entry) return [];
        if (entry.scope === 'wikipedia') {
            const iden = ctx.uniqueIdentities([entry.key, entry.title, entry.subtitle]);
            // If we have "Naruto (manga)", add "Naruto" as an alias
            const mainIden = iden.map(i => i.replace(/\s*\(.*?\)\s*/g, '').trim()).filter(Boolean);
            return Array.from(new Set([...iden, ...mainIden]));
        }
        if (entry.scope === 'fandom') {
            const domain = String(entry.key || '').trim();
            const domainStem = domain.replace(/\.fandom\.com$/i, '');
            const candidates = [entry.key, entry.title, entry.subtitle, domainStem];
            
            // Add stems without pedia/wiki suffixes if they aren't already there
            const cleanStem = domainStem.replace(/(pedia|wiki|encyclopedia)$/i, '');
            if (cleanStem && cleanStem !== domainStem) candidates.push(cleanStem);

            return ctx.uniqueIdentities(candidates);
        }
        if (entry.query) {
            return ctx.uniqueIdentities([entry.query]);
        }
        return [];
    };

    /**
     * Build unified groups of cached data (Wikipedia + Fandom + API)
     */
    ctx.buildSourceCacheGroups = async function buildSourceCacheGroups(categoryName, options = {}) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const apiEntries = api.Cache ? await api.Cache.listQueries(resolvedCategory) : [];

        const knowledgeEntries = await ctx.loadKnowledgeCacheEntries(resolvedCategory, {
            includeUncachedKnowledge: options.includeUncachedKnowledge === true
        });

        
        const aliasMap = new Map();
        const groups = {}; // Keyed by primary identity string
        
        /**
         * Get or create a group for an entry
         * @param {object} entry - The entry to group
         * @param {string[]} aliases - Its identity aliases
         */
        ctx.getOrCreateGroup = function getOrCreateGroup(entry, aliases) {
            let group = null;
            const entryTitle = String(entry.title || '').trim().toLowerCase();

            // 1. Try to find existing group by aliases
            aliases.forEach(function (alias) {
                if (!group && aliasMap.has(alias)) {
                    group = aliasMap.get(alias);
                }
            });

            // 2. Fallback: Try to find group by exact title match
            if (!group && entryTitle) {
                const existingGroups = Object.values(groups);
                group = existingGroups.find(g => String(g.title || '').trim().toLowerCase() === entryTitle);
                if (group) {
                    // Link all this entry's aliases to the found group
                    aliases.forEach(a => {
                        group.aliases.add(a);
                        aliasMap.set(a, group);
                    });
                }
            }

            // 3. Create new group if still not found
            if (!group) {
                const primaryId = aliases[0] || ctx.normalizeSourceIdentity(entry.title || entry.key) || 'group_' + Date.now();
                group = {
                    id: primaryId,
                    title: entry.title || entry.key || 'Untitled',
                    aliases: new Set(aliases),
                    wikipediaEntry: null,
                    fandomEntry: null,
                    apiEntries: [],
                    updatedAt: 0
                };
                groups[primaryId] = group;
            }

            // Map all aliases to this group
            aliases.forEach(function (alias) {
                if (!alias) return;
                group.aliases.add(alias);
                aliasMap.set(alias, group);
            });

            return group;
        };

        // 1. Map Wikipedia entries
        knowledgeEntries.wikipedia.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates(entry);
            const group = ctx.getOrCreateGroup(entry, aliases);
            group.wikipediaEntry = entry;
            group.title = String(entry.title || group.title).trim();
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        // 2. Map Fandom entries
        knowledgeEntries.fandom.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates(entry);
            const group = ctx.getOrCreateGroup(entry, aliases);
            group.fandomEntry = entry;
            if (!group.wikipediaEntry) {
                group.title = String(entry.title || group.title).trim();
            }
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        // 3. Map API queries
        apiEntries.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates({ scope: 'api', query: entry.query });
            const group = ctx.getOrCreateGroup({ key: entry.query, title: entry.query, scope: 'api' }, aliases);
            if (!group.apiEntries) group.apiEntries = [];
            group.apiEntries.push(entry);
            
            if (!group.wikipediaEntry && !group.fandomEntry) {
                group.title = String(entry.query || group.title).trim();
            }
            const entryTs = Number(entry.timestamp || 0);
            group.updatedAt = Math.max(Number(group.updatedAt || 0), entryTs);
        });

        const finalGroups = Object.values(groups)
            .filter(function (group) {
                return group.wikipediaEntry || group.fandomEntry || (group.apiEntries && group.apiEntries.length > 0);
            })
            .sort(function (left, right) {
                return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
            });

        return finalGroups;
    };

    /**
     * Find a group by any matching candidate strings
     */
    ctx.findSourceCacheGroup = async function findSourceCacheGroup(categoryName, candidates, options = {}) {
        const aliases = ctx.uniqueIdentities(candidates);
        if (!aliases.length) return null;
        const groups = await ctx.buildSourceCacheGroups(categoryName, options);
        return groups.find(function (group) {
            return aliases.some(function (alias) {
                return group.aliases && group.aliases.has(alias);
            });
        }) || null;
    };

    /**
     * Summarize results across all providers in an API group
     */
    ctx.summarizeApiGroupProviders = function summarizeApiGroupProviders(apiEntries) {
        const counts = {};
        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([key, count]) {
                const nextCount = Number(count || 0);
                if (!nextCount) return;
                counts[key] = Number(counts[key] || 0) + nextCount;
            });
        });
        return counts;
    };

    /**
     * Exported helper for specific normalization used in knowledge titles
     */
    ctx.normalizeKnowledgeTitleKey = function normalizeKnowledgeTitleKey(value) {
        return ctx.normalizeKnowledgeTitleValue(value)
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    /**
     * Standard normalization for knowledge values
     */
    ctx.normalizeKnowledgeTitleValue = function normalizeKnowledgeTitleValue(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    };

    /**
     * Extract title-like slug from Wikipedia/Fandom URLs
     */
    ctx.extractKnowledgeSlugTitle = function extractKnowledgeSlugTitle(url) {
        const rawUrl = String(url || '').trim();
        if (!rawUrl) return '';

        try {
            const parsed = new URL(rawUrl, window.location.href);
            const match = parsed.pathname.match(/\/wiki\/(.+)$/i);
            if (!match || !match[1]) return '';
            return ctx.normalizeKnowledgeTitleValue(
                decodeURIComponent(match[1]).replace(/_/g, ' ')
            );
        } catch (error) {
            return '';
        }
    };

    /**
     * Strip source suffix from a title (e.g. "Naruto | Fandom" -> "Naruto")
     */
    ctx.stripKnowledgeSourceSuffix = function stripKnowledgeSourceSuffix(title, sourceLabel) {
        const normalizedTitle = ctx.normalizeKnowledgeTitleValue(title);
        const normalizedSource = ctx.normalizeKnowledgeTitleValue(sourceLabel);
        if (!normalizedTitle) return '';
        if (!normalizedSource) return normalizedTitle;

        const escapedSource = normalizedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const suffixPatterns = [
            new RegExp(`\\s*[|\\-–—:]\\s*${escapedSource}$`, 'i'),
            new RegExp(`\\s*[|\\-–—:]\\s*${escapedSource}\\s+wiki$`, 'i'),
            /\s*[|\\-–—:]\s*fandom$/i,
            /\s*[|\\-–—:]\s*wikipedia$/i
        ];

        let nextTitle = normalizedTitle;
        suffixPatterns.forEach(function (pattern) {
            nextTitle = nextTitle.replace(pattern, '').trim();
        });
        return nextTitle || normalizedTitle;
    };

    /**
     * UI helper for section titles
     */
    ctx.buildKnowledgeSectionTitle = function buildKnowledgeSectionTitle(scope) {
        return scope === 'wikipedia' ? 'Wikipedia Saved Sources' : 'Fandom Saved Sources';
    };

    /**
     * Sort knowledge results by score and title
     */
    ctx.sortKnowledgeResults = function sortKnowledgeResults(results) {
        return (Array.isArray(results) ? results.slice() : []).sort(function (left, right) {
            const scoreDelta = Number(right?.matchScore || 0) - Number(left?.matchScore || 0);
            if (scoreDelta !== 0) return scoreDelta;
            const leftScope = String(left?.source || '').toLowerCase() === 'fandom' ? 'fandom' : 'wikipedia';
            const rightScope = String(right?.source || '').toLowerCase() === 'fandom' ? 'fandom' : 'wikipedia';
            return ctx.resolveKnowledgeResultTitle(left, leftScope)
                .localeCompare(ctx.resolveKnowledgeResultTitle(right, rightScope));
        });
    };

    /**
     * Build chips for genres/tags/categories
     */
    ctx.buildKnowledgeChips = function buildKnowledgeChips(result) {
        const values = [];
        ['genres', 'tags', 'categories', 'names', 'aliases'].forEach(function (field) {
            const items = Array.isArray(result?.[field]) ? result[field] : [];
            items.forEach(function (item) {
                const next = String(item || '').trim();
                if (!next) return;
                if (values.some(function (existing) { return existing.toLowerCase() === next.toLowerCase(); })) return;
                values.push(next);
            });
        });
        return values.slice(0, 6);
    };

    /**
     * Resolve the most appropriate title for a knowledge result
     */
    ctx.resolveKnowledgeResultTitle = function resolveKnowledgeResultTitle(result, scope) {
        const rawTitle = ctx.normalizeKnowledgeTitleValue(result?.title || result?.name || '');
        const wikiName = ctx.normalizeKnowledgeTitleValue(result?.wiki_name || '');
        const domainLabel = ctx.normalizeKnowledgeTitleValue(
            String(result?.domain || result?.wiki_domain || '')
                .replace(/^https?:\/\//i, '')
                .replace(/\.fandom\.com$/i, '')
                .replace(/\.[^.]+$/, '')
                .replace(/[-_]+/g, ' ')
        );
        const cleanedRawTitle = ctx.stripKnowledgeSourceSuffix(rawTitle, wikiName || domainLabel);
        const cleanedSlugTitle = ctx.stripKnowledgeSourceSuffix(
            ctx.extractKnowledgeSlugTitle(result?.url || ''),
            wikiName || domainLabel
        );
        const rawKey = ctx.normalizeKnowledgeTitleKey(cleanedRawTitle);
        const genericKeys = new Set([
            ctx.normalizeKnowledgeTitleKey(wikiName),
            ctx.normalizeKnowledgeTitleKey(`${wikiName} wiki`),
            ctx.normalizeKnowledgeTitleKey(domainLabel),
            ctx.normalizeKnowledgeTitleKey(`${domainLabel} wiki`),
            'untitled',
            'no title'
        ].filter(Boolean));

        if (scope === 'fandom' && cleanedSlugTitle && (!rawKey || genericKeys.has(rawKey))) {
            return cleanedSlugTitle;
        }

        return cleanedRawTitle || cleanedSlugTitle || 'Untitled';
    };

    /**
     * Build the HTML markup for a single knowledge result card
     */
    ctx.buildKnowledgeResultCard = function buildKnowledgeResultCard(result, scope, categoryName) {
        const targetUrl = String(result?.url || '').trim();
        const title = ctx.resolveKnowledgeResultTitle(result, scope);
        const sourceLabel = scope === 'wikipedia'
            ? String(result?.wiki_name || 'Wikipedia').trim()
            : String(result?.wiki_name || result?.domain || 'Fandom').trim();
        const metaParts = [
            sourceLabel,
            String(result?.contentType || '').trim(),
            Number(result?.rating) > 0 ? `Rating ${Number(result.rating)}` : '',
            result?.fromCache || result?.entryDataFromCache ? 'Cached' : 'Live'
        ].filter(Boolean);
        const chips = ctx.buildKnowledgeChips(result);
        const titleMarkup = targetUrl
            ? `<a href="${ctx.escapeHtml(targetUrl)}" class="unidex-search-card-title" data-unidex-link="1" data-unidex-link-title="${ctx.escapeHtml(title)}" data-unidex-link-category="${ctx.escapeHtml(categoryName)}">${ctx.escapeHtml(title)}</a>`
            : `<span class="unidex-search-card-title">${ctx.escapeHtml(title)}</span>`;
        return `
            <article class="unidex-search-card" data-unidex-result-scope="${ctx.escapeHtml(scope)}">
                <div class="unidex-search-card-header">
                    <div class="unidex-search-card-kicker">${ctx.escapeHtml(scope === 'wikipedia' ? 'Wikipedia' : 'Fandom')}</div>
                    ${titleMarkup}
                    <div class="unidex-search-card-meta">${ctx.escapeHtml(metaParts.join(' . '))}</div>
                </div>
                ${String(result?.snippet || '').trim() ? `<p class="unidex-search-card-snippet">${ctx.escapeHtml(String(result.snippet).trim())}</p>` : ''}
                ${chips.length ? `<div class="api-provider-badges">${chips.map(function (chip) { return `<span class="api-provider-badge">${ctx.escapeHtml(chip)}</span>`; }).join('')}</div>` : ''}
                ${targetUrl ? `<div class="unidex-search-card-actions"><button type="button" class="api-action-btn unidex-search-open-btn" data-unidex-link-button="1" data-unidex-link-url="${ctx.escapeHtml(targetUrl)}" data-unidex-link-title="${ctx.escapeHtml(title)}" data-unidex-link-category="${ctx.escapeHtml(categoryName)}">Open</button></div>` : ''}
            </article>
        `;
    };

    /**
     * Build the HTML markup for a full knowledge results section
     */
    ctx.buildKnowledgeResultsSection = function buildKnowledgeResultsSection(scope, payload, categoryName) {
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const header = ctx.buildKnowledgeSectionTitle(scope);
        const countLabel = `${results.length} result${results.length === 1 ? '' : 's'}`;
        const sourceCount = Number(payload?.sourceCount || 0);
        const body = payload?.error
            ? `<div class="unidex-search-empty">Unable to load ${ctx.escapeHtml(header.toLowerCase())}: ${ctx.escapeHtml(payload.error.message || payload.error)}</div>`
            : results.length
                ? results.map(function (result) {
                    return ctx.buildKnowledgeResultCard(result, scope, categoryName);
                }).join('')
                : `<div class="unidex-search-empty">${sourceCount > 0
                    ? `No ${ctx.escapeHtml(header.toLowerCase())} matches for this query in this card yet.`
                    : `No ${ctx.escapeHtml(header.toLowerCase())} are linked to this card yet.`}</div>`;

        return `
            <details class="api-cache-section unidex-search-section" data-unidex-section="${ctx.escapeHtml(scope)}" open>
                <summary class="api-cache-section-header">
                    <span>${ctx.escapeHtml(header)}</span>
                    <span class="api-cache-section-count">${ctx.escapeHtml(countLabel)}</span>
                </summary>
                <div class="api-cache-section-list unidex-search-section-list">
                    ${body}
                </div>
            </details>
        `;
    };

})(window.EveOS.API);