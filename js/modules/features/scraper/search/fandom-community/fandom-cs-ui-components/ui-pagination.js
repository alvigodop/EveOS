/**
 * Fandom CS UI Pagination
 * 
 * Handles pagination logic for Fandom Community Search.
 */

(function () {
    'use strict';

    const FandomCSUI_Pagination = {

        resetPagination: function (elements, currentPageToKeep = 1) {
            const { pageInfo, prevBtn, nextBtn } = elements;
            if (!pageInfo || !prevBtn || !nextBtn) return;

            if (window.FandomCSCore) {
                FandomCSCore.state.currentPage = currentPageToKeep;
                const totalPages = Math.ceil(FandomCSCore.state.totalResults / FandomCSCore.config.RESULTS_PER_PAGE);
                this.updatePagination(elements, FandomCSCore.state.currentPage, totalPages);

                // Hide if no results were ever found
                if (FandomCSCore.state.totalResults === 0 && FandomCSCore.state.currentPage === 1) {
                    prevBtn.style.display = 'none';
                    nextBtn.style.display = 'none';
                    pageInfo.style.display = 'none';
                }
            }
        },

        updatePagination: function (elements, page, totalPages) {
            const { pageInfo, prevBtn, nextBtn } = elements;
            if (!pageInfo || !prevBtn || !nextBtn) return;

            // Get total results from core if available for check
            const totalResults = window.FandomCSCore ? FandomCSCore.state.totalResults : 0;

            if (totalResults === 0 && page === 1) {
                pageInfo.textContent = '';
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                pageInfo.style.display = 'none';
            } else {
                totalPages = Math.max(1, totalPages);
                pageInfo.textContent = `Page ${page} of ${totalPages}`;
                prevBtn.disabled = (page <= 1);
                nextBtn.disabled = (page >= totalPages);

                prevBtn.style.display = 'inline-block';
                nextBtn.style.display = 'inline-block';
                pageInfo.style.display = 'inline-block';
            }
        }
    };

    window.FandomCSUI_Pagination = FandomCSUI_Pagination;
})();
