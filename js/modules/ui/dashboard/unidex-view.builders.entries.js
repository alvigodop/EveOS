// Unidex View Entry Builders Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    function identity(value) {
        return value;
    }

    window.UnidexViewModules.createEntryBuilders = function createEntryBuilders(deps) {
        const encodeParam = deps?.encodeParam || identity;
        const escapeHtml = deps?.escapeHtml || identity;
        const getDomain = deps?.getDomain || (() => '');
        const truncateText = deps?.truncateText || (value => String(value || ''));
        const getLinkedLibraryEntry = deps?.getLinkedLibraryEntry || (() => null);
        const getEntryConfidence = deps?.getEntryConfidence || (() => null);
        const getMediaTypeLabel = deps?.getMediaTypeLabel || (() => '');
        const getProgressLabel = deps?.getProgressLabel || (() => '');
        const buildBookmarkIconHtml = deps?.buildBookmarkIconHtml || (() => '<span class="unidex-entry-bookmark-icon-fallback">&#128279;</span>');

        function buildEntriesHtml(entryLinks, taskMode, layoutMode, options) {
            const entryOptions = options || {};
            if (entryLinks.length === 0) {
                return `
                <div class="unidex-empty-state">
                    <h3>No Entries Found</h3>
                    <p>This card has no bookmarks for the current search.</p>
                </div>
            `;
            }

            const isGridLayout = String(layoutMode || '') === 'grid';
            const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
            const rowCoverWidth = isCompactViewport ? 72 : 84;
            const rowCoverHeight = isCompactViewport ? 132 : 156;
            const rowImageHeight = Math.round(rowCoverHeight * 1.32);
            const rowImageOffset = Math.round((rowImageHeight - rowCoverHeight) / 2);

            return entryLinks.map(function (link) {
                const encodedId = encodeParam(link.id);
                const safeTitle = escapeHtml(link.title || 'Untitled');
                const hoverText = escapeHtml(truncateText(String(link.title || 'Untitled').toUpperCase(), 34));
                const safeDomain = escapeHtml(getDomain(link.url));
                const effectiveTaskMode = typeof entryOptions.resolveTaskMode === 'function'
                    ? !!entryOptions.resolveTaskMode(link, taskMode)
                    : !!taskMode;
                const rawCategoryLabel = typeof entryOptions.getCategoryLabel === 'function'
                    ? entryOptions.getCategoryLabel(link)
                    : (link.category || 'Unsorted');
                const showCategoryTag = !!entryOptions.includeCategoryTag;
                const safeCategoryLabel = showCategoryTag
                    ? escapeHtml(String(rawCategoryLabel || 'Unsorted'))
                    : '';
                const libraryEntry = getLinkedLibraryEntry(link.id);
                const isLibraryLinked = !!libraryEntry;
                const confidenceValue = isLibraryLinked ? getEntryConfidence(libraryEntry) : null;
                const libraryStatusRaw = String(libraryEntry?.status || '').trim();
                const libraryRatingRaw = String(libraryEntry?.rating || '').trim();
                const libraryAuthorRaw = String(libraryEntry?.author || '').trim();
                const libraryGenreRaw = String(libraryEntry?.genre || '').trim();
                const librarySummaryRaw = truncateText(libraryEntry?.summary, 220);
                const libraryLanguageRaw = String(libraryEntry?.language || '').trim();
                const libraryMediaTypeRaw = getMediaTypeLabel(libraryEntry);
                const progressRaw = getProgressLabel(libraryEntry);
                const coverUrlRaw = String(libraryEntry?.image || libraryEntry?.imageUrl || '').trim();
                const confidenceLabelRaw = Number.isFinite(confidenceValue) ? confidenceValue.toFixed(2) : '';
                const libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
                const libraryRating = escapeHtml(libraryRatingRaw || '-');
                const libraryAuthor = escapeHtml(libraryAuthorRaw);
                const libraryGenre = escapeHtml(libraryGenreRaw);
                const librarySummary = escapeHtml(librarySummaryRaw);
                const libraryLanguage = escapeHtml(libraryLanguageRaw);
                const libraryMediaType = escapeHtml(libraryMediaTypeRaw);
                const libraryProgress = escapeHtml(progressRaw);
                const confidenceLabel = escapeHtml(confidenceLabelRaw);
                const safeCoverUrl = escapeHtml(coverUrlRaw);
                const libraryChips = [];
                if (libraryStatusRaw) libraryChips.push(`<span class="unidex-entry-chip">${libraryStatus}</span>`);
                if (libraryRatingRaw) libraryChips.push(`<span class="unidex-entry-chip">Rating ${libraryRating}</span>`);
                if (libraryProgress) libraryChips.push(`<span class="unidex-entry-chip">${libraryProgress}</span>`);
                if (libraryMediaType) libraryChips.push(`<span class="unidex-entry-chip">${libraryMediaType}</span>`);
                if (libraryLanguage) libraryChips.push(`<span class="unidex-entry-chip">${libraryLanguage}</span>`);
                if (confidenceLabelRaw) libraryChips.push(`<span class="unidex-entry-chip">Confidence ${confidenceLabel}</span>`);
                const libraryDetailHtml = isLibraryLinked
                    ? `
                    <div class="unidex-entry-library-wrap">
                        ${libraryAuthor ? `<p class="unidex-entry-library-author">${libraryAuthor}</p>` : ''}
                        ${libraryGenre ? `<p class="unidex-entry-library-genre">${libraryGenre}</p>` : ''}
                        ${libraryChips.length ? `<div class="unidex-entry-library-chips">${libraryChips.join('')}</div>` : ''}
                        ${librarySummary ? `<p class="unidex-entry-library-summary">${librarySummary}</p>` : ''}
                    </div>
                `
                    : '';
                const visualButtonStyle = isGridLayout
                    ? ' style="width:100% !important;min-width:0 !important;max-width:none !important;height:auto !important;min-height:0 !important;border:0 !important;background:transparent !important;overflow:visible !important;display:block !important;padding:0 !important;line-height:0 !important;"'
                    : ` style="width:${rowCoverWidth}px !important;height:${rowCoverHeight}px !important;min-height:${rowCoverHeight}px !important;border:1px solid rgba(255,255,255,0.18) !important;background:rgba(0,0,0,0.22) !important;overflow:hidden !important;display:block !important;padding:0 !important;line-height:0 !important;"`;
                const coverSlotStyle = isGridLayout
                    ? ' style="width:100% !important;height:auto !important;min-height:0 !important;display:block !important;aspect-ratio:auto !important;border:0 !important;background:transparent !important;overflow:visible !important;"'
                    : ` style="width:100% !important;height:100% !important;min-height:100% !important;display:block !important;border:0 !important;background:transparent !important;overflow:hidden !important;"`;
                const coverImageStyle = isGridLayout
                    ? ' style="display:block !important;width:100% !important;max-width:100% !important;height:auto !important;min-height:0 !important;max-height:none !important;margin:0 !important;object-fit:contain !important;object-position:center top !important;"'
                    : ` style="width:100% !important;max-width:100% !important;height:${rowImageHeight}px !important;min-height:0 !important;max-height:none !important;margin-left:0 !important;margin-top:-${rowImageOffset}px !important;object-fit:cover !important;object-position:center top !important;"`;
                const visualHtml = isLibraryLinked
                    ? `
                    <div class="unidex-entry-cover-slot"${coverSlotStyle}>
                        ${safeCoverUrl
                            ? `<img class="unidex-entry-cover" src="${safeCoverUrl}" alt="${safeTitle} cover" loading="lazy" decoding="async" referrerpolicy="no-referrer"${coverImageStyle}>`
                            : '<div class="unidex-entry-cover-fallback">&#128218;</div>'}
                    </div>
                `
                    : `
                    <div class="unidex-entry-cover-slot is-bookmark-only">
                        <div class="unidex-entry-bookmark-icon-wrap">
                            ${buildBookmarkIconHtml(link, safeTitle)}
                        </div>
                    </div>
                `;
                const categoryTagHtml = showCategoryTag
                    ? `<span class="unidex-entry-tag category">${safeCategoryLabel}</span>`
                    : '';
                const taskTagHtml = effectiveTaskMode
                    ? `<span class="unidex-entry-tag ${link.done ? 'done' : 'pending'}">${link.done ? 'Done' : 'Pending'}</span>`
                    : '';
                const libraryTagHtml = isLibraryLinked
                    ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
                    : '';
                const confidenceTagHtml = confidenceLabelRaw
                    ? `<span class="unidex-entry-tag confidence">Conf ${confidenceLabel}</span>`
                    : '';
                const extraTagsHtml = typeof entryOptions.getExtraTagsHtml === 'function'
                    ? String(entryOptions.getExtraTagsHtml(link) || '')
                    : '';

                return `
                <article class="unidex-entry-item has-visual-slot ${taskMode && link.done ? 'is-done' : ''} ${isLibraryLinked ? 'is-library-linked' : 'is-bookmark-only'}"
                    data-text="${hoverText}">
                    <button type="button"
                        class="unidex-entry-visual-btn"${visualButtonStyle}
                        onclick="return window.UnidexView.openEntryDirect('${encodedId}', event)"
                        title="Open ${safeTitle} in new tab"
                        aria-label="Open ${safeTitle} in new tab">
                        ${visualHtml}
                    </button>
                    <div class="unidex-entry-main">
                        <h4 class="unidex-entry-title">${safeTitle}</h4>
                        <p class="unidex-entry-domain">${safeDomain}</p>
                        ${libraryDetailHtml}
                        <div class="unidex-entry-tags">
                            ${categoryTagHtml}
                            ${extraTagsHtml}
                            ${taskTagHtml}
                            ${libraryTagHtml}
                            ${confidenceTagHtml}
                            ${link.pinned ? '<span class="unidex-entry-tag pinned">Pinned</span>' : ''}
                        </div>
                    </div>
                    <div class="unidex-entry-actions">
                        <button type="button" class="unidex-entry-btn" onclick="return window.UnidexView.openEntry('${encodedId}', event)">Open</button>
                    </div>
                </article>
            `;
            }).join('');
        }

        return {
            buildEntriesHtml
        };
    };
})();
