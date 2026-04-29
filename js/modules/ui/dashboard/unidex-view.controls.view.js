// Unidex View Controls View Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createControlsView = function createControlsView(deps) {
        const getEntriesFilterMode = deps?.getEntriesFilterMode || (() => 'all');
        const getEntriesSortBy = deps?.getEntriesSortBy || (() => 'none');
        const getEntriesSortOrder = deps?.getEntriesSortOrder || (() => 'desc');
        const getEntriesConfidenceMin = deps?.getEntriesConfidenceMin || (() => null);
        const getEntriesConfidenceMax = deps?.getEntriesConfidenceMax || (() => null);
        const getEntriesLayoutMode = deps?.getEntriesLayoutMode || (() => 'rows');
        const getEntriesDensityMode = deps?.getEntriesDensityMode || (() => 'comfortable');
        const getEntriesGroupMode = deps?.getEntriesGroupMode || (() => 'flat');
        const formatConfidenceInput = deps?.formatConfidenceInput || (() => '');

        function buildEntriesControlsHtml(options) {
            const controlOptions = options || {};
            const filterMode = getEntriesFilterMode();
            const groupMode = getEntriesGroupMode();
            const sortBy = getEntriesSortBy();
            const sortOrder = getEntriesSortOrder();
            const minConfidence = getEntriesConfidenceMin();
            const maxConfidence = getEntriesConfidenceMax();
            const layoutLabel = getEntriesLayoutMode() === 'grid' ? 'Grid' : 'Rows';
            const densityMode = getEntriesDensityMode();
            const toggleHtml = String(controlOptions.toggleHtml || '');

            return `
            ${toggleHtml}
            <select class="unidex-filter-select" aria-label="Bookmark filter" onchange="window.UnidexView.setEntriesFilter(this.value)">
                <option value="all" ${filterMode === 'all' ? 'selected' : ''}>All Bookmarks</option>
                <option value="linked" ${filterMode === 'linked' ? 'selected' : ''}>Library Linked</option>
                <option value="bookmark-only" ${filterMode === 'bookmark-only' ? 'selected' : ''}>Bookmarks Only</option>
            </select>
            <select class="unidex-filter-select" aria-label="Bookmark grouping" onchange="window.UnidexView.setEntriesGroupMode(this.value)">
                <option value="flat" ${groupMode === 'flat' ? 'selected' : ''}>View: Flat</option>
                <option value="identifiers" ${groupMode === 'identifiers' ? 'selected' : ''}>View: Identifiers</option>
            </select>
            <select class="unidex-filter-select" aria-label="Entry density" onchange="window.UnidexView.setEntriesDensityMode(this.value)">
                <option value="comfortable" ${densityMode === 'comfortable' ? 'selected' : ''}>Density: Comfortable</option>
                <option value="compact" ${densityMode === 'compact' ? 'selected' : ''}>Density: Compact</option>
                <option value="atlas" ${densityMode === 'atlas' ? 'selected' : ''}>Density: Atlas</option>
            </select>
            <select class="unidex-filter-select" aria-label="Entries sort" onchange="window.UnidexView.setEntriesSortBy(this.value)">
                <option value="none" ${sortBy === 'none' ? 'selected' : ''}>Sort: Default</option>
                <option value="confidence" ${sortBy === 'confidence' ? 'selected' : ''}>Sort: Confidence</option>
                <option value="truevalue" ${sortBy === 'truevalue' ? 'selected' : ''}>Sort: True Value</option>
            </select>
            <select class="unidex-filter-select" aria-label="Sort direction" onchange="window.UnidexView.setEntriesSortOrder(this.value)">
                <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>High -> Low</option>
                <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>Low -> High</option>
            </select>
            <div class="unidex-confidence-controls" role="group" aria-label="Confidence threshold">
                <span class="unidex-confidence-label">Confidence</span>
                <input type="number"
                    class="unidex-confidence-input"
                    min="0"
                    max="1"
                    step="0.01"
                    value="${formatConfidenceInput(minConfidence)}"
                    placeholder="Min"
                    aria-label="Minimum confidence"
                    onchange="window.UnidexView.setEntriesConfidenceMin(this.value)">
                <span class="unidex-confidence-separator">to</span>
                <input type="number"
                    class="unidex-confidence-input"
                    min="0"
                    max="1"
                    step="0.01"
                    value="${formatConfidenceInput(maxConfidence)}"
                    placeholder="Max"
                    aria-label="Maximum confidence"
                    onchange="window.UnidexView.setEntriesConfidenceMax(this.value)">
            </div>
            <button type="button" class="unidex-layout-btn" onclick="window.UnidexView.toggleEntriesLayout()" title="Toggle entries layout">
                Layout: ${layoutLabel}
            </button>
            <button type="button" class="unidex-layout-btn unidex-map-btn" onclick="window.UnidexView.openConstellationMap()" title="Open Constellation Map for this layer">
                Map
            </button>
        `;
        }

        return {
            buildEntriesControlsHtml
        };
    };
})();
