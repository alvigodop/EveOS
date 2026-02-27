// Unidex View Controls Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createControls = function createControls(deps) {
        const getLinkedLibraryEntry = deps?.getLinkedLibraryEntry || (() => null);
        const getEntryConfidence = deps?.getEntryConfidence || (() => null);

        function getEntriesLayoutMode() {
            return String(config?.unidexEntriesLayout || 'rows') === 'grid' ? 'grid' : 'rows';
        }

        function setEntriesLayoutMode(mode) {
            const nextMode = String(mode || '') === 'grid' ? 'grid' : 'rows';
            if (config.unidexEntriesLayout === nextMode) return;
            config.unidexEntriesLayout = nextMode;
            if (typeof saveConfig === 'function') saveConfig();
        }

        function toggleEntriesLayout() {
            const nextMode = getEntriesLayoutMode() === 'grid' ? 'rows' : 'grid';
            setEntriesLayoutMode(nextMode);
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function getCardsUnifiedMode() {
            return !!config?.unidexCardsUnified;
        }

        function setCardsUnifiedMode(enabled) {
            const nextState = !!enabled;
            if (!!config.unidexCardsUnified === nextState) return false;
            config.unidexCardsUnified = nextState;
            if (typeof saveConfig === 'function') saveConfig();
            return true;
        }

        function setCardsUnified(enabled) {
            setCardsUnifiedMode(enabled);
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function getTabsUnifiedMode() {
            return !!config?.unidexTabsUnified;
        }

        function setTabsUnifiedMode(enabled) {
            const nextState = !!enabled;
            if (!!config.unidexTabsUnified === nextState) return false;
            config.unidexTabsUnified = nextState;
            if (typeof saveConfig === 'function') saveConfig();
            return true;
        }

        function setTabsUnified(enabled) {
            setTabsUnifiedMode(enabled);
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function getEntriesFilterMode() {
            const mode = String(config?.unidexEntriesFilter || 'all');
            if (mode === 'linked' || mode === 'bookmark-only') return mode;
            return 'all';
        }

        function setEntriesFilter(mode) {
            const nextMode = String(mode || '') === 'linked'
                ? 'linked'
                : String(mode || '') === 'bookmark-only'
                    ? 'bookmark-only'
                    : 'all';
            if (config.unidexEntriesFilter === nextMode) return;
            config.unidexEntriesFilter = nextMode;
            if (typeof saveConfig === 'function') saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function matchesEntriesFilter(link, filterMode) {
            if (filterMode === 'all') return true;
            const isLinked = !!getLinkedLibraryEntry(link.id);
            if (filterMode === 'linked') return isLinked;
            if (filterMode === 'bookmark-only') return !isLinked;
            return true;
        }

        function getEntriesSortBy() {
            const mode = String(config?.unidexEntriesSortBy || 'none').toLowerCase();
            if (mode === 'confidence') return 'confidence';
            return 'none';
        }

        function getEntriesSortOrder() {
            return String(config?.unidexEntriesSortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        }

        function setEntriesSortBy(sortBy) {
            const nextSortBy = String(sortBy || '').toLowerCase() === 'confidence' ? 'confidence' : 'none';
            if (String(config?.unidexEntriesSortBy || 'none') === nextSortBy) return;
            config.unidexEntriesSortBy = nextSortBy;
            if (typeof saveConfig === 'function') saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function setEntriesSortOrder(sortOrder) {
            const nextOrder = String(sortOrder || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
            const currentOrder = String(config?.unidexEntriesSortOrder || 'desc');
            const currentSortBy = getEntriesSortBy();
            const shouldEnableConfidenceSort = currentSortBy === 'none';
            if (currentOrder === nextOrder && !shouldEnableConfidenceSort) return;
            config.unidexEntriesSortOrder = nextOrder;
            if (shouldEnableConfidenceSort) {
                config.unidexEntriesSortBy = 'confidence';
            }
            if (typeof saveConfig === 'function') saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function normalizeConfidenceInput(rawValue) {
            const text = String(rawValue ?? '').trim();
            if (!text) return null;
            const value = Number(text);
            if (!Number.isFinite(value)) return null;
            return Math.max(0, Math.min(1, value));
        }

        function getEntriesConfidenceMin() {
            return normalizeConfidenceInput(config?.unidexEntriesConfidenceMin);
        }

        function getEntriesConfidenceMax() {
            return normalizeConfidenceInput(config?.unidexEntriesConfidenceMax);
        }

        function formatConfidenceInput(value) {
            if (!Number.isFinite(value)) return '';
            return value.toFixed(2);
        }

        function setEntriesConfidenceMin(rawValue) {
            const nextMin = normalizeConfidenceInput(rawValue);
            const currentMax = getEntriesConfidenceMax();

            config.unidexEntriesConfidenceMin = nextMin;
            if (Number.isFinite(nextMin) && Number.isFinite(currentMax) && nextMin > currentMax) {
                config.unidexEntriesConfidenceMax = nextMin;
            }

            if (typeof saveConfig === 'function') saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function setEntriesConfidenceMax(rawValue) {
            const nextMax = normalizeConfidenceInput(rawValue);
            const currentMin = getEntriesConfidenceMin();

            config.unidexEntriesConfidenceMax = nextMax;
            if (Number.isFinite(nextMax) && Number.isFinite(currentMin) && nextMax < currentMin) {
                config.unidexEntriesConfidenceMin = nextMax;
            }

            if (typeof saveConfig === 'function') saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function matchesConfidenceRange(link, minConfidence, maxConfidence) {
            if (!Number.isFinite(minConfidence) && !Number.isFinite(maxConfidence)) return true;

            const entry = getLinkedLibraryEntry(link.id);
            if (!entry) return true;

            const confidence = getEntryConfidence(entry);
            if (!Number.isFinite(confidence)) return false;
            if (Number.isFinite(minConfidence) && confidence < minConfidence) return false;
            if (Number.isFinite(maxConfidence) && confidence > maxConfidence) return false;
            return true;
        }

        function sortByConfidence(links, sortOrder) {
            const indexed = (Array.isArray(links) ? links : []).map(function (link, index) {
                const entry = getLinkedLibraryEntry(link.id);
                return {
                    index: index,
                    link: link,
                    confidence: entry ? getEntryConfidence(entry) : null
                };
            });

            indexed.sort(function (a, b) {
                const aValue = a.confidence;
                const bValue = b.confidence;
                const aMissing = !Number.isFinite(aValue);
                const bMissing = !Number.isFinite(bValue);

                if (aMissing && bMissing) return a.index - b.index;
                if (aMissing) return 1;
                if (bMissing) return -1;
                if (aValue !== bValue) {
                    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
                }
                return a.index - b.index;
            });

            return indexed.map(function (item) { return item.link; });
        }

        function applyEntriesViewTransforms(entryLinks, filterMode) {
            const base = Array.isArray(entryLinks) ? entryLinks.slice() : [];
            const minConfidence = getEntriesConfidenceMin();
            const maxConfidence = getEntriesConfidenceMax();
            const sortBy = getEntriesSortBy();
            const sortOrder = getEntriesSortOrder();

            const filtered = base.filter(function (link) {
                return matchesEntriesFilter(link, filterMode)
                    && matchesConfidenceRange(link, minConfidence, maxConfidence);
            });

            if (sortBy === 'confidence') {
                return sortByConfidence(filtered, sortOrder);
            }
            return filtered;
        }

        function buildEntriesControlsHtml(options) {
            const controlOptions = options || {};
            const filterMode = getEntriesFilterMode();
            const sortBy = getEntriesSortBy();
            const sortOrder = getEntriesSortOrder();
            const minConfidence = getEntriesConfidenceMin();
            const maxConfidence = getEntriesConfidenceMax();
            const layoutLabel = getEntriesLayoutMode() === 'grid' ? 'Grid' : 'Rows';
            const toggleHtml = String(controlOptions.toggleHtml || '');

            return `
            ${toggleHtml}
            <select class="unidex-filter-select" aria-label="Bookmark filter" onchange="window.UnidexView.setEntriesFilter(this.value)">
                <option value="all" ${filterMode === 'all' ? 'selected' : ''}>All Bookmarks</option>
                <option value="linked" ${filterMode === 'linked' ? 'selected' : ''}>Library Linked</option>
                <option value="bookmark-only" ${filterMode === 'bookmark-only' ? 'selected' : ''}>Bookmarks Only</option>
            </select>
            <select class="unidex-filter-select" aria-label="Entries sort" onchange="window.UnidexView.setEntriesSortBy(this.value)">
                <option value="none" ${sortBy === 'none' ? 'selected' : ''}>Sort: Default</option>
                <option value="confidence" ${sortBy === 'confidence' ? 'selected' : ''}>Sort: Confidence</option>
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
        `;
        }

        return {
            getEntriesLayoutMode,
            setEntriesLayoutMode,
            toggleEntriesLayout,
            getCardsUnifiedMode,
            setCardsUnifiedMode,
            setCardsUnified,
            getTabsUnifiedMode,
            setTabsUnifiedMode,
            setTabsUnified,
            getEntriesFilterMode,
            setEntriesFilter,
            getEntriesSortBy,
            getEntriesSortOrder,
            setEntriesSortBy,
            setEntriesSortOrder,
            getEntriesConfidenceMin,
            getEntriesConfidenceMax,
            setEntriesConfidenceMin,
            setEntriesConfidenceMax,
            applyEntriesViewTransforms,
            buildEntriesControlsHtml
        };
    };
})();
