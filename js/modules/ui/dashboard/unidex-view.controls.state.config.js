// Unidex View Controls State Config Helpers
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createControlsStateConfig) return;

    window.UnidexViewModules.createControlsStateConfig = function createControlsStateConfig(deps) {
        const readConfig = typeof deps?.readConfig === 'function'
            ? deps.readConfig
            : function () {
                return typeof config !== 'undefined' && config ? config : {};
            };
        const persistConfig = typeof deps?.persistConfig === 'function'
            ? deps.persistConfig
            : function () {
                if (typeof saveConfig === 'function') saveConfig();
            };
        const requestRender = typeof deps?.requestRender === 'function'
            ? deps.requestRender
            : function () {
                if (typeof renderDashboard === 'function') renderDashboard();
            };

        function getConfigState() {
            const currentConfig = readConfig();
            return currentConfig && typeof currentConfig === 'object' ? currentConfig : {};
        }

        function getEntriesLayoutMode() {
            return String(getConfigState().unidexEntriesLayout || 'rows') === 'grid' ? 'grid' : 'rows';
        }

        function setEntriesLayoutMode(mode) {
            const nextMode = String(mode || '') === 'grid' ? 'grid' : 'rows';
            const currentConfig = getConfigState();
            if (currentConfig.unidexEntriesLayout === nextMode) return;
            currentConfig.unidexEntriesLayout = nextMode;
            persistConfig();
        }

        function toggleEntriesLayout() {
            const nextMode = getEntriesLayoutMode() === 'grid' ? 'rows' : 'grid';
            setEntriesLayoutMode(nextMode);
            requestRender();
        }

        function getCardsUnifiedMode() {
            return !!getConfigState().unidexCardsUnified;
        }

        function setCardsUnifiedMode(enabled) {
            const nextState = !!enabled;
            const currentConfig = getConfigState();
            if (!!currentConfig.unidexCardsUnified === nextState) return false;
            currentConfig.unidexCardsUnified = nextState;
            persistConfig();
            return true;
        }

        function setCardsUnified(enabled) {
            setCardsUnifiedMode(enabled);
            requestRender();
        }

        function getTabsUnifiedMode() {
            return !!getConfigState().unidexTabsUnified;
        }

        function setTabsUnifiedMode(enabled) {
            const nextState = !!enabled;
            const currentConfig = getConfigState();
            if (!!currentConfig.unidexTabsUnified === nextState) return false;
            currentConfig.unidexTabsUnified = nextState;
            persistConfig();
            return true;
        }

        function setTabsUnified(enabled) {
            setTabsUnifiedMode(enabled);
            requestRender();
        }

        function getEntriesFilterMode() {
            const mode = String(getConfigState().unidexEntriesFilter || 'all');
            if (mode === 'linked' || mode === 'bookmark-only') return mode;
            return 'all';
        }

        function setEntriesFilter(mode) {
            const nextMode = String(mode || '') === 'linked'
                ? 'linked'
                : String(mode || '') === 'bookmark-only'
                    ? 'bookmark-only'
                    : 'all';
            const currentConfig = getConfigState();
            if (currentConfig.unidexEntriesFilter === nextMode) return;
            currentConfig.unidexEntriesFilter = nextMode;
            persistConfig();
            requestRender();
        }

        function getEntriesSortBy() {
            const mode = String(getConfigState().unidexEntriesSortBy || 'none').toLowerCase();
            return mode === 'confidence' ? 'confidence' : 'none';
        }

        function getEntriesSortOrder() {
            return String(getConfigState().unidexEntriesSortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        }

        function setEntriesSortBy(sortBy) {
            const nextSortBy = String(sortBy || '').toLowerCase() === 'confidence' ? 'confidence' : 'none';
            const currentConfig = getConfigState();
            if (String(currentConfig.unidexEntriesSortBy || 'none') === nextSortBy) return;
            currentConfig.unidexEntriesSortBy = nextSortBy;
            persistConfig();
            requestRender();
        }

        function setEntriesSortOrder(sortOrder) {
            const nextOrder = String(sortOrder || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
            const currentConfig = getConfigState();
            const currentOrder = String(currentConfig.unidexEntriesSortOrder || 'desc');
            const currentSortBy = getEntriesSortBy();
            const shouldEnableConfidenceSort = currentSortBy === 'none';
            if (currentOrder === nextOrder && !shouldEnableConfidenceSort) return;
            currentConfig.unidexEntriesSortOrder = nextOrder;
            if (shouldEnableConfidenceSort) {
                currentConfig.unidexEntriesSortBy = 'confidence';
            }
            persistConfig();
            requestRender();
        }

        function normalizeConfidenceInput(rawValue) {
            const text = String(rawValue ?? '').trim();
            if (!text) return null;
            const value = Number(text);
            if (!Number.isFinite(value)) return null;
            return Math.max(0, Math.min(1, value));
        }

        function getEntriesConfidenceMin() {
            return normalizeConfidenceInput(getConfigState().unidexEntriesConfidenceMin);
        }

        function getEntriesConfidenceMax() {
            return normalizeConfidenceInput(getConfigState().unidexEntriesConfidenceMax);
        }

        function formatConfidenceInput(value) {
            if (!Number.isFinite(value)) return '';
            return value.toFixed(2);
        }

        function setEntriesConfidenceMin(rawValue) {
            const nextMin = normalizeConfidenceInput(rawValue);
            const currentMax = getEntriesConfidenceMax();
            const currentConfig = getConfigState();
            currentConfig.unidexEntriesConfidenceMin = nextMin;
            if (Number.isFinite(nextMin) && Number.isFinite(currentMax) && nextMin > currentMax) {
                currentConfig.unidexEntriesConfidenceMax = nextMin;
            }
            persistConfig();
            requestRender();
        }

        function setEntriesConfidenceMax(rawValue) {
            const nextMax = normalizeConfidenceInput(rawValue);
            const currentMin = getEntriesConfidenceMin();
            const currentConfig = getConfigState();
            currentConfig.unidexEntriesConfidenceMax = nextMax;
            if (Number.isFinite(nextMax) && Number.isFinite(currentMin) && nextMax < currentMin) {
                currentConfig.unidexEntriesConfidenceMin = nextMax;
            }
            persistConfig();
            requestRender();
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
