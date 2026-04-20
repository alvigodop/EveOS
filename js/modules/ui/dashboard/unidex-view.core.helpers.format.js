window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createCoreHelperFormat = function createCoreHelperFormat() {
        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function encodeParam(value) {
            return encodeURIComponent(String(value ?? ''));
        }

        function decodeParam(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            try {
                return decodeURIComponent(text);
            } catch (error) {
                return text;
            }
        }

        function getDomain(rawUrl) {
            try {
                return new URL(rawUrl).hostname || String(rawUrl || '');
            } catch (error) {
                return String(rawUrl || '');
            }
        }

        function truncateText(value, maxLength) {
            const text = String(value || '').trim();
            if (!text) return '';
            if (text.length <= maxLength) return text;
            return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
        }

        function getMediaTypeLabel(entry) {
            const rawType = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
                ? String(entry.mediaTypes[0] || '').trim()
                : '';
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
            if (season > 0 || episode > 0) return `S${Math.max(0, season)} E${Math.max(0, episode)}`;

            const graphicChapter = Number(entry.graphicChapter || 0);
            if (graphicChapter > 0) return `Chapter ${graphicChapter}`;

            const novelChapter = Number(entry.novelChapter || 0);
            if (novelChapter > 0) return `Chapter ${novelChapter}`;

            const chapter = Number(entry.chapter || 0);
            if (chapter > 0) return `Chapter ${chapter}`;
            return '';
        }

        function buildBookmarkIconHtml(link, safeTitle) {
            const faviconUtils = window.EveFaviconUtils || null;
            const iconRaw = String(link?.icon || '').trim();
            const iconNormalized = iconRaw.replace(/\uFE0F/g, '');
            const isLegacyLinkIcon = iconNormalized === '\u{1F517}';
            const hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon;
            const fallbackDomain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
                ? faviconUtils.getDomainFromUrl(link?.url)
                : getDomain(link?.url);
            const fallbackSrc = faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
                ? faviconUtils.getFallbackSrc(fallbackDomain, 64)
                : '';
            const safeFallbackSrc = escapeHtml(fallbackSrc);
            const fallbackAttr = safeFallbackSrc ? ` data-fallback-src="${safeFallbackSrc}"` : '';
            const fallbackOnError = `const fallback=this.dataset.fallbackSrc||'';if(this.dataset.fallbackApplied==='1'||!fallback){this.onerror=null;this.replaceWith(document.createTextNode(String.fromCodePoint(0x1F310)));return;}this.dataset.fallbackApplied='1';this.src=fallback;`;

            if (hasCustomIcon) {
                if (/^(?:https?:\/\/|data:)/i.test(iconRaw) || iconRaw.startsWith('/')) {
                    const safeIconUrl = escapeHtml(iconRaw);
                    return `<img class="unidex-entry-bookmark-icon-img" src="${safeIconUrl}" alt="${safeTitle} icon"${fallbackAttr} loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`;
                }
                return `<span class="unidex-entry-bookmark-icon-emoji">${escapeHtml(iconRaw)}</span>`;
            }

            const sourceUrl = String(link?.url || '').trim();
            const isLocal = sourceUrl.startsWith('file://');
            const domain = fallbackDomain;
            const hasDomain = !isLocal && !!domain;
            if (hasDomain) {
                const cachedSrc = faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
                    ? faviconUtils.getBestEffortSrc(domain, 64)
                    : '';
                return `<img class="unidex-entry-bookmark-icon-img" src="${escapeHtml(cachedSrc)}" alt="${safeTitle} icon"${fallbackAttr} loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`;
            }

            return '<span class="unidex-entry-bookmark-icon-fallback">&#128279;</span>';
        }

        return {
            escapeHtml,
            encodeParam,
            decodeParam,
            getDomain,
            truncateText,
            getMediaTypeLabel,
            getProgressLabel,
            buildBookmarkIconHtml
        };
    };
})();
