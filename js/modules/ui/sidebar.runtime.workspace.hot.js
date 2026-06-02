window.EveSidebarRuntime = window.EveSidebarRuntime || {};
(function () {
    'use strict';
    var rt = window.EveSidebarRuntime;
    if (rt.workspaceHotReady) return;
    function isFrequentWorkspace(ws) {
        return !!window.EveDashboardHydrationMemory?.isWorkspaceFrequent?.(ws?.id);
    }
    function makeDragSafeBadge(text, title, nativeDragEnabled, startWorkspaceDrag, endWorkspaceDrag) {
        var badge = document.createElement('span');
        badge.className = 'ws-summary-chip ws-summary-chip--frequent';
        badge.textContent = text || '';
        badge.title = title;
        badge.setAttribute('aria-label', title);
        badge.setAttribute('draggable', nativeDragEnabled ? 'true' : 'false');
        badge.draggable = nativeDragEnabled;
        badge.ondragstart = function (e) {
            e.stopPropagation();
            return startWorkspaceDrag(e);
        };
        badge.ondragend = function (e) {
            e.stopPropagation();
            endWorkspaceDrag(e);
        };
        return badge;
    }
    function appendFrequentWorkspaceBadge(item, ws, nativeDragEnabled, startWorkspaceDrag, endWorkspaceDrag) {
        if (!isFrequentWorkspace(ws)) return false;
        item.classList.add('ws-frequent');
        item.appendChild(makeDragSafeBadge(
            '',
            'Frequent tab: EveOS may auto-load remembered cards here.',
            nativeDragEnabled,
            startWorkspaceDrag,
            endWorkspaceDrag
        ));
        return true;
    }
    Object.assign(rt, {
        isFrequentWorkspace,
        appendFrequentWorkspaceBadge,
        workspaceHotReady: true
    });
})();
