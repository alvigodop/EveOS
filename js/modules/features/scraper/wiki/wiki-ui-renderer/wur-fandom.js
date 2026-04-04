/**
 * Wiki UI Renderer - Fandom List Component
 * 
 * Handles rendering of the Fandom domains list.
 */

(function () {
    'use strict';

    window.WikiUIRenderer = window.WikiUIRenderer || {};

    /**
     * Render the list of Fandom domains
     * @param {Array} fandomDomains - List of fandom domains to render
     * @param {HTMLElement} listElement - The element to render to
     * @param {Object} cacheStore - The cache store for status checking
     * @param {Object} handlers - Object containing callback handlers (remove, reload, clearCache)
     */
    WikiUIRenderer.renderFandomDomainList = function (fandomDomains, listElement, cacheStore, handlers) {
        listElement.innerHTML = '';

        if (!fandomDomains || fandomDomains.length === 0) {
            listElement.innerHTML = '<li class="empty-list">No Fandom wikis added yet</li>';
            return;
        }

        fandomDomains.forEach(wiki => {
            const li = document.createElement('li');
            li.className = 'entry-item'; // Changed from 'domain-item' to match CSS

            const infoDiv = document.createElement('div');
            infoDiv.className = 'entry-info'; // Changed from 'domain-info'

            // Image (Banner/Icon)
            // Always create an image element, with fallbacks for missing imageUrl
            const img = document.createElement('img');
            img.className = 'entry-image';
            img.alt = wiki.name || wiki.domain;

            // STYLE: Transparent background for clean look
            img.style.backgroundColor = 'transparent';
            img.style.padding = '2px';
            img.style.borderRadius = '4px';
            img.style.objectFit = 'contain';

            // Track fallback stage: 0=original, 1=apple-touch, 2=favicon, 3=star, 4=hide
            img.dataset.fallbackStage = '0';

            img.onerror = function () {
                const stage = parseInt(this.dataset.fallbackStage || '0');

                // Fallback Chain based on stage
                // Simplified Fallback: Google Favicon -> Base64 (Instant, no flicker)
                this.dataset.fallbackStage = '3';
                // Base64 SVG "W" icon - Guaranteed to load
                this.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiI+PHBhdGggZmlsbD0iIzAwZDZkNsiIGQ9Ik0wIDBoNTEydjUxMkgweiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkeT0iLjM1ZW0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyMCIgZm9udC13ZWlnaHQ9ImJvbGQiPlc8L3RleHQ+PC9zdmc+';

                // If even Base64 fails (impossible), hide it
                this.onerror = function () { this.style.display = 'none'; };
            };

            // Set the initial src - use stored imageUrl or try to get wiki logo
            // FORCE GOOGLE FAVICON: Ignore stored imageUrl (which might be broken Site-logo.png)
            // This ensures the sidebar is always consistent with search results and flicker-free.
            img.dataset.fallbackStage = '0';
            img.src = `https://www.google.com/s2/favicons?domain=${wiki.domain}&sz=64`;

            infoDiv.appendChild(img);

            // Link logic - delegated to a handler if possible, otherwise default behavior
            infoDiv.onclick = function (e) {
                if (handlers.onItemClick) {
                    handlers.onItemClick(e, wiki);
                } else if (e.target.tagName !== 'BUTTON') {
                    const url = `https://${wiki.domain}`;
                    window.open(url, '_blank');
                }
            };
            infoDiv.style.cursor = 'pointer';

            const metaDiv = document.createElement('div');
            metaDiv.className = 'entry-meta';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'entry-name'; // Changed from 'domain-name'
            nameSpan.textContent = wiki.name || wiki.domain;
            metaDiv.appendChild(nameSpan);

            const domainSpan = document.createElement('span');
            domainSpan.className = 'domain-url';
            domainSpan.textContent = wiki.domain;
            metaDiv.appendChild(domainSpan);
            
            infoDiv.appendChild(metaDiv);

            // Status Badge
            const statusDiv = document.createElement('div');
            statusDiv.className = 'entry-status'; // Changed from 'domain-status'
            // Use the utility function from wur-status.js
            if (typeof WikiUIRenderer.getFandomCacheStatus === 'function') {
                statusDiv.innerHTML = WikiUIRenderer.getFandomCacheStatus(wiki.domain, cacheStore);
            } else {
                statusDiv.textContent = 'Status unavailable';
            }
            metaDiv.appendChild(statusDiv);
            
            infoDiv.appendChild(metaDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'entry-actions'; // Changed from 'domain-actions'

            // Visit Button
            const visitBtn = document.createElement('button');
            visitBtn.className = 'action-btn visit-btn';
            visitBtn.textContent = 'Visit ↗';
            visitBtn.onclick = function (e) {
                e.stopPropagation();
                const url = `https://${wiki.domain}`;
                if (handlers.onVisit) {
                    handlers.onVisit(url, wiki.name);
                } else {
                    window.open(url, '_blank');
                }
            };
            actionsDiv.appendChild(visitBtn);

            // Reload Button
            const reloadBtn = document.createElement('button');
            reloadBtn.className = 'action-btn-premium reload-btn-premium';
            reloadBtn.innerHTML = `
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                <span>Reload</span>
            `;
            reloadBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onReload) {
                    handlers.onReload(wiki.domain, reloadBtn);
                }
            };
            actionsDiv.appendChild(reloadBtn);

            // Cache Button (View Cache)
            const cacheBtn = document.createElement('button');
            cacheBtn.className = 'action-btn cache-btn';
            cacheBtn.textContent = 'View Cache';
            cacheBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onViewCache) {
                    handlers.onViewCache(wiki.domain);
                }
            };
            actionsDiv.appendChild(cacheBtn);

            // Remove Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn remove-btn';
            deleteBtn.textContent = 'Remove';
            deleteBtn.onclick = function (e) {
                e.stopPropagation();
                console.log(`[WikiUIRenderer] Sidebar Remove clicked for ${wiki.domain}`);
                if (handlers.onRemove) handlers.onRemove(wiki.domain);
            };
            actionsDiv.appendChild(deleteBtn);

            // Clear Cache Button
            const clearCacheBtn = document.createElement('button');
            clearCacheBtn.className = 'action-btn-premium clear-cache-btn-premium';
            clearCacheBtn.innerHTML = `
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 2-2m4.6-4.6L11 13m4.6-4.6L17 7m-3 10 2 2 2-2-2-2-2 2Zm-5-5L4 4m6 6-1.5 1.5"></path></svg>
                <span>Clear Cache</span>
            `;
            clearCacheBtn.title = 'Clear Cache';
            clearCacheBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onClearCache) handlers.onClearCache(wiki.domain);
            };
            actionsDiv.appendChild(clearCacheBtn);

            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);
            listElement.appendChild(li);
        });
    };

    console.log('WikiUIRenderer: Fandom component loaded');
})();
