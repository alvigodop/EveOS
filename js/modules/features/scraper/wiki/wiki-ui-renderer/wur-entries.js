/**
 * Wiki UI Renderer - Entries List Component
 * 
 * Handles rendering of the Wikipedia entries list.
 */

(function () {
    'use strict';

    window.WikiUIRenderer = window.WikiUIRenderer || {};

    /**
     * Render the list of Wikipedia entries
     * @param {Array} wikiEntries - List of wiki entries
     * @param {HTMLElement} listElement - The element to render to
     * @param {Object} cacheStore - The cache store
     * @param {Object} handlers - Callback handlers
     */
    WikiUIRenderer.renderWikiEntryList = function (wikiEntries, listElement, cacheStore, handlers) {
        listElement.innerHTML = '';

        if (!wikiEntries || wikiEntries.length === 0) {
            listElement.innerHTML = '<li class="empty-list">No Wikipedia articles added yet</li>';
            return;
        }

        wikiEntries.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'entry-item';

            const infoDiv = document.createElement('div');
            infoDiv.className = 'entry-info';

            // Image (Banner) - adapted to use .entry-image from CSS
            if (entry.imageUrl) {
                const img = document.createElement('img');
                img.className = 'entry-image';
                img.src = entry.imageUrl;
                img.alt = entry.name || entry.title;
                // Handle loading error (fallback)
                img.onerror = function () {
                    this.style.display = 'none';
                };
                infoDiv.appendChild(img);
            }

            infoDiv.onclick = function (e) {
                if (handlers.onItemClick) {
                    handlers.onItemClick(e, entry);
                } else if (e.target.tagName !== 'BUTTON') {
                    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title)}`;
                    window.open(url, '_blank');
                }
            };
            infoDiv.style.cursor = 'pointer';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'entry-name';
            nameSpan.textContent = entry.name || entry.title;
            infoDiv.appendChild(nameSpan);

            if (entry.name && entry.name !== entry.title) {
                const titleSpan = document.createElement('span');
                titleSpan.className = 'entry-title-sub';
                titleSpan.textContent = `(${entry.title})`;
                infoDiv.appendChild(titleSpan);
            }

            // Status Badge
            const statusDiv = document.createElement('div');
            statusDiv.className = 'entry-status';
            // Use utility function from wur-status.js
            if (typeof WikiUIRenderer.getWikiCacheStatus === 'function') {
                statusDiv.innerHTML = WikiUIRenderer.getWikiCacheStatus(entry.title, cacheStore);
            } else {
                statusDiv.textContent = 'Status unavailable';
            }
            infoDiv.appendChild(statusDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'entry-actions';

            // Visit Button
            const visitBtn = document.createElement('button');
            visitBtn.className = 'action-btn visit-btn';
            visitBtn.textContent = 'Visit ↗';
            visitBtn.onclick = function (e) {
                e.stopPropagation();
                const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title)}`;
                if (handlers.onVisit) {
                    handlers.onVisit(url, entry.name);
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
                if (handlers.onReload) handlers.onReload(entry.title, reloadBtn);
            };
            actionsDiv.appendChild(reloadBtn);

            // Cache Button (View Cache)
            const cacheBtn = document.createElement('button');
            cacheBtn.className = 'action-btn cache-btn';
            cacheBtn.textContent = 'View Cache';
            cacheBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onViewCache) handlers.onViewCache(entry.title);
            };
            actionsDiv.appendChild(cacheBtn);

            // Remove Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn remove-btn';
            deleteBtn.textContent = 'Remove';
            deleteBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onRemove) handlers.onRemove(entry.title);
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
                if (handlers.onClearCache) handlers.onClearCache(entry.title);
            };
            actionsDiv.appendChild(clearCacheBtn);

            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);
            listElement.appendChild(li);
        });
    };

    console.log('WikiUIRenderer: Entries component loaded');
})();
