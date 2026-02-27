/**
 * Entries Renderer Module for Eve OS
 * Renders library entries inside category cards
 * Adapted from MegaBase entries-renderer.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;
    const Ratings = window.EveLibrary.Ratings;

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function toUniqueList(value) {
        if (Array.isArray(value)) {
            const seen = new Set();
            return value
                .map(item => String(item || '').trim())
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }
        return parseUniqueCsvList(value);
    }

    function toDisplayCsv(value) {
        return toUniqueList(value).join(', ');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeForId(value) {
        return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
    }

    function buildExpandableDetail(label, value, expandId, maxChars) {
        const compact = String(value || '').replace(/\s+/g, ' ').trim();
        if (!compact) return '';

        const escapedLabel = escapeHtml(label);
        if (compact.length <= maxChars) {
            return `<p><strong>${escapedLabel}:</strong> ${escapeHtml(compact)}</p>`;
        }

        const preview = escapeHtml(compact.slice(0, maxChars).trimEnd()) + '&hellip;';
        const full = escapeHtml(compact);
        return `
            <p class="lib-entry-expandable">
                <strong>${escapedLabel}:</strong>
                <span id="${expandId}-preview">${preview}</span>
                <span id="${expandId}-full" style="display:none;">${full}</span>
                <button type="button" class="lib-expand-toggle" onclick="window.EveLibrary.EntriesRenderer.toggleExpandableDetail('${expandId}', this)" aria-expanded="false" title="Show more">more</button>
            </p>
        `;
    }

    function toggleExpandableDetail(expandId, buttonEl) {
        const preview = document.getElementById(`${expandId}-preview`);
        const full = document.getElementById(`${expandId}-full`);
        if (!preview || !full) return;

        const isExpanded = full.style.display !== 'none';
        if (isExpanded) {
            full.style.display = 'none';
            preview.style.display = '';
            if (buttonEl) {
                buttonEl.textContent = 'more';
                buttonEl.setAttribute('aria-expanded', 'false');
                buttonEl.title = 'Show more';
            }
            return;
        }

        full.style.display = '';
        preview.style.display = 'none';
        if (buttonEl) {
            buttonEl.textContent = 'less';
            buttonEl.setAttribute('aria-expanded', 'true');
            buttonEl.title = 'Show less';
        }
    }

    function renderEntries(categoryName, container) {
        if (!container) return;

        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        // Get filtered and sorted entries
        let entries = Search.getFilteredEntries(categoryName);
        const sortBy = document.getElementById(prefix + 'sort-by')?.value || '';
        const sortOrder = document.getElementById(prefix + 'sort-order')?.value || 'asc';

        if (sortBy) {
            entries = Search.sortEntries([...entries], sortBy, sortOrder, categoryName);
        }

        // Pagination
        const entriesPerPage = State.getEntriesPerPage();
        const totalEntries = entries.length;
        const totalPages = Math.ceil(totalEntries / entriesPerPage);
        let currentPage = State.getPage(categoryName);

        if (currentPage > totalPages && totalPages > 0) {
            State.setPage(categoryName, totalPages);
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * entriesPerPage;
        const end = start + entriesPerPage;
        const pageEntries = entries.slice(start, end);

        // Render entries
        const entriesHtml = pageEntries.map((entry, index) =>
            createEntryHtml(entry, start + index + 1, dataType, categoryName)
        ).join('');

        container.innerHTML = entriesHtml || '<p class="lib-no-entries">No entries found.</p>';

        // Render pagination
        renderPagination(categoryName, totalPages, currentPage);
    }

    function createEntryHtml(entry, displayNumber, dataType, categoryName) {
        const safeCat = categoryName.replace(/'/g, "\\'");
        const safeId = entry.id;
        const safeEntryIdBase = sanitizeForId(`${categoryName}-${safeId}`);
        const lastEditedText = formatLastEdited(entry.lastEdited || entry.dateAdded);
        const sourceUrl = entry.sourceUrl || '';
        const safeSourceUrl = sourceUrl.replace(/'/g, "\\'");
        const authorAltNames = toUniqueList(entry.authorAltNames);
        const artistValue = toDisplayCsv(entry.artist);
        const genreValue = toDisplayCsv(entry.genre);
        const tags = toUniqueList(entry.tags);
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

        return `
            <div class="lib-entry" data-id="${safeId}">
                <div class="lib-entry-actions">
                    <button onclick="window.EveLibrary.UI.editEntry('${safeCat}', '${safeId}')" title="Edit">✏️</button>
                    <button onclick="window.EveLibrary.UI.confirmDeleteEntry('${safeCat}', '${safeId}')" title="Delete">🗑️</button>
                </div>
                <button class="lib-favorite-btn ${entry.favorite ? 'active' : ''}" 
                        onclick="window.EveLibrary.UI.toggleFavorite('${safeCat}', '${safeId}')" title="Favorite">
                    ${entry.favorite ? '⭐' : '☆'}
                </button>
                <div class="lib-entry-select">
                   <input type="checkbox" class="lib-batch-checkbox" data-category="${safeCat}" data-id="${safeId}">
                </div>
                ${entry.image ? `<img class="lib-entry-image" src="${entry.image}" alt="${entry.title}" onclick="window.EveLibrary.UI.openLightbox('${entry.image}')" title="View Fullsize">` : ''}
                ${titleHtml}
                <div class="lib-entry-details">
                    <p><strong>Author:</strong> ${entry.author || 'N/A'}</p>
                    <p><strong>Status:</strong> ${entry.status || 'N/A'}</p>
                    ${renderTypeFields(entry, dataType)}
                    <p><strong>Rating:</strong> ${entry.rating || 'N/A'}</p>
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

    function formatLastEdited(isoValue) {
        if (!isoValue) return 'Last edited: -';
        const parsed = new Date(isoValue);
        if (Number.isNaN(parsed.getTime())) return 'Last edited: -';
        const stamp = parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
        return `Last edited: ${stamp}`;
    }

    function renderTypeFields(entry, dataType) {
        if (dataType === 'films') {
            return `
                <p><strong>Season:</strong> ${entry.season || 0}</p>
                <p><strong>Episode:</strong> ${entry.episode || 0}</p>
            `;
        }
        return `<p><strong>Chapter:</strong> ${entry.chapter || 0}</p>`;
    }

    function renderDerivedRatings(derived) {
        if (!derived || typeof derived !== 'object') return '';
        const average = formatScore(derived.apiAverage10);
        const weighted = formatScore(derived.apiWeighted10);
        const hybrid = formatScore(derived.hybrid10);
        const confidence = formatScore(derived.confidence);
        if (!average && !weighted && !hybrid) return '';
        const items = [];
        if (average) items.push(`API Avg: ${average}`);
        if (weighted) items.push(`API Weighted: ${weighted}`);
        if (hybrid) items.push(`Unified: ${hybrid}`);
        if (confidence) items.push(`Confidence: ${confidence}`);
        return `<p><strong>Derived:</strong> ${items.join(' | ')}</p>`;
    }

    function formatScore(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2).replace(/\.?0+$/, '');
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

        // Previous button
        if (currentPage > 1) {
            html += `<button onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${currentPage - 1})">◀</button>`;
        }

        // Page numbers (show max 5)
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="${i === currentPage ? 'active' : ''}" 
                            onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${i})">${i}</button>`;
        }

        // Next button
        if (currentPage < totalPages) {
            html += `<button onclick="window.EveLibrary.UI.goToPage('${safeCat}', ${currentPage + 1})">▶</button>`;
        }

        container.innerHTML = html;
    }

    window.EveLibrary.EntriesRenderer = {
        renderEntries,
        toggleExpandableDetail
    };
})();
