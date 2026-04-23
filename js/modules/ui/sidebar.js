// --- SIDEBAR UI ---

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime = window.EveSidebarRuntime || {};
    if (rt.ready) return;
    if (!rt.sharedReady || !rt.interactionsReady || !rt.groupsReady || !rt.workspaceReady || !rt.popoutReady) {
        console.warn('EveSidebar: runtime modules missing');
        return;
    }

    var SIDEBAR_HEAVY_NODE_THRESHOLD = 80;

    function buildUnidexButton() {
        var unidexBtn = document.createElement('div');
        unidexBtn.className = 'ws-item ws-unidex ' + (config.viewMode === 'unidex' ? 'active' : '');
        if (typeof rt.registerUnidexButtonElement === 'function') {
            rt.registerUnidexButtonElement(unidexBtn);
        }
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
                if (typeof rt.syncSidebarViewState === 'function') rt.syncSidebarViewState();
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
            syncHoverRevealContentVisibility();
        }, 0);
    }

    function getHoverRevealPreviewState() {
        var previewState = rt.previewState || (rt.previewState = {});
        if (typeof previewState.revealRenderVersion !== 'number') previewState.revealRenderVersion = 0;
        if (typeof previewState.revealPreviewVersion !== 'number') previewState.revealPreviewVersion = -1;
        if (typeof previewState.revealPreviewQueued !== 'boolean') previewState.revealPreviewQueued = false;
        if (typeof previewState.revealPreviewReady !== 'boolean') previewState.revealPreviewReady = false;
        return previewState;
    }

    function syncHoverRevealContentVisibility(scaffold) {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : ensureSidebarScaffold(sb);
        var previewState = getHoverRevealPreviewState();
        var revealActive = !!(rt.isHoverRevealActive && rt.isHoverRevealActive());
        var previewReady = !!previewState.revealPreviewReady
            && !!targetScaffold.previewHost
            && targetScaffold.previewHost.childElementCount > 0;

        if (targetScaffold.contentHost) {
            targetScaffold.contentHost.hidden = revealActive && previewReady;
            targetScaffold.contentHost.setAttribute('aria-hidden', revealActive && previewReady ? 'true' : 'false');
        }
        if (targetScaffold.previewHost) {
            targetScaffold.previewHost.hidden = !(revealActive && previewReady);
            targetScaffold.previewHost.setAttribute('aria-hidden', revealActive && previewReady ? 'false' : 'true');
        }
    }

    function renderSidebarContentHost(sb, host, options) {
        var opts = options && typeof options === 'object' ? options : {};
        if (!sb || !host) return;
        host.innerHTML = '';

        var ctx = rt.createRenderContext(sb, {
            hoverRevealOverride: typeof opts.hoverRevealOverride === 'boolean'
                ? opts.hoverRevealOverride
                : null
        });

        if (opts.resetRegistry && typeof rt.resetSidebarElementRegistry === 'function') {
            rt.resetSidebarElementRegistry();
        }
        if (opts.syncFocusedGroupState) {
            ctx.syncFocusedGroupState();
        }

        host.appendChild(buildUnidexButton());

        var divider = document.createElement('div');
        divider.className = 'ws-divider';
        host.appendChild(divider);

        var originalHost = ctx.sb;
        ctx.sb = host;
        rt.renderRootTree(ctx);
        ctx.sb.appendChild(buildAddButton(ctx));
        ctx.sb = originalHost;
    }

    function queueHoverRevealPreviewBuild(sb, scaffold) {
        if (!sb || !scaffold || !scaffold.previewHost) return;
        var previewState = getHoverRevealPreviewState();
        if (previewState.revealPreviewQueued) return;

        previewState.revealPreviewQueued = true;
        var renderVersion = previewState.revealRenderVersion;

        window.setTimeout(function () {
            previewState.revealPreviewQueued = false;
            if (previewState.revealRenderVersion !== renderVersion) return;
            if (config.sidebarHidden) return;

            renderSidebarContentHost(sb, scaffold.previewHost, {
                hoverRevealOverride: true,
                resetRegistry: false,
                syncFocusedGroupState: false
            });
            previewState.revealPreviewReady = true;
            previewState.revealPreviewVersion = renderVersion;
            syncHoverRevealContentVisibility(scaffold);
        }, 48);
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
            var sb = document.getElementById('sidebar');
            if (!sb) return;
            var scaffold = ensureSidebarScaffold(sb);
            var previewState = getHoverRevealPreviewState();
            if (!previewState.revealPreviewReady || !scaffold.previewHost || scaffold.previewHost.childElementCount === 0) {
                renderSidebarContentHost(sb, scaffold.previewHost, {
                    hoverRevealOverride: true,
                    resetRegistry: false,
                    syncFocusedGroupState: false
                });
                previewState.revealPreviewReady = true;
                previewState.revealPreviewVersion = previewState.revealRenderVersion;
            }
            syncHoverRevealContentVisibility(scaffold);
        };
        previewBtn.onmouseleave = function () {
            queueHoverRevealDeactivation();
        };
        return previewBtn;
    }

    function ensureSidebarScaffold(sb) {
        var contentHost = sb.querySelector('.ws-sidebar-content');
        if (!contentHost) {
            contentHost = document.createElement('div');
            contentHost.className = 'ws-sidebar-content';
            sb.appendChild(contentHost);
        }

        var previewHost = sb.querySelector('.ws-sidebar-content--hover-preview');
        if (!previewHost) {
            previewHost = document.createElement('div');
            previewHost.className = 'ws-sidebar-content ws-sidebar-content--hover-preview';
            previewHost.hidden = true;
            previewHost.setAttribute('aria-hidden', 'true');
            sb.appendChild(previewHost);
        } else if (previewHost.parentNode !== sb) {
            sb.appendChild(previewHost);
        }

        var footerHost = sb.querySelector('.ws-sidebar-footer');
        if (!footerHost) {
            footerHost = document.createElement('div');
            footerHost.className = 'ws-sidebar-footer';
            sb.appendChild(footerHost);
        } else if (footerHost.parentNode !== sb) {
            sb.appendChild(footerHost);
        }

        var previewBtn = footerHost.querySelector('.ws-hover-reveal');
        if (!previewBtn) {
            previewBtn = buildHoverRevealButton();
            footerHost.appendChild(previewBtn);
        }

        if (typeof rt.syncHoverRevealUiState === 'function') rt.syncHoverRevealUiState();

        return {
            contentHost: contentHost,
            previewHost: previewHost,
            footerHost: footerHost,
            previewBtn: previewBtn
        };
    }

    function estimateSidebarNodeCount() {
        var workspaceCount = Array.isArray(config?.workspaces) ? config.workspaces.length : 0;
        var groupCount = Array.isArray(config?.sidebarGroups) ? config.sidebarGroups.length : 0;
        return workspaceCount + groupCount;
    }

    function isSidebarExpanded() {
        return !!config.sidebarExpanded;
    }

    function setSidebarExpanded(nextValue, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var nextExpanded = !!nextValue;
        if (!!config.sidebarExpanded === nextExpanded && !opts.forceSync) return nextExpanded;
        config.sidebarExpanded = nextExpanded;
        if (opts.persist !== false && typeof saveConfig === 'function') {
            saveConfig({ immediate: true });
        }
        var sb = document.getElementById('sidebar');
        if (sb) syncSidebarShellState(sb);
        return nextExpanded;
    }

    function bindSidebarToggleBehavior(sb) {
        if (!sb || sb.__eveSidebarToggleBound) return;
        sb.__eveSidebarToggleBound = true;
        sb.addEventListener('click', function (event) {
            if (config.sidebarHidden) return;
            var target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            if (target.closest('.ws-hover-reveal')) return;

            var interactiveTarget = target.closest('.ws-item, .ws-group-header, .ws-toggle, .ws-order-slot');
            if (interactiveTarget) return;

            setSidebarExpanded(!isSidebarExpanded());
        });
    }

    function syncSidebarShellState(sb) {
        if (!sb) return;
        if (typeof config.sidebarExpanded !== 'boolean') config.sidebarExpanded = false;
        sb.classList.toggle('is-expanded', !!config.sidebarExpanded);
        sb.classList.toggle('ultra-collapsed', !!config.ultraCollapseSidebar);
        sb.classList.toggle('hidden-completely', !!config.sidebarHidden);
        sb.classList.toggle('ws-hover-reveal-active', !!(rt.isHoverRevealActive && rt.isHoverRevealActive()));
        sb.classList.toggle('ws-heavy', estimateSidebarNodeCount() >= SIDEBAR_HEAVY_NODE_THRESHOLD);
        sb.setAttribute('aria-expanded', config.sidebarExpanded ? 'true' : 'false');
    }

    window.toggleSidebarVisibility = function () {
        config.sidebarHidden = !config.sidebarHidden;
        saveConfig();
        var sb = document.getElementById('sidebar');
        var wasHidden = !!(sb && sb.classList.contains('hidden-completely'));
        if (sb) syncSidebarShellState(sb);
        if (config.sidebarHidden) return;
        if (wasHidden && !rt.sidebarDirtyWhileHidden && sb?.querySelector('.ws-sidebar-content')?.childElementCount) {
            if (typeof rt.syncHoverRevealUiState === 'function') rt.syncHoverRevealUiState();
            return;
        }
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
    };

    window.renderSidebar = function () {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        bindSidebarToggleBehavior(sb);
        var scaffold = ensureSidebarScaffold(sb);
        var ctx = rt.createRenderContext(sb);
        syncSidebarShellState(sb);
        syncHoverRevealContentVisibility(scaffold);
        if (config.sidebarHidden) {
            rt.sidebarDirtyWhileHidden = true;
            return;
        }
        rt.sidebarDirtyWhileHidden = false;
        var previewState = getHoverRevealPreviewState();
        previewState.revealRenderVersion += 1;
        previewState.revealPreviewReady = false;
        previewState.revealPreviewVersion = -1;
        scaffold.previewHost.innerHTML = '';
        scaffold.previewHost.hidden = true;
        scaffold.previewHost.setAttribute('aria-hidden', 'true');

        renderSidebarContentHost(sb, scaffold.contentHost, {
            hoverRevealOverride: false,
            resetRegistry: true,
            syncFocusedGroupState: true
        });

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

        if (typeof rt.captureSidebarViewState === 'function') rt.captureSidebarViewState();
        if (typeof rt.syncHoverRevealUiState === 'function') rt.syncHoverRevealUiState();
        syncHoverRevealContentVisibility(scaffold);
        queueHoverRevealPreviewBuild(sb, scaffold);
    };

    window.toggleSidebarExpanded = function (nextValue) {
        if (typeof nextValue === 'boolean') return setSidebarExpanded(nextValue);
        return setSidebarExpanded(!isSidebarExpanded());
    };

    rt.ready = true;
})();
