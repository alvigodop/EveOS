// --- SIDEBAR UI ---

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime = window.EveSidebarRuntime || {};
    if (rt.ready) return;
    if (!rt.sharedReady || !rt.interactionsReady || !rt.groupsReady || !rt.workspaceReady || !rt.popoutReady) {
        console.warn('EveSidebar: runtime modules missing');
        return;
    }

    function buildUnidexButton() {
        var unidexBtn = document.createElement('div');
        unidexBtn.className = 'ws-item ws-unidex ' + (config.viewMode === 'unidex' ? 'active' : '');
        unidexBtn.innerHTML = '\u{1F9ED} <span class="ws-label">Unidex Layer</span>';
        unidexBtn.title = 'Open Unidex View';
        unidexBtn.oncontextmenu = function (e) {
            if (typeof showUnidexContextMenu === 'function') showUnidexContextMenu(e);
        };
        unidexBtn.onclick = function () {
            if (typeof openUnidexView === 'function') {
                openUnidexView();
            } else {
                config.viewMode = 'unidex';
                if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
                    window.UnidexView.resetSelection();
                }
                saveConfig();
                if (typeof renderDashboard === 'function') renderDashboard();
            }
        };
        return unidexBtn;
    }

    function buildAddButton(ctx) {
        var addBtn = document.createElement('div');
        addBtn.className = 'ws-item ws-add';
        addBtn.innerHTML = '+ <span class="ws-label">Add / Drop</span>';
        addBtn.onclick = function () {
            openWorkspaceModal(null);
        };
        addBtn.ondragover = function (e) {
            if (!ctx.getDraggedWorkspaceId() && !ctx.getDraggedGroupId()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        addBtn.ondragenter = function (e) {
            if (!ctx.getDraggedWorkspaceId() && !ctx.getDraggedGroupId()) return;
            e.preventDefault();
            addBtn.classList.add('ws-drop-target');
        };
        addBtn.ondragleave = function () {
            addBtn.classList.remove('ws-drop-target');
        };
        addBtn.ondrop = function (e) {
            e.preventDefault();
            e.stopPropagation();
            addBtn.classList.remove('ws-drop-target');

            var dragGroupId = ctx.getDraggedGroupId();
            if (dragGroupId) {
                if (ctx.moveGroupToParentContext(dragGroupId, '', null)) ctx.saveAndRefresh(false);
                return;
            }

            var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId) return;
            if (ctx.promoteToRoot(dragId, null, [], 0)) ctx.saveAndRefresh(true);
        };
        return addBtn;
    }

    function queueHoverRevealDeactivation() {
        var previewState = rt.previewState || (rt.previewState = {});
        window.clearTimeout(previewState.hideTimer || 0);
        previewState.hideTimer = window.setTimeout(function () {
            var hoveredPreview = document.querySelector('#sidebar .ws-hover-reveal:hover');
            if (hoveredPreview) return;
            if (!rt.isHoverRevealActive || !rt.isHoverRevealActive()) return;
            rt.setHoverRevealActive(false);
            if (typeof window.renderSidebar === 'function') window.renderSidebar();
        }, 0);
    }

    function buildHoverRevealButton() {
        var previewBtn = document.createElement('div');
        previewBtn.className = 'ws-item ws-hover-reveal' + ((rt.isHoverRevealActive && rt.isHoverRevealActive()) ? ' active' : '');
        previewBtn.innerHTML = '<span class="ws-hover-reveal-icon">\u{1F441}</span><span class="ws-label">Hover: Show All Hidden</span>';
        previewBtn.title = 'Hover to temporarily show hidden tabs, inactive tabs, and hidden groups';
        previewBtn.setAttribute('aria-hidden', 'true');
        previewBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
        };
        previewBtn.onmouseenter = function () {
            if (!rt.setHoverRevealActive) return;
            if (rt.isHoverRevealActive && rt.isHoverRevealActive()) return;
            rt.setHoverRevealActive(true);
            if (typeof window.renderSidebar === 'function') window.renderSidebar();
        };
        previewBtn.onmouseleave = function () {
            queueHoverRevealDeactivation();
        };
        return previewBtn;
    }

    window.toggleSidebarVisibility = function () {
        config.sidebarHidden = !config.sidebarHidden;
        saveConfig();
        var sb = document.getElementById('sidebar');
        if (sb) sb.classList.toggle('hidden-completely', !!config.sidebarHidden);
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
    };

    window.renderSidebar = function () {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        var ctx = rt.createRenderContext(sb);

        sb.innerHTML = '';
        sb.classList.toggle('ultra-collapsed', !!config.ultraCollapseSidebar);
        sb.classList.toggle('hidden-completely', !!config.sidebarHidden);
        sb.classList.toggle('ws-hover-reveal-active', !!(rt.isHoverRevealActive && rt.isHoverRevealActive()));

        sb.appendChild(buildUnidexButton());

        var divider = document.createElement('div');
        divider.className = 'ws-divider';
        sb.appendChild(divider);

        ctx.syncFocusedGroupState();

        sb.ondragover = function (e) {
            var dragId = ctx.getDraggedWorkspaceId();
            if (!dragId) return;

            var targetElement = ctx.resolveEventTargetElement(e);
            var targetWorkspaceId = ctx.resolveWorkspaceDropTargetId(targetElement, dragId);
            if (!targetWorkspaceId) return;

            ctx.setHoveredWorkspaceTarget(targetWorkspaceId);
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };

        sb.ondrop = function (e) {
            var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId) return;

            var targetElement = ctx.resolveEventTargetElement(e);
            var targetWorkspaceId = ctx.resolveWorkspaceDropTargetId(targetElement, dragId);
            if (!targetWorkspaceId || dragId === targetWorkspaceId) return;

            e.preventDefault();
            e.stopPropagation();
            if (rt.handleSidebarWorkspaceDrop(ctx, dragId, targetWorkspaceId)) {
                ctx.saveAndRefresh(true);
            }
        };

        rt.renderRootTree(ctx);
        sb.appendChild(buildAddButton(ctx));
        sb.appendChild(buildHoverRevealButton());
    };

    rt.ready = true;
})();
