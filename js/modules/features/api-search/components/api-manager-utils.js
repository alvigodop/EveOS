window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

ctx.PROVIDER_CONFIG = [
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

ctx.PROVIDER_ORDER = ctx.PROVIDER_CONFIG.map(function (provider) {
        return [provider.key, provider.label];
    });

ctx.PROVIDER_KEYS = ctx.PROVIDER_CONFIG.map(function (provider) {
        return provider.key;
    });

ctx.PROVIDER_LABELS = ctx.PROVIDER_CONFIG.reduce(function (acc, provider) {
        acc[provider.key] = provider.label;
        return acc;
    }, {});

ctx.PROVIDER_SET = new Set(ctx.PROVIDER_KEYS);

ctx.TTL_OPTIONS = [
        { value: 60 * 60 * 1000, label: '1 hour' },
        { value: 6 * 60 * 60 * 1000, label: '6 hours' },
        { value: 24 * 60 * 60 * 1000, label: '24 hours' },
        { value: 7 * 24 * 60 * 60 * 1000, label: '7 days' }
    ];

ctx.normalizeCategoryName = function normalizeCategoryName(categoryName) {
        return String(categoryName || window.currentCategoryCtx || window.StorageManager?.categoryContext || '').trim();
    }

ctx.ensureCategoryContext = function ensureCategoryContext(categoryName) {
        const resolvedCategory = ctx.normalizeCategoryName(categoryName);
        if (resolvedCategory && window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
            window.StorageManager.setCategoryContext(resolvedCategory);
        }
        return resolvedCategory;
    }

ctx.countResults = function countResults(sources) {
        const summary = api.Cache?.summarizeSources ? api.Cache.summarizeSources(sources || {}) : { totalResults: 0 };
        return Number(summary.totalResults || 0);
    }

ctx.updateResultsCount = function updateResultsCount(total) {
        const counter = document.getElementById('resultCount');
        if (counter) {
            counter.textContent = String(Number(total) || 0);
        }
    }

ctx.formatRelativeTime = function formatRelativeTime(timestamp) {
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

ctx.formatExpiry = function formatExpiry(expiresAt) {
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

ctx.toTimestamp = function toTimestamp(value) {
        if (Number(value) > 0) return Number(value);
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

ctx.escapeHtml = function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

ctx.isProviderSource = function isProviderSource(source) {
        return ctx.PROVIDER_SET.has(String(source || '').trim());
    }

ctx.getProviderLabel = function getProviderLabel(providerKey) {
        return ctx.PROVIDER_LABELS[String(providerKey || '').trim()] || 'API Provider';
    }

ctx.filterSourcesByProvider = function filterSourcesByProvider(sources, providerKey) {
        if (!providerKey || !ctx.isProviderSource(providerKey)) {
            return sources || {};
        }
        return {
            [providerKey]: sources?.[providerKey]
        };
    }

ctx.mergeSources = function mergeSources(baseSources, nextSources) {
        return {
            ...(baseSources && typeof baseSources === 'object' ? baseSources : {}),
            ...(nextSources && typeof nextSources === 'object' ? nextSources : {})
        };
    }

ctx.getProviderList = function getProviderList(sources, providerKey) {
        const val = sources?.[providerKey];
        if (!val) return [];
        
        switch (providerKey) {
            case 'mangadex':
                return Array.isArray(val.data) ? val.data : [];
            case 'jikanManga':
            case 'jikanAnime':
                return Array.isArray(val.data) ? val.data : [];
            case 'anilistManga':
            case 'anilistAnime':
                return Array.isArray(val.data?.Page?.media) ? val.data.Page.media : [];
            case 'mangaupdates':
                return Array.isArray(val.results) ? val.results : [];
            case 'kitsuAnime':
            case 'kitsuManga':
                return Array.isArray(val.data) ? val.data : [];
            case 'tvmaze':
                return Array.isArray(val) ? val : [];
            case 'itunes':
                return Array.isArray(val.results) ? val.results : [];
            case 'wlnupdates':
                return Array.isArray(val.data) ? val.data : [];
            case 'openlibrary':
                return Array.isArray(val.docs) ? val.docs : [];
            case 'comick':
                return Array.isArray(val) ? val : [];
            default:
                return [];
        }
    }

ctx.runAfterDelay = function runAfterDelay(callback, delayMs) {
        if (!(typeof callback === 'function')) return;
        if (Number(delayMs) > 0) {
            window.setTimeout(callback, Number(delayMs));
            return;
        }
        callback();
    }

ctx.claimResultsView = function claimResultsView(resultsContainer, meta = {}) {
        if (!resultsContainer) return '';
        if (!resultsContainer.dataset) {
            resultsContainer.dataset = {};
        }
        const nextRequestId = `eve-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        resultsContainer.dataset.eveSearchRequestId = nextRequestId;
        resultsContainer.dataset.eveSearchQuery = String(meta.query || '').trim();
        resultsContainer.dataset.eveSearchSource = String(meta.source || '').trim();
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '';
        ctx.updateResultsCount(0);
        return nextRequestId;
    }

ctx.isClaimCurrent = function isClaimCurrent(resultsContainer, requestId) {
        if (!resultsContainer || !requestId) return true;
        return resultsContainer.dataset.eveSearchRequestId === requestId;
    }

ctx.buildSourceGroupMarkup = function buildSourceGroupMarkup(group) {
        const laneCount = Number(!!group.wikipediaEntry) + Number(!!group.fandomEntry) + Number((group.apiEntries || []).length > 0);
        const meta = `${laneCount} cache ${laneCount === 1 ? 'lane' : 'lanes'} . updated ${ctx.formatRelativeTime(group.updatedAt)}`;
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
        const apiProviderCounts = ctx.summarizeApiGroupProviders(group.apiEntries);
        ctx.PROVIDER_ORDER.forEach(function ([key, label]) {
            const count = Number(apiProviderCounts[key] || 0);
            if (!count) return;
            badges.push(`<span class="api-provider-badge">${ctx.escapeHtml(label)} <strong>${count}</strong></span>`);
        });

        return `
            <div class="api-cache-entry api-cache-entry-source" data-group-key="${ctx.escapeHtml(group.id)}">
                <div class="api-cache-entry-header">
                    <div class="api-cache-entry-copy">
                        <div class="api-cache-entry-title">${ctx.escapeHtml(group.title)}</div>
                        <div class="api-cache-entry-meta">${ctx.escapeHtml(meta)}</div>
                        <div class="api-cache-entry-expiry">${ctx.escapeHtml(subtitleParts.join(' . '))}</div>
                    </div>
                    <div class="api-cache-actions">
                        <button type="button" class="api-cache-open-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Open</button>
                        <button type="button" class="api-cache-view-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">View</button>
                        <button type="button" class="api-cache-refresh-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Refresh</button>
                        <button type="button" class="api-cache-clear-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Clear</button>
                    </div>
                </div>
                <div class="api-provider-badges">${badges.join('') || '<span class="api-provider-empty">No cache lanes linked.</span>'}</div>
            </div>
        `;
    }

ctx.buildUnifiedCacheListMarkup = async function buildUnifiedCacheListMarkup(categoryName) {
        const groups = await ctx.buildSourceCacheGroups(categoryName, { includeUncachedKnowledge: false });
        if (!groups.length) {
            return '<div style="opacity:0.68; font-size:0.83rem;">No cached API, Wikipedia, or Fandom data for this card yet.</div>';
        }

        return groups.map(ctx.buildSourceGroupMarkup).join('');
    }

ctx.normalizeKnowledgeTitleKey = function normalizeKnowledgeTitleKey(value) {
        return ctx.normalizeKnowledgeTitleValue(value)
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

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
    }

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
    }

ctx.buildKnowledgeSectionTitle = function buildKnowledgeSectionTitle(scope) {
        return scope === 'wikipedia' ? 'Wikipedia Saved Sources' : 'Fandom Saved Sources';
    }
    /**
     * Get a value from scoped storage (sync).
     */
ctx.getScopedStorageValue = function getScopedStorageValue(key, defaultValue, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.loadData === 'function') {
            return window.StorageManager.loadData(key, defaultValue, resolvedCategory) ?? defaultValue;
        }
        
        // Fallback to direct localStorage if StorageManager is missing
        const fullKey = `${resolvedCategory}_${key}`;
        try {
            const raw = localStorage.getItem(fullKey);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    };

    /**
     * Save a value to scoped storage (sync).
     */
    ctx.saveScopedStorageValue = function saveScopedStorageValue(key, value, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.saveData === 'function') {
            return window.StorageManager.saveData(key, value, resolvedCategory);
        }
        
        // Fallback to direct localStorage if StorageManager is missing
        const fullKey = `${resolvedCategory}_${key}`;
        try {
            localStorage.setItem(fullKey, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    };

    /**
     * Get a value from scoped storage (async) - supports heavy data.
     */
ctx.getScopedStorageValueAsync = async function getScopedStorageValueAsync(key, defaultValue, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.loadDataAsync === 'function') {
            return (await window.StorageManager.loadDataAsync(key, defaultValue, resolvedCategory)) ?? defaultValue;
        }
        
        // Fallback to sync if async is not available
        return ctx.getScopedStorageValue(key, defaultValue, resolvedCategory);
    };

    /**
     * Save a value to scoped storage (async) - supports heavy data.
     */
    ctx.saveScopedStorageValueAsync = async function saveScopedStorageValueAsync(key, value, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (window.StorageManager && typeof window.StorageManager.saveDataAsync === 'function') {
            return await window.StorageManager.saveDataAsync(key, value, resolvedCategory);
        }
        
        // Fallback to sync if async is not available
        return ctx.saveScopedStorageValue(key, value, resolvedCategory);
    };


})(window.EveOS.API);
