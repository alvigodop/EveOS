/**
 * View Grid Content - Details Component
 * Handles rendering of categories and snippets in a grid result card.
 */
(function () {
    'use strict';

    const VGCDetails = {
        /**
         * Render categories with expand/collapse logic
         * @param {Element} container - The container element
         * @param {object} result - The search result
         */
        renderCategories: function (container, result) {
            const categoriesDiv = document.createElement('div');
            categoriesDiv.className = 'result-categories';

            // Helper to render tags with expand/collapse logic
            const renderTags = (expanded) => {
                categoriesDiv.innerHTML = '';
                const limit = 5;
                const tagsToShow = expanded ? result.categories : result.categories.slice(0, limit);

                tagsToShow.forEach(cat => {
                    // Determine Category URL
                    let catUrl = '#'; // Default
                    const safeCat = encodeURIComponent(cat.replace(/ /g, '_'));

                    if (result.source === 'wikipedia') {
                        catUrl = `https://en.wikipedia.org/wiki/Category:${safeCat}`;
                    } else if (result.domain) {
                        // For Fandom, try to construct the URL
                        // Ensure domain doesn't have protocol
                        const cleanDomain = result.domain.replace(/^https?:\/\//, '');
                        catUrl = `https://${cleanDomain}/wiki/Category:${safeCat}`;
                    }

                    const tag = document.createElement('a');
                    tag.className = 'category-tag';
                    tag.textContent = cat;
                    tag.href = catUrl;
                    tag.target = '_blank';
                    tag.style.textDecoration = 'none'; // Keep look of a tag
                    tag.style.color = 'inherit';

                    // Prevent click propagation to card and open in popup
                    tag.onclick = (e) => {
                        e.stopPropagation();
                        if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                            e.preventDefault();
                            console.log('Opening category via PopupManager:', catUrl);
                            PopupManager.openPopup(catUrl, `Category: ${cat}`);
                        }
                    };

                    categoriesDiv.appendChild(tag);
                });

                if (result.categories.length > limit) {
                    const toggleTag = document.createElement('span');
                    toggleTag.className = 'category-tag toggle-tag';
                    toggleTag.style.cursor = 'pointer';
                    toggleTag.style.fontStyle = 'italic';
                    toggleTag.style.backgroundColor = 'rgba(0,0,0,0.05)';
                    toggleTag.textContent = expanded ? 'Show less' : `+${result.categories.length - limit} more`;

                    toggleTag.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        renderTags(!expanded);
                    };
                    categoriesDiv.appendChild(toggleTag);
                }
            };

            // Initial render (collapsed)
            renderTags(false);
            container.appendChild(categoriesDiv);
        },

        /**
         * Render snippet with "View More" functionality
         * @param {Element} container - The container element
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @param {object} context - The ResultDisplay instance
         */
        renderSnippet: function (container, result, options, context) {
            const snippet = document.createElement('div');
            snippet.className = 'result-snippet';

            // Use description or snippet
            const snippetText = result.description || result.snippet;

            // If it's HTML content, set it directly
            if (snippetText && snippetText.includes('<') && snippetText.includes('>')) {
                snippet.innerHTML = snippetText;
            } else {
                // Otherwise set as text content
                snippet.textContent = snippetText || '';

                // Highlight query terms if needed
                if (options.highlightQuery && options.query) {
                    snippet.innerHTML = context.highlightQueryTerms(snippet.textContent, options.query);
                }
            }

            container.appendChild(snippet);

            // Add "View More" button for overflow handling
            // Only add if text is reasonably long
            if (snippetText && snippetText.length > 80) {
                const viewMoreBtn = document.createElement('span');
                viewMoreBtn.className = 'view-more-btn';
                viewMoreBtn.textContent = 'View More';

                viewMoreBtn.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const isExpanded = snippet.classList.toggle('expanded');
                    viewMoreBtn.textContent = isExpanded ? 'Show Less' : 'View More';

                    // Direct style override to ensure it works
                    if (isExpanded) {
                        snippet.style.display = 'block';
                        snippet.style.webkitLineClamp = 'unset';
                        snippet.style.maxHeight = 'none';
                    } else {
                        snippet.style.display = '';
                        snippet.style.webkitLineClamp = '';
                        snippet.style.maxHeight = '';
                    }
                };

                container.appendChild(viewMoreBtn);

                // Check overflow after rendering
                setTimeout(() => {
                    // Check if scrollHeight is strictly greater than clientHeight
                    // We add a small buffer (2px) to account for sub-pixel rendering differences
                    if (snippet.scrollHeight > snippet.clientHeight + 2) {
                        viewMoreBtn.classList.add('visible');
                        viewMoreBtn.style.display = 'inline-block';
                    }
                }, 100);
            }
        }
    };

    window.VGCDetails = VGCDetails;
})();
