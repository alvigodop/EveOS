/**
 * Fandom CS UI Events
 * 
 * Handles event listeners and interactions.
 */

(function () {
    'use strict';

    const FandomCSUI_Events = {

        handleSearch: function (elements) {
            if (FandomCSCore && FandomCSCore.state.isLoading) return;

            if (FandomCSCore) {
                // Update engine from UI
                if (elements.searchEngineSelector) {
                    FandomCSCore.setSearchEngine(elements.searchEngineSelector.value);
                }

                // Update query
                const query = elements.searchInput.value.trim();
                if (!query) return;

                FandomCSCore.resetSearchState();
                FandomCSCore.state.lastSearchTerm = query;

                if (window.FandomCSAPI) {
                    FandomCSAPI.fetchResults(1);
                }
            }
        },

        handleReset: function (elements, paginationModule) {
            if (FandomCSCore && FandomCSCore.state.isLoading) return;

            elements.searchInput.value = '';
            elements.resultsDiv.innerHTML = '';

            if (FandomCSCore) {
                FandomCSCore.resetAllState();
            }

            if (paginationModule) {
                paginationModule.resetPagination(elements);
            }
            elements.searchInput.focus();
        },

        handleResultClick: function (event) {
            const link = event.target.closest('.fandom-result-title') || event.target.closest('.fandom-result-url');

            if (link) {
                event.preventDefault();
                event.stopPropagation();
                const url = link.href;
                const openMode = window.FandomCSCore ? FandomCSCore.state.openMode : 'popup';

                console.log(`Fandom Search: Opening link ${url} in ${openMode} mode.`);

                if (openMode === 'newtab') {
                    window.open(url, '_blank');
                } else {
                    if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                        const title = link.textContent || 'Wiki Article';
                        PopupManager.openPopup(url, title);
                    } else {
                        console.warn('PopupManager not found, falling back to window.open');
                        const popupFeatures = 'width=900,height=700,scrollbars=yes,resizable=yes';
                        const popup = window.open(url, 'fandomPopup', popupFeatures);
                        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                            alert('Popup blocked. Please allow popups.');
                        }
                    }
                }
            }
        },

        addEventListeners: function (elements, context) {
            const { searchBtn, searchInput, resetBtn, prevBtn, nextBtn, openModeRadios, resultsDiv } = elements;

            // Bind context to this module
            searchBtn.addEventListener('click', () => {
                this.handleSearch(elements);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch(elements);
                }
            });

            resetBtn.addEventListener('click', () => {
                this.handleReset(elements, context.pagination);
            });

            prevBtn.addEventListener('click', () => {
                if (!prevBtn.disabled && FandomCSCore && FandomCSCore.state.currentPage > 1) {
                    FandomCSCore.state.currentPage--;
                    FandomCSCore.executeSearch(FandomCSCore.state.currentPage);
                }
            });

            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(FandomCSCore.state.totalResults / FandomCSCore.config.RESULTS_PER_PAGE);
                if (!nextBtn.disabled && FandomCSCore && FandomCSCore.state.currentPage < totalPages) {
                    FandomCSCore.state.currentPage++;
                    FandomCSCore.executeSearch(FandomCSCore.state.currentPage);
                }
            });

            openModeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (context.updateOpenMode) context.updateOpenMode();
                });
            });

            resultsDiv.addEventListener('click', this.handleResultClick.bind(this));

            // Search Engine Selector (Handle CSE Toggle)
            if (elements.searchEngineSelector) {
                elements.searchEngineSelector.addEventListener('change', () => {
                    const mode = elements.searchEngineSelector.value;
                    if (window.FandomCSCore) {
                        FandomCSCore.setSearchEngine(mode);
                    }

                    if (window.setCSEMode) {
                        window.setCSEMode(mode === 'google-cse' ? 'google-cse' : 'default', 'fandom');
                    }
                });
            }
        }
    };

    window.FandomCSUI_Events = FandomCSUI_Events;
})();
