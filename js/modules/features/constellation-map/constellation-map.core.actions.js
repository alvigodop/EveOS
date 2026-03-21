window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const view = ns._view || {};



    const { state, getConfig, text, hashNodeId } = shared;

    const { centerOnNode } = view;



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



function activateNode(node) {



        if (!node) return;



        const data = node.data || {};



        if (node.kind === 'link' && data.linkId && typeof window.openBookmarkFromDashboard === 'function') {



            window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, data.linkId);



            ns.closeMap();



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



            } catch (error) {



                console.warn('[ConstellationMap] Failed to open card settings from map', error);



            }



        }, 60);



        return true;



    }



function runNodeAction(node, action) {



        if (!node || !action) return;



        if (action === 'primary') {



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



        if (action === 'open-category-settings') {



            openCategorySettingsFromMap(node);



        }



    }





    const coreActions = ns._coreActions = ns._coreActions || {};



    Object.assign(coreActions, {

        applyPassiveReleaseImpulse,

        getPrimaryAction,

        activateNode,

        openFolderFromMap,

        openCategorySettingsFromMap,

        runNodeAction

    });



    ns._applyPassiveReleaseImpulse = applyPassiveReleaseImpulse;

    ns._activateNode = activateNode;

    ns._runNodeAction = runNodeAction;



})(window.EveConstellationMap);
