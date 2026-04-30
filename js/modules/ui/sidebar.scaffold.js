window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.scaffoldReady) return;

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

    function isHoverRevealHoldTargetActive() {
        var sb = document.getElementById('sidebar');
        if (sb && sb.matches && sb.matches(':hover')) return true;
        if (document.querySelector('.tab-nav-popover [data-tab-nav-hover-preview]:hover')) return true;
        if (document.querySelector('#sidebar .ws-hover-reveal:hover')) return true;
        return false;
    }

    function queueHoverRevealDeactivation(delayMs) {
        var previewState = rt.previewState || (rt.previewState = {});
        window.clearTimeout(previewState.hideTimer || 0);
        previewState.hideTimer = window.setTimeout(function () {
            if (isHoverRevealHoldTargetActive()) return;
            if (!rt.isHoverRevealActive || !rt.isHoverRevealActive()) return;
            rt.setHoverRevealActive(false);
            syncHoverRevealContentVisibility();
        }, Math.max(0, Number(delayMs || 0) || 0));
    }

    function getHoverRevealPreviewState() {
        var previewState = rt.previewState || (rt.previewState = {});
        if (typeof previewState.revealRenderVersion !== 'number') previewState.revealRenderVersion = 0;
        if (typeof previewState.revealPreviewVersion !== 'number') previewState.revealPreviewVersion = -1;
        if (typeof previewState.revealPreviewQueued !== 'boolean') previewState.revealPreviewQueued = false;
        if (typeof previewState.revealPreviewReady !== 'boolean') previewState.revealPreviewReady = false;
        if (typeof previewState.revealPreviewVisible !== 'boolean') previewState.revealPreviewVisible = false;
        return previewState;
    }

    function getSidebarScrollMemory() {
        var scrollMemory = rt._sidebarScrollMemory || (rt._sidebarScrollMemory = {});
        if (typeof scrollMemory.contentTop !== 'number') scrollMemory.contentTop = 0;
        if (typeof scrollMemory.previewTop !== 'number') scrollMemory.previewTop = 0;
        if (typeof scrollMemory.visibleTop !== 'number') scrollMemory.visibleTop = 0;
        if (typeof scrollMemory.restoreToken !== 'number') scrollMemory.restoreToken = 0;
        return scrollMemory;
    }

    function bindSidebarScrollTracking(scaffold) {
        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : null;
        if (!targetScaffold) return;

        var scrollMemory = getSidebarScrollMemory();

        function bindHost(host, kind) {
            if (!host || host.__eveSidebarScrollTrackingBound) return;
            host.__eveSidebarScrollTrackingBound = true;
            host.addEventListener('scroll', function () {
                if (rt._sidebarSuppressScrollTracking) return;
                var nextTop = Number(host.scrollTop || 0);
                if (kind === 'preview') {
                    scrollMemory.previewTop = nextTop;
                    if (rt.isHoverRevealActive && rt.isHoverRevealActive()) {
                        scrollMemory.visibleTop = nextTop;
                    }
                    return;
                }

                scrollMemory.contentTop = nextTop;
                if (!(rt.isHoverRevealActive && rt.isHoverRevealActive())) {
                    scrollMemory.visibleTop = nextTop;
                }
            }, { passive: true });
        }

        bindHost(targetScaffold.contentHost, 'content');
        bindHost(targetScaffold.previewHost, 'preview');
    }

    function captureSidebarScrollState(scaffold) {
        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : null;
        var scrollMemory = getSidebarScrollMemory();
        if (!targetScaffold) {
            return {
                contentTop: 0,
                previewTop: 0,
                visibleTop: 0
            };
        }

        var contentTop = targetScaffold.contentHost ? Number(targetScaffold.contentHost.scrollTop || 0) : 0;
        var previewTop = targetScaffold.previewHost ? Number(targetScaffold.previewHost.scrollTop || 0) : 0;
        var visibleTop = targetScaffold.previewHost && !targetScaffold.previewHost.hidden
            ? previewTop
            : contentTop;

        if (rt._sidebarSuppressScrollTracking) {
            if (Number.isFinite(scrollMemory.contentTop)) contentTop = Number(scrollMemory.contentTop || 0);
            if (Number.isFinite(scrollMemory.previewTop)) previewTop = Number(scrollMemory.previewTop || 0);
            if (Number.isFinite(scrollMemory.visibleTop)) visibleTop = Number(scrollMemory.visibleTop || 0);
        }

        return {
            contentTop: contentTop,
            previewTop: previewTop,
            visibleTop: visibleTop
        };
    }

    function restoreSidebarScrollState(scaffold, state) {
        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : null;
        var scrollState = state && typeof state === 'object' ? state : null;
        if (!targetScaffold || !scrollState) return;

        var scrollMemory = getSidebarScrollMemory();

        if (targetScaffold.contentHost && Number.isFinite(scrollState.contentTop)) {
            targetScaffold.contentHost.scrollTop = scrollState.contentTop;
            scrollMemory.contentTop = Number(targetScaffold.contentHost.scrollTop || 0);
        }
        if (targetScaffold.previewHost && Number.isFinite(scrollState.previewTop)) {
            targetScaffold.previewHost.scrollTop = scrollState.previewTop;
            scrollMemory.previewTop = Number(targetScaffold.previewHost.scrollTop || 0);
        }

        if (!Number.isFinite(scrollState.visibleTop)) return;

        var previewVisible = !!(targetScaffold.previewHost && !targetScaffold.previewHost.hidden);
        if (previewVisible && targetScaffold.previewHost) {
            targetScaffold.previewHost.scrollTop = scrollState.visibleTop;
            scrollMemory.previewTop = Number(targetScaffold.previewHost.scrollTop || 0);
            scrollMemory.visibleTop = scrollMemory.previewTop;
        } else if (targetScaffold.contentHost) {
            targetScaffold.contentHost.scrollTop = scrollState.visibleTop;
            scrollMemory.contentTop = Number(targetScaffold.contentHost.scrollTop || 0);
            scrollMemory.visibleTop = scrollMemory.contentTop;
        }
    }

    function getSidebarActiveScrollHost(scaffold) {
        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : null;
        if (!targetScaffold) return null;
        if (targetScaffold.previewHost && !targetScaffold.previewHost.hidden) {
            return targetScaffold.previewHost;
        }
        return targetScaffold.contentHost || null;
    }

    function maybeAutoScrollSidebarDrag(scaffold, event) {
        var scrollHost = getSidebarActiveScrollHost(scaffold);
        if (!scrollHost || !Number.isFinite(event?.clientY)) return;

        var rect = typeof scrollHost.getBoundingClientRect === 'function'
            ? scrollHost.getBoundingClientRect()
            : null;
        if (!rect || rect.height <= 0) return;

        var edgeThreshold = Math.max(40, Math.min(72, rect.height * 0.14));
        var delta = 0;

        if (event.clientY < rect.top + edgeThreshold) {
            var topRatio = 1 - ((event.clientY - rect.top) / edgeThreshold);
            delta = -Math.ceil(6 + (Math.max(0, topRatio) * 20));
        } else if (event.clientY > rect.bottom - edgeThreshold) {
            var bottomRatio = 1 - ((rect.bottom - event.clientY) / edgeThreshold);
            delta = Math.ceil(6 + (Math.max(0, bottomRatio) * 20));
        }

        if (!delta) return;

        var previousTop = Number(scrollHost.scrollTop || 0);
        scrollHost.scrollTop = previousTop + delta;
        var nextTop = Number(scrollHost.scrollTop || 0);
        if (nextTop === previousTop) return;

        var scrollMemory = getSidebarScrollMemory();
        if (scrollHost === scaffold.previewHost) {
            scrollMemory.previewTop = nextTop;
        } else {
            scrollMemory.contentTop = nextTop;
        }
        scrollMemory.visibleTop = nextTop;
    }

    function syncHoverRevealContentVisibility(scaffold) {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        var targetScaffold = scaffold && scaffold.contentHost ? scaffold : ensureSidebarScaffold(sb);
        bindSidebarScrollTracking(targetScaffold);
        var previewState = getHoverRevealPreviewState();
        var revealActive = !!(rt.isHoverRevealActive && rt.isHoverRevealActive());
        var previewReady = !!previewState.revealPreviewReady
            && !!targetScaffold.previewHost
            && targetScaffold.previewHost.childElementCount > 0;
        var nextPreviewVisible = revealActive && previewReady;

        if (targetScaffold.contentHost && targetScaffold.previewHost) {
            if (nextPreviewVisible && !previewState.revealPreviewVisible) {
                targetScaffold.previewHost.scrollTop = Number(targetScaffold.contentHost.scrollTop || 0);
            } else if (!nextPreviewVisible && previewState.revealPreviewVisible) {
                targetScaffold.contentHost.scrollTop = Number(targetScaffold.previewHost.scrollTop || 0);
            }
        }

        previewState.revealPreviewVisible = nextPreviewVisible;

        if (targetScaffold.contentHost) {
            targetScaffold.contentHost.hidden = nextPreviewVisible;
            targetScaffold.contentHost.setAttribute('aria-hidden', nextPreviewVisible ? 'true' : 'false');
        }
        if (targetScaffold.previewHost) {
            targetScaffold.previewHost.hidden = !nextPreviewVisible;
            targetScaffold.previewHost.setAttribute('aria-hidden', nextPreviewVisible ? 'false' : 'true');
        }
    }

    function renderSidebarContentHost(sb, host, options) {
        var opts = options && typeof options === 'object' ? options : {};
        if (!sb || !host) return;
        host.scrollTop = 0;
        host.innerHTML = '';

        var ctx = rt.createRenderContext(sb, {
            hoverRevealOverride: typeof opts.hoverRevealOverride === 'boolean'
                ? opts.hoverRevealOverride
                : null,
            hoverRevealOverrides: opts.hoverRevealOverrides && typeof opts.hoverRevealOverrides === 'object'
                ? opts.hoverRevealOverrides
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

    function buildHoverRevealPreview(sb, scaffold) {
        if (!sb || !scaffold || !scaffold.previewHost) return false;
        if (config.sidebarHidden) return false;

        var previewState = getHoverRevealPreviewState();
        var hoverRevealOverrides = rt.getHoverRevealPreviewOptions
            ? rt.getHoverRevealPreviewOptions()
            : { showInactiveTabs: true, showHiddenGroups: true };
        renderSidebarContentHost(sb, scaffold.previewHost, {
            hoverRevealOverrides: hoverRevealOverrides || { showInactiveTabs: true, showHiddenGroups: true },
            resetRegistry: false,
            syncFocusedGroupState: false
        });
        previewState.revealPreviewReady = true;
        previewState.revealPreviewVersion = previewState.revealRenderVersion;
        syncHoverRevealContentVisibility(scaffold);
        return true;
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

            buildHoverRevealPreview(sb, scaffold);
        }, 12);
    }

    function invalidateHoverRevealPreview(options) {
        var opts = options && typeof options === 'object' ? options : {};
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        var scaffold = ensureSidebarScaffold(sb);
        var previewState = getHoverRevealPreviewState();
        previewState.revealRenderVersion += 1;
        previewState.revealPreviewReady = false;
        previewState.revealPreviewVersion = -1;

        if (scaffold.previewHost) {
            scaffold.previewHost.innerHTML = '';
            scaffold.previewHost.hidden = true;
            scaffold.previewHost.setAttribute('aria-hidden', 'true');
        }

        if (opts.rebuildIfActive && rt.isHoverRevealActive && rt.isHoverRevealActive()) {
            buildHoverRevealPreview(sb, scaffold);
        } else if (opts.queue === true && !config.sidebarHidden) {
            queueHoverRevealPreviewBuild(sb, scaffold);
        }

        syncHoverRevealContentVisibility(scaffold);
    }

    function activateHoverRevealPreview(options) {
        if (!rt.setHoverRevealActive) return false;
        rt.setHoverRevealActive(true, options);

        var sb = document.getElementById('sidebar');
        if (!sb || config.sidebarHidden) return false;
        var scaffold = ensureSidebarScaffold(sb);
        var previewState = getHoverRevealPreviewState();
        previewState.revealPreviewReady = false;
        previewState.revealPreviewVersion = -1;
        buildHoverRevealPreview(sb, scaffold);
        syncHoverRevealContentVisibility(scaffold);
        return true;
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
            activateHoverRevealPreview({ showInactiveTabs: true, showHiddenGroups: true });
        };
        previewBtn.onmouseleave = function () {
            queueHoverRevealDeactivation(450);
        };
        return previewBtn;
    }

    function ensureSidebarScaffold(sb) {
        if (sb && !sb.__eveSidebarHoverRevealLeaveBound) {
            sb.__eveSidebarHoverRevealLeaveBound = true;
            sb.addEventListener('mouseenter', function () {
                var previewState = rt.previewState || (rt.previewState = {});
                window.clearTimeout(previewState.hideTimer || 0);
            });
            sb.addEventListener('mouseleave', function () {
                queueHoverRevealDeactivation(240);
            });
        }

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

    rt.ensureSidebarScaffold = ensureSidebarScaffold;
    rt.bindSidebarScrollTracking = bindSidebarScrollTracking;
    rt.captureSidebarScrollState = captureSidebarScrollState;
    rt.restoreSidebarScrollState = restoreSidebarScrollState;
    rt.getSidebarScrollMemory = getSidebarScrollMemory;
    rt.getHoverRevealPreviewState = getHoverRevealPreviewState;
    rt.syncHoverRevealContentVisibility = syncHoverRevealContentVisibility;
    rt.renderSidebarContentHost = renderSidebarContentHost;
    rt.buildHoverRevealPreview = buildHoverRevealPreview;
    rt.queueHoverRevealPreviewBuild = queueHoverRevealPreviewBuild;
    rt.invalidateHoverRevealPreview = invalidateHoverRevealPreview;
    rt.activateHoverRevealPreview = activateHoverRevealPreview;
    rt.queueHoverRevealDeactivation = queueHoverRevealDeactivation;
    rt.maybeAutoScrollSidebarDrag = maybeAutoScrollSidebarDrag;
    rt.scaffoldReady = true;
})();
