window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const render = ns._render || {};
    const helpers = ns._coreActionHelpers || {};

    const { state, text } = shared;
    const { renderToolbarState, renderInspector, requestDraw } = render;
    const { hasArmedSource, getArmedSourceCount } = helpers;

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

    function getActionWheelItems(node) {
        if (!node) return [];

        const items = [];
        const isRewireSource = text(state.rewire?.sourceNodeId, '') === text(node?.id, '');
        const canRewire = typeof ns._canConstellationRewireNode === 'function' && ns._canConstellationRewireNode(node);
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

        if (node.data?.detached && node.data?.detachedRoot) {
            if (canRewire) items.push({ label: isRewireSource ? 'Cancel Reattach' : 'Reattach Chain', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire', accent: true });
            items.push({ label: 'Center', action: 'center' });
            return items;
        }

        if (node.kind === 'folder') {
            items.push({ label: 'Open Folder', action: 'open-folder', accent: true });
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
            items.push({ label: 'New Card + Attach', action: 'create-card-attach' });
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

    ns._coreActionWheel = Object.assign(ns._coreActionWheel || {}, {
        resetActionWheelState,
        closeActionWheel,
        getActionWheelItems,
        openActionWheel
    });
})(window.EveConstellationMap);
