window.DashboardCategories = window.DashboardCategories || {};

(function (DashboardCategories) {
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
        var text = String(value || '').trim();
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
        var normalized = normalizeId(linkId);
        if (!normalized) return null;
        return getAllLinks().find(function (item) {
            return normalizeId(item?.id) === normalized;
        }) || null;
    }

    function getLinkedRecord(linkId) {
        return window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(normalizeId(linkId)) || null;
    }

    function getMediaTypeLabel(entry) {
        var mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : [];
        var rawType = mediaTypes.length ? String(mediaTypes[0] || '').trim() : '';
        if (!rawType) return '';
        if (rawType === 'graphicNovels') return 'Graphic Novel';
        if (rawType === 'novels') return 'Novel';
        if (rawType === 'films') return 'Film/Series';
        return rawType;
    }

    function getProgressLabel(entry) {
        if (!entry || typeof entry !== 'object') return '';

        var season = Number(entry.season || 0);
        var episode = Number(entry.episode || 0);
        if (season > 0 || episode > 0) return 'S' + Math.max(0, season) + ' E' + Math.max(0, episode);

        var graphicChapter = Number(entry.graphicChapter || 0);
        if (graphicChapter > 0) return 'Chapter ' + graphicChapter;

        var novelChapter = Number(entry.novelChapter || 0);
        if (novelChapter > 0) return 'Chapter ' + novelChapter;

        var chapter = Number(entry.chapter || 0);
        if (chapter > 0) return 'Chapter ' + chapter;

        return '';
    }

    function buildBookmarkIconHtml(link, safeTitle) {
        var linkIcon = '\u{1F517}';
        var globeIcon = '\u{1F310}';
        var iconRaw = String(link?.icon || '').trim();
        var iconNormalized = iconRaw.replace(/\uFE0F/g, '');
        var isLegacyLinkIcon = iconNormalized === linkIcon;
        var hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon;

        if (hasCustomIcon) {
            if (/^https?:\/\//i.test(iconRaw)) {
                return '<img class="unidex-entry-bookmark-icon-img" src="' + escapeHtml(iconRaw) + '" alt="' + safeTitle + ' icon" loading="lazy" referrerpolicy="no-referrer">';
            }
            return '<span class="unidex-entry-bookmark-icon-emoji">' + escapeHtml(iconRaw) + '</span>';
        }

        var sourceUrl = String(link?.url || '').trim();
        var isLocal = sourceUrl.startsWith('file://');
        var domain = getDomain(sourceUrl);
        var hasDomain = !isLocal && domain.includes('.');
        if (hasDomain) {
            return '<img class="unidex-entry-bookmark-icon-img" src="https://www.google.com/s2/favicons?domain=' + escapeHtml(domain) + '&sz=64" alt="' + safeTitle + ' icon" loading="lazy" referrerpolicy="no-referrer">';
        }

        return '<span class="unidex-entry-bookmark-icon-fallback">' + globeIcon + '</span>';
    }

    DashboardCategories.openFocusedEntry = function (linkId, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        var normalizedId = normalizeId(linkId);
        if (!normalizedId) return false;

        if (typeof openBookmarkFromDashboard === 'function') {
            return openBookmarkFromDashboard(event, normalizedId);
        }

        var link = getLinkById(normalizedId);
        if (!link?.url) return false;
        var safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    };

    DashboardCategories.openFocusedEntryDirect = function (linkId, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        var normalizedId = normalizeId(linkId);
        if (!normalizedId) return false;

        var link = getLinkById(normalizedId);
        if (!link?.url) return false;
        var safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    };

    DashboardCategories.buildFocusedLinkHtml = function (link, options) {
        var renderOptions = options || {};
        var isTaskMode = !!renderOptions.taskMode;
        var normalizedId = normalizeId(link?.id);
        var encodedId = encodeURIComponent(normalizedId);
        var jsIdLiteral = "'" + escapeJsString(normalizedId) + "'";

        var safeTitle = escapeHtml(link?.title || 'Untitled');
        var hoverText = escapeHtml(truncateText(String(link?.title || 'Untitled').toUpperCase(), 34));
        var safeDomain = escapeHtml(getDomain(link?.url));

        var linkedRecord = getLinkedRecord(normalizedId);
        var isLibraryLinked = !!linkedRecord?.entry;
        var libraryEntry = linkedRecord?.entry || null;

        var libraryStatusRaw = String(libraryEntry?.status || '').trim();
        var libraryRatingRaw = String(libraryEntry?.rating || '').trim();
        var libraryAuthorRaw = String(libraryEntry?.author || '').trim();
        var libraryGenreRaw = String(libraryEntry?.genre || '').trim();
        var librarySummaryRaw = truncateText(libraryEntry?.summary, 180);
        var libraryLanguageRaw = String(libraryEntry?.language || '').trim();
        var libraryMediaTypeRaw = getMediaTypeLabel(libraryEntry);
        var progressRaw = getProgressLabel(libraryEntry);
        var coverUrlRaw = String(libraryEntry?.image || libraryEntry?.imageUrl || '').trim();

        var libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
        var libraryRating = escapeHtml(libraryRatingRaw || '-');
        var libraryAuthor = escapeHtml(libraryAuthorRaw);
        var libraryGenre = escapeHtml(libraryGenreRaw);
        var librarySummary = escapeHtml(librarySummaryRaw);
        var libraryLanguage = escapeHtml(libraryLanguageRaw);
        var libraryMediaType = escapeHtml(libraryMediaTypeRaw);
        var libraryProgress = escapeHtml(progressRaw);
        var safeCoverUrl = escapeHtml(coverUrlRaw);

        var libraryChips = [];
        if (libraryStatusRaw) libraryChips.push('<span class="unidex-entry-chip">' + libraryStatus + '</span>');
        if (libraryRatingRaw) libraryChips.push('<span class="unidex-entry-chip">Rating ' + libraryRating + '</span>');
        if (libraryProgress) libraryChips.push('<span class="unidex-entry-chip">' + libraryProgress + '</span>');
        if (libraryMediaType) libraryChips.push('<span class="unidex-entry-chip">' + libraryMediaType + '</span>');
        if (libraryLanguage) libraryChips.push('<span class="unidex-entry-chip">' + libraryLanguage + '</span>');

        var libraryDetailHtml = isLibraryLinked
            ? '<div class="unidex-entry-library-wrap">'
                + (libraryAuthor ? '<p class="unidex-entry-library-author">' + libraryAuthor + '</p>' : '')
                + (libraryGenre ? '<p class="unidex-entry-library-genre">' + libraryGenre + '</p>' : '')
                + (libraryChips.length ? '<div class="unidex-entry-library-chips">' + libraryChips.join('') + '</div>' : '')
                + (librarySummary ? '<p class="unidex-entry-library-summary">' + librarySummary + '</p>' : '')
            + '</div>'
            : '';

        var visualHtml = isLibraryLinked
            ? '<div class="unidex-entry-cover-slot">'
                + (safeCoverUrl
                    ? '<img class="unidex-entry-cover" src="' + safeCoverUrl + '" alt="' + safeTitle + ' cover" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
                    : '<div class="unidex-entry-cover-fallback">&#128218;</div>')
            + '</div>'
            : '<div class="unidex-entry-cover-slot is-bookmark-only"><div class="unidex-entry-bookmark-icon-wrap">'
                + buildBookmarkIconHtml(link, safeTitle)
            + '</div></div>';

        var libraryTagHtml = isLibraryLinked
            ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
            : '';
        var taskTagHtml = isTaskMode
            ? '<span class="unidex-entry-tag ' + (link.done ? 'done' : 'pending') + '">' + (link.done ? 'Done' : 'Pending') + '</span>'
            : '';
        var pinnedTagHtml = link.pinned ? '<span class="unidex-entry-tag pinned">Pinned</span>' : '';
        var doneActionHtml = isTaskMode
            ? '<button type="button" class="unidex-entry-btn" onclick="toggleDone(' + jsIdLiteral + ')">' + (link.done ? 'Undo Done' : 'Mark Done') + '</button>'
            : '';

        return ''
            + '<article class="unidex-entry-item has-visual-slot focused-entry-item ' + (isTaskMode && link.done ? 'is-done' : '') + ' ' + (isLibraryLinked ? 'is-library-linked' : 'is-bookmark-only') + '"'
                + ' data-text="' + hoverText + '"'
                + ' draggable="true"'
                + ' ondragstart="drag(event, ' + jsIdLiteral + ')"'
                + ' oncontextmenu="showLinkContextMenu(event, ' + jsIdLiteral + ')">'
                + '<button type="button" class="unidex-entry-visual-btn"'
                    + ' onclick="return window.DashboardCategories.openFocusedEntryDirect(' + jsIdLiteral + ', event)"'
                    + ' title="Open ' + safeTitle + ' in new tab"'
                    + ' aria-label="Open ' + safeTitle + ' in new tab">'
                    + visualHtml
                + '</button>'
                + '<div class="unidex-entry-main">'
                    + '<h4 class="unidex-entry-title">' + safeTitle + '</h4>'
                    + '<p class="unidex-entry-domain">' + safeDomain + '</p>'
                    + libraryDetailHtml
                    + '<div class="unidex-entry-tags">'
                        + taskTagHtml
                        + libraryTagHtml
                        + pinnedTagHtml
                    + '</div>'
                + '</div>'
                + '<div class="unidex-entry-actions focused-entry-actions">'
                    + '<button type="button" class="unidex-entry-btn" onclick="return window.DashboardCategories.openFocusedEntry(' + jsIdLiteral + ', event)">Open</button>'
                    + '<button type="button" class="unidex-entry-btn" onclick="togglePin(' + jsIdLiteral + ')">' + (link.pinned ? 'Unpin' : 'Pin') + '</button>'
                    + doneActionHtml
                    + '<button type="button" class="unidex-entry-btn" onclick="openEdit(' + jsIdLiteral + ')">Edit</button>'
                    + '<button type="button" class="unidex-entry-btn danger" onclick="deleteLink(' + jsIdLiteral + ')">Delete</button>'
                + '</div>'
            + '</article>';
    };
})(window.DashboardCategories);
