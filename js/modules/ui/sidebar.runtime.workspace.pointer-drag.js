window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.workspacePointerDragReady) return;

    rt.attachNestedWorkspacePointerDrag = function attachNestedWorkspacePointerDrag(ctx, item, ws) {
            var pointerDrag = null;

            function clearPointerDropTarget() {
                if (pointerDrag && pointerDrag.dropTarget && pointerDrag.dropTarget.classList) {
                    pointerDrag.dropTarget.classList.remove('ws-drop-target');
                }
                if (pointerDrag) pointerDrag.dropTarget = null;
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

            function beginPointerWorkspaceDrag(event) {
                if (!pointerDrag || pointerDrag.started) return;
                pointerDrag.started = true;
                rt._lastWorkspaceDragStartTime = Date.now();
                rt._isDraggingWorkspace = true;
                if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                    ctx.markRecentWorkspaceDragGesture(420);
                }
                ctx.setDragState('workspace', ws.id);
                item.classList.add('ws-dragging');
                if (typeof item.setPointerCapture === 'function') {
                    try { item.setPointerCapture(pointerDrag.pointerId); } catch (err) { /* ignore lost capture */ }
                }
                event.preventDefault();
            }

            item.onpointerdown = function (event) {
                if (event.button !== 0) return;
                var target = event.target instanceof Element ? event.target : null;
                if (target && target.closest('.ws-toggle')) return;
                pointerDrag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    started: false,
                    dropTarget: null
                };
            };

            item.onpointermove = function (event) {
                if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
                var dx = Number(event.clientX) - pointerDrag.startX;
                var dy = Number(event.clientY) - pointerDrag.startY;
                if (!pointerDrag.started && Math.sqrt((dx * dx) + (dy * dy)) < 4) return;

                beginPointerWorkspaceDrag(event);
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
                pointerDrag = null;
                if (typeof item.releasePointerCapture === 'function') {
                    try { item.releasePointerCapture(activeDrag.pointerId); } catch (err) { /* ignore lost capture */ }
                }

                if (!activeDrag.started) return;
                event.preventDefault();
                event.stopPropagation();

                item.classList.remove('ws-dragging');
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
                clearPointerDropTarget();
                pointerDrag = null;
                item.classList.remove('ws-dragging');
                rt._isDraggingWorkspace = false;
                ctx.clearDragState();
            };
    };

    rt.workspacePointerDragReady = true;
})();
