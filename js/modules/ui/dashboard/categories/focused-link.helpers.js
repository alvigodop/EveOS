window.DashboardCategoriesModules = window.DashboardCategoriesModules || {};

(function (modules) {
    if (modules.focusedLinkHelpers) return;

    function getAllLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
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

    function getLinkById(linkId) {
        const normalized = normalizeId(linkId);
        if (!normalized) return null;
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
        const iconRaw = String(link?.icon || '').trim();
        const iconNormalized = iconRaw.replace(/\uFE0F/g, '');
        const isLegacyLinkIcon = iconNormalized === linkIcon;
        const hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon;

        if (hasCustomIcon) {
            if (/^https?:\/\//i.test(iconRaw)) {
                return '<img class="unidex-entry-bookmark-icon-img" src="' + escapeHtml(iconRaw) + '" alt="' + safeTitle + ' icon" loading="lazy" referrerpolicy="no-referrer">';
            }
            return '<span class="unidex-entry-bookmark-icon-emoji">' + escapeHtml(iconRaw) + '</span>';
        }

        const sourceUrl = String(link?.url || '').trim();
        const isLocal = sourceUrl.startsWith('file://');
        const domain = getDomain(sourceUrl);
        const hasDomain = !isLocal && domain.includes('.');
        if (hasDomain) {
            return '<img class="unidex-entry-bookmark-icon-img" src="https://www.google.com/s2/favicons?domain=' + escapeHtml(domain) + '&sz=64" alt="' + safeTitle + ' icon" loading="lazy" referrerpolicy="no-referrer">';
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
