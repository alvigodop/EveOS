'use strict';

function installSidebarPointerTrace() {
    window.__sidebarPreviewLifecycle = {
        added: 0,
        removed: 0,
        appendAttempts: 0,
        lastAddedText: '',
        appendTexts: [],
        events: []
    };
    window.__sidebarPreviewObserver?.disconnect?.();
    const state = window.__sidebarPreviewLifecycle;

    window.__sidebarPreviewOriginalAppendChild = document.body.appendChild;
    document.body.appendChild = function instrumentedSidebarAppendChild(node) {
        if (node instanceof Element && node.classList.contains('ws-pointer-drag-preview')) {
            state.appendAttempts += 1;
            state.appendTexts.push(String(node.textContent || '').trim());
            state.events.push('append-attempt');
        }
        return window.__sidebarPreviewOriginalAppendChild.call(this, node);
    };

    const previewObserver = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes || []) {
                if (!(node instanceof Element)) continue;
                const preview = node.matches?.('.ws-pointer-drag-preview')
                    ? node
                    : node.querySelector?.('.ws-pointer-drag-preview');
                if (!preview) continue;
                state.added += 1;
                state.lastAddedText = String(preview.textContent || '').trim();
                state.events.push('added');
            }
            for (const node of record.removedNodes || []) {
                if (!(node instanceof Element)) continue;
                const preview = node.matches?.('.ws-pointer-drag-preview')
                    ? node
                    : node.querySelector?.('.ws-pointer-drag-preview');
                if (!preview) continue;
                state.removed += 1;
                state.events.push('removed');
            }
        }
    });
    previewObserver.observe(document.body, { childList: true, subtree: true });
    window.__sidebarPreviewObserver = previewObserver;

    window.__sidebarHitTestLog = [];
    const nativeElementFromPoint = document.elementFromPoint.bind(document);
    window.__sidebarOriginalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = function instrumentedElementFromPoint(x, y) {
        const node = nativeElementFromPoint(x, y);
        if (window.__sidebarHitTestLog.length < 120) {
            window.__sidebarHitTestLog.push({
                x: Number(x || 0),
                y: Number(y || 0),
                tag: node instanceof Element ? node.tagName : '',
                className: node instanceof Element ? String(node.className || '') : '',
                wsId: node instanceof Element
                    ? String(node.closest('.ws-item[data-ws-id]')?.dataset?.wsId || '')
                    : '',
                isAdd: !!(node instanceof Element && node.closest('.ws-add')),
                isOrderSlot: !!(node instanceof Element && node.closest('.ws-order-slot')),
                isGroup: !!(node instanceof Element && node.closest('.ws-group-header, .ws-group-body'))
            });
        }
        return node;
    };

    window.__sidebarDropApplyLog = [];
    const addApplyTarget = document.querySelector('#sidebar .ws-add');
    const outsideApplyTarget = document.querySelector('#sidebar .ws-item[data-ws-id="outside"]');
    if (addApplyTarget && typeof addApplyTarget.__eveSidebarApplyPointerDrop === 'function') {
        const originalAddApply = addApplyTarget.__eveSidebarApplyPointerDrop;
        addApplyTarget.__eveSidebarApplyPointerDrop = function instrumentedAddDropApply(dragId) {
            const result = originalAddApply.call(this, dragId);
            window.__sidebarDropApplyLog.push({
                target: 'add',
                dragId: String(dragId || ''),
                result: !!result
            });
            return result;
        };
    }
    if (outsideApplyTarget && typeof outsideApplyTarget.__eveSidebarApplyPointerDrop === 'function') {
        const originalOutsideApply = outsideApplyTarget.__eveSidebarApplyPointerDrop;
        outsideApplyTarget.__eveSidebarApplyPointerDrop = function instrumentedOutsideDropApply(dragId) {
            const result = originalOutsideApply.call(this, dragId);
            window.__sidebarDropApplyLog.push({
                target: 'outside',
                dragId: String(dragId || ''),
                result: !!result
            });
            return result;
        };
    }

    window.__sidebarDropClassLog = [];
    [addApplyTarget, outsideApplyTarget].forEach((node) => {
        if (!node) return;
        const observer = new MutationObserver(() => {
            window.__sidebarDropClassLog.push({
                target: node.classList.contains('ws-add') ? 'add' : String(node.dataset.wsId || ''),
                at: performance.now(),
                className: String(node.className || '')
            });
        });
        observer.observe(node, { attributes: true, attributeFilter: ['class'] });
    });

    const sourceNode = document.querySelector('#sidebar .ws-item[data-ws-id="deep"]');
    window.__sidebarPointerEventLog = [];
    window.__sidebarPointerClassLog = [];
    window.__sidebarPointerTimerLog = [];
    window.__sidebarPointerHandlerLog = [];
    window.__sidebarPointerWindowLog = [];
    if (!sourceNode) return;

    const originalPointerDown = sourceNode.onpointerdown;
    if (typeof originalPointerDown === 'function') {
        sourceNode.onpointerdown = function instrumentedPointerDown(event) {
            window.__sidebarPointerHandlerLog.push({
                phase: 'before',
                pointerId: Number(event.pointerId || 0),
                button: Number(event.button ?? -1),
                targetClassName: event.target instanceof Element
                    ? String(event.target.className || '')
                    : ''
            });
            const result = originalPointerDown.call(this, event);
            window.__sidebarPointerHandlerLog.push({
                phase: 'after',
                pointerId: Number(event.pointerId || 0),
                defaultPrevented: !!event.defaultPrevented
            });
            return result;
        };
    }

    const nativeSetTimeout = window.setTimeout;
    const nativeClearTimeout = window.clearTimeout;
    const trackedTimers = new Map();
    window.__sidebarPointerOriginalSetTimeout = nativeSetTimeout;
    window.__sidebarPointerOriginalClearTimeout = nativeClearTimeout;
    window.setTimeout = function instrumentedSetTimeout(callback, delay, ...args) {
        const numericDelay = Number(delay || 0);
        let timerId = 0;
        const wrapped = function (...callbackArgs) {
            if (numericDelay === 180 || numericDelay === 45) {
                window.__sidebarPointerTimerLog.push({
                    phase: 'fired',
                    delay: numericDelay,
                    timerId: Number(timerId || 0)
                });
            }
            trackedTimers.delete(timerId);
            return callback.apply(this, callbackArgs);
        };
        timerId = nativeSetTimeout.call(this, wrapped, delay, ...args);
        trackedTimers.set(timerId, numericDelay);
        if (numericDelay === 180 || numericDelay === 45) {
            window.__sidebarPointerTimerLog.push({
                phase: 'scheduled',
                delay: numericDelay,
                timerId: Number(timerId || 0)
            });
        }
        return timerId;
    };
    window.clearTimeout = function instrumentedClearTimeout(timerId) {
        const numericDelay = trackedTimers.get(timerId);
        if (numericDelay === 180 || numericDelay === 45) {
            window.__sidebarPointerTimerLog.push({
                phase: 'cleared',
                delay: numericDelay,
                timerId: Number(timerId || 0)
            });
        }
        trackedTimers.delete(timerId);
        return nativeClearTimeout.call(this, timerId);
    };

    const logWindowState = (type) => {
        window.__sidebarPointerWindowLog.push({
            type,
            at: performance.now(),
            hasFocus: document.hasFocus(),
            visibilityState: document.visibilityState,
            activeTag: document.activeElement?.tagName || '',
            activeClassName: document.activeElement instanceof Element
                ? String(document.activeElement.className || '')
                : ''
        });
    };
    window.addEventListener('blur', () => logWindowState('blur'), true);
    window.addEventListener('focus', () => logWindowState('focus'), true);

    const logEvent = (event) => {
        window.__sidebarPointerEventLog.push({
            type: event.type,
            pointerId: Number(event.pointerId || 0),
            button: Number(event.button ?? -1),
            buttons: Number(event.buttons ?? 0),
            clientX: Number(event.clientX || 0),
            clientY: Number(event.clientY || 0),
            className: sourceNode.className || '',
            draggable: !!sourceNode.draggable,
            targetTag: event.target instanceof Element ? event.target.tagName : '',
            targetClassName: event.target instanceof Element ? String(event.target.className || '') : '',
            targetClosestToggle: !!(
                event.target instanceof Element
                && event.target.closest('.ws-toggle')
            )
        });
    };
    [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'gotpointercapture',
        'lostpointercapture',
        'dragstart',
        'dragend',
        'mousedown',
        'mousemove',
        'mouseup'
    ].forEach((type) => sourceNode.addEventListener(type, logEvent, true));

    const classObserver = new MutationObserver(() => {
        window.__sidebarPointerClassLog.push({
            at: performance.now(),
            className: sourceNode.className || '',
            connected: sourceNode.isConnected
        });
    });
    classObserver.observe(sourceNode, { attributes: true, attributeFilter: ['class'] });
    window.__sidebarPointerClassObserver = classObserver;
}

module.exports = {
    installSidebarPointerTrace
};
