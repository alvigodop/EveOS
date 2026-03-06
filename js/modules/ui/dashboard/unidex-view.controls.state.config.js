// Unidex View Controls State Config Helpers
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createControlsStateConfig) return;

    window.UnidexViewModules.createControlsStateConfig = function createControlsStateConfig() {
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

        function getEntriesSortBy() {
            const mode = String(config?.unidexEntriesSortBy || 'none').toLowerCase();
            return mode === 'confidence' ? 'confidence' : 'none';
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
            formatConfidenceInput
        };
    };
})();
