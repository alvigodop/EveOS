/** State and scope helpers for the Gemini Live Link agentic card. */
window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};

(function () {
    const agentic = window.GeminiLiveLinkAgentic;
    if (agentic.uiState) return;
const GEMINI_LIVE_LINK_MODE_PROFILES = {
    brief: { label: 'Quick Scoped Brief', limit: 10, note: 'Lean card and bookmark names, counts, and a small useful sample.' },
    summary: { label: 'Rich Scoped Summary', limit: 30, note: 'Readable scoped sample with folders, bookmark identifiers, status, progress, ratings, URLs, and Nexus hints.' },
    deep: { label: 'Deep Scoped Snapshot', limit: 60, note: 'More complete tree sample for the selected scope without raw internal state dumps.' },
    full: { label: 'Complete Scoped Snapshot', limit: 90, note: 'Largest safe structured payload for the selected scope, chunked for Gemini Live.' }
};

const GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS = {
    auto: 'Auto follows the current EveOS surface. In normal tabs it uses the active tab branch; in card drill-ins it can scope to that card; in Unidex it can expose the global datapack.',
    'tab-current': 'Current Tab Only sends this tab name, path, visible cards, folders, bookmarks, notes, pins, and library links. Sub-tab paths may be named, but sub-tab contents are not included.',
    'tab-branch': 'Current Tab + Sub Tabs sends this tab and its visible sub-tab branch, preserving tab paths while keeping each card and folder tree separated.',
    group: 'Current Group sends all tabs, sub-tabs, cards, folders, bookmarks, notes, and library connections belonging to the active sidebar group.',
    card: 'Specific Card sends one selected card, its folders, root bookmarks, bookmark identifier/category pills, linked-library state, pins, URLs, notes, progress, and compact system-view hints.',
    all: 'Whole Datapack is only available from Unidex/global surfaces. Use it sparingly; it is chunked but still the largest scope.'
};

function _normalizeGeminiLiveLinkMode(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'json' || value === 'complete') return 'full';
    return GEMINI_LIVE_LINK_MODE_PROFILES[value] ? value : 'summary';
}

function _getGeminiLiveLinkModeProfile(mode) {
    const normalized = _normalizeGeminiLiveLinkMode(mode);
    return { id: normalized, ...GEMINI_LIVE_LINK_MODE_PROFILES[normalized] };
}

function _getGeminiLiveLinkConfig() {
    if (window.eveState?.config) return window.eveState.config;
    if (typeof config !== 'undefined') return config;
    return window.config || null;
}

function _getGeminiLiveLinkMode() {
    const cfg = _getGeminiLiveLinkConfig();
    return _normalizeGeminiLiveLinkMode(cfg?.modularGeminiMode || 'summary');
}

function _getGeminiLiveLinkApi() {
    return window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync || null;
}

function _isGeminiLiveLinkEnabled() {
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg && typeof cfg.geminiLiveLinkEnabled === 'boolean') {
        return cfg.geminiLiveLinkEnabled;
    }
    return true;
}

function _getGeminiLiveLinkScopeMode() {
    return window.GeminiLiveLinkScopeRuntime?.getScopeMode?.() || 'auto';
}

function _isGeminiLiveLinkDataStreamEnabled() {
    return !!window.GeminiLiveLinkScopeRuntime?.isDataStreamEnabled?.();
}

function _isGeminiLiveLinkSettingsOpen() {
    const cfg = _getGeminiLiveLinkConfig();
    return !!cfg?.geminiLiveLinkSettingsOpen;
}

function _setGeminiLiveLinkSettingsOpen(open) {
    const cfg = _getGeminiLiveLinkConfig();
    const value = !!open;
    if (cfg) {
        cfg.geminiLiveLinkSettingsOpen = value;
        if (typeof saveConfig === 'function') saveConfig();
    }
    return value;
}

function _setGeminiLiveLinkMode(mode) {
    const normalized = _normalizeGeminiLiveLinkMode(mode);
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg) {
        cfg.modularGeminiMode = normalized;
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }
    return normalized;
}

function _setGeminiLiveLinkEnabled(enabled) {
    const value = !!enabled;
    const cfg = _getGeminiLiveLinkConfig();
    const changed = !cfg || cfg.geminiLiveLinkEnabled !== value;
    if (cfg) {
        cfg.geminiLiveLinkEnabled = value;
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }
    if (changed) {
        try {
            window.dispatchEvent(new CustomEvent('eve:gemini-live-link-toggled', {
                detail: { enabled: value }
            }));
        } catch { /* optional host event */ }
        const sync = window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync;
        sync?.recordDataStreamMarker?.(`Context Relay ${value ? 'enabled' : 'disabled'}`, {
            relayEnabled: value
        });
    }
    return value;
}

function _setGeminiLiveLinkScopeMode(mode) {
    return window.GeminiLiveLinkScopeRuntime?.setScopeMode?.(mode) || 'auto';
}

function _setGeminiLiveLinkSelectedCard(value) {
    window.GeminiLiveLinkScopeRuntime?.setSelectedCard?.(value);
}

function _setGeminiLiveLinkDataStreamEnabled(enabled) {
    return !!window.GeminiLiveLinkScopeRuntime?.setDataStreamEnabled?.(enabled);
}

function _getGeminiLiveLinkSelectedScope() {
    return window.GeminiLiveLinkScopeRuntime?.getSelectedScope?.()
        || { scope: 'workspace', workspaceId: String(_getGeminiLiveLinkConfig()?.activeWorkspace || 'main'), source: 'fallback' };
}

function _formatGeminiLiveLinkNumber(value) {
    const number = Number(value) || 0;
    return number.toLocaleString();
}

function _escapeGeminiLiveLinkHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function _getGeminiLiveLinkActiveWorkspaceLabel(workspaceId) {
    const cfg = _getGeminiLiveLinkConfig() || {};
    const activeId = String(workspaceId || cfg.activeWorkspace || 'main');
    // Use the RECURSIVE helper so NESTED sub-tabs resolve to their name. A flat find only checked
    // top-level workspaces, so any sub-tab (or a recovered tab) fell back to showing its raw id.
    const helpers = window.EveWorkspaceHelpers;
    const workspace = helpers?.findById
        ? helpers.findById(cfg.workspaces || [], activeId)
        : (Array.isArray(cfg.workspaces) ? cfg.workspaces.find((item) => String(item?.id || '') === activeId) : null);
    return workspace?.name || activeId;
}

function _getGeminiLiveLinkRouteLabel(route) {
    if (route === 'websocket') return 'Live WebSocket';
    if (route === 'queued-websocket') return 'Queued for WebSocket';
    if (route === 'clipboard') return 'Clipboard fallback';
    if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) return 'Live WebSocket';
    if (typeof window.waitForConnection === 'function') return 'Auto-queue if offline';
    return 'Clipboard fallback';
}

function _buildPendingGeminiLiveLinkManifest(mode, selectedScope) {
    const scope = selectedScope || _getGeminiLiveLinkSelectedScope();
    const scopeMode = String(scope.scope || 'workspace').toLowerCase();
    const scopeLabel = scope.label || (scopeMode === 'all'
        ? 'Whole datapack'
        : (scopeMode === 'card' ? 'Specific card' : 'Selected tab scope'));
    const profile = _getGeminiLiveLinkModeProfile(mode || _getGeminiLiveLinkMode());
    const cfg = _getGeminiLiveLinkConfig() || {};
    const groupId = cfg.groupOverviewId;
    let activeGroupName = '';
    if (groupId) {
        const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
        const group = typeof groupsApi?.findGroupById === 'function' ? groupsApi.findGroupById(groupId, cfg) : null;
        activeGroupName = group?.name || 'Group Overview';
    }
    return {
        mode: profile.id,
        scope: scopeLabel,
        scopeMode,
        source: scope.source || 'search-monitor',
        activeWorkspaceId: scope.workspaceId || String(cfg.activeWorkspace || 'main'),
        activeWorkspaceName: scope.workspaceId ? _getGeminiLiveLinkActiveWorkspaceLabel(scope.workspaceId) : 'All tabs',
        activeGroupName: activeGroupName,
        categoryName: scope.categoryName || '',
        sampleLimit: profile.limit,
        messageChars: 0,
        counts: null,
        route: ''
    };
}

function _formatGeminiLiveLinkModeLabel(mode) {
    return _getGeminiLiveLinkModeProfile(mode).label;
}

function _withGeminiLiveLinkTimeout(promise, timeoutMs, label) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => {
            reject(new Error(`${label || 'Operation'} timed out after ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) window.clearTimeout(timer);
    });
}
    agentic.uiState = Object.freeze({
        GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS,
        _normalizeGeminiLiveLinkMode,
        _getGeminiLiveLinkModeProfile,
        _getGeminiLiveLinkConfig,
        _getGeminiLiveLinkMode,
        _getGeminiLiveLinkApi,
        _isGeminiLiveLinkEnabled,
        _getGeminiLiveLinkScopeMode,
        _isGeminiLiveLinkDataStreamEnabled,
        _isGeminiLiveLinkSettingsOpen,
        _setGeminiLiveLinkSettingsOpen,
        _setGeminiLiveLinkMode,
        _setGeminiLiveLinkEnabled,
        _setGeminiLiveLinkScopeMode,
        _setGeminiLiveLinkSelectedCard,
        _setGeminiLiveLinkDataStreamEnabled,
        _getGeminiLiveLinkSelectedScope,
        _formatGeminiLiveLinkNumber,
        _escapeGeminiLiveLinkHtml,
        _getGeminiLiveLinkActiveWorkspaceLabel,
        _getGeminiLiveLinkRouteLabel,
        _buildPendingGeminiLiveLinkManifest,
        _formatGeminiLiveLinkModeLabel,
        _withGeminiLiveLinkTimeout
    });
})();