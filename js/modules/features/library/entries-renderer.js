/**
 * Entries Renderer Module for Eve OS
 * Renders library entries inside category cards
 * Adapted from MegaBase entries-renderer.js
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.Modules = window.EveLibrary.Modules || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;
    const Ratings = window.EveLibrary.Ratings;
    const Modules = window.EveLibrary.Modules || {};

    const helpers = typeof Modules.createEntriesRendererHelpers === 'function'
        ? Modules.createEntriesRendererHelpers()
        : {};
    const templates = typeof Modules.createEntriesRendererTemplates === 'function'
        ? Modules.createEntriesRendererTemplates({ helpers, Ratings })
        : {};

    function renderEntries(categoryName, container) {
        if (!container) return;

        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        let entries = Search.getFilteredEntries(categoryName);
        const sortBy = document.getElementById(prefix + 'sort-by')?.value || '';
        const sortOrder = document.getElementById(prefix + 'sort-order')?.value || 'asc';

        if (sortBy) {
            entries = Search.sortEntries([...entries], sortBy, sortOrder, categoryName);
        }

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

        const entriesHtml = pageEntries.map(function (entry, index) {
            return templates.createEntryHtml(entry, start + index + 1, dataType, categoryName);
        }).join('');

        container.innerHTML = entriesHtml || '<p class="lib-no-entries">No entries found.</p>';
        templates.renderPagination(categoryName, totalPages, currentPage);
    }

    window.EveLibrary.EntriesRenderer = {
        renderEntries,
        toggleExpandableDetail: helpers.toggleExpandableDetail
    };
})();
