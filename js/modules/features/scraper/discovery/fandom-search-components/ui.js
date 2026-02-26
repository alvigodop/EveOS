/**
 * Fandom Search Components - UI
 * Handles result display and text highlighting.
 */
(function () {
    'use strict';

    // Ensure namespace exists
    window.FandomSearch = window.FandomSearch || {};
    const FandomSearch = window.FandomSearch;

    /**
     * Display search results in the specified container
     * @param {Array} results - The search results
     * @param {string} query - The search query
     * @param {Element|string} container - Container element or selector
     */
    FandomSearch.displayResults = function (results, query, container) {
        console.log(`FandomSearch: Displaying ${results.length} results for query "${query}"`);

        // Handle container as string (selector) or element
        let resultsContainer = container;
        if (typeof container === 'string') {
            resultsContainer = document.querySelector(container) || document.getElementById(container);
        }

        if (!resultsContainer) {
            console.error('FandomSearch: Results container not found');
            return;
        }

        // Clear previous results
        resultsContainer.innerHTML = '';

        // Check if we have results
        if (!results || !Array.isArray(results) || results.length === 0) {
            resultsContainer.innerHTML = `<div class="no-results">No Fandom community wikis found. Try a different search term.</div>`;
            return;
        }

        // Delegate to SearchUIRenderer
        if (window.SearchUIRenderer && typeof SearchUIRenderer.renderFandomResults === 'function') {
            SearchUIRenderer.renderFandomResults(results, container, query, {
                // Check if a result is already added
                isAdded: function (url, domain) {
                    return window.WikiManager &&
                        window.WikiManager.fandomDomains &&
                        window.WikiManager.fandomDomains.some(d => d.url === url || d.domain === domain);
                },
                // Handle adding a result
                onAdd: function (url, title, btn) {
                    if (window.WikiManager && typeof WikiManager.addFandomDomainFromDiscovery === 'function') {
                        WikiManager.addFandomDomainFromDiscovery(url, title);
                        if (btn) {
                            btn.textContent = 'Added';
                            btn.disabled = true;
                        }
                    } else {
                        console.error('WikiManager.addFandomDomainFromDiscovery not found');
                    }
                }
            });
        } else {
            console.warn('SearchUIRenderer not available, using fallback display');
            if (resultsContainer) {
                resultsContainer.innerHTML = '<div class="error">Display module missing. Please reload.</div>';
            }
        }

        // Dispatch event that results were updated
        const event = new CustomEvent('searchResultsUpdated', {
            detail: {
                query: query,
                resultsCount: results.length
            }
        });
        document.dispatchEvent(event);
    };

    /**
     * Highlights search terms in the text
     * @param {string} text - The text to highlight
     * @param {Object} searchTerms - The search terms object containing original and split terms
     * @returns {string} - The text with search terms highlighted
     */
    FandomSearch.highlightSearchTerms = function (text, searchTerms) {
        if (!text || !searchTerms) return text;

        // First escape HTML to prevent XSS and ensure HTML doesn't display as text
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Escape HTML in the text
        let highlightedText = escapeHtml(text);
        const { original, terms } = searchTerms;

        // First highlight the original full search term (highest priority)
        if (original && original.length > 1) {
            const originalRegex = new RegExp(`(${original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            highlightedText = highlightedText.replace(originalRegex, '<mark>$1</mark>');
        }

        // Sort terms by length (longest first) to prevent nested highlights
        const sortedTerms = [...terms].sort((a, b) => b.length - a.length);

        // Then highlight individual terms if they aren't already highlighted
        sortedTerms.forEach(term => {
            // Skip if term is too short or is the original term
            if (term.length < 2 || term === original) return;

            // Split by existing highlights
            const parts = highlightedText.split('<mark>');
            let newText = parts[0];

            // Process each part
            for (let i = 1; i < parts.length; i++) {
                const subParts = parts[i].split('</mark>');
                // Keep the highlighted part as is
                newText += '<mark>' + subParts[0] + '</mark>';

                // Process remaining text
                if (subParts.length > 1) {
                    // Escape special regex characters
                    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(${escapedTerm})`, 'gi');
                    newText += subParts.slice(1).join('</mark>').replace(regex, '<mark class="secondary">$1</mark>');
                }
            }

            highlightedText = newText;
        });

        return highlightedText;
    };

    console.log('[FandomSearch.UI] Loaded');
})();
