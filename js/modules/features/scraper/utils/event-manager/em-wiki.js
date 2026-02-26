/**
 * Event Manager - Wiki Management Sub-module
 * Handles wiki content management events
 */

window.EventManagerWiki = window.EventManagerWiki || {};

(function (module) {

    /**
     * Set up wiki management event handlers
     */
    module.setupWikiManagement = function () {
        // Add Wikipedia entry button
        const addWikiBtn = document.getElementById('addWikiBtn');
        if (addWikiBtn) {
            addWikiBtn.addEventListener('click', () => {
                if (window.WikiManager && typeof WikiManager.addWikiEntry === 'function') {
                    const title = document.getElementById('wikiEntryInput').value.trim();
                    const name = document.getElementById('wikiNameInput').value.trim();

                    if (title) {
                        WikiManager.addWikiEntry(title, name);

                        // Clear inputs
                        document.getElementById('wikiEntryInput').value = '';
                        document.getElementById('wikiNameInput').value = '';
                    } else {
                        alert('Please enter a Wikipedia entry title');
                    }
                } else if (typeof window.directAddWikiEntry === 'function') {
                    window.directAddWikiEntry();
                } else {
                    alert('Add entry function not available. Please check console for errors.');
                    console.error('addWikiEntry function not available');
                }
            });
        }

        // Add Fandom domain button
        const addFandomBtn = document.getElementById('addFandomBtn');
        if (addFandomBtn) {
            addFandomBtn.addEventListener('click', () => {
                if (window.WikiManager && typeof WikiManager.addFandomDomain === 'function') {
                    const domain = document.getElementById('fandomDomainInput').value.trim();
                    const name = document.getElementById('fandomNameInput').value.trim();

                    if (domain) {
                        WikiManager.addFandomDomain(domain, name);

                        // Clear inputs
                        document.getElementById('fandomDomainInput').value = '';
                        document.getElementById('fandomNameInput').value = '';
                    } else {
                        alert('Please enter a Fandom domain');
                    }
                } else if (typeof window.directAddFandomDomain === 'function') {
                    window.directAddFandomDomain();
                } else {
                    alert('Add domain function not available. Please check console for errors.');
                    console.error('addFandomDomain function not available');
                }
            });
        }
    };

    /**
     * Ensure wiki lists are properly rendered
     */
    module.ensureWikiListsRendered = function () {
        // Ensuring wiki lists

        if (window.WikiManager) {
            try {
                if (typeof WikiManager.renderWikiEntryList === 'function') {
                    WikiManager.renderWikiEntryList();
                }
                if (typeof WikiManager.renderFandomDomainList === 'function') {
                    WikiManager.renderFandomDomainList();
                }
                // Wiki lists rendered
            } catch (e) {
                console.warn('Error rendering wiki lists from EventManager:', e);
            }
        } else {
            console.warn('WikiManager not available for EventManager to render lists');
        }
    };

})(window.EventManagerWiki);
