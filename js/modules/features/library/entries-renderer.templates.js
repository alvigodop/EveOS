/**
 * Entries Renderer Templates for Eve OS
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.Modules = window.EveLibrary.Modules || {};

(function () {
    window.EveLibrary.Modules.createEntriesRendererTemplates = function createEntriesRendererTemplates(deps) {
        const helpers = deps?.helpers || {};
        const Ratings = deps?.Ratings;
        const toUniqueList = helpers.toUniqueList || (() => []);
        const toDisplayCsv = helpers.toDisplayCsv || (() => '');
        const sanitizeForId = helpers.sanitizeForId || (value => String(value || ''));
        const buildExpandableDetail = helpers.buildExpandableDetail || (() => '');
        const formatLastEdited = helpers.formatLastEdited || (() => 'Last edited: -');
        const renderTypeFields = helpers.renderTypeFields || (() => '');
        const renderDerivedRatings = helpers.renderDerivedRatings || (() => '');

        function getDatapackIndexApi() {
            return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        }

        function resolveLinkedBookmark(conn) {
            if (!conn?.linkId) return null;
            const datapackIndex = getDatapackIndexApi();
            if (datapackIndex && typeof datapackIndex.resolveBookmarkLink === 'function') {
                const resolved = datapackIndex.resolveBookmarkLink(conn.linkId);
                if (resolved) return resolved;
            }
            const linksList = typeof window.getLiveLinks === 'function'
                ? window.getLiveLinks()
                : (window.eveState?.links || (typeof links !== 'undefined' ? links : []));
            return Array.isArray(linksList)
                ? linksList.find(l => String(l?.id) === String(conn.linkId)) || null
                : null;
        }

        function createEntryHtml(entry, displayNumber, dataType, categoryName) {
            const safeCat = categoryName.replace(/'/g, "\\'");
            const safeId = entry.id;
            const safeEntryIdBase = sanitizeForId(`${categoryName}-${safeId}`);
            const lastEditedText = formatLastEdited(entry.lastEdited || entry.dateAdded);
            const sourceUrl = entry.sourceUrl || '';
            const safeSourceUrl = sourceUrl.replace(/'/g, "\\'");
            const rawDisplayImage = window.EveBookmarkCovers?.getDisplayCoverForLibraryEntry?.(categoryName, entry) || entry.image || entry.imageUrl || '';
            const displayImage = typeof window.EveBookmarkCovers?.isDisplayableCoverUrl === 'function'
                ? (window.EveBookmarkCovers.isDisplayableCoverUrl(rawDisplayImage) ? rawDisplayImage : '')
                : rawDisplayImage;
            const safeDisplayImage = String(displayImage || '').replace(/'/g, "\\'");
            const titleAltNames = toUniqueList(entry.titleAltNames || entry.altTitles);
            const authorAltNames = toUniqueList(entry.authorAltNames);
            const artistValue = toDisplayCsv(entry.artist);
            const genreValue = toDisplayCsv(entry.genre);
            const tags = toUniqueList(entry.tags);
            const sourceStatus = String(entry.sourceStatus || '').trim();
            const titleAltHtml = buildExpandableDetail('Title Alt', titleAltNames.join(', '), `${safeEntryIdBase}-title-alt`, 84);
            const authorAltHtml = buildExpandableDetail('Author Alt', authorAltNames.join(', '), `${safeEntryIdBase}-author-alt`, 84);
            const tagsHtml = buildExpandableDetail('Tags', tags.join(', '), `${safeEntryIdBase}-tags`, 92);
            const notesHtml = buildExpandableDetail('Notes', entry.summary || '', `${safeEntryIdBase}-notes`, 96);
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(entry);
            }
            const derived = entry.derivedRatings || {};
            const titleHtml = sourceUrl
                ? `<button class="lib-entry-title-btn" onclick="window.EveLibrary.UI.openEntryLink('${safeSourceUrl}')" title="Open source link">${displayNumber}. ${entry.title}</button>`
                : `<h4 class="lib-entry-title">${displayNumber}. ${entry.title}</h4>`;

            let identifierTagsHtml = '';
            if (window.EveLibrary?.ConnectionsAPI && window.EveBookmarkIdentifiers?.getBadgeHtmlForLink) {
                const conn = window.EveLibrary.ConnectionsCore?.findConnectionByLibraryEntryId
                    ? window.EveLibrary.ConnectionsCore.findConnectionByLibraryEntryId(safeId)
                    : (window.EveLibrary.ConnectionsAPI.getAll() || []).find(c => String(c.libraryEntryId) === String(safeId));
                const link = resolveLinkedBookmark(conn);
                if (link) {
                    const badges = window.EveBookmarkIdentifiers.getBadgeHtmlForLink(link);
                    if (badges) {
                        identifierTagsHtml = '<div class="lib-entry-identifiers" style="margin-top:4px; margin-bottom:8px;">' + badges + '</div>';
                    }
                }
            }

            return `
            <div class="lib-entry" data-id="${safeId}">
                <div class="lib-entry-actions">
                    <button onclick="window.EveLibrary.UI.editEntry('${safeCat}', '${safeId}')" title="Edit">&#9998;</button>
                    <button onclick="window.EveLibrary.UI.confirmDeleteEntry('${safeCat}', '${safeId}')" title="Delete">&#128465;</button>
                </div>
                <button class="lib-favorite-btn ${entry.favorite ? 'active' : ''}"
                        onclick="window.EveLibrary.UI.toggleFavorite('${safeCat}', '${safeId}')" title="Favorite">
                    ${entry.favorite ? '&#11088;' : '&#9734;'}
                </button>
                <div class="lib-entry-select">
                   <input type="checkbox" class="lib-batch-checkbox" data-category="${safeCat}" data-id="${safeId}">
                </div>
                ${displayImage ? `<img class="lib-entry-image" src="${displayImage}" alt="${entry.title}" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onclick="window.EveLibrary.UI.openLightbox('${safeDisplayImage}')" onerror="if(window.EveBookmarkCovers&&typeof window.EveBookmarkCovers.handleCoverImageError==='function'){window.EveBookmarkCovers.handleCoverImageError(this);return;}this.removeAttribute('src');this.style.display='none';" title="View Fullsize">` : ''}
                ${titleHtml}
                ${identifierTagsHtml}
                <div class="lib-entry-details">
                    <p><strong>Author:</strong> ${entry.author || 'N/A'}</p>
                    <p><strong>Status:</strong> ${entry.status || 'N/A'}</p>
                    ${sourceStatus ? `<p><strong>Source Status:</strong> ${sourceStatus}</p>` : ''}
                    ${renderTypeFields(entry, dataType)}
                    <p><strong>Rating:</strong> ${entry.rating || 'N/A'}</p>
                    ${titleAltHtml}
                    ${authorAltHtml}
                    ${artistValue ? `<p><strong>Artist:</strong> ${artistValue}</p>` : ''}
                    <p><strong>Genre:</strong> ${genreValue || 'N/A'}</p>
                    ${renderDerivedRatings(derived)}
                    ${tagsHtml}
                    ${notesHtml}
                </div>
                <div class="lib-entry-last-edited" title="Last edited">${lastEditedText}</div>
            </div>
        `;
        }

        function renderPagination(categoryName, totalPages, currentPage) {
            const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
            const container = document.getElementById(prefix + 'pagination');
            if (!container) return;

            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            const safeCat = categoryName.replace(/'/g, "\\'");
            let html = '';

            if (currentPage > 1) {
                html += `<button onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${currentPage - 1})">&#9664;</button>`;
            }

            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, startPage + 4);

            for (let i = startPage; i <= endPage; i++) {
                html += `<button class="${i === currentPage ? 'active' : ''}"
                            onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${i})">${i}</button>`;
            }

            if (currentPage < totalPages) {
                html += `<button onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${currentPage + 1})">&#9654;</button>`;
            }

            container.innerHTML = html;
        }

        return {
            createEntryHtml,
            renderPagination
        };
    };
})();
