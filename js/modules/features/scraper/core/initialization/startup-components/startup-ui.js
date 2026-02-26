/**
 * Startup UI Module
 * 
 * Handles DOM visibility, loading screens, and forced rendering of wiki lists.
 */

(function () {
    // Extend existing StartupHelper or wait for it
    const extendStartupUI = () => {
        if (!window.StartupHelper) {
            console.error('StartupHelper not found for UI extension');
            return;
        }

        const UI = {
            /**
             * Ensure UI is shown if loading takes too long
             */
            ensureUIIsVisible: function () {
                console.log('StartupHelper ensuring UI is visible');

                const loadingElement = document.getElementById('initialLoading');
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                }

                const mainElement = document.querySelector('main');
                if (mainElement) {
                    mainElement.style.display = 'block';
                }

                // Ensure wiki lists are rendered
                this.ensureWikiListsRendered();

                // Ensure management UI is visible
                this.ensureWikiManagementVisible();
            },

            /**
             * Ensure the Wiki Management sections are visible
             */
            ensureWikiManagementVisible: function () {
                // Get the wiki management section - first try by ID
                let wikiManagementSection = document.getElementById('wikiManagementSection');

                // If not found by ID, try by class or other selectors
                if (!wikiManagementSection) {
                    wikiManagementSection = document.querySelector('.wiki-management') ||
                        document.querySelector('section:nth-child(2)');
                }

                if (!wikiManagementSection) {
                    // If main section missing, still try to show sub-sections if they exist
                    const wikipediaManagement = document.getElementById('wikipediaManagement');
                    if (wikipediaManagement && window.currentSource === 'wikipedia') wikipediaManagement.style.display = 'block';
                    return;
                }

                // Make sure the section is visible
                wikiManagementSection.style.display = 'block';

                // Get current active tab
                const activeTab = document.querySelector('.tab-btn.active');
                const currentSource = activeTab ? activeTab.id.replace('Tab', '').toLowerCase() : 'wikipedia';

                // Ensure the correct management panel is visible
                const wikipediaManagement = document.getElementById('wikipediaManagement');
                const fandomManagement = document.getElementById('fandomManagement');

                if (wikipediaManagement) {
                    wikipediaManagement.style.display = currentSource === 'wikipedia' ? 'block' : 'none';
                }

                if (fandomManagement) {
                    fandomManagement.style.display = currentSource === 'fandom' ? 'block' : 'none';
                }
            },

            /**
             * Ensure wiki lists are properly rendered
             */
            ensureWikiListsRendered: function () {
                // 1. First try using WikiManager
                if (window.WikiManager) {
                    try {
                        setTimeout(() => {
                            if (typeof WikiManager.renderWikiEntryList === 'function') {
                                WikiManager.renderWikiEntryList(true); // Force rendering
                            }
                            if (typeof WikiManager.renderFandomDomainList === 'function') {
                                WikiManager.renderFandomDomainList(true); // Force rendering
                            }
                        }, 50);
                    } catch (e) {
                        console.warn('StartupHelper: Error invoking WikiManager:', e);
                    }
                }
            },

            /**
             * Force render wiki lists (public API for other modules)
             */
            forceRenderWikiLists: function () {
                // Delegating to WikiManager if available
                if (window.WikiManager) {
                    if (typeof WikiManager.renderWikiEntryList === 'function') WikiManager.renderWikiEntryList(true);
                    if (typeof WikiManager.renderFandomDomainList === 'function') WikiManager.renderFandomDomainList(true);
                }
            }
        };

        Object.assign(window.StartupHelper, UI);
    };

    // Initialize extension
    if (window.StartupHelper) {
        extendStartupUI();
    } else {
        // Retry if loaded out of order
        window.addEventListener('DOMContentLoaded', extendStartupUI);
    }
})();
