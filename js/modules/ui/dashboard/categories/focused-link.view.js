window.DashboardCategoriesModules = window.DashboardCategoriesModules || {};

(function (modules) {
    if (modules.focusedLinkView) return;

    const helpers = modules.focusedLinkHelpers || {};
    const {
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
    } = helpers;

    function openFocusedEntry(linkId, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const normalizedId = normalizeId(linkId);
        if (!normalizedId) return false;

        if (typeof openBookmarkFromDashboard === 'function') {
            return openBookmarkFromDashboard(event, normalizedId);
        }

        const link = getLinkById(normalizedId);
        if (!link?.url) return false;
        const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    }

    function openFocusedEntryDirect(linkId, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const normalizedId = normalizeId(linkId);
        if (!normalizedId) return false;

        const link = getLinkById(normalizedId);
        if (!link?.url) return false;
        const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    }

    function isPinned(linkId) {
        return !!window.EveQuickPins?.isBookmarkPinned?.(linkId);
    }

    function buildFocusedLinkHtml(link, options) {
        const renderOptions = options || {};
        const allowHoverPreview = !window._evePerfMode;
        const isTaskMode = renderOptions.taskEnabled !== undefined
            ? !!renderOptions.taskEnabled
            : !!renderOptions.taskMode;
        const normalizedId = normalizeId(link?.id);
        const jsIdLiteral = "'" + escapeJsString(normalizedId) + "'";

        const safeTitle = escapeHtml(link?.title || 'Untitled');
        const hoverText = escapeHtml(truncateText(String(link?.title || 'Untitled').toUpperCase(), 34));
        const safeDomain = escapeHtml(getDomain(link?.url));

        const linkedRecord = getLinkedRecord(normalizedId);
        const isLibraryLinked = !!linkedRecord?.entry;
        const libraryEntry = linkedRecord?.entry || null;

        const libraryStatusRaw = String(libraryEntry?.status || '').trim();
        const libraryRatingRaw = String(libraryEntry?.rating || '').trim();
        const libraryAuthorRaw = String(libraryEntry?.author || '').trim();
        const libraryGenreRaw = String(libraryEntry?.genre || '').trim();
        const librarySummaryRaw = truncateText(libraryEntry?.summary, 180);
        const libraryLanguageRaw = String(libraryEntry?.language || '').trim();
        const libraryMediaTypeRaw = getMediaTypeLabel(libraryEntry);
        const progressRaw = getProgressLabel(libraryEntry);
        const coverUrlRaw = String(
            window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
            || link?.coverImage
            || libraryEntry?.image
            || libraryEntry?.imageUrl
            || ''
        ).trim();

        const libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
        const libraryRating = escapeHtml(libraryRatingRaw || '-');
        const libraryAuthor = escapeHtml(libraryAuthorRaw);
        const libraryGenre = escapeHtml(libraryGenreRaw);
        const librarySummary = escapeHtml(librarySummaryRaw);
        const libraryLanguage = escapeHtml(libraryLanguageRaw);
        const libraryMediaType = escapeHtml(libraryMediaTypeRaw);
        const libraryProgress = escapeHtml(progressRaw);
        const canDisplayCover = typeof window.EveBookmarkCovers?.isDisplayableCoverUrl === 'function'
            ? window.EveBookmarkCovers.isDisplayableCoverUrl(coverUrlRaw)
            : (typeof window.EveBookmarkCovers?.isRenderableCoverUrl !== 'function' || window.EveBookmarkCovers.isRenderableCoverUrl(coverUrlRaw));
        const safeCoverUrl = canDisplayCover ? escapeHtml(coverUrlRaw) : '';

        const libraryChips = [];
        if (libraryStatusRaw) libraryChips.push('<span class="unidex-entry-chip">' + libraryStatus + '</span>');
        if (libraryRatingRaw) libraryChips.push('<span class="unidex-entry-chip">Rating ' + libraryRating + '</span>');
        if (libraryProgress) libraryChips.push('<span class="unidex-entry-chip">' + libraryProgress + '</span>');
        if (libraryMediaType) libraryChips.push('<span class="unidex-entry-chip">' + libraryMediaType + '</span>');
        if (libraryLanguage) libraryChips.push('<span class="unidex-entry-chip">' + libraryLanguage + '</span>');

        const libraryDetailHtml = isLibraryLinked
            ? '<div class="unidex-entry-library-wrap">'
                + (libraryAuthor ? '<p class="unidex-entry-library-author">' + libraryAuthor + '</p>' : '')
                + (libraryGenre ? '<p class="unidex-entry-library-genre">' + libraryGenre + '</p>' : '')
                + (libraryChips.length ? '<div class="unidex-entry-library-chips">' + libraryChips.join('') + '</div>' : '')
                + (librarySummary ? '<p class="unidex-entry-library-summary">' + librarySummary + '</p>' : '')
            + '</div>'
            : '';

        const visualHtml = safeCoverUrl
            ? '<div class="unidex-entry-cover-slot">'
                + '<img class="unidex-entry-cover" src="' + safeCoverUrl + '" alt="' + safeTitle + ' cover" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onerror="if(window.EveBookmarkCovers&&typeof window.EveBookmarkCovers.handleCoverImageError===\'function\'){window.EveBookmarkCovers.handleCoverImageError(this);return;}this.removeAttribute(\'src\');">'
                + '<div class="unidex-entry-icon-overlay" style="position: absolute; bottom: 8px; right: 8px; z-index: 2; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.2); pointer-events: none;">'
                    + buildBookmarkIconHtml(link, safeTitle)
                + '</div>'
            + '</div>'
            : (isLibraryLinked
                ? '<div class="unidex-entry-cover-slot">'
                    + '<div class="unidex-entry-cover-fallback">&#128218;</div>'
                    + '<div class="unidex-entry-icon-overlay" style="position: absolute; bottom: 8px; right: 8px; z-index: 2; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.2); pointer-events: none;">'
                        + buildBookmarkIconHtml(link, safeTitle)
                    + '</div>'
                + '</div>'
                : '<div class="unidex-entry-cover-slot is-bookmark-only"><div class="unidex-entry-bookmark-icon-wrap">'
                    + buildBookmarkIconHtml(link, safeTitle)
                + '</div></div>');

        const libraryTagHtml = isLibraryLinked
            ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
            : '';
        const taskTagHtml = isTaskMode
            ? '<span class="unidex-entry-tag ' + (link.done ? 'done' : 'pending') + '">' + (link.done ? 'Done' : 'Pending') + '</span>'
            : '';
        const identifierTagHtml = window.EveBookmarkIdentifiers?.getBadgeHtmlForLink?.(link) || '';
        const bookmarkPinned = isPinned(normalizedId);
        const pinnedTagHtml = bookmarkPinned ? '<span class="unidex-entry-tag pinned">Pinned</span>' : '';
        const doneActionHtml = isTaskMode
            ? '<button type="button" class="unidex-entry-btn" onclick="toggleDone(' + jsIdLiteral + ')">' + (link.done ? 'Undo Done' : 'Mark Done') + '</button>'
            : '';
        const hoverHandlers = allowHoverPreview
            ? ' onmouseenter="showBookmarkCoverHover(event, ' + jsIdLiteral + ')"'
                + ' onmousemove="moveBookmarkCoverHover(event)"'
                + ' onmouseleave="hideBookmarkCoverHover()"'
            : '';

        return ''
            + '<article class="unidex-entry-item has-visual-slot focused-entry-item ' + (isTaskMode && link.done ? 'is-done' : '') + ' ' + (isLibraryLinked ? 'is-library-linked' : 'is-bookmark-only') + '"'
                + ' data-text="' + hoverText + '"'
                + ' draggable="true"'
                + ' ondragstart="drag(event, ' + jsIdLiteral + ')"'
                + ' oncontextmenu="showLinkContextMenu(event, ' + jsIdLiteral + ')"'
                + hoverHandlers + '>'
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
                        + identifierTagHtml
                        + taskTagHtml
                        + libraryTagHtml
                        + pinnedTagHtml
                    + '</div>'
                + '</div>'
                + '<div class="unidex-entry-actions focused-entry-actions">'
                    + '<button type="button" class="unidex-entry-btn" onclick="return window.DashboardCategories.openFocusedEntry(' + jsIdLiteral + ', event)">Open</button>'
                    + '<button type="button" class="unidex-entry-btn" onclick="togglePin(' + jsIdLiteral + ')">' + (bookmarkPinned ? 'Unpin' : 'Pin') + '</button>'
                    + doneActionHtml
                    + '<button type="button" class="unidex-entry-btn" onclick="openEdit(' + jsIdLiteral + ')">Edit</button>'
                    + '<button type="button" class="unidex-entry-btn danger" onclick="deleteLink(' + jsIdLiteral + ')">Delete</button>'
                + '</div>'
            + '</article>';
    }

    modules.focusedLinkView = {
        openFocusedEntry,
        openFocusedEntryDirect,
        buildFocusedLinkHtml
    };
})(window.DashboardCategoriesModules);
