/**
 * Entries Renderer Module for Eve OS
 * Renders library entries inside category cards
 * Adapted from MegaBase entries-renderer.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;

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
            entries = Search.sortEntries([...entries], sortBy, sortOrder);
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
        const lastEditedText = formatLastEdited(entry.lastEdited || entry.dateAdded);
        const sourceUrl = entry.sourceUrl || '';
        const safeSourceUrl = sourceUrl.replace(/'/g, "\\'");
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
                    <p><strong>Genre:</strong> ${entry.genre || 'N/A'}</p>
                    <p><strong>Status:</strong> ${entry.status || 'N/A'}</p>
                    ${renderTypeFields(entry, dataType)}
                    <p><strong>Rating:</strong> ${entry.rating || 'N/A'}</p>
                    ${entry.tags?.length ? `<p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>` : ''}
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
        renderEntries
    };
})();
