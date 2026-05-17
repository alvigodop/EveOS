window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.workspacePointerDragReady) return;

    rt.attachNestedWorkspacePointerDrag = function attachNestedWorkspacePointerDrag(ctx, item, ws) {
            var pointerDrag = null;
            var LONG_PRESS_DRAG_MS = 120;
            var SORT_MODE_DRAG_MS = 45;
            var NORMAL_MOVE_THRESHOLD_PX = 2;
            var SORT_MODE_MOVE_THRESHOLD_PX = 1;

            function isSortModeActive() {
                return !!(rt.isSidebarSortModeActive && rt.isSidebarSortModeActive());
            }

            function clearPointerDropTarget() {
                if (pointerDrag && pointerDrag.dropTarget && pointerDrag.dropTarget.classList) {
                    pointerDrag.dropTarget.classList.remove('ws-drop-target');
                }
                if (pointerDrag) pointerDrag.dropTarget = null;
            }

            function clearPointerDragTimer() {
                if (!pointerDrag || !pointerDrag.timer) return;
                clearTimeout(pointerDrag.timer);
                pointerDrag.timer = 0;
            }

            function destroyPointerDragPreview(drag) {
                var state = drag || pointerDrag;
                if (!state || !state.preview) return;
                if (state.preview.parentNode) {
                    state.preview.parentNode.removeChild(state.preview);
                }
                state.preview = null;
            }

            function clearPointerDrag() {
                destroyPointerDragPreview(pointerDrag);
                clearPointerDropTarget();
                clearPointerDragTimer();
                pointerDrag = null;
            }

            function resolvePointerDropTarget(event) {
                if (!event || typeof document.elementFromPoint !== 'function') return null;
                var pointTarget = document.elementFromPoint(event.clientX, event.clientY);
                if (!(pointTarget instanceof Element)) return null;
                var slotTarget = pointTarget.closest('.ws-order-slot');
                if (slotTarget && typeof slotTarget.__eveSidebarApplyPointerDrop === 'function') {
                    return slotTarget;
                }
                var itemTarget = pointTarget.closest('.ws-item[data-ws-id]');
                if (itemTarget && itemTarget !== item && typeof itemTarget.__eveSidebarApplyPointerDrop === 'function') {
                    return itemTarget;
                }
                var groupTarget = pointTarget.closest('.ws-group-header, .ws-group-body');
                if (groupTarget && typeof groupTarget.__eveSidebarApplyPointerDrop === 'function') {
                    return groupTarget;
                }
                return null;
            }

            function maybeScrollPointerDrag(event) {
                var host = item.closest('.ws-sidebar-content');
                if (!host || !Number.isFinite(event?.clientY)) return;
                var rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
                if (!rect || rect.height <= 0) return;
                var edge = Math.min(48, rect.height / 4);
                var y = Number(event.clientY);
                if (y < rect.top + edge) host.scrollTop -= 14;
                else if (y > rect.bottom - edge) host.scrollTop += 14;
            }

            function updatePointerDragPreview(event) {
                if (!pointerDrag || !pointerDrag.preview || !event) return;
                var x = Number(event.clientX) - Number(pointerDrag.previewOffsetX || 0);
                var y = Number(event.clientY) - Number(pointerDrag.previewOffsetY || 0);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                pointerDrag.preview.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
            }

            function createPointerDragPreview(event) {
                if (!pointerDrag || pointerDrag.preview || !document.body) return;
                var rect = typeof item.getBoundingClientRect === 'function' ? item.getBoundingClientRect() : null;
                var preview = item.cloneNode(true);
                preview.classList.remove('ws-dragging', 'ws-pointer-dragging', 'ws-drop-target', 'ws-drop-target-card');
                preview.classList.add('ws-pointer-drag-preview');
                preview.removeAttribute('id');
                preview.removeAttribute('aria-label');
                preview.setAttribute('aria-hidden', 'true');
                preview.draggable = false;
                preview.querySelectorAll('[draggable]').forEach(function (node) {
                    node.setAttribute('draggable', 'false');
                    node.draggable = false;
                });

                if (rect && rect.width > 0) {
                    preview.style.width = rect.width + 'px';
                    preview.style.minWidth = rect.width + 'px';
                }
                if (rect && rect.height > 0) {
                    preview.style.height = rect.height + 'px';
                }

                pointerDrag.previewOffsetX = rect ? (Number(event.clientX) - rect.left) : 16;
                pointerDrag.previewOffsetY = rect ? (Number(event.clientY) - rect.top) : 16;
                document.body.appendChild(preview);
                pointerDrag.preview = preview;
                updatePointerDragPreview(event);
            }

            function beginPointerWorkspaceDrag(event) {
                if (!pointerDrag || pointerDrag.started) return;
                pointerDrag.started = true;
                clearPointerDragTimer();
                rt._lastWorkspaceDragStartTime = Date.now();
                rt._isDraggingWorkspace = true;
                if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                    ctx.markRecentWorkspaceDragGesture(420);
                }
                ctx.setDragState('workspace', ws.id);
                item.classList.add('ws-dragging');
                item.classList.add('ws-pointer-dragging');
                createPointerDragPreview(event);
                if (typeof item.setPointerCapture === 'function') {
                    try { item.setPointerCapture(pointerDrag.pointerId); } catch (err) { /* ignore lost capture */ }
                }
                if (event && typeof event.preventDefault === 'function') event.preventDefault();
            }

            item.onpointerdown = function (event) {
                if (event.button !== 0) return;
                var target = event.target instanceof Element ? event.target : null;
                if (target && target.closest('.ws-toggle')) return;
                clearPointerDrag();
                pointerDrag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    sortMode: isSortModeActive(),
                    started: false,
                    dropTarget: null,
                    timer: 0
                };
                if (pointerDrag.sortMode && typeof event.preventDefault === 'function') {
                    event.preventDefault();
                }
                pointerDrag.timer = setTimeout(function () {
                    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId || pointerDrag.started) return;
                    beginPointerWorkspaceDrag(event);
                }, pointerDrag.sortMode ? SORT_MODE_DRAG_MS : LONG_PRESS_DRAG_MS);
            };

            item.onpointermove = function (event) {
                if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
                var dx = Number(event.clientX) - pointerDrag.startX;
                var dy = Number(event.clientY) - pointerDrag.startY;
                var threshold = pointerDrag.sortMode ? SORT_MODE_MOVE_THRESHOLD_PX : NORMAL_MOVE_THRESHOLD_PX;
                if (!pointerDrag.started && Math.sqrt((dx * dx) + (dy * dy)) < threshold) return;

                beginPointerWorkspaceDrag(event);
                updatePointerDragPreview(event);
                maybeScrollPointerDrag(event);

                var nextTarget = resolvePointerDropTarget(event);
                if (nextTarget !== pointerDrag.dropTarget) {
                    clearPointerDropTarget();
                    pointerDrag.dropTarget = nextTarget;
                    if (nextTarget && nextTarget.classList) nextTarget.classList.add('ws-drop-target');
                }
                event.preventDefault();
            };

            item.onpointerup = function (event) {
                if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
                var activeDrag = pointerDrag;
                var dropTarget = activeDrag.dropTarget || (activeDrag.started ? resolvePointerDropTarget(event) : null);
                clearPointerDropTarget();
                clearPointerDragTimer();
                destroyPointerDragPreview(activeDrag);
                pointerDrag = null;
                if (typeof item.releasePointerCapture === 'function') {
                    try { item.releasePointerCapture(activeDrag.pointerId); } catch (err) { /* ignore lost capture */ }
                }

                if (!activeDrag.started) return;
                event.preventDefault();
                event.stopPropagation();

                item.classList.remove('ws-dragging');
                item.classList.remove('ws-pointer-dragging');
                rt._isDraggingWorkspace = false;
                if (dropTarget && typeof dropTarget.__eveSidebarApplyPointerDrop === 'function'
                    && dropTarget.__eveSidebarApplyPointerDrop(ws.id)) {
                    ctx.clearDragState();
                    ctx.saveAndRefresh(true);
                    return;
                }
                ctx.clearDragState();
            };

            item.onpointercancel = function (event) {
                if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
                clearPointerDragTimer();
                clearPointerDropTarget();
                destroyPointerDragPreview(pointerDrag);
                pointerDrag = null;
                item.classList.remove('ws-dragging');
                item.classList.remove('ws-pointer-dragging');
                rt._isDraggingWorkspace = false;
                ctx.clearDragState();
            };
    };

    rt.workspacePointerDragReady = true;
})();
