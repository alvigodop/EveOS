/**
 * Fandom CS UI Renderer
 * 
 * Handles displaying results and loading states.
 */

(function () {
    'use strict';

    const FandomCSUI_Renderer = {

        updateLoadingState: function (elements, loading) {
            const { resultsDiv, searchBtn, resetBtn, prevBtn, nextBtn } = elements;
            if (loading) {
                resultsDiv.innerHTML = '<p>Loading...</p>';
                searchBtn.disabled = true;
                resetBtn.disabled = true;
                prevBtn.disabled = true;
                nextBtn.disabled = true;
            } else {
                searchBtn.disabled = false;
                resetBtn.disabled = false;
                // Pagination buttons handled by updatePagination
            }
        },

        showError: function (elements, message) {
            const { resultsDiv } = elements;
            resultsDiv.innerHTML = `<p class="error">${message}</p>`;
        },

        showManualSearchMessage: function (elements, query) {
            const { resultsDiv } = elements;
            const hubLink = `https://www.fandom.com/?s=${encodeURIComponent(query)}`;
            resultsDiv.innerHTML = `
                <div class="info-message" style="padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; border-left: 4px solid #00d37e; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                    <h3 style="margin: 0 0 15px 0; color: #00d37e; font-size: 16px;">⚡ Search Fallback Unavailable</h3>
                    <p style="margin: 0 0 15px 0; color: #ccc; line-height: 1.6;">
                        Google API quota exceeded and fallback search couldn't complete.
                    </p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="${hubLink}" target="_blank" 
                           style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #00d37e; color: #000; text-decoration: none; border-radius: 6px; font-weight: 600;">
                            🔍 Search on Fandom.com
                        </a>
                    </div>
                </div>`;
            if (window.FandomCSCore) FandomCSCore.setLoading(false);
        },

        showInfoMessage: function (elements, html) {
            const { resultsDiv } = elements;
            resultsDiv.innerHTML = `<div class="info-message">${html}</div>`;
        },

        displayResults: function (elements, items, page) {
            const { resultsDiv } = elements;
            resultsDiv.innerHTML = '';

            if (!items || items.length === 0) {
                if (page === 1) {
                    resultsDiv.innerHTML = '<p>No results found for your query targeting fandom.com.</p>';
                } else {
                    resultsDiv.innerHTML = '<p>No more results found.</p>';
                }
                return;
            }

            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const div = this._createResultCard(item);
                fragment.appendChild(div);
            });
            resultsDiv.appendChild(fragment);
        },

        _createResultCard: function (item) {
            const div = document.createElement('div');
            div.className = 'fandom-result';
            div.style.position = 'relative';

            let domain = '';
            try {
                domain = new URL(item.link).hostname;
            } catch (e) {
                console.warn('Invalid URL in result:', item.link);
            }

            let isAdded = false;
            if (window.WikiManager && window.WikiManager.fandomDomains) {
                isAdded = window.WikiManager.fandomDomains.some(d => d.domain === domain);
            }

            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '5px';

            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.flex = '1';

            // Image logic
            let imageUrl = null;
            let hasGoogleSourceImage = false;

            if (item.pagemap) {
                if (item.pagemap.cse_image && item.pagemap.cse_image.length > 0) {
                    imageUrl = item.pagemap.cse_image[0].src;
                    hasGoogleSourceImage = true;
                } else if (item.pagemap.cse_thumbnail && item.pagemap.cse_thumbnail.length > 0) {
                    imageUrl = item.pagemap.cse_thumbnail[0].src;
                    hasGoogleSourceImage = true;
                }
            }

            if (!imageUrl && domain) {
                // Google Favicon fallback
                imageUrl = window.EveFaviconUtils && typeof window.EveFaviconUtils.getBestEffortSrc === 'function'
                    ? window.EveFaviconUtils.getBestEffortSrc(domain, 64)
                    : '';
            }

            if (imageUrl) {
                const img = document.createElement('img');
                // img.id ... generated if needed
                img.style.width = '30px';
                img.style.height = '30px';
                img.style.objectFit = hasGoogleSourceImage ? 'cover' : 'contain';
                // CRITICAL: Supress referrer to avoid Fandom hotlink protection (404/403 on localhost)
                img.referrerPolicy = 'no-referrer';
                img.style.marginRight = '10px';
                img.style.borderRadius = '4px';
                img.alt = 'Wiki Logo';

                const FALLBACK_LOGO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiI+PHBhdGggZmlsbD0iIzAwZDZkNsiIGQ9Ik0wIDBoNTEydjUxMkgweiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkeT0iLjM1ZW0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyMCIgZm9udC13ZWlnaHQ9ImJvbGQiPlc8L3RleHQ+PC9zdmc+';
                img.dataset.fallbackStage = '0';

                img.onerror = function () {
                    const stage = parseInt(this.dataset.fallbackStage || '0');
                    switch (stage) {
                        case 0: // Original failed, try apple-touch-icon
                            this.dataset.fallbackStage = '1';
                            this.src = `https://${domain}/apple-touch-icon.png`;
                            this.style.objectFit = 'contain';
                            break;
                        case 1: // Apple touch failed, use Fandom Star
                            this.dataset.fallbackStage = '2';
                            this.src = FALLBACK_LOGO;
                            this.style.objectFit = 'contain';
                            break;
                        case 2: // Even star failed, hide
                        default:
                            this.dataset.fallbackStage = '3';
                            this.style.display = 'none';
                            break;
                    }
                };

                img.src = imageUrl;
                titleContainer.appendChild(img);
            }

            const titleLink = document.createElement('a');
            titleLink.className = 'fandom-result-title';
            titleLink.href = item.link;
            titleLink.target = '_blank';
            titleLink.innerHTML = item.htmlTitle || item.title || 'No Title';
            titleContainer.appendChild(titleLink);

            const addBtn = document.createElement('button');
            addBtn.className = 'action-btn add-btn add-wiki-btn';
            addBtn.dataset.domain = domain;

            if (isAdded) {
                addBtn.textContent = 'Added';
                addBtn.disabled = true;
            } else {
                addBtn.textContent = 'Add';
                addBtn.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (window.WikiManager && typeof WikiManager.addFandomDomainFromDiscovery === 'function') {
                        const rawTitle = item.title || 'Unknown Wiki';
                        WikiManager.addFandomDomainFromDiscovery(item.link, rawTitle, imageUrl);
                        addBtn.textContent = 'Added';
                        addBtn.disabled = true;
                    } else {
                        console.error('WikiManager.addFandomDomainFromDiscovery not available');
                        alert('Error: WikiManager not loaded.');
                    }
                };
            }

            headerDiv.appendChild(titleContainer);
            headerDiv.appendChild(addBtn);
            div.appendChild(headerDiv);

            const urlSpan = document.createElement('a');
            urlSpan.className = 'fandom-result-url';
            urlSpan.href = item.link;
            urlSpan.textContent = item.link;
            urlSpan.style.display = 'block';
            urlSpan.style.color = '#006621';
            urlSpan.style.textDecoration = 'none';
            urlSpan.style.fontSize = '0.9em';
            div.appendChild(urlSpan);

            const snippetSpan = document.createElement('span');
            snippetSpan.className = 'fandom-result-snippet';
            snippetSpan.innerHTML = item.htmlSnippet || item.snippet || 'No description available.';
            div.appendChild(snippetSpan);

            return div;
        }
    };

    window.FandomCSUI_Renderer = FandomCSUI_Renderer;
})();
