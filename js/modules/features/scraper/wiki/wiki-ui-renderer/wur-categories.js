/**
 * Wiki UI Renderer - Categories List Component
 * 
 * Handles rendering of the Wikipedia categories list.
 */

(function () {
    'use strict';

    window.WikiUIRenderer = window.WikiUIRenderer || {};

    /**
     * Render the list of Wikipedia categories
     * @param {Array} wikiCategories - List of categories
     * @param {HTMLElement} listElement - The element to render to
     * @param {Object} cacheStore - The cache store
     * @param {Object} handlers - Callback handlers
     */
    WikiUIRenderer.renderWikiCategoryList = function (wikiCategories, listElement, cacheStore, handlers) {
        listElement.innerHTML = '';

        if (!wikiCategories || wikiCategories.length === 0) {
            listElement.innerHTML = '<li class="empty-list">No categories added yet</li>';
            return;
        }

        wikiCategories.forEach(cat => {
            const li = document.createElement('li');
            li.className = 'entry-item';

            const infoDiv = document.createElement('div');
            infoDiv.className = 'entry-info';

            infoDiv.onclick = function (e) {
                if (handlers.onItemClick) {
                    handlers.onItemClick(e, cat);
                } else if (e.target.tagName !== 'BUTTON') {
                    const url = `https://en.wikipedia.org/wiki/Category:${encodeURIComponent(cat.category)}`;
                    window.open(url, '_blank');
                }
            };
            infoDiv.style.cursor = 'pointer';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'entry-name';
            nameSpan.textContent = cat.name;
            infoDiv.appendChild(nameSpan);

            // Status Badge
            const statusDiv = document.createElement('div');
            statusDiv.className = 'entry-status';
            // Use utility function from wur-status.js
            if (typeof WikiUIRenderer.getCategoryCacheStatus === 'function') {
                statusDiv.innerHTML = WikiUIRenderer.getCategoryCacheStatus(cat.category, cacheStore);
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
                const url = `https://en.wikipedia.org/wiki/Category:${encodeURIComponent(cat.category)}`;
                if (handlers.onVisit) {
                    handlers.onVisit(url, cat.name);
                } else {
                    window.open(url, '_blank');
                }
            };
            actionsDiv.appendChild(visitBtn);

            // Cache Button
            const cacheBtn = document.createElement('button');
            cacheBtn.className = 'action-btn cache-btn';
            cacheBtn.textContent = 'Cache';
            cacheBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onViewCache) handlers.onViewCache(cat.category, cat.name);
            };
            actionsDiv.appendChild(cacheBtn);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.textContent = 'Del';
            deleteBtn.onclick = function (e) {
                e.stopPropagation();
                if (handlers.onRemove) handlers.onRemove(cat.category);
            };
            actionsDiv.appendChild(deleteBtn);

            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);
            listElement.appendChild(li);
        });
    };

    console.log('WikiUIRenderer: Categories component loaded');
})();
