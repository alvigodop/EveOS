window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const render = ns._render || {};

    const view = ns._view || {};



    const { state, getConfig, text, hashNodeId } = shared;

    const { renderToolbarState, renderInspector, requestDraw } = render;

    const { centerOnNode } = view;



function bringModalAboveConstellation(modalId) {



        const modal = document.getElementById(text(modalId, ''));



        if (!modal) return;



        modal.style.zIndex = '10020';



    }



function applyPassiveReleaseImpulse(node) {



        if (!node || node.kind !== 'folder') return;



        const speed = Math.hypot(Number(node.vx) || 0, Number(node.vy) || 0);



        if (speed >= 0.48) return;



        const hash = hashNodeId(node);



        const angle = (hash % 6283) / 1000;



        const impulse = 0.76 + ((hash % 7) * 0.05);



        node.vx = Math.cos(angle) * impulse;



        node.vy = Math.sin(angle) * impulse;



    }



function getPrimaryAction(node) {



        if (!node) return null;



        if (node.kind === 'link') {



            return { label: 'Open Bookmark', action: 'open-link' };



        }



        if (node.kind === 'workspace') {



            return { label: 'Open Tab', action: 'open-workspace' };



        }



        if (node.kind === 'category') {



            return { label: 'Open Card', action: 'open-category' };



        }



        if (node.kind === 'folder') {



            return { label: 'Open Folder', action: 'open-folder' };



        }



        return { label: 'Center Node', action: 'center-node' };



    }

function resetActionWheelState() {



        state.actionWheel = {
            visible: false,
            nodeId: '',
            clientX: 0,
            clientY: 0,
            items: []
        };



    }



function closeActionWheel() {



        const wasVisible = !!state.actionWheel?.visible || !!text(state.actionWheel?.nodeId, '');



        resetActionWheelState();



        if (wasVisible) renderToolbarState();



    }



function getNodeTargetSpec(node) {



        if (!node) return null;



        if (node.kind === 'category') {



            return {
                workspaceId: text(node.data?.workspaceId, 'main'),
                categoryName: text(node.data?.categoryName, 'Unsorted'),
                folderId: '',
                targetParentId: '',
                targetNodeId: text(node.id, '')
            };



        }



        if (node.kind === 'folder') {



            const folderId = text(node.data?.folderId, '');



            if (!folderId) return null;



            return {
                workspaceId: text(node.data?.workspaceId, 'main'),
                categoryName: text(node.data?.categoryName, 'Unsorted'),
                folderId,
                targetParentId: folderId,
                targetNodeId: text(node.id, '')
            };



        }



        return null;



    }



function hasArmedSource() {



        return !!ns._coreRewire?.hasArmedSource?.();



    }



function getArmedSourceCount() {



        return Number(ns._coreRewire?.getArmedSourceCount?.() || 0);



    }



function ensureCategoryInOrder(categoryName) {



        const nextCategoryName = text(categoryName, '');



        if (!nextCategoryName) return false;



        const config = getConfig();



        if (!Array.isArray(config.categoryOrder)) config.categoryOrder = [];



        if (config.categoryOrder.includes(nextCategoryName)) return false;



        config.categoryOrder.push(nextCategoryName);



        return true;



    }



function promptForNodeName(promptText, fallbackValue) {



        const raw = window.prompt(text(promptText, 'Name'), text(fallbackValue, ''));



        const value = String(raw || '').trim();



        return value || '';



    }



function refreshGraphAfterMutation(selectionId, options = {}) {



        if (typeof ns._refreshConstellationGraphAfterMove === 'function') {



            ns._refreshConstellationGraphAfterMove(selectionId, options);



            return;



        }



        renderToolbarState();



        renderInspector();



        requestDraw();



    }



function createFolderFromNode(node, options = {}) {



        const data = node?.data || {};



        const targetKind = text(node?.kind, '');



        if (targetKind !== 'category' && targetKind !== 'folder') return false;



        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');

        const categoryName = text(data.categoryName, '');

        const parentId = targetKind === 'folder' ? text(data.folderId, '') : '';



        if (!categoryName || !window.EveBookmarkFolders?.createFolder) return false;



        const folderName = promptForNodeName(
            parentId ? 'New subfolder name' : 'New folder name',
            parentId ? 'Detached Chain' : 'New Folder'
        );



        if (!folderName) return false;



        const folder = window.EveBookmarkFolders.createFolder({
            workspaceId,
            categoryName,
            parentId,
            name: folderName,
            persist: false
        });



        if (!folder?.id) return false;



        const folderNodeId = 'folder_' + workspaceId + '_' + categoryName + '_' + text(folder.id, '');
        const shouldAttach = options.attachArmedSource !== false && hasArmedSource();



        if (shouldAttach && typeof ns._commitConstellationRewireTarget === 'function') {



            const attached = ns._commitConstellationRewireTarget({
                workspaceId,
                categoryName,
                folderId: text(folder.id, ''),
                targetParentId: text(folder.id, ''),
                targetNodeId: folderNodeId
            }, {
                snapToTargetNodeId: folderNodeId,
                silent: false
            });



            if (attached) return true;



        }



        if (typeof saveData === 'function') {



            saveData({ skipRender: true, skipSuggestions: true });



        }



        refreshGraphAfterMutation(folderNodeId);



        if (typeof window.showToast === 'function') {



            window.showToast('Folder created inside the current chain.', 'success');



        }



        return true;



    }



function createCardAndAttachFromWorkspace(node) {



        const workspaceId = text(node?.data?.workspaceId, getConfig().activeWorkspace || 'main');



        if (!workspaceId) return false;



        if (!hasArmedSource()) {



            if (typeof window.showToast === 'function') {



                window.showToast('Arm a bookmark or folder first. Empty cards are not first-class map nodes yet.', 'warning');



            }



            return false;



        }



        const categoryName = promptForNodeName('New card name', 'Detached Chain');



        if (!categoryName) return false;



        ensureCategoryInOrder(categoryName);



        if (typeof ns._commitConstellationRewireTarget === 'function') {



            return !!ns._commitConstellationRewireTarget({
                workspaceId,
                categoryName,
                folderId: '',
                targetParentId: '',
                targetNodeId: 'category_' + workspaceId + '_' + categoryName
            }, {
                snapToTargetNodeId: 'category_' + workspaceId + '_' + categoryName,
                silent: false
            });



        }



        return false;



    }



function getActionWheelItems(node) {



        if (!node) return [];



        const items = [];

        const isRewireSource = text(state.rewire?.sourceNodeId, '') === text(node?.id, '');

        const canRewire = typeof ns._canConstellationRewireNode === 'function'
            && ns._canConstellationRewireNode(node);

        const canDetachToRoot = !!ns._coreRewire?.canDetachNodeToRoot?.(node);

        const canDetachToParking = !!ns._coreRewire?.canDetachNodeToParking?.(node);

        const armedSourceCount = getArmedSourceCount();

        const armedSourceLabel = armedSourceCount > 1 ? ('Attach ' + armedSourceCount + ' Here') : 'Attach Here';



        if (node.kind === 'link') {



            items.push({ label: 'Open Bookmark', action: 'open-link', accent: true });

            if (text(node?.data?.folderId, '')) items.push({ label: 'Open Folder', action: 'open-folder' });

            if (text(node?.data?.categoryName, '')) items.push({ label: 'Open Card', action: 'open-category' });

            if (canRewire) items.push({ label: isRewireSource ? 'Cancel Move' : 'Chain Move', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

            if (canDetachToRoot) items.push({ label: 'Move To Root', action: 'detach-to-root' });

            if (canDetachToParking) items.push({ label: 'Detach To Parking', action: 'detach-to-parking' });

            items.push({ label: 'Center', action: 'center' });

            return items;



        }



        if (node.kind === 'folder') {



            items.push({ label: 'Open Folder', action: 'open-folder', accent: true });

            items.push({ label: 'Open Card', action: 'open-category' });

            if (hasArmedSource() && !isRewireSource) items.push({ label: armedSourceLabel, action: 'attach-here' });

            items.push({ label: hasArmedSource() ? 'New Folder + Attach' : 'New Folder', action: 'create-folder' });

            if (canRewire) items.push({ label: isRewireSource ? 'Cancel Move' : 'Chain Move', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

            if (canDetachToRoot) items.push({ label: 'Move To Root', action: 'detach-to-root' });

            if (canDetachToParking) items.push({ label: 'Detach To Parking', action: 'detach-to-parking' });

            items.push({ label: 'Center', action: 'center' });

            return items;



        }



        if (node.kind === 'category') {



            items.push({ label: 'Open Card', action: 'open-category', accent: true });

            items.push({ label: 'Card Settings', action: 'open-category-settings' });

            if (hasArmedSource()) items.push({ label: armedSourceLabel, action: 'attach-here' });

            items.push({ label: hasArmedSource() ? 'New Folder + Attach' : 'New Folder', action: 'create-folder' });

            items.push({ label: 'Center', action: 'center' });

            return items;



        }



        if (node.kind === 'workspace') {



            items.push({ label: 'Open Tab', action: 'open-workspace', accent: true });

            items.push({ label: hasArmedSource() ? 'New Card + Attach' : 'New Card + Attach', action: 'create-card-attach' });

            items.push({ label: 'Center', action: 'center' });

            return items;



        }



        if (node.data?.detached && node.data?.detachedRoot) {



            if (canRewire) items.push({ label: isRewireSource ? 'Cancel Reattach' : 'Reattach Chain', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire', accent: true });

            items.push({ label: 'Center', action: 'center' });

            return items;



        }



        items.push({ label: 'Center', action: 'center' });



        return items;



    }



function openActionWheel(node, clientX, clientY) {



        const items = getActionWheelItems(node);



        if (!node || !items.length) {



            closeActionWheel();



            return false;



        }



        state.selected = node;

        if (!(state.selectionIds instanceof Set) || !state.selectionIds.has(text(node.id, ''))) {

            state.selectionIds = new Set([text(node.id, '')].filter(Boolean));

        }

        state.actionWheel = {
            visible: true,
            nodeId: text(node.id, ''),
            clientX: Number(clientX) || 0,
            clientY: Number(clientY) || 0,
            items
        };



        renderInspector();



        renderToolbarState();



        requestDraw();



        return true;



    }



function activateNode(node) {



        if (!node) return;



        const data = node.data || {};



        if (node.kind === 'link' && data.linkId && typeof window.openBookmarkFromDashboard === 'function') {



            window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, data.linkId);



            bringModalAboveConstellation('bookmarkFocusModal');



            return;



        }



        if (node.kind === 'workspace' && data.workspaceId && typeof window.switchWorkspace === 'function') {



            window.switchWorkspace(data.workspaceId);



            ns.closeMap();



            return;



        }



        if (node.kind === 'category' && data.categoryName) {



            if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {



                window.switchWorkspace(data.workspaceId);



            }



            if (typeof window.setFocus === 'function') {



                window.setFocus(data.categoryName);



                ns.closeMap();



                return;



            }



        }



        if (node.kind === 'folder' && data.folderId && data.categoryName && openFolderFromMap(node)) {



            return;



        }



        centerOnNode(node, Math.max(state.transform.scale, 1.2));



    }



function openFolderFromMap(node) {



        const data = node?.data || {};



        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');

        const categoryName = text(data.categoryName, '');

        const folderId = text(data.folderId, '');



        if (!categoryName || !folderId || !window.EveFolderViewV2?.enterFolder) return false;



        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {



            window.switchWorkspace(workspaceId);



        }



        if (categoryName && typeof window.setFocus === 'function') {



            window.setFocus(categoryName);



        }



        window.setTimeout(() => {



            try {



                window.EveFolderViewV2.enterFolder(null, categoryName, folderId, workspaceId);



            } catch (error) {



                console.warn('[ConstellationMap] Failed to open folder from map', error);



            }



        }, 70);



        ns.closeMap();



        return true;



    }



function openCategorySettingsFromMap(node) {



        const data = node?.data || {};



        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');

        const categoryName = text(data.categoryName, '');



        if (!categoryName || typeof window.openCategorySettings !== 'function') return false;



        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {



            window.switchWorkspace(workspaceId);



        }



        if (typeof window.setFocus === 'function') {



            window.setFocus(categoryName);



        }



        window.setTimeout(() => {



            try {



                window.openCategorySettings(categoryName);



                bringModalAboveConstellation('categorySettingsModal');



                bringModalAboveConstellation('settingsModal');



            } catch (error) {



                console.warn('[ConstellationMap] Failed to open card settings from map', error);



            }



        }, 60);



        return true;



    }



function runNodeAction(node, action) {



        if (!node || !action) return;



        closeActionWheel();



        if (action === 'primary') {



            activateNode(node);

            return;



        }



        if (action === 'open-link') {



            activateNode(node);



            return;



        }



        if (action === 'center') {



            centerOnNode(node, Math.max(state.transform.scale, 1.24));

            return;



        }



        if (action === 'open-category') {



            const data = node.data || {};



            if (data.categoryName) {



                if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {



                    window.switchWorkspace(data.workspaceId);



                }



                if (typeof window.setFocus === 'function') {



                    window.setFocus(data.categoryName);

                    ns.closeMap();

                }



            }



            return;



        }



        if (action === 'open-folder') {



            openFolderFromMap(node);

            return;



        }



        if (action === 'open-workspace') {



            activateNode(node);



            return;



        }



        if (action === 'arm-rewire') {



            if (typeof ns._armConstellationRewireNode === 'function') {



                ns._armConstellationRewireNode(node);



            }



            return;



        }



        if (action === 'cancel-rewire') {



            if (typeof ns._cancelConstellationRewire === 'function') {



                ns._cancelConstellationRewire();



            }



            return;



        }



        if (action === 'detach-to-root') {



            if (typeof ns._detachConstellationNodeToRoot === 'function') {



                ns._detachConstellationNodeToRoot(node);



            }



            return;



        }



        if (action === 'detach-to-parking') {



            if (typeof ns._detachConstellationNodeToParking === 'function') {



                ns._detachConstellationNodeToParking(node);



            }



            return;



        }



        if (action === 'attach-here') {



            const targetSpec = getNodeTargetSpec(node);



            if (targetSpec && typeof ns._commitConstellationRewireTarget === 'function') {



                ns._commitConstellationRewireTarget(targetSpec, {
                    snapToTargetNodeId: text(node.id, ''),
                    silent: false
                });



            }



            return;



        }



        if (action === 'create-folder') {



            createFolderFromNode(node, { attachArmedSource: true });



            return;



        }



        if (action === 'create-card-attach') {



            createCardAndAttachFromWorkspace(node);



            return;



        }



        if (action === 'open-category-settings') {



            openCategorySettingsFromMap(node);



        }



    }





    const coreActions = ns._coreActions = ns._coreActions || {};



    Object.assign(coreActions, {

        applyPassiveReleaseImpulse,

        getPrimaryAction,

        getActionWheelItems,

        activateNode,

        openFolderFromMap,

        openCategorySettingsFromMap,

        openActionWheel,

        closeActionWheel,

        runNodeAction

    });



    ns._applyPassiveReleaseImpulse = applyPassiveReleaseImpulse;

    ns._activateNode = activateNode;

    ns._openConstellationActionWheel = openActionWheel;

    ns._closeConstellationActionWheel = closeActionWheel;

    ns._getConstellationActionWheelItems = getActionWheelItems;

    ns._runNodeAction = runNodeAction;



})(window.EveConstellationMap);
