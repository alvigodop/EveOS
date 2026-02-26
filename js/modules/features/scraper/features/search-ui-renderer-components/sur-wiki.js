/**
 * Search UI Renderer Wikipedia Component
 * Handles rendering of Wikipedia discovery results.
 */
const SearchUIRendererWiki = {};

/**
 * Initialize the module
 */
SearchUIRendererWiki.init = function () {
    console.log('SearchUIRendererWiki initialized');
};

/**
 * Render Wikipedia discovery results (Moved from WikiManager)
 * @param {Array} results - The results to render
 * @param {HTMLElement} listElement - The element to render into
 * @param {Object} handlers - Event handlers (add, click, isAdded)
 */
SearchUIRendererWiki.renderWikipediaDiscoveryResults = function (results, listElement, handlers = {}) {
    listElement.innerHTML = '';

    if (!results || results.length === 0) {
        listElement.innerHTML = '<p class="info">No Wikipedia articles found for this term.</p>';
        return;
    }

    const listHtml = results.map(item => {
        // Check if added using the provided check function or default check
        const isAdded = handlers.isAdded ? handlers.isAdded(item) : false;

        const thumbnailHtml = item.thumbnail ?
            `<div class="wiki-thumbnail"><img src="${item.thumbnail}" alt="${item.title}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px;"></div>` :
            '';

        const badgeHtml = item.contentType ?
            `<span class="content-type-badge ${item.contentType.toLowerCase()}" style="font-size: 0.7em; padding: 2px 6px; border-radius: 4px; background: #eee; margin-left: 5px;">${item.contentType}</span>` :
            '';

        // Escape quotes for inline standard handlers
        const escapedUrl = item.url ? item.url.replace(/'/g, "\\'") : '#';
        const escapedTitle = item.title.replace(/'/g, "\\'");
        const escapedThumb = (item.thumbnail || '').replace(/'/g, "\\'");
        const escapedTitleDouble = item.title.replace(/"/g, '&quot;');

        return `
            <li class="wiki-discovery-item" style="display: flex; align-items: start; padding: 10px; border-bottom: 1px solid #eee;">
                ${thumbnailHtml}
                <div class="wiki-info" style="flex: 1;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        <a href="${item.url}" class="wiki-link" data-url="${escapedUrl}" style="font-weight: bold; margin-right: 5px;">${item.title}</a>
                        ${badgeHtml}
                    </div>
                    <span class="wiki-description" style="display: block; font-size: 0.9em; color: #666; margin-top: 2px;">${item.description || 'No description available'}</span>
                </div>
                <button 
                    class="action-btn add-btn add-wiki-btn"
                    data-title="${escapedTitleDouble}"
                    data-thumb="${escapedThumb}"
                    ${isAdded ? 'disabled' : ''}
                    style="margin-left: 10px;"
                >
                    ${isAdded ? 'Added' : 'Add'}
                </button>
            </li>
        `;
    }).join('');

    listElement.innerHTML = `<ul class="wiki-results-list">${listHtml}</ul>`;

    // Attach event listeners to avoid inline onclick string hell
    const links = listElement.querySelectorAll('.wiki-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            if (handlers.onItemClick) {
                // e.preventDefault(); // Optional, depending on handler
                handlers.onItemClick(e, link.dataset.url);
            }
        });
    });

    const buttons = listElement.querySelectorAll('.add-wiki-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (handlers.onAdd) {
                handlers.onAdd(btn.dataset.title, btn.dataset.thumb, btn);
            }
        });
    });
};

window.SearchUIRendererWiki = SearchUIRendererWiki;
