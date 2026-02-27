/**
 * Library UI Template
 * Holds the panel HTML builder used by library UI.
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIShared = window.EveLibrary.UIShared || {};

(function (shared) {
    shared.createLibraryPanelHtml = function (categoryName) {
        const State = window.EveLibrary.State;
        const safeCat = categoryName.replace(/'/g, "\\'");
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const dataTypes = State.getDataTypes();

        const typeOptionsHtml = Object.keys(dataTypes).map(key =>
            `<option value="${key}" ${key === dataType ? 'selected' : ''}>${dataTypes[key].label}</option>`
        ).join('');

        return `
            <div class="lib-panel-header">
                <select id="${prefix}data-type" class="lib-type-select" onchange="window.EveLibrary.UI.changeDataType('${safeCat}', this.value)">
                    ${typeOptionsHtml}
                </select>
                <div class="lib-panel-controls">
                    <button class="lib-btn lib-btn-primary" onclick="window.EveLibrary.UI.showAddForm('${safeCat}')">+ Add Entry</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.toggleStats('${safeCat}')">&#128202; Stats</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.batchDelete('${safeCat}')" title="Delete Selected">&#128465; Selected</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.exportLibrary('${safeCat}')">&#11015; Export</button>
                    <button class="lib-btn" onclick="document.getElementById('${prefix}import-file').click()">&#11014; Import</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.showBackups('${safeCat}')" title="Restore Backup">&#128230; Backups</button>
                    <input type="file" id="${prefix}import-file" style="display:none" accept=".json" 
                           onchange="window.EveLibrary.UI.importLibrary('${safeCat}', this.files[0])">
                </div>
            </div>

            <div id="${prefix}entry-form" class="lib-entry-form" style="display:none;">
                <h4 id="${prefix}form-title">Add New Entry</h4>
                <div class="lib-form-grid">
                    <label>Title: <input type="text" id="${prefix}title" required></label>
                    <label>Author: <input type="text" id="${prefix}author"></label>
                    <label>Author Alt Names: <input type="text" id="${prefix}author-alt-names" placeholder="comma separated"></label>
                    <label>Artist: <input type="text" id="${prefix}artist" placeholder="comma separated"></label>
                    <label>Genre: <input type="text" id="${prefix}genre"></label>
                    <label>Status: <select id="${prefix}status"></select></label>
                    <label id="${prefix}chapter-label">Chapter: <input type="number" id="${prefix}chapter" min="0" value="0"></label>
                    <label id="${prefix}season-label" style="display:none;">Season: <input type="number" id="${prefix}season" min="0" value="0"></label>
                    <label id="${prefix}episode-label" style="display:none;">Episode: <input type="number" id="${prefix}episode" min="0" value="0"></label>
                    <label>Rating: 
                        <select id="${prefix}rating">
                            <option value="">Select</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                        </select>
                    </label>
                    <label>AniList (0-10): <input type="number" id="${prefix}api-rating-anilist" min="0" max="10" step="0.01"></label>
                    <label>MyAnimeList (0-10): <input type="number" id="${prefix}api-rating-myanimelist" min="0" max="10" step="0.01"></label>
                    <label>MangaDex (0-10): <input type="number" id="${prefix}api-rating-mangadex" min="0" max="10" step="0.01"></label>
                    <label>Language: <input type="text" id="${prefix}language"></label>
                    <label>Tags: <input type="text" id="${prefix}tags" placeholder="comma separated"></label>
                    <label>Source URL: <input type="url" id="${prefix}source-url"></label>
                    <label>Image URL: <input type="url" id="${prefix}image-url"></label>
                    <label class="lib-full-width lib-entry-meta-line">
                        <span id="${prefix}date-added-meta">Added: -</span>
                        <span id="${prefix}last-edited-meta">Last Edited: -</span>
                    </label>
                    <label class="lib-full-width">Summary: <textarea id="${prefix}summary" rows="2"></textarea></label>
                </div>
                <div class="lib-form-actions">
                    <button class="lib-btn lib-btn-primary" onclick="window.EveLibrary.UI.saveEntry('${safeCat}')">Save</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.hideForm('${safeCat}')">Cancel</button>
                </div>
            </div>

            <div id="${prefix}stats-view" class="lib-stats-view" style="display:none;"></div>

            <div id="${prefix}entries-view">
                <div class="lib-search-bar">
                    <input type="text" id="${prefix}search-title" placeholder="Title...">
                    <input type="text" id="${prefix}search-author" placeholder="Author...">
                    <select id="${prefix}search-genre"><option value="">All Genres</option></select>
                    <select id="${prefix}search-status"><option value="">All Statuses</option></select>
                    <select id="${prefix}search-rating">
                        <option value="">All Ratings</option>
                        <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                        <option value="4">4</option><option value="5">5</option>
                    </select>
                    <select id="${prefix}search-rating-scale">
                        <option value="hybrid">Unified Rating</option>
                        <option value="personal">Personal Only</option>
                        <option value="api_weighted">API Weighted</option>
                        <option value="api_average">API Average</option>
                        <option value="confidence">Confidence</option>
                    </select>
                    <input type="number" id="${prefix}min-derived-rating" placeholder="Min U" min="0" max="10" step="0.1" style="width:70px;">
                    <input type="number" id="${prefix}max-derived-rating" placeholder="Max U" min="0" max="10" step="0.1" style="width:70px;">
                    <input type="number" id="${prefix}min-chapter" placeholder="Min Ch" min="0" style="width:70px;">
                    <input type="number" id="${prefix}max-chapter" placeholder="Max Ch" min="0" style="width:70px;">
                    <input type="number" id="${prefix}min-season" placeholder="Min S" min="0" style="width:60px; display:none;">
                    <input type="number" id="${prefix}max-season" placeholder="Max S" min="0" style="width:60px; display:none;">
                    <input type="number" id="${prefix}min-episode" placeholder="Min Ep" min="0" style="width:70px; display:none;">
                    <input type="number" id="${prefix}max-episode" placeholder="Max Ep" min="0" style="width:70px; display:none;">
                    <input type="text" id="${prefix}search-tags" placeholder="Tags...">
                    <input type="text" id="${prefix}search-language" placeholder="Language...">
                    <select id="${prefix}sort-by"><option value="">Sort By</option></select>
                    <select id="${prefix}sort-order">
                        <option value="asc">Asc</option>
                        <option value="desc">Desc</option>
                    </select>
                    <label class="lib-fav-filter"><input type="checkbox" id="${prefix}filter-favorites"> &#11088; Only</label>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.refreshLibrary('${safeCat}')">&#128269;</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.resetAndRefresh('${safeCat}')">&#8635;</button>
                </div>

                <div id="${prefix}entries" class="lib-entries-grid"></div>
                <div id="${prefix}pagination" class="lib-pagination"></div>
            </div>
        `;
    };
})(window.EveLibrary.UIShared);
