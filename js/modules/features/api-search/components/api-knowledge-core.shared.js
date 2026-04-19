window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.knowledgeCoreSharedReady) return;

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

        let stem = normalized
            .replace(/[-_]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        stem = stem.replace(/^(the|a|an)\s+/i, '');
        stem = stem.replace(/\s*(pedia|wiki|encyclopedia|fandom|fanon|official|data)\s*$/i, '');
        stem = stem.replace(/(pedia|wiki|encyclopedia|fanon|official|data)$/i, '');

        return stem.trim() || normalized;
    };

    ctx.uniqueIdentities = function uniqueIdentities(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map(ctx.normalizeSourceIdentity)
            .filter(Boolean)));
    };

    ctx.loadSavedKnowledgeSources = async function loadSavedKnowledgeSources(categoryName) {
        const storedWikiEntries = await ctx.getScopedStorageValueAsync('wikiEntries', [], categoryName);
        const storedFandomDomains = await ctx.getScopedStorageValueAsync('fandomDomains', [], categoryName);
        const wikiEntries = Array.isArray(storedWikiEntries) ? storedWikiEntries : [];
        const fandomDomains = Array.isArray(storedFandomDomains) ? storedFandomDomains : [];
        return { wikiEntries, fandomDomains };
    };

    ctx.normalizeSavedWikipediaEntries = async function normalizeSavedWikipediaEntries(categoryName) {
        const knowledge = await ctx.loadSavedKnowledgeSources(categoryName);
        return knowledge.wikiEntries.map(function (entry) {
            const title = String(entry?.title || entry?.name || entry || '').trim();
            if (!title) return null;
            return {
                title: title,
                name: String(entry?.name || title).trim()
            };
        }).filter(Boolean);
    };

    ctx.normalizeSavedFandomDomains = async function normalizeSavedFandomDomains(categoryName) {
        const knowledge = await ctx.loadSavedKnowledgeSources(categoryName);
        return knowledge.fandomDomains.map(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return null;
            return {
                domain: domain,
                name: String(entry?.name || domain).trim()
            };
        }).filter(Boolean);
    };

    ctx.normalizeKnowledgeTitleKey = function normalizeKnowledgeTitleKey(value) {
        return ctx.normalizeKnowledgeTitleValue(value)
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    ctx.normalizeKnowledgeTitleValue = function normalizeKnowledgeTitleValue(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    };

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

    ctx.stripKnowledgeSourceSuffix = function stripKnowledgeSourceSuffix(title, sourceLabel) {
        const normalizedTitle = ctx.normalizeKnowledgeTitleValue(title);
        const normalizedSource = ctx.normalizeKnowledgeTitleValue(sourceLabel);
        if (!normalizedTitle) return '';
        if (!normalizedSource) return normalizedTitle;

        const escapedSource = normalizedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const suffixPatterns = [
            new RegExp(`\\s*[|\\-\\u2013\\u2014:]\\s*${escapedSource}$`, 'i'),
            new RegExp(`\\s*[|\\-\\u2013\\u2014:]\\s*${escapedSource}\\s+wiki$`, 'i'),
            /\s*[|\-\u2013\u2014:]\s*fandom$/i,
            /\s*[|\-\u2013\u2014:]\s*wikipedia$/i
        ];

        let nextTitle = normalizedTitle;
        suffixPatterns.forEach(function (pattern) {
            nextTitle = nextTitle.replace(pattern, '').trim();
        });
        return nextTitle || normalizedTitle;
    };

    ctx.buildKnowledgeSectionTitle = function buildKnowledgeSectionTitle(scope) {
        return scope === 'wikipedia' ? 'Wikipedia Saved Sources' : 'Fandom Saved Sources';
    };

    ctx.knowledgeCoreSharedReady = true;
})(window.EveOS.API);
