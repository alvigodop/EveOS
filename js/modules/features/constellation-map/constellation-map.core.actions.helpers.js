window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const render = ns._render || {};

    const { state, getConfig, text, hashNodeId } = shared;
    const { renderToolbarState, renderInspector, requestDraw } = render;

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
        if (node.data?.detached && node.data?.detachedRoot) return { label: 'Reattach Chain', action: 'arm-rewire' };
        if (node.kind === 'link') return { label: 'Open Bookmark', action: 'open-link' };
        if (node.kind === 'workspace') return { label: 'Open Tab', action: 'open-workspace' };
        if (node.kind === 'category') return { label: 'Open Card', action: 'open-category' };
        if (node.kind === 'folder') return { label: 'Open Folder', action: 'open-folder' };
        return { label: 'Center Node', action: 'center-node' };
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

    function ensureCategoryInOrder(categoryName, workspaceId) {
        const nextCategoryName = text(categoryName, '');
        if (!nextCategoryName) return false;

        const config = getConfig();
        const nextWorkspaceId = text(workspaceId, config.activeWorkspace || 'main');

        if (window.EveCategoryOrder?.ensureCategory) {
            return !!window.EveCategoryOrder.ensureCategory(nextWorkspaceId, nextCategoryName);
        }

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

    ns._coreActionHelpers = Object.assign(ns._coreActionHelpers || {}, {
        bringModalAboveConstellation,
        applyPassiveReleaseImpulse,
        getPrimaryAction,
        getNodeTargetSpec,
        hasArmedSource,
        getArmedSourceCount,
        ensureCategoryInOrder,
        promptForNodeName,
        refreshGraphAfterMutation
    });
})(window.EveConstellationMap);
