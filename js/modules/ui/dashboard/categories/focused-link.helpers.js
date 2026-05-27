window.DashboardCategoriesModules = window.DashboardCategoriesModules || {};

(function (modules) {
    if (modules.focusedLinkHelpers) return;

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getAllLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function normalizeId(value) {
        return String(value ?? '');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeJsString(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function truncateText(value, maxLength) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '...';
    }

    function getDomain(rawUrl) {
        try {
            return new URL(rawUrl).hostname || String(rawUrl || '');
        } catch (error) {
            return String(rawUrl || '');
        }
    }

    function isReservedIconUrl(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        const faviconUtils = window.EveFaviconUtils || null;
        if (faviconUtils && typeof faviconUtils.isReservedIconUrl === 'function') {
            return !!faviconUtils.isReservedIconUrl(text);
        }
        try {
            const host = new URL(text).hostname.toLowerCase();
            return host === 'example'
                || host.endsWith('.example')
                || host === 'test'
                || host.endsWith('.test')
                || host === 'invalid'
                || host.endsWith('.invalid');
        } catch (error) {
            return false;
        }
    }

    function getLinkById(linkId) {
        const normalized = normalizeId(linkId);
        if (!normalized) return null;
        const indexApi = getDatapackIndexApi();
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(normalized);
            if (resolved) return resolved;
        }
        return getAllLinks().find(item => normalizeId(item?.id) === normalized) || null;
    }

    function getLinkedRecord(linkId) {
        return window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(normalizeId(linkId)) || null;
    }

    function getMediaTypeLabel(entry) {
        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : [];
        const rawType = mediaTypes.length ? String(mediaTypes[0] || '').trim() : '';
        if (!rawType) return '';
        if (rawType === 'graphicNovels') return 'Graphic Novel';
        if (rawType === 'novels') return 'Novel';
        if (rawType === 'films') return 'Film/Series';
        return rawType;
    }

    function getProgressLabel(entry) {
        if (!entry || typeof entry !== 'object') return '';

        const season = Number(entry.season || 0);
        const episode = Number(entry.episode || 0);
        if (season > 0 || episode > 0) return 'S' + Math.max(0, season) + ' E' + Math.max(0, episode);

        const graphicChapter = Number(entry.graphicChapter || 0);
        if (graphicChapter > 0) return 'Chapter ' + graphicChapter;

        const novelChapter = Number(entry.novelChapter || 0);
        if (novelChapter > 0) return 'Chapter ' + novelChapter;

        const chapter = Number(entry.chapter || 0);
        if (chapter > 0) return 'Chapter ' + chapter;

        return '';
    }

    function buildBookmarkIconHtml(link, safeTitle) {
        const linkIcon = '\u{1F517}';
        const globeIcon = '\u{1F310}';
        const faviconUtils = window.EveFaviconUtils || null;
        const iconRaw = String(link?.icon || '').trim();
        const iconNormalized = iconRaw.replace(/\uFE0F/g, '');
        const isLegacyLinkIcon = iconNormalized === linkIcon;
        const customIconIsImage = /^(?:https?:\/\/|data:)/i.test(iconRaw) || iconRaw.startsWith('/');
        const hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon && !(customIconIsImage && isReservedIconUrl(iconRaw));
        const fallbackDomain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
            ? faviconUtils.getDomainFromUrl(link?.url)
            : getDomain(link?.url);
        const fallbackSrc = faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
            ? faviconUtils.getFallbackSrc(fallbackDomain, 64)
            : '';
        const safeFallbackSrc = escapeHtml(fallbackSrc);
        const fallbackAttr = safeFallbackSrc ? ' data-fallback-src="' + safeFallbackSrc + '"' : '';
        const faviconDomainAttr = fallbackDomain ? ' data-favicon-domain="' + escapeHtml(fallbackDomain) + '"' : '';
        const faviconSizeAttr = ' data-favicon-size="64"';
        const fallbackOnError = "if(window.EveFaviconUtils&&typeof window.EveFaviconUtils.handleImageError==='function'){window.EveFaviconUtils.handleImageError(this);return;}this.onerror=null;this.replaceWith(document.createTextNode(String.fromCodePoint(0x1F310)));";

        if (hasCustomIcon) {
            if (customIconIsImage) {
                const safeIconUrl = escapeHtml(iconRaw);
                return '<img class="unidex-entry-bookmark-icon-img" src="' + safeIconUrl + '" alt="' + safeTitle + ' icon"' + fallbackAttr + faviconDomainAttr + faviconSizeAttr + ' loading="lazy" referrerpolicy="no-referrer" onerror="' + fallbackOnError + '">';
            }
            return '<span class="unidex-entry-bookmark-icon-emoji">' + escapeHtml(iconRaw) + '</span>';
        }

        const sourceUrl = String(link?.url || '').trim();
        const isLocal = sourceUrl.startsWith('file://');
        const domain = fallbackDomain;
        const hasDomain = !isLocal && !!domain;
        if (hasDomain) {
            const cachedSrc = faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
                ? faviconUtils.getBestEffortSrc(domain, 64)
                : '';
            return '<img class="unidex-entry-bookmark-icon-img" src="' + escapeHtml(cachedSrc) + '" alt="' + safeTitle + ' icon"' + fallbackAttr + faviconDomainAttr + faviconSizeAttr + ' loading="lazy" referrerpolicy="no-referrer" onerror="' + fallbackOnError + '">';
        }

        return '<span class="unidex-entry-bookmark-icon-fallback">' + globeIcon + '</span>';
    }

    modules.focusedLinkHelpers = {
        normalizeId,
        escapeHtml,
        escapeJsString,
        truncateText,
        getDomain,
        getLinkById,
        getLinkedRecord,
        getMediaTypeLabel,
        getProgressLabel,
        buildBookmarkIconHtml
    };
})(window.DashboardCategoriesModules);
