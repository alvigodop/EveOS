/**
 * View List Content Component
 * 
 * Handles rendering of the main content column (Title, Snippet, Badges, Categories)
 */
(function () {
    'use strict';

    const VLContent = {
        /**
         * Create the content column
         * @param {object} result - The search result object
         * @param {object} options - Display options
         * @param {object} context - Context containing helper methods
         * @returns {HTMLElement} The populated result-content element
         */
        create: function (result, options, context) {
            const content = document.createElement('div');
            content.className = 'result-content';

            this._addBadges(content, result);
            this._addTitle(content, result, options, context);
            this._addDomainInfo(content, result);
            this._addSnippet(content, result, options, context);
            this._addCategories(content, result);

            return content;
        },

        _addBadges: function (container, result) {
            // Add content type badge
            if (result.contentType) {
                const badge = document.createElement('span');
                badge.className = `content-type-badge ${result.contentType.toLowerCase()}`;
                badge.textContent = result.contentType;
                container.appendChild(badge);
            }

            // Add cache/live badge
            const statusBadge = document.createElement('span');
            if (result.fromCache) {
                statusBadge.className = 'status-badge cache-source';
                statusBadge.textContent = '⚡ Cached';
                statusBadge.title = 'This search result was retrieved from cache';
            } else {
                statusBadge.className = 'status-badge live-source';
                statusBadge.textContent = '🔴 Live';
                if (result.entryDataFromCache) {
                    statusBadge.title = 'Fresh search - article data was loaded from cache';
                } else {
                    statusBadge.title = 'Fresh search - data fetched live';
                }
            }
            container.appendChild(statusBadge);
        },

        _addTitle: function (container, result, options, context) {
            const title = document.createElement('h3');
            title.className = 'result-title';

            // For Fandom wiki results, use formatted name if special domain
            if (result.domain && (result.domain.includes('fandom.com') || result.domain.includes('wikia.com'))) {
                if (result.name) {
                    title.textContent = result.name;
                } else {
                    const domainParts = result.domain.split('.');
                    const domainName = domainParts[0];
                    const formattedName = domainName
                        .split('-')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                    title.textContent = formattedName + ' Wiki';
                }
            } else {
                title.textContent = result.title || result.name || 'Untitled';
            }

            // Highlight query terms
            if (options.highlightQuery && options.query) {
                title.innerHTML = context.highlightQueryTerms(title.textContent, options.query);
            }

            container.appendChild(title);

            // Add text match indicator
            if (result.isTextMatch) {
                const matchBadge = document.createElement('div');
                matchBadge.className = 'text-match-badge';
                matchBadge.innerHTML = `<span class="match-icon">📝</span> Text Match`;
                container.appendChild(matchBadge);
            }
        },

        _addDomainInfo: function (container, result) {
            if (result.domain) {
                const domain = document.createElement('div');
                domain.className = 'result-domain';
                domain.textContent = result.domain;

                if (result.verified) {
                    const verifiedBadge = document.createElement('span');
                    verifiedBadge.className = 'verified-badge';
                    verifiedBadge.title = 'Verified to exist';
                    verifiedBadge.textContent = '✓';
                    domain.appendChild(verifiedBadge);
                }

                container.appendChild(domain);
            }
        },

        _addSnippet: function (container, result, options, context) {
            if (result.snippet || result.description) {
                const snippet = document.createElement('div');
                snippet.className = 'result-snippet';

                const snippetText = result.description || result.snippet;

                if (snippetText && snippetText.includes('<') && snippetText.includes('>')) {
                    snippet.innerHTML = snippetText;
                } else {
                    snippet.textContent = snippetText || '';
                    if (options.highlightQuery && options.query) {
                        snippet.innerHTML = context.highlightQueryTerms(snippet.textContent, options.query);
                    }
                }

                container.appendChild(snippet);

                // View More logic
                if (snippetText && snippetText.length > 80) {
                    const viewMoreBtn = document.createElement('span');
                    viewMoreBtn.className = 'view-more-btn';
                    viewMoreBtn.textContent = 'View More';

                    viewMoreBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const isExpanded = snippet.classList.toggle('expanded');
                        viewMoreBtn.textContent = isExpanded ? 'Show Less' : 'View More';

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

                    setTimeout(() => {
                        if (snippet.scrollHeight > snippet.clientHeight + 2) {
                            viewMoreBtn.classList.add('visible');
                            viewMoreBtn.style.display = 'inline-block';
                        }
                    }, 100);
                }
            }
        },

        _addCategories: function (container, result) {
            if (result.categories && result.categories.length > 0) {
                const categoriesDiv = document.createElement('div');
                categoriesDiv.className = 'result-categories';

                const renderTags = (expanded) => {
                    categoriesDiv.innerHTML = '';
                    const limit = 5;
                    const tagsToShow = expanded ? result.categories : result.categories.slice(0, limit);

                    tagsToShow.forEach(cat => {
                        let catUrl = '#';
                        const safeCat = encodeURIComponent(cat.replace(/ /g, '_'));

                        if (result.source === 'wikipedia') {
                            catUrl = `https://en.wikipedia.org/wiki/Category:${safeCat}`;
                        } else if (result.domain) {
                            const cleanDomain = result.domain.replace(/^https?:\/\//, '');
                            catUrl = `https://${cleanDomain}/wiki/Category:${safeCat}`;
                        }

                        const tag = document.createElement('a');
                        tag.className = 'category-tag';
                        tag.textContent = cat;
                        tag.href = catUrl;
                        tag.target = '_blank';
                        tag.style.textDecoration = 'none';
                        tag.style.color = 'inherit';

                        tag.onclick = (e) => {
                            e.stopPropagation();
                            if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                                e.preventDefault();
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

                renderTags(false);
                container.appendChild(categoriesDiv);
            }
        }
    };

    // Expose globally
    window.VLContent = VLContent;

})();
