const path = require('path');
const { launchChromiumOrConnect, waitForEveCoreHydrated } = require('./playwright-browser');
const { installSidebarPointerTrace } = require('./sidebar-pointer-trace.shared');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarRuntime
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findParent
    ), undefined, { timeout: 120000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'group-root',
            viewMode: 'grid',
            sidebarExpanded: true,
            sidebarHidden: false,
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: [],
            sidebarGroups: [
                { id: 'group-a', name: 'Group A', color: '#00d4ff', collapsed: false, hidden: false, parentWorkspaceId: '' }
            ],
            workspaces: [
                {
                    id: 'group-root',
                    name: 'Group Root',
                    icon: 'G',
                    groupId: 'group-a',
                    subTabs: [
                        {
                            id: 'child',
                            name: 'Child',
                            icon: 'C',
                            subTabs: [
                                {
                                    id: 'deep',
                                    name: 'Deep',
                                    icon: 'D',
                                    subTabs: []
                                }
                            ]
                        }
                    ]
                },
                { id: 'outside', name: 'Outside', icon: 'O', subTabs: [] }
            ]
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};
        window.EveSidebarGroups.ensureConfigDefaults(config);
        window.renderSidebar();
    });
}

async function runSmoke(page, browserDiagnostics) {
    const diagnostics = browserDiagnostics || { pageErrors: [], consoleErrors: [] };
    await page.waitForFunction(async () => {
        const source = document.querySelector('#sidebar .ws-item[data-ws-id="deep"]');
        const target = document.querySelector('#sidebar .ws-add');
        if (!source || !target || !source.isConnected || !target.isConnected) return false;
        if (typeof target.__eveSidebarApplyPointerDrop !== 'function') return false;
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (sourceRect.width <= 0 || sourceRect.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) return false;
        const sourceIdentity = source;
        const targetIdentity = target;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return sourceIdentity.isConnected
            && targetIdentity.isConnected
            && document.querySelector('#sidebar .ws-item[data-ws-id="deep"]') === sourceIdentity
            && document.querySelector('#sidebar .ws-add') === targetIdentity;
    }, undefined, { timeout: 10000 });

    const geometry = await page.evaluate(() => {
        const sourceNode = document.querySelector('#sidebar .ws-item[data-ws-id="deep"]');
        const targetNode = document.querySelector('#sidebar .ws-add');
        const describe = (node) => {
            if (!node) return null;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const hiddenAncestors = [];
            let cursor = node;
            while (cursor && cursor instanceof Element) {
                if (cursor.hidden || cursor.classList.contains('is-collapsed')) {
                    hiddenAncestors.push({
                        tag: cursor.tagName,
                        className: cursor.className,
                        hidden: !!cursor.hidden
                    });
                }
                cursor = cursor.parentElement;
            }
            return {
                connected: node.isConnected,
                offsetParent: !!node.offsetParent,
                display: style.display,
                visibility: style.visibility,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                hiddenAncestors
            };
        };
        return {
            source: describe(sourceNode),
            target: describe(targetNode),
            hasPointerDrop: typeof targetNode?.__eveSidebarApplyPointerDrop === 'function',
            pointerRuntimeReady: !!window.EveSidebarRuntime?.workspacePointerDragReady,
            attachPointerType: typeof window.EveSidebarRuntime?.attachNestedWorkspacePointerDrag,
            sourcePointerDownType: typeof sourceNode?.onpointerdown,
            sourcePointerMoveType: typeof sourceNode?.onpointermove,
            sourcePointerUpType: typeof sourceNode?.onpointerup,
            sourceLostCaptureType: typeof sourceNode?.onlostpointercapture,
            sidebarClassName: document.getElementById('sidebar')?.className || '',
            collapsedTabs: Array.isArray(config?.collapsedTabs) ? config.collapsedTabs.slice() : []
        };
    });

    const sourceBox = geometry.source?.rect || null;
    const addDropBox = geometry.target?.rect || null;
    if (!sourceBox || !addDropBox || sourceBox.width <= 0 || sourceBox.height <= 0 || addDropBox.width <= 0 || addDropBox.height <= 0 || !geometry.hasPointerDrop) {
        throw new Error(`Sidebar Add/Drop promote setup failed: unstable rendered geometry ${JSON.stringify(geometry, null, 2)}`);
    }

    await page.evaluate(installSidebarPointerTrace);

    const sourcePoint = {
        x: sourceBox.x + Math.min(Math.max(sourceBox.width * 0.5, 4), Math.max(sourceBox.width - 4, 4)),
        y: sourceBox.y + Math.min(Math.max(sourceBox.height * 0.5, 4), Math.max(sourceBox.height - 4, 4))
    };
    await page.bringToFront();
    await page.evaluate(() => {
        try { window.focus(); } catch (error) { /* best effort */ }
    });
    await page.waitForFunction(() => document.visibilityState === 'visible', undefined, { timeout: 5000 });
    const preGestureFocus = await page.evaluate(() => ({
        hasFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
        activeTag: document.activeElement?.tagName || '',
        activeClassName: document.activeElement instanceof Element ? String(document.activeElement.className || '') : ''
    }));

    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    try {
        await page.waitForFunction(() => (
            !!document.querySelector('#sidebar.ws-drag-active')
            && !!document.querySelector('.ws-pointer-drag-preview')
        ), undefined, { timeout: 1500 });
    } catch (error) {
        const readiness = await page.evaluate(() => ({
            runtimeReady: !!window.EveSidebarRuntime?.workspacePointerDragReady,
            attachPointerType: typeof window.EveSidebarRuntime?.attachNestedWorkspacePointerDrag,
            sourcePointerDownType: typeof document.querySelector('#sidebar .ws-item[data-ws-id="deep"]')?.onpointerdown,
            sourcePointerMoveType: typeof document.querySelector('#sidebar .ws-item[data-ws-id="deep"]')?.onpointermove,
            sourcePointerUpType: typeof document.querySelector('#sidebar .ws-item[data-ws-id="deep"]')?.onpointerup,
            pointerEvents: Array.isArray(window.__sidebarPointerEventLog) ? window.__sidebarPointerEventLog.slice() : [],
            pointerClassEvents: Array.isArray(window.__sidebarPointerClassLog) ? window.__sidebarPointerClassLog.slice() : [],
            pointerHandlerEvents: Array.isArray(window.__sidebarPointerHandlerLog) ? window.__sidebarPointerHandlerLog.slice() : [],
            pointerTimerEvents: Array.isArray(window.__sidebarPointerTimerLog) ? window.__sidebarPointerTimerLog.slice() : [],
            pointerWindowEvents: Array.isArray(window.__sidebarPointerWindowLog) ? window.__sidebarPointerWindowLog.slice() : []
        }));
        throw new Error(`Pointer drag did not arm: ${JSON.stringify({ geometry, preGestureFocus, readiness }, null, 2)}`);
    }
    let liveTargetPoint = null;
    let reachedAddDrop = false;
    const targetTracking = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
        liveTargetPoint = await page.evaluate(() => {
            const target = document.querySelector('#sidebar .ws-add');
            if (!target || !target.isConnected) return null;
            const rect = target.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                rect: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                }
            };
        });
        if (!liveTargetPoint) break;

        await page.mouse.move(liveTargetPoint.x, liveTargetPoint.y, { steps: attempt === 0 ? 8 : 2 });
        const targetState = await page.evaluate(() => {
            const target = document.querySelector('#sidebar .ws-add');
            if (!target) return { highlighted: false, hitIsAdd: false, rect: null };
            const rect = target.getBoundingClientRect();
            const hit = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2
            );
            return {
                highlighted: target.classList.contains('ws-drop-target'),
                hitIsAdd: !!(hit instanceof Element && hit.closest('.ws-add') === target),
                rect: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                }
            };
        });
        targetTracking.push({ attempt, point: liveTargetPoint, state: targetState });
        if (targetState.highlighted) {
            reachedAddDrop = true;
            break;
        }
        if (targetState.hitIsAdd) {
            await page.mouse.move(liveTargetPoint.x + 0.5, liveTargetPoint.y, { steps: 1 });
            reachedAddDrop = await page.evaluate(() => (
                !!document.querySelector('#sidebar .ws-add.ws-drop-target')
            ));
            if (reachedAddDrop) break;
        }
        await page.waitForTimeout(20);
    }

    const duringDrag = await page.evaluate(({ targetTracking, reachedAddDrop }) => {
        const addTarget = document.querySelector('#sidebar .ws-add');
        const lifecycle = window.__sidebarPreviewLifecycle || {};
        return {
            highlighted: !!addTarget?.classList.contains('ws-drop-target'),
            preview: !!document.querySelector('.ws-pointer-drag-preview'),
            previewAdded: Number(lifecycle.added || 0),
            previewRemoved: Number(lifecycle.removed || 0),
            previewAppendAttempts: Number(lifecycle.appendAttempts || 0),
            previewAppendTexts: Array.isArray(lifecycle.appendTexts) ? lifecycle.appendTexts.slice() : [],
            previewEvents: Array.isArray(lifecycle.events) ? lifecycle.events.slice() : [],
            previewText: String(lifecycle.lastAddedText || ''),
            dragActive: !!document.querySelector('#sidebar.ws-drag-active'),
            sortModeActive: !!document.querySelector('#sidebar.ws-sort-mode-active'),
            sourceClassName: document.querySelector('#sidebar .ws-item[data-ws-id="deep"]')?.className || '',
            sourceDraggable: !!document.querySelector('#sidebar .ws-item[data-ws-id="deep"]')?.draggable,
            pointerEvents: Array.isArray(window.__sidebarPointerEventLog) ? window.__sidebarPointerEventLog.slice() : [],
            pointerClassEvents: Array.isArray(window.__sidebarPointerClassLog) ? window.__sidebarPointerClassLog.slice() : [],
            hitTests: Array.isArray(window.__sidebarHitTestLog) ? window.__sidebarHitTestLog.slice() : [],
            dropClassEvents: Array.isArray(window.__sidebarDropClassLog) ? window.__sidebarDropClassLog.slice() : [],
            targetTracking,
            reachedAddDrop,
            elementAtTarget: (() => {
                const rect = addTarget?.getBoundingClientRect?.();
                if (!rect) return '';
                const node = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return node?.className || node?.tagName || '';
            })()
        };
    }, { targetTracking, reachedAddDrop });

    await page.mouse.up();
    await page.waitForTimeout(180);

    const result = await page.evaluate((dragState) => {
        if (window.__sidebarPreviewOriginalAppendChild && document.body) {
            document.body.appendChild = window.__sidebarPreviewOriginalAppendChild;
            window.__sidebarPreviewOriginalAppendChild = null;
        }
        if (window.__sidebarPointerOriginalSetTimeout) {
            window.setTimeout = window.__sidebarPointerOriginalSetTimeout;
            window.__sidebarPointerOriginalSetTimeout = null;
        }
        if (window.__sidebarPointerOriginalClearTimeout) {
            window.clearTimeout = window.__sidebarPointerOriginalClearTimeout;
            window.__sidebarPointerOriginalClearTimeout = null;
        }
        if (window.__sidebarOriginalElementFromPoint) {
            document.elementFromPoint = window.__sidebarOriginalElementFromPoint;
            window.__sidebarOriginalElementFromPoint = null;
        }
        window.__sidebarPreviewObserver?.disconnect?.();
        window.__sidebarPointerClassObserver?.disconnect?.();
        const helpers = window.EveWorkspaceHelpers;
        const deep = helpers.findById(config.workspaces, 'deep');
        const deepParent = helpers.findParent(config.workspaces, 'deep');
        const groupRoots = window.EveSidebarGroups.getGroupRoots('group-a', config).map(ws => ws.id);
        return {
            ok: true,
            highlightedDuringDrag: dragState.highlighted,
            previewDuringDrag: dragState.preview,
            previewAddedDuringDrag: dragState.previewAdded,
            previewRemovedDuringDrag: dragState.previewRemoved,
            previewAppendAttemptsDuringDrag: dragState.previewAppendAttempts,
            previewAppendTextsDuringDrag: dragState.previewAppendTexts,
            previewEventsDuringDrag: dragState.previewEvents,
            previewTextDuringDrag: dragState.previewText,
            dragActiveDuringDrag: dragState.dragActive,
            sortModeActiveDuringDrag: dragState.sortModeActive,
            sourceClassNameDuringDrag: dragState.sourceClassName,
            sourceDraggableDuringDrag: dragState.sourceDraggable,
            pointerEventsDuringDrag: dragState.pointerEvents,
            pointerClassEventsDuringDrag: dragState.pointerClassEvents,
            hitTestsDuringDrag: dragState.hitTests,
            dropClassEventsDuringDrag: dragState.dropClassEvents,
            targetTrackingDuringDrag: dragState.targetTracking,
            reachedAddDropDuringDrag: dragState.reachedAddDrop,
            elementAtTarget: dragState.elementAtTarget,
            dropApplyEvents: Array.isArray(window.__sidebarDropApplyLog) ? window.__sidebarDropApplyLog.slice() : [],
            previewAfterDrop: !!document.querySelector('.ws-pointer-drag-preview'),
            rootOrder: config.workspaces.map(ws => ws.id),
            deepGroupId: deep ? String(deep.groupId || '') : '',
            deepParentId: deepParent ? String(deepParent.id || '') : '',
            groupRoots,
            pageErrors: Array.isArray(dragState.pageErrors) ? dragState.pageErrors : [],
            consoleErrors: Array.isArray(dragState.consoleErrors) ? dragState.consoleErrors : []
        };
    }, {
        ...duringDrag,
        pageErrors: diagnostics.pageErrors.slice(),
        consoleErrors: diagnostics.consoleErrors.slice()
    });

    if (!result.highlightedDuringDrag || !result.previewDuringDrag || result.previewAfterDrop) {
        throw new Error(`Expected Add/Drop highlight and transient pointer preview: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.rootOrder.join('|') !== 'group-root|outside|deep') {
        throw new Error(`Expected deep tab promoted to root level: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.deepGroupId || result.deepParentId) {
        throw new Error(`Expected promoted tab outside group and parent: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.groupRoots.join('|') !== 'group-root') {
        throw new Error(`Expected group roots to no longer include promoted tab: ${JSON.stringify(result, null, 2)}`);
    }
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const browserDiagnostics = { pageErrors: [], consoleErrors: [] };
    page.on('pageerror', (error) => {
        browserDiagnostics.pageErrors.push(String(error && error.stack ? error.stack : error));
    });
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        browserDiagnostics.consoleErrors.push(message.text());
    });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
        await waitForApp(page);
        await waitForEveCoreHydrated(page);
        await seedState(page);
        await runSmoke(page, browserDiagnostics);
        console.log('SIDEBAR_ADD_DROP_PROMOTE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
