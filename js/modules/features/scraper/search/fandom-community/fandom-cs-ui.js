/**
 * Fandom Community Search UI Module
 * 
 * Facade that orchestrates UI components for Fandom Community Search.
 * 
 * @version 1.1.0
 */

(function () {
    'use strict';

    if (!window.FandomCSUI) {
        const FandomCSUI = {
            version: '1.1.0',
            _initialized: false,

            // Sub-modules
            elementsModule: null,
            rendererModule: null,
            paginationModule: null,
            eventsModule: null,

            // DOM Elements (Cached from elements module)
            elements: {},

            init: function () {
                console.log('Initializing FandomCSUI (Facade)');

                // Initialize modules
                this.elementsModule = window.FandomCSUI_Elements;
                this.rendererModule = window.FandomCSUI_Renderer;
                this.paginationModule = window.FandomCSUI_Pagination;
                this.eventsModule = window.FandomCSUI_Events;

                if (!this.elementsModule || !this.rendererModule || !this.paginationModule || !this.eventsModule) {
                    console.error('FandomCSUI: Critical sub-modules missing.');
                    return false;
                }

                this.elements = this.elementsModule.getElements();

                if (this.elementsModule.validateElements()) {
                    this._setupDelegation();
                    this._addEventListeners();
                    this._updateOpenMode();
                    this.resetPagination();
                    this._initialized = true;
                    return true;
                }
                return false;
            },

            // Delegate methods mainly for compatibility or ease of access
            _setupDelegation: function () {
                // Expose renderer methods if needed by other modules directly calling FandomCSUI
                this.updateLoadingState = (loading) => this.rendererModule.updateLoadingState(this.elements, loading);
                this.showError = (message) => {
                    this.rendererModule.showError(this.elements, message);
                    this.resetPagination();
                };
                this.showManualSearchMessage = (query) => this.rendererModule.showManualSearchMessage(this.elements, query);
                this.showInfoMessage = (html) => this.rendererModule.showInfoMessage(this.elements, html);
                this.displayResults = (items, page) => {
                    this.rendererModule.displayResults(this.elements, items, page);
                    // Post-render pagination update
                    if (window.FandomCSCore) {
                        const totalPages = Math.ceil(FandomCSCore.state.totalResults / FandomCSCore.config.RESULTS_PER_PAGE);
                        this.paginationModule.updatePagination(this.elements, page, totalPages);
                    }
                };
            },

            _updateOpenMode: function () {
                if (!window.FandomCSCore) return;

                const checkedRadio = document.querySelector('input[name="fandomOpenMode"]:checked');
                if (checkedRadio) {
                    FandomCSCore.setOpenMode(checkedRadio.value);
                }
            },

            resetPagination: function (currentPageToKeep = 1) {
                this.paginationModule.resetPagination(this.elements, currentPageToKeep);
            },

            // Kept for direct calls if any exist, but primary logic is in events module
            updatePagination: function (page, totalPages) {
                this.paginationModule.updatePagination(this.elements, page, totalPages);
            },

            _addEventListeners: function () {
                // Pass 'this' context for callbacks that need facade methods like updateOpenMode or access to pagination
                const context = {
                    pagination: this.paginationModule,
                    updateOpenMode: this._updateOpenMode.bind(this)
                };
                this.eventsModule.addEventListeners(this.elements, context);
            }
        };

        window.FandomCSUI = FandomCSUI;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('FandomCSUI', FandomCSUI);
        }
    }
})();
