window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const PROVIDER_CONFIG = [
        { key: 'mangadex', label: 'MangaDex', shortLabel: 'Dex' },
        { key: 'jikanManga', label: 'Jikan Manga', shortLabel: 'J-Manga' },
        { key: 'jikanAnime', label: 'Jikan Anime', shortLabel: 'J-Anime' },
        { key: 'anilistManga', label: 'AniList Manga', shortLabel: 'AL Manga' },
        { key: 'anilistAnime', label: 'AniList Anime', shortLabel: 'AL Anime' },
        { key: 'mangaupdates', label: 'MangaUpdates', shortLabel: 'MU' },
        { key: 'kitsuAnime', label: 'Kitsu Anime', shortLabel: 'K Anime' },
        { key: 'kitsuManga', label: 'Kitsu Manga', shortLabel: 'K Manga' },
        { key: 'tvmaze', label: 'TVmaze', shortLabel: 'TV' },
        { key: 'itunes', label: 'iTunes', shortLabel: 'iTunes' },
        { key: 'wlnupdates', label: 'WLNUpdates', shortLabel: 'WLN' },
        { key: 'openlibrary', label: 'OpenLibrary', shortLabel: 'Books' },
        { key: 'comick', label: 'ComicK', shortLabel: 'ComicK' }
    ];
    const PROVIDER_ORDER = PROVIDER_CONFIG.map(function (provider) {
        return [provider.key, provider.label];
    });
    const PROVIDER_KEYS = PROVIDER_CONFIG.map(function (provider) {
        return provider.key;
    });
    const PROVIDER_LABELS = PROVIDER_CONFIG.reduce(function (acc, provider) {
        acc[provider.key] = provider.label;
        return acc;
    }, {});
    const PROVIDER_SET = new Set(PROVIDER_KEYS);
    const TTL_OPTIONS = [
        { value: 60 * 60 * 1000, label: '1 hour' },
        { value: 6 * 60 * 60 * 1000, label: '6 hours' },
        { value: 24 * 60 * 60 * 1000, label: '24 hours' },
        { value: 7 * 24 * 60 * 60 * 1000, label: '7 days' }
    ];

    function normalizeCategoryName(categoryName) {
        return String(categoryName || window.currentCategoryCtx || window.StorageManager?.categoryContext || '').trim();
    }

    function ensureCategoryContext(categoryName) {
        const resolvedCategory = normalizeCategoryName(categoryName);
        if (resolvedCategory && window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
            window.StorageManager.setCategoryContext(resolvedCategory);
        }
        return resolvedCategory;
    }

    function countResults(sources) {
        const summary = api.Cache?.summarizeSources ? api.Cache.summarizeSources(sources || {}) : { totalResults: 0 };
        return Number(summary.totalResults || 0);
    }

    function updateResultsCount(total) {
        const counter = document.getElementById('resultCount');
        if (counter) {
            counter.textContent = String(Number(total) || 0);
        }
    }

    function formatRelativeTime(timestamp) {
        if (!(Number(timestamp) > 0)) return 'unknown';
        const diffMs = Math.max(0, Date.now() - Number(timestamp));
        const diffMinutes = Math.round(diffMs / 60000);
        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.round(diffHours / 24);
        return `${diffDays}d ago`;
    }

    function formatExpiry(expiresAt) {
        if (!(Number(expiresAt) > 0)) return 'No expiry';
        const diffMs = Number(expiresAt) - Date.now();
        if (diffMs <= 0) return 'Expired';
        const diffMinutes = Math.round(diffMs / 60000);
        if (diffMinutes < 60) return `Expires in ${diffMinutes}m`;
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `Expires in ${diffHours}h`;
        const diffDays = Math.round(diffHours / 24);
        return `Expires in ${diffDays}d`;
    }

    function toTimestamp(value) {
        if (Number(value) > 0) return Number(value);
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isProviderSource(source) {
        return PROVIDER_SET.has(String(source || '').trim());
    }

    function getProviderLabel(providerKey) {
        return PROVIDER_LABELS[String(providerKey || '').trim()] || 'API Provider';
    }

    function buildTtlOptionsMarkup(selectedTtlMs) {
        const fallbackTtl = Number(selectedTtlMs) > 0 ? Number(selectedTtlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        return TTL_OPTIONS.map(function (option) {
            const selected = Number(option.value) === fallbackTtl ? 'selected' : '';
            return `<option value="${option.value}" ${selected}>${escapeHtml(option.label)}</option>`;
        }).join('');
    }

    function syncTtlState(ttlMs, origin) {
        const selectors = [
            '[data-api-ttl-select="search"]',
            '[data-api-ttl-select="scraper"]'
        ];

        selectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                element.value = String(ttlMs);
            });
        });
    }

    function persistTtlPreference(categoryName, ttlMs, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        const normalizedTtl = Number(ttlMs) > 0 ? Number(ttlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        if (api.Cache) {
            api.Cache.savePrefs({ ttlMs: normalizedTtl }, resolvedCategory);
        }
        syncTtlState(normalizedTtl, origin);
    }

    function filterSourcesByProvider(sources, providerKey) {
        if (!providerKey || !isProviderSource(providerKey)) {
            return sources || {};
        }
        return {
            [providerKey]: sources?.[providerKey]
        };
    }

    function mergeSources(baseSources, nextSources) {
        return {
            ...(baseSources && typeof baseSources === 'object' ? baseSources : {}),
            ...(nextSources && typeof nextSources === 'object' ? nextSources : {})
        };
    }

    async function fetchProviderResults(query, providerKey) {
        switch (providerKey) {
            case 'mangadex':
                return api.MangaDex.searchMangaDex(query);
            case 'jikanManga':
                return api.Jikan.searchJikanManga(query);
            case 'jikanAnime':
                return api.Jikan.searchJikanAnime(query);
            case 'anilistManga':
                return api.AniList.searchAniListManga(query);
            case 'anilistAnime':
                return api.AniList.searchAniListAnime(query);
            case 'mangaupdates':
                return api.MangaUpdates.searchMangaUpdates(query);
            case 'kitsuAnime':
                return api.Kitsu.searchKitsuAnime(query);
            case 'kitsuManga':
                return api.Kitsu.searchKitsuManga(query);
            case 'tvmaze':
                return api.TVmaze.searchTVmaze(query);
            case 'itunes':
                return api.iTunes.searchiTunes(query);
            case 'wlnupdates':
                return api.WlnUpdates.searchWlnUpdates(query);
            case 'openlibrary':
                return api.OpenLibrary.searchOpenLibrary(query);
            case 'comick':
                return api.ComicK.searchComicK(query);
            default:
                throw new Error(`Unsupported API provider source: ${providerKey}`);
        }
    }

    async function collectLiveResults(query, providerKey = null) {
        const Core = api.Core;
        const MangaDex = api.MangaDex;
        const Jikan = api.Jikan;
        const AniList = api.AniList;
        const MangaUpdates = api.MangaUpdates;
        const Kitsu = api.Kitsu;
        const TVmaze = api.TVmaze;
        const iTunes = api.iTunes;
        const WlnUpdates = api.WlnUpdates;
        const OpenLibrary = api.OpenLibrary;
        const ComicK = api.ComicK;

        if (!Core || !MangaDex || !Jikan || !AniList || !MangaUpdates || !Kitsu || !TVmaze || !iTunes || !WlnUpdates || !OpenLibrary || !ComicK) {
            throw new Error('API modules are not fully loaded.');
        }

        if (providerKey && isProviderSource(providerKey)) {
            return {
                [providerKey]: await fetchProviderResults(query, providerKey)
            };
        }

        const pairs = await Promise.all(PROVIDER_KEYS.map(async function (key) {
            return [key, await fetchProviderResults(query, key)];
        }));

        return pairs.reduce(function (acc, pair) {
            acc[pair[0]] = pair[1];
            return acc;
        }, {});
    }

    function renderSourceResults(sourceResults, resultsContainer, onSelect, providerKey = null) {
        const Display = api.Display;
        if (!Display || typeof Display.displayResults !== 'function') {
            throw new Error('Display module is not loaded.');
        }

        const visibleSources = filterSourcesByProvider(sourceResults || {}, providerKey);
        resultsContainer.style.display = 'block';
        Display.displayResults(visibleSources, resultsContainer, onSelect);
        updateResultsCount(countResults(visibleSources));
        return visibleSources;
    }

    function resolveLivePreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? api.Cache.loadPrefs(categoryName).liveResults === true : false;
    }

    function resolveHybridPreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? api.Cache.loadPrefs(categoryName).hybridResults !== false : true;
    }

    function runAfterDelay(callback, delayMs) {
        if (!(typeof callback === 'function')) return;
        if (Number(delayMs) > 0) {
            window.setTimeout(callback, Number(delayMs));
            return;
        }
        callback();
    }

    function renderCacheOnlyMessage(resultsContainer, query, providerKey = null) {
        if (!resultsContainer) return;
        const providerLabel = providerKey ? getProviderLabel(providerKey) : 'this view';
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
            <div style="padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                <div style="font-weight:600; margin-bottom:4px;">No cached API result for this card.</div>
                <div style="font-size:0.83rem; opacity:0.75;">
                    Query <strong>${escapeHtml(query)}</strong> has not been cached for <strong>${escapeHtml(providerLabel)}</strong> inside this card yet. Enable Hybrid or Live to fetch it.
                </div>
            </div>
        `;
        updateResultsCount(0);
    }

    function syncLiveToggleState(enabled, origin) {
        const liveSelectors = [
            '[data-api-live-toggle="shared"]',
            '[data-api-live-toggle="search"]',
            '[data-api-live-toggle="scraper"]',
            '#liveSearchToggle'
        ];

        liveSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    function syncHybridToggleState(enabled, origin) {
        const hybridSelectors = [
            '[data-api-hybrid-toggle="shared"]',
            '[data-api-hybrid-toggle="search"]',
            '[data-api-hybrid-toggle="scraper"]',
            '#hybridSearchToggle'
        ];

        hybridSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    function persistLivePreference(categoryName, enabled, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (api.Cache) {
            api.Cache.savePrefs({ liveResults: enabled === true }, resolvedCategory);
        }
        syncLiveToggleState(enabled === true, origin);
    }

    function persistHybridPreference(categoryName, enabled, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (api.Cache) {
            api.Cache.savePrefs({ hybridResults: enabled !== false }, resolvedCategory);
        }
        syncHybridToggleState(enabled !== false, origin);
    }

    function buildCacheListMarkup(entries, emptyMessage, providerKey = null) {
        const visibleEntries = Array.isArray(entries) ? entries.filter(function (entry) {
            if (!providerKey || !isProviderSource(providerKey)) return true;
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) : [];

        if (!visibleEntries.length) {
            return `<div style="opacity:0.68; font-size:0.83rem;">${escapeHtml(emptyMessage)}</div>`;
        }

        return visibleEntries.map(function (entry) {
            const totalResults = providerKey && isProviderSource(providerKey)
                ? Number(entry.summary?.perSource?.[providerKey] || 0)
                : Number(entry.summary?.totalResults || 0);
            const providerBadges = PROVIDER_ORDER
                .map(function ([key, label]) {
                    const count = Number(entry.summary?.perSource?.[key] || 0);
                    if (providerKey && key !== providerKey) return '';
                    if (!count) return '';
                    return `<span class="api-provider-badge">${escapeHtml(label)} <strong>${count}</strong></span>`;
                })
                .filter(Boolean)
                .join('');

            return `
                <div class="api-cache-entry" data-query="${escapeHtml(entry.query)}">
                    <div class="api-cache-entry-header">
                        <div class="api-cache-entry-copy">
                            <div class="api-cache-entry-title">${escapeHtml(entry.query)}</div>
                            <div class="api-cache-entry-meta">${totalResults} results . updated ${escapeHtml(formatRelativeTime(entry.updatedAt))}</div>
                            <div class="api-cache-entry-expiry">${escapeHtml(formatExpiry(entry.expiresAt))}</div>
                        </div>
                        <div class="api-cache-actions">
                            <button type="button" class="api-cache-load-btn" data-query="${escapeHtml(entry.query)}">Load</button>
                            <button type="button" class="api-cache-refresh-btn" data-query="${escapeHtml(entry.query)}">Refresh</button>
                            <button type="button" class="api-cache-delete-btn" data-query="${escapeHtml(entry.query)}">Delete</button>
                        </div>
                    </div>
                    <div class="api-provider-badges">${providerBadges || '<span class="api-provider-empty">No provider hits stored.</span>'}</div>
                </div>
            `;
        }).join('');
    }

    function getScopedStorageValue(key, defaultValue, categoryName) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.loadData === 'function') {
            return window.StorageManager.loadData(key, defaultValue);
        }

        try {
            const normalized = String(resolvedCategory || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const scopedKey = normalized ? `${normalized}_${key}` : key;
            const raw = localStorage.getItem(scopedKey);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (error) {
            console.warn('API Manager: Failed to read scoped storage', key, error);
            return defaultValue;
        }
    }

    function saveScopedStorageValue(key, value, categoryName) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.saveData === 'function') {
            return window.StorageManager.saveData(key, value);
        }

        try {
            const normalized = String(resolvedCategory || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const scopedKey = normalized ? `${normalized}_${key}` : key;
            localStorage.setItem(scopedKey, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('API Manager: Failed to save scoped storage', key, error);
            return false;
        }
    }

    function normalizeSourceIdentity(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .replace(/\.fandom\.com$/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function uniqueIdentities(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map(normalizeSourceIdentity)
            .filter(Boolean)));
    }

    function loadKnowledgeCacheEntries(categoryName, options = {}) {
        const storedWikiEntries = getScopedStorageValue('wikiEntries', [], categoryName);
        const storedFandomDomains = getScopedStorageValue('fandomDomains', [], categoryName);
        const wikiEntries = Array.isArray(storedWikiEntries) ? storedWikiEntries : [];
        const fandomDomains = Array.isArray(storedFandomDomains) ? storedFandomDomains : [];
        const wikiCacheStore = getScopedStorageValue('wikiCacheStore', {}, categoryName) || {};
        const wikiDataStore = getScopedStorageValue('wikiDataStore', { searchResults: {} }, categoryName) || {};
        const fandomResults = wikiDataStore.searchResults && typeof wikiDataStore.searchResults === 'object'
            ? wikiDataStore.searchResults
            : {};
        const includeUncached = options.includeUncached === true;

        const wikipedia = wikiEntries.map(function (entry) {
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return null;
            const cached = wikiCacheStore.entryResults?.[title] || wikiCacheStore[title];
            const updatedAt = toTimestamp(cached?.lastUpdate || cached?.main?.lastUpdate);

            const searchResults = cached?.searchResults && typeof cached.searchResults === 'object'
                ? cached.searchResults
                : {};
            const itemCount = (cached?.main ? 1 : 0) + Object.keys(searchResults).length;
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
            const updatedAt = toTimestamp(cached?.lastUpdate);

            const itemCount = Object.keys(cached || {}).filter(function (key) {
                return key !== 'lastUpdate';
            }).length;
            if (!includeUncached && !updatedAt) return null;

            return {
                scope: 'fandom',
                key: domain,
                title: String(entry?.name || domain).trim(),
                subtitle: domain,
                updatedAt,
                itemCount,
                hasCache: updatedAt > 0
            };
        }).filter(Boolean).sort(function (left, right) {
            return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });

        return { wikipedia, fandom };
    }

    function clearKnowledgeCaches(categoryName) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        const storedWikiEntries = getScopedStorageValue('wikiEntries', [], resolvedCategory);
        const storedFandomDomains = getScopedStorageValue('fandomDomains', [], resolvedCategory);
        const wikiEntries = Array.isArray(storedWikiEntries) ? storedWikiEntries : [];
        const fandomDomains = Array.isArray(storedFandomDomains) ? storedFandomDomains : [];
        const wikiCacheStore = getScopedStorageValue('wikiCacheStore', {}, resolvedCategory) || {};
        const wikiDataStore = getScopedStorageValue('wikiDataStore', { searchResults: {} }, resolvedCategory) || { searchResults: {} };

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

        saveScopedStorageValue('wikiCacheStore', wikiCacheStore, resolvedCategory);
        saveScopedStorageValue('wikiDataStore', wikiDataStore, resolvedCategory);

        if (window.CacheCore && typeof window.CacheCore.clearInternalApiCache === 'function') {
            window.CacheCore.clearInternalApiCache('wiki_');
            window.CacheCore.clearInternalApiCache('wikipedia_search_');
            window.CacheCore.clearInternalApiCache('fandom_');
        }

        if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
            window.WikiManager.refreshCacheStores();
        }
    }

    function getSourceCacheCandidates(entry) {
        if (!entry) return [];
        if (entry.scope === 'wikipedia') {
            return uniqueIdentities([entry.key, entry.title, entry.subtitle]);
        }
        if (entry.scope === 'fandom') {
            const domain = String(entry.key || '').trim();
            const domainStem = domain.replace(/\.fandom\.com$/i, '');
            return uniqueIdentities([entry.key, entry.title, entry.subtitle, domainStem]);
        }
        if (entry.query) {
            return uniqueIdentities([entry.query]);
        }
        return [];
    }

    function buildSourceCacheGroups(categoryName, options = {}) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        const apiEntries = api.Cache ? api.Cache.listQueries(resolvedCategory) : [];
        const knowledgeEntries = loadKnowledgeCacheEntries(resolvedCategory, {
            includeUncached: options.includeUncachedKnowledge === true
        });
        const aliasMap = new Map();
        const groups = [];

        function getOrCreateGroup(entry, aliases) {
            let group = null;
            aliases.forEach(function (alias) {
                if (!group && aliasMap.has(alias)) {
                    group = aliasMap.get(alias);
                }
            });

            if (!group) {
                group = {
                    id: aliases[0] || normalizeSourceIdentity(entry?.title || entry?.query || entry?.key || `group_${groups.length + 1}`),
                    title: String(entry?.title || entry?.query || entry?.key || 'Cached Source').trim(),
                    updatedAt: 0,
                    wikipediaEntry: null,
                    fandomEntry: null,
                    apiEntries: [],
                    aliases: new Set()
                };
                groups.push(group);
            }

            aliases.forEach(function (alias) {
                if (!alias) return;
                group.aliases.add(alias);
                aliasMap.set(alias, group);
            });

            return group;
        }

        knowledgeEntries.wikipedia.forEach(function (entry) {
            const aliases = getSourceCacheCandidates(entry);
            const group = getOrCreateGroup(entry, aliases);
            group.wikipediaEntry = entry;
            group.title = String(entry.title || group.title).trim();
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        knowledgeEntries.fandom.forEach(function (entry) {
            const aliases = getSourceCacheCandidates(entry);
            const group = getOrCreateGroup(entry, aliases);
            group.fandomEntry = entry;
            if (!group.wikipediaEntry) {
                group.title = String(entry.title || group.title).trim();
            }
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        apiEntries.forEach(function (entry) {
            const aliases = getSourceCacheCandidates(entry);
            const group = getOrCreateGroup(entry, aliases);
            group.apiEntries.push(entry);
            if (!group.wikipediaEntry && !group.fandomEntry) {
                group.title = String(entry.query || group.title).trim();
            }
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        return groups
            .filter(function (group) {
                return group.wikipediaEntry || group.fandomEntry || group.apiEntries.length > 0;
            })
            .sort(function (left, right) {
                return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
            });
    }

    function findSourceCacheGroup(categoryName, candidates, options = {}) {
        const aliases = uniqueIdentities(candidates);
        if (!aliases.length) return null;
        const groups = buildSourceCacheGroups(categoryName, options);
        return groups.find(function (group) {
            return aliases.some(function (alias) {
                return group.aliases && group.aliases.has(alias);
            });
        }) || null;
    }

    function summarizeApiGroupProviders(apiEntries) {
        const counts = {};
        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([key, count]) {
                const nextCount = Number(count || 0);
                if (!nextCount) return;
                counts[key] = Number(counts[key] || 0) + nextCount;
            });
        });
        return counts;
    }

    function matchesGroupFilter(group, filterQuery) {
        const normalizedFilter = normalizeSourceIdentity(filterQuery);
        if (!normalizedFilter) return true;

        const values = [
            group?.title,
            group?.wikipediaEntry?.title,
            group?.wikipediaEntry?.subtitle,
            group?.wikipediaEntry?.key,
            group?.fandomEntry?.title,
            group?.fandomEntry?.subtitle,
            group?.fandomEntry?.key,
            ...(Array.isArray(group?.apiEntries) ? group.apiEntries.map(function (entry) {
                return entry?.query;
            }) : []),
            ...(group?.aliases ? Array.from(group.aliases) : [])
        ];

        Object.keys(summarizeApiGroupProviders(group?.apiEntries || {})).forEach(function (providerKey) {
            values.push(providerKey);
            values.push(getProviderLabel(providerKey));
        });

        return values.some(function (value) {
            const normalizedValue = normalizeSourceIdentity(value);
            return normalizedValue && normalizedValue.includes(normalizedFilter);
        });
    }

    function buildSourceGroupMarkup(group) {
        const laneCount = Number(!!group.wikipediaEntry) + Number(!!group.fandomEntry) + Number((group.apiEntries || []).length > 0);
        const meta = `${laneCount} cache ${laneCount === 1 ? 'lane' : 'lanes'} . updated ${formatRelativeTime(group.updatedAt)}`;
        const subtitleParts = [];
        if (group.wikipediaEntry) subtitleParts.push(`Wiki: ${group.wikipediaEntry.subtitle}`);
        if (group.fandomEntry) subtitleParts.push(`Fandom: ${group.fandomEntry.subtitle}`);
        if (group.apiEntries.length === 1) {
            subtitleParts.push(`API query: ${group.apiEntries[0].query}`);
        } else if (group.apiEntries.length > 1) {
            subtitleParts.push(`${group.apiEntries.length} API queries`);
        }

        const badges = [];
        if (group.wikipediaEntry) {
            badges.push(`<span class="api-provider-badge api-provider-badge-source">Wikipedia <strong>${Number(group.wikipediaEntry.itemCount || 0)}</strong></span>`);
        }
        if (group.fandomEntry) {
            badges.push(`<span class="api-provider-badge api-provider-badge-source">Fandom <strong>${Number(group.fandomEntry.itemCount || 0)}</strong></span>`);
        }
        const apiProviderCounts = summarizeApiGroupProviders(group.apiEntries);
        PROVIDER_ORDER.forEach(function ([key, label]) {
            const count = Number(apiProviderCounts[key] || 0);
            if (!count) return;
            badges.push(`<span class="api-provider-badge">${escapeHtml(label)} <strong>${count}</strong></span>`);
        });

        return `
            <div class="api-cache-entry api-cache-entry-source" data-group-key="${escapeHtml(group.id)}">
                <div class="api-cache-entry-header">
                    <div class="api-cache-entry-copy">
                        <div class="api-cache-entry-title">${escapeHtml(group.title)}</div>
                        <div class="api-cache-entry-meta">${escapeHtml(meta)}</div>
                        <div class="api-cache-entry-expiry">${escapeHtml(subtitleParts.join(' . '))}</div>
                    </div>
                    <div class="api-cache-actions">
                        <button type="button" class="api-cache-open-group-btn" data-group-key="${escapeHtml(group.id)}">Open</button>
                        <button type="button" class="api-cache-view-group-btn" data-group-key="${escapeHtml(group.id)}">View</button>
                        <button type="button" class="api-cache-refresh-group-btn" data-group-key="${escapeHtml(group.id)}">Refresh</button>
                        <button type="button" class="api-cache-clear-group-btn" data-group-key="${escapeHtml(group.id)}">Clear</button>
                    </div>
                </div>
                <div class="api-provider-badges">${badges.join('') || '<span class="api-provider-empty">No cache lanes linked.</span>'}</div>
            </div>
        `;
    }

    function buildUnifiedCacheListMarkup(categoryName) {
        const groups = buildSourceCacheGroups(categoryName, { includeUncachedKnowledge: false });
        if (!groups.length) {
            return '<div style="opacity:0.68; font-size:0.83rem;">No cached API, Wikipedia, or Fandom data for this card yet.</div>';
        }

        return groups.map(buildSourceGroupMarkup).join('');
    }

    function formatCacheFreshness(entry) {
        if (!entry || !entry.hasCache || !entry.updatedAt) return 'Not cached yet';
        return `Updated ${formatRelativeTime(entry.updatedAt)}`;
    }

    function buildUnidexApiProviderRows(apiEntries) {
        const providerStats = {};

        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            const updatedAt = Number(entry?.updatedAt || 0);
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([providerKey, count]) {
                const resultCount = Number(count || 0);
                if (!resultCount) return;
                if (!providerStats[providerKey]) {
                    providerStats[providerKey] = {
                        providerKey,
                        label: getProviderLabel(providerKey),
                        resultCount: 0,
                        queryCount: 0,
                        updatedAt: 0,
                        latestQuery: ''
                    };
                }
                providerStats[providerKey].resultCount += resultCount;
                providerStats[providerKey].queryCount += 1;
                if (updatedAt >= providerStats[providerKey].updatedAt) {
                    providerStats[providerKey].updatedAt = updatedAt;
                    providerStats[providerKey].latestQuery = String(entry?.query || '').trim();
                }
            });
        });

        return PROVIDER_ORDER.map(function ([providerKey]) {
            const provider = providerStats[providerKey];
            if (!provider) return '';
            const resultLabel = `${provider.resultCount} result${provider.resultCount === 1 ? '' : 's'}`;
            const queryLabel = `${provider.queryCount} quer${provider.queryCount === 1 ? 'y' : 'ies'}`;
            const freshness = provider.updatedAt ? `Updated ${formatRelativeTime(provider.updatedAt)}` : 'No timestamp';
            return `
                <div class="unidex-api-provider-row">
                    <div class="unidex-api-provider-copy">
                        <div class="unidex-api-provider-title">${escapeHtml(provider.label)}</div>
                        <div class="unidex-api-provider-meta">${escapeHtml(resultLabel)} . ${escapeHtml(queryLabel)} . ${escapeHtml(freshness)}</div>
                    </div>
                    <div class="unidex-api-provider-actions">
                        <button type="button" class="api-cache-open-provider-btn" data-provider-key="${escapeHtml(provider.providerKey)}" data-query="${escapeHtml(provider.latestQuery)}">Open</button>
                    </div>
                </div>
            `;
        }).filter(Boolean).join('');
    }

    function buildUnidexLaneMarkup(group) {
        const lanes = [];

        if (group.wikipediaEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-meta">${escapeHtml(group.wikipediaEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${escapeHtml(formatCacheFreshness(group.wikipediaEntry))}${group.wikipediaEntry.hasCache ? ` . ${group.wikipediaEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="wikipedia" data-source-key="${escapeHtml(group.wikipediaEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="wikipedia" data-source-key="${escapeHtml(group.wikipediaEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="wikipedia" data-source-key="${escapeHtml(group.wikipediaEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="wikipedia" data-source-key="${escapeHtml(group.wikipediaEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-status">No linked Wikipedia entry yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="wikipedia" data-link-title="${escapeHtml(group.title)}">Link Wiki</button>
                    </div>
                </div>
            `);
        }

        if (group.fandomEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-meta">${escapeHtml(group.fandomEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${escapeHtml(formatCacheFreshness(group.fandomEntry))}${group.fandomEntry.hasCache ? ` . ${group.fandomEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="fandom" data-source-key="${escapeHtml(group.fandomEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="fandom" data-source-key="${escapeHtml(group.fandomEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="fandom" data-source-key="${escapeHtml(group.fandomEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="fandom" data-source-key="${escapeHtml(group.fandomEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-status">No linked Fandom domain yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="fandom" data-link-title="${escapeHtml(group.title)}">Link Fandom</button>
                    </div>
                </div>
            `);
        }

        const apiProviderCounts = summarizeApiGroupProviders(group.apiEntries);
        if (group.apiEntries.length) {
            const apiBadges = PROVIDER_ORDER.map(function ([key, label]) {
                const count = Number(apiProviderCounts[key] || 0);
                if (!count) return '';
                return `<span class="api-provider-badge">${escapeHtml(label)} <strong>${count}</strong></span>`;
            }).filter(Boolean).join('');
            const latestApi = group.apiEntries[0];
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-meta">${group.apiEntries.length === 1 ? escapeHtml(latestApi.query) : `${group.apiEntries.length} cached queries`}</div>
                        <div class="unidex-lane-status">Updated ${escapeHtml(formatRelativeTime(latestApi.updatedAt))} . ${Number(latestApi.summary?.totalResults || 0)} total results</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-load-btn" data-query="${escapeHtml(latestApi.query)}">Load</button>
                        <button type="button" class="api-cache-refresh-group-btn" data-group-key="${escapeHtml(group.id)}">Refresh</button>
                        <button type="button" class="api-cache-clear-group-btn" data-group-key="${escapeHtml(group.id)}">Clear</button>
                    </div>
                    <div class="unidex-api-provider-list">
                        ${buildUnidexApiProviderRows(group.apiEntries)}
                    </div>
                    <div class="api-provider-badges">${apiBadges}</div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-status">No cached API queries linked to this source yet.</div>
                    </div>
                </div>
            `);
        }

        return lanes.join('');
    }

    function buildUnidexGroupMarkup(group) {
        const linkedLanes = [
            group.wikipediaEntry ? 'Wikipedia' : null,
            group.fandomEntry ? 'Fandom' : null,
            group.apiEntries.length ? 'API' : null
        ].filter(Boolean);

        return `
            <div class="api-cache-entry unidex-source-card" data-group-key="${escapeHtml(group.id)}">
                <div class="api-cache-entry-header">
                    <div class="api-cache-entry-copy">
                        <div class="api-cache-entry-title">${escapeHtml(group.title)}</div>
                        <div class="api-cache-entry-meta">${escapeHtml(linkedLanes.join(' . ') || 'Unlinked source')} . updated ${escapeHtml(formatRelativeTime(group.updatedAt || 0))}</div>
                    </div>
                    <div class="api-provider-badges">
                        ${group.wikipediaEntry ? '<span class="api-provider-badge api-provider-badge-source">Wiki</span>' : ''}
                        ${group.fandomEntry ? '<span class="api-provider-badge api-provider-badge-source">Fandom</span>' : ''}
                        ${group.apiEntries.length ? '<span class="api-provider-badge api-provider-badge-source">API</span>' : ''}
                    </div>
                </div>
                <div class="unidex-lane-list">
                    ${buildUnidexLaneMarkup(group)}
                </div>
            </div>
        `;
    }

    function buildUnidexManagementMarkup(categoryName, filterQuery = '') {
        const groups = buildSourceCacheGroups(categoryName, { includeUncachedKnowledge: true }).filter(function (group) {
            return matchesGroupFilter(group, filterQuery);
        });
        if (!groups.length) {
            const baseMessage = filterQuery
                ? `No unified sources match "${escapeHtml(filterQuery)}" for this card yet.`
                : 'No saved wiki sources, fandom domains, or cached API queries for this card yet.';
            return `<div style="opacity:0.68; font-size:0.83rem;">${baseMessage}</div>`;
        }
        return groups.map(buildUnidexGroupMarkup).join('');
    }

    function wireCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const cacheEntries = api.Cache ? api.Cache.listQueries(resolvedCategory) : [];
        container.innerHTML = buildCacheListMarkup(cacheEntries, 'No API queries cached for this card yet.', options.providerKey);
        const interactionDelayMs = Number(options.interactionDelayMs) > 0 ? Number(options.interactionDelayMs) : 0;

        function assignQuery(query) {
            if (!queryInput) return;
            queryInput.value = query;
        }

        container.querySelectorAll('.api-cache-load-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                runAfterDelay(function () {
                    loadCachedQuery(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey: options.providerKey,
                        onAfterRender: options.onRefresh
                    });
                }, interactionDelayMs);
            });
        });

        container.querySelectorAll('.api-cache-refresh-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                runAfterDelay(function () {
                    runSearch(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey: options.providerKey,
                        liveResults: true,
                        onAfterRender: function () {
                            if (typeof options.onRefresh === 'function') options.onRefresh();
                        }
                    });
                }, interactionDelayMs);
            });
        });

        container.querySelectorAll('.api-cache-delete-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query || !api.Cache) return;
                api.Cache.deleteQuery(query, resolvedCategory);
                wireCacheList(container, resolvedCategory, resultsContainer, queryInput, options);
            });
        });
    }

    function wireUnifiedCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        container.innerHTML = buildUnifiedCacheListMarkup(resolvedCategory);

        function refreshPool() {
            wireUnifiedCacheList(container, resolvedCategory, resultsContainer, queryInput, options);
        }

        function getGroup(groupKey) {
            return buildSourceCacheGroups(resolvedCategory).find(function (group) {
                return String(group.id || '') === String(groupKey || '');
            }) || null;
        }

        function focusUnifiedGroup(group) {
            if (typeof window.switchCategoryTab === 'function') {
                window.switchCategoryTab('scraper');
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && group?.title) {
                searchInput.value = group.title;
            }
            if (typeof window.updateSource === 'function') {
                window.updateSource('unidex');
            }
            const unidexContainer = document.getElementById('unidex-scraper-panel-container');
            if (unidexContainer) {
                renderUnidexPanelUI(unidexContainer, resolvedCategory, {
                    filterQuery: group?.title || ''
                });
            }
        }

        container.querySelectorAll('.api-cache-open-group-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                focusUnifiedGroup(group);
            });
        });

        container.querySelectorAll('.api-cache-view-group-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                ensureCategoryContext(resolvedCategory);
                if (group.wikipediaEntry && window.CacheManager && typeof window.CacheManager.viewWikiCachedData === 'function') {
                    window.CacheManager.viewWikiCachedData(group.wikipediaEntry.key);
                    return;
                }
                if (group.fandomEntry && window.CacheManager && typeof window.CacheManager.viewFandomCachedData === 'function') {
                    window.CacheManager.viewFandomCachedData(group.fandomEntry.key);
                    return;
                }
                const latestApi = group.apiEntries[0];
                if (latestApi) {
                    if (queryInput) queryInput.value = latestApi.query;
                    loadCachedQuery(latestApi.query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        onAfterRender: refreshPool
                    });
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                ensureCategoryContext(resolvedCategory);
                if (group.wikipediaEntry && window.WikiManager && typeof window.WikiManager.reloadWikiEntryStatus === 'function') {
                    await window.WikiManager.reloadWikiEntryStatus(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.WikiManager && typeof window.WikiManager.reloadFandomWikiStatus === 'function') {
                    await window.WikiManager.reloadFandomWikiStatus(group.fandomEntry.key);
                }
                if (group.apiEntries.length) {
                    for (const entry of group.apiEntries) {
                        if (queryInput) queryInput.value = entry.query;
                        await runSearch(entry.query, resultsContainer, null, {
                            categoryName: resolvedCategory,
                            liveResults: true
                        });
                    }
                }
                refreshPool();
            });
        });

        container.querySelectorAll('.api-cache-clear-group-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                ensureCategoryContext(resolvedCategory);
                if (group.wikipediaEntry && window.CacheManager && typeof window.CacheManager.clearWikiCache === 'function') {
                    window.CacheManager.clearWikiCache(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.CacheManager && typeof window.CacheManager.clearFandomCache === 'function') {
                    window.CacheManager.clearFandomCache(group.fandomEntry.key);
                }
                if (group.apiEntries.length && api.Cache) {
                    group.apiEntries.forEach(function (entry) {
                        api.Cache.deleteQuery(entry.query, resolvedCategory);
                    });
                }
                refreshPool();
            });
        });
    }

    function suggestFandomDomain(title) {
        const base = String(title || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
        return base ? `${base}.fandom.com` : '';
    }

    function renderUnidexPanelUI(container, categoryName, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const filterQuery = String(options.filterQuery || '').trim();
        container.innerHTML = `
            <div class="api-scraper-shell unidex-scraper-shell">
                <div class="api-scraper-hero">
                    <div>
                        <div class="api-scraper-kicker">Unified Knowledge Base</div>
                        <div class="api-scraper-provider-title">Unidex</div>
                        <div class="api-scraper-provider-meta">Group saved wiki sources, fandom domains, and cached API queries under one source identity for this card.</div>
                    </div>
                    <div class="api-scraper-focus-pill">Knowledge Base</div>
                </div>
                <div class="api-cache-pool-list unidex-source-list">
                    ${buildUnidexManagementMarkup(resolvedCategory, filterQuery)}
                </div>
            </div>
        `;

        const resultsContainer = document.getElementById('results');
        const queryInput = document.getElementById('searchInput');

        function refreshPanel() {
            renderUnidexPanelUI(container, resolvedCategory, { filterQuery });
        }

        function getGroup(groupKey) {
            return buildSourceCacheGroups(resolvedCategory, { includeUncachedKnowledge: true }).find(function (group) {
                return String(group.id || '') === String(groupKey || '');
            }) || null;
        }

        function openSource(scope, key) {
            if (typeof window.updateSource === 'function') {
                window.updateSource(scope);
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && key) {
                searchInput.value = key;
            }
        }

        container.querySelectorAll('.api-cache-open-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key) return;
                openSource(scope, key);
            });
        });

        container.querySelectorAll('.api-cache-view-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.CacheManager) return;
                if (scope === 'wikipedia' && typeof window.CacheManager.viewWikiCachedData === 'function') {
                    window.CacheManager.viewWikiCachedData(key);
                } else if (scope === 'fandom' && typeof window.CacheManager.viewFandomCachedData === 'function') {
                    window.CacheManager.viewFandomCachedData(key);
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-source-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.WikiManager) return;
                if (scope === 'wikipedia' && typeof window.WikiManager.reloadWikiEntryStatus === 'function') {
                    await window.WikiManager.reloadWikiEntryStatus(key);
                } else if (scope === 'fandom' && typeof window.WikiManager.reloadFandomWikiStatus === 'function') {
                    await window.WikiManager.reloadFandomWikiStatus(key);
                }
                refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-clear-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.CacheManager) return;
                if (scope === 'wikipedia' && typeof window.CacheManager.clearWikiCache === 'function') {
                    window.CacheManager.clearWikiCache(key);
                } else if (scope === 'fandom' && typeof window.CacheManager.clearFandomCache === 'function') {
                    window.CacheManager.clearFandomCache(key);
                }
                refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-load-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                if (queryInput) queryInput.value = query;
                loadCachedQuery(query, resultsContainer, null, {
                    categoryName: resolvedCategory
                });
            });
        });

        container.querySelectorAll('.api-cache-open-provider-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const providerKey = String(button.dataset.providerKey || '').trim();
                const query = String(button.dataset.query || '').trim();
                if (!providerKey || !query) return;
                if (queryInput) queryInput.value = query;
                if (typeof window.updateSource === 'function') {
                    window.updateSource(providerKey);
                }
                if (resultsContainer) {
                    loadCachedQuery(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey
                    });
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                if (group.wikipediaEntry && window.WikiManager && typeof window.WikiManager.reloadWikiEntryStatus === 'function') {
                    await window.WikiManager.reloadWikiEntryStatus(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.WikiManager && typeof window.WikiManager.reloadFandomWikiStatus === 'function') {
                    await window.WikiManager.reloadFandomWikiStatus(group.fandomEntry.key);
                }
                if (group.apiEntries.length) {
                    for (const entry of group.apiEntries) {
                        if (queryInput) queryInput.value = entry.query;
                        await runSearch(entry.query, resultsContainer, null, {
                            categoryName: resolvedCategory,
                            liveResults: true
                        });
                    }
                }
                refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-clear-group-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const group = getGroup(button.dataset.groupKey);
                if (!group) return;
                if (group.wikipediaEntry && window.CacheManager && typeof window.CacheManager.clearWikiCache === 'function') {
                    window.CacheManager.clearWikiCache(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.CacheManager && typeof window.CacheManager.clearFandomCache === 'function') {
                    window.CacheManager.clearFandomCache(group.fandomEntry.key);
                }
                if (group.apiEntries.length && api.Cache) {
                    group.apiEntries.forEach(function (entry) {
                        api.Cache.deleteQuery(entry.query, resolvedCategory);
                    });
                }
                refreshPanel();
            });
        });

        container.querySelectorAll('.unidex-link-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.linkScope || '').trim();
                const title = String(button.dataset.linkTitle || '').trim();
                if (!scope || !title || !window.WikiManager) return;

                if (scope === 'wikipedia' && typeof window.WikiManager.addWikiEntry === 'function') {
                    window.WikiManager.addWikiEntry(title, title);
                    refreshPanel();
                    return;
                }

                if (scope === 'fandom' && typeof window.WikiManager.addFandomDomain === 'function') {
                    window.WikiManager.addFandomDomain(suggestFandomDomain(title), title);
                    refreshPanel();
                }
            });
        });
    }

    function getLatestCachedQuery(categoryName, providerKey = null) {
        const cacheEntries = api.Cache ? api.Cache.listQueries(categoryName) : [];
        if (!providerKey || !isProviderSource(providerKey)) {
            return cacheEntries[0] || null;
        }
        return cacheEntries.find(function (entry) {
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) || null;
    }

    function renderScraperSourceTabs(container, activeSource) {
        if (!container) return;

        container.innerHTML = PROVIDER_CONFIG.map(function (provider) {
            const isActive = String(activeSource || '').trim() === provider.key ? ' active' : '';
            return `
                <button class="source-toggle-btn${isActive}" data-source="${escapeHtml(provider.key)}" data-provider-source="true" onclick="updateSource('${escapeHtml(provider.key)}')">
                    <span class="icon">${escapeHtml(provider.shortLabel)}</span> ${escapeHtml(provider.label)}
                </button>
            `;
        }).join('');
    }

    function ensureScraperLiveToggleBinding(categoryName) {
        const liveToggle = document.getElementById('liveSearchToggle');
        const hybridToggle = document.getElementById('hybridSearchToggle');

        if (liveToggle) {
            const enabled = resolveLivePreference(categoryName);
            liveToggle.checked = enabled;

            if (liveToggle.dataset.apiLiveBound !== '1') {
                liveToggle.dataset.apiLiveBound = '1';
                liveToggle.addEventListener('change', function () {
                    persistLivePreference(categoryName, liveToggle.checked, liveToggle);
                });
            }
        }

        if (hybridToggle) {
            const enabled = resolveHybridPreference(categoryName);
            hybridToggle.checked = enabled;

            if (hybridToggle.dataset.apiHybridBound !== '1') {
                hybridToggle.dataset.apiHybridBound = '1';
                hybridToggle.addEventListener('change', function () {
                    persistHybridPreference(categoryName, hybridToggle.checked, hybridToggle);
                });
            }
        }
    }

    async function runSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ensureCategoryContext(options.categoryName);
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const shouldUseLive = resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = resolveHybridPreference(resolvedCategory, options.hybridResults);
        const normalizedQuery = String(query).trim();
        const cachedEntry = api.Cache ? api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;
        const cachedVisibleSources = filterSourcesByProvider(cachedEntry?.sources || {}, providerKey);
        const cachedVisibleCount = countResults(cachedVisibleSources);

        resultsContainer.style.display = 'block';

        if (!shouldUseLive && cachedEntry?.sources && cachedVisibleCount > 0) {
            if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
            const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: renderedSources,
                meta: {
                    fromCache: true,
                    providerKey,
                    summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
                }
            };
        }

        if (!shouldUseLive && !shouldUseHybrid) {
            renderCacheOnlyMessage(resultsContainer, normalizedQuery, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({
                    fromCache: false,
                    cacheMiss: true,
                    categoryName: resolvedCategory
                });
            }
            return {
                sources: {},
                meta: {
                    fromCache: false,
                    cacheMiss: true,
                    summary: { totalResults: 0 }
                }
            };
        }

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching ${escapeHtml(providerKey ? getProviderLabel(providerKey) : 'API providers')}...</div>`;
        updateResultsCount(0);

        try {
            const liveSources = await collectLiveResults(normalizedQuery, providerKey);
            const mergedSources = providerKey ? mergeSources(cachedEntry?.sources, liveSources) : liveSources;
            const storedEntry = api.Cache ? api.Cache.storeQuery(normalizedQuery, mergedSources, resolvedCategory, { ttlMs: options.ttlMs }) : null;
            const renderedSources = renderSourceResults(mergedSources, resultsContainer, onSelect, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: false, entry: storedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: renderedSources,
                meta: {
                    fromCache: false,
                    providerKey,
                    summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
                }
            };
        } catch (error) {
            console.error('API search error:', error);

            if (cachedEntry?.sources && cachedVisibleCount > 0) {
                if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
                const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
                if (typeof options.onAfterRender === 'function') {
                    options.onAfterRender({ fromCache: true, fallback: true, entry: cachedEntry, categoryName: resolvedCategory });
                }
                return {
                    sources: renderedSources,
                    meta: {
                        fromCache: true,
                        fallback: true,
                        providerKey,
                        summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
                    }
                };
            }

            resultsContainer.innerHTML = 'An error occurred while searching.<br><pre style="text-align:left; font-size:12px; color:red;">' + (error.stack || error.message || error) + '</pre>';
            return null;
        }
    }

    function loadCachedQuery(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer || !api.Cache) return null;

        const resolvedCategory = ensureCategoryContext(options.categoryName);
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const cachedEntry = api.Cache.getQuery(query, resolvedCategory);
        if (!cachedEntry?.sources) return null;
        if (countResults(filterSourcesByProvider(cachedEntry.sources, providerKey)) < 1) return null;

        api.Cache.touchQuery(query, resolvedCategory);
        const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
        if (typeof options.onAfterRender === 'function') {
            options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        }
        return {
            ...cachedEntry,
            renderedSources
        };
    }

    function renderSearchUI(searchContainer, resultsContainer, categoryName) {
        if (!searchContainer || !resultsContainer) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        searchContainer.innerHTML = `
            <div class="api-control-card">
                <div class="api-search-box">
                    <input type="text" class="api-search-input" placeholder="Search API providers for this card's Unidex graph...">
                    <button type="button" class="api-search-btn">Search</button>
                </div>
                <div class="api-preferences-row">
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-hybrid-toggle="search" ${prefs.hybridResults !== false ? 'checked' : ''}>
                        <span>Hybrid cache</span>
                    </label>
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-live-toggle="search" ${prefs.liveResults ? 'checked' : ''}>
                        <span>Live results</span>
                    </label>
                    <label class="api-select-chip">
                        <span>TTL</span>
                        <select data-api-ttl-select="search" class="api-ttl-select">${buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    <button type="button" class="api-action-btn api-search-refresh-last-btn">Refresh Last</button>
                    <button type="button" class="api-action-btn api-search-open-unidex-btn">Open Unidex</button>
                    <button type="button" class="api-action-btn api-search-clear-cache-btn">Clear Cache Pool</button>
                    <span class="api-surface-note">This mirrors Scraper &gt; Unidex. Cache is isolated to this card only.</span>
                </div>
                <details class="api-cache-pool-details" open>
                    <summary>Cache Pool</summary>
                    <div class="api-cache-pool-list"></div>
                </details>
            </div>
        `;

        const input = searchContainer.querySelector('.api-search-input');
        const button = searchContainer.querySelector('.api-search-btn');
        const hybridToggle = searchContainer.querySelector('[data-api-hybrid-toggle="search"]');
        const liveToggle = searchContainer.querySelector('[data-api-live-toggle="search"]');
        const ttlSelect = searchContainer.querySelector('[data-api-ttl-select="search"]');
        const refreshLastButton = searchContainer.querySelector('.api-search-refresh-last-btn');
        const openUnidexButton = searchContainer.querySelector('.api-search-open-unidex-btn');
        const clearCacheButton = searchContainer.querySelector('.api-search-clear-cache-btn');
        const cachePoolList = searchContainer.querySelector('.api-cache-pool-list');

        function refreshPool() {
            wireUnifiedCacheList(cachePoolList, resolvedCategory, resultsContainer, input, {
                onRefresh: refreshPool
            });
        }

        function executeSearch(forceLive) {
            const nextQuery = String(input.value || '').trim();
            if (!nextQuery) return;
            runSearch(nextQuery, resultsContainer, null, {
                categoryName: resolvedCategory,
                ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                liveResults: typeof forceLive === 'boolean' ? forceLive : liveToggle.checked,
                hybridResults: hybridToggle?.checked !== false,
                onAfterRender: refreshPool
            });
        }

        if (button) {
            button.onclick = function () { executeSearch(); };
        }

        if (input) {
            input.onkeypress = function (event) {
                if (event.key === 'Enter') executeSearch();
            };
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        if (refreshLastButton) {
            refreshLastButton.addEventListener('click', function () {
                const fallbackEntry = getLatestCachedQuery(resolvedCategory, null);
                if (!String(input.value || '').trim() && fallbackEntry?.query) {
                    input.value = fallbackEntry.query;
                }
                executeSearch(true);
            });
        }

        if (openUnidexButton) {
            openUnidexButton.addEventListener('click', function () {
                const focusQuery = String(input?.value || '').trim();
                if (typeof window.switchCategoryTab === 'function') {
                    window.switchCategoryTab('scraper');
                }

                window.setTimeout(function () {
                    if (typeof window.updateSource === 'function') {
                        window.updateSource('unidex');
                    }

                    const scraperInput = document.getElementById('searchInput');
                    if (scraperInput && focusQuery) {
                        scraperInput.value = focusQuery;
                    }

                    const unidexPanelContainer = document.getElementById('unidex-scraper-panel-container');
                    if (unidexPanelContainer && window.EveOS?.API?.Manager?.renderUnidexPanelUI) {
                        window.EveOS.API.Manager.renderUnidexPanelUI(unidexPanelContainer, resolvedCategory, {
                            filterQuery: focusQuery
                        });
                    }
                }, 180);
            });
        }

        if (clearCacheButton) {
            clearCacheButton.addEventListener('click', async function () {
                if (api.Cache) {
                    api.Cache.clearAll(resolvedCategory);
                    api.Cache.savePrefs({
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false
                    }, resolvedCategory);
                }
                clearKnowledgeCaches(resolvedCategory);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                updateResultsCount(0);
                refreshPool();
            });
        }

        refreshPool();
        syncHybridToggleState(hybridToggle?.checked !== false, hybridToggle);
        syncLiveToggleState(liveToggle?.checked === true, liveToggle);
        syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);
    }

    function renderScraperPanelUI(container, categoryName, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const providerLabel = providerKey ? getProviderLabel(providerKey) : 'All API Sources';
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        container.innerHTML = `
            <div class="api-scraper-shell">
                <div class="api-scraper-hero">
                    <div>
                        <div class="api-scraper-kicker">Card-scoped provider cache</div>
                        <div class="api-scraper-provider-title">${escapeHtml(providerLabel)}</div>
                        <div class="api-scraper-provider-meta">
                            ${providerKey ? `Search and cache only ${escapeHtml(providerLabel)} results from the left search bar.` : 'Search all API providers from the left search bar. Cached queries and results stay inside this card.'}
                        </div>
                    </div>
                    <div class="api-scraper-focus-pill">${providerKey ? 'Provider view' : 'All providers'}</div>
                </div>
                <div class="api-preferences-row">
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-hybrid-toggle="scraper" ${prefs.hybridResults !== false ? 'checked' : ''}>
                        <span>Hybrid cache</span>
                    </label>
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-live-toggle="scraper" ${prefs.liveResults ? 'checked' : ''}>
                        <span>Live results</span>
                    </label>
                    <label class="api-select-chip">
                        <span>TTL</span>
                        <select data-api-ttl-select="scraper" class="api-ttl-select">${buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    <button type="button" class="api-action-btn api-scraper-refresh-btn">Refresh Last</button>
                    <button type="button" class="api-action-btn api-scraper-clear-btn">Clear Cache Pool</button>
                </div>
                <div class="api-scraper-cache-list"></div>
            </div>
        `;

        const queryInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('results');
        const hybridToggle = container.querySelector('[data-api-hybrid-toggle="scraper"]');
        const liveToggle = container.querySelector('[data-api-live-toggle="scraper"]');
        const ttlSelect = container.querySelector('[data-api-ttl-select="scraper"]');
        const refreshButton = container.querySelector('.api-scraper-refresh-btn');
        const clearButton = container.querySelector('.api-scraper-clear-btn');
        const cacheList = container.querySelector('.api-scraper-cache-list');

        ensureScraperLiveToggleBinding(resolvedCategory);
        syncHybridToggleState(prefs.hybridResults !== false, hybridToggle);
        syncLiveToggleState(prefs.liveResults === true, liveToggle);
        syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);

        function beforeLoad() {
            if (typeof window.updateSource === 'function') {
                window.updateSource(providerKey || 'api');
            }
        }

        function refreshPool() {
            wireCacheList(cacheList, resolvedCategory, resultsContainer, queryInput, {
                beforeLoad: beforeLoad,
                interactionDelayMs: 340,
                providerKey: providerKey,
                onRefresh: refreshPool
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', function () {
                beforeLoad();
                const latestEntry = getLatestCachedQuery(resolvedCategory, providerKey);
                const nextQuery = String(queryInput?.value || '').trim() || latestEntry?.query || '';
                if (!nextQuery || !resultsContainer) return;
                if (queryInput) queryInput.value = nextQuery;
                runAfterDelay(function () {
                    runSearch(nextQuery, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey: providerKey,
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: true,
                        hybridResults: hybridToggle?.checked !== false,
                        onAfterRender: refreshPool
                    });
                }, 340);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', function () {
                if (api.Cache) {
                    api.Cache.clearAll(resolvedCategory);
                    api.Cache.savePrefs({
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false
                    }, resolvedCategory);
                }
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                refreshPool();
                updateResultsCount(0);
            });
        }

        refreshPool();
    }

    api.Manager = {
        collectLiveResults,
        getProviderLabel,
        isProviderSource,
        buildSourceCacheGroups,
        findSourceCacheGroup,
        renderScraperSourceTabs,
        renderSearchUI,
        renderScraperPanelUI,
        renderUnidexPanelUI,
        refreshScraperPanel: renderScraperPanelUI,
        loadCachedQuery,
        runSearch
    };
})(window.EveOS.API);

