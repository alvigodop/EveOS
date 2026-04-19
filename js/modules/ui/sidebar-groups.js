(function () {
    'use strict';

    if (window.EveSidebarGroups) return;
    var rt = window.EveSidebarGroupsRuntime = window.EveSidebarGroupsRuntime || {};
    if (!rt.sharedReady || !rt.orderReady || !rt.mutationsReady) {
        console.warn('EveSidebarGroups: helper modules missing');
        return;
    }

    window.EveSidebarGroups = {
        ensureConfigDefaults: rt.ensureConfigDefaults,
        getGroups: rt.getGroups,
        getGroupMap: rt.getGroupMap,
        findGroupById: rt.findGroupById,
        getRootWorkspaces: rt.getRootWorkspaces,
        getWorkspaceGroupId: rt.getWorkspaceGroupId,
        getGroupRoots: rt.getGroupRoots,
        getGroupParentWorkspaceId: rt.getGroupParentWorkspaceId,
        setGroupParentWorkspaceId: rt.setGroupParentWorkspaceId,
        getGroupsForParent: rt.getGroupsForParent,
        getVisibleBuckets: rt.getVisibleBuckets,
        getFocusedGroupId: rt.getFocusedGroupId,
        setFocusedGroup: rt.setFocusedGroup,
        isWorkspaceInFocusedGroup: rt.isWorkspaceInFocusedGroup,
        isWorkspaceEffectivelyInactive: rt.isWorkspaceEffectivelyInactive,
        isGroupEffectivelyInactive: rt.isGroupEffectivelyInactive,
        getSidebarOrderMode: rt.getSidebarOrderMode,
        setSidebarOrderMode: rt.setSidebarOrderMode,
        getOrderedEntries: rt.getOrderedEntries,
        getOrderedRootEntries: rt.getOrderedRootEntries,
        getManualOrderEntries: rt.getManualOrderEntries,
        resetManualOrder: rt.resetManualOrder,
        placeManualOrderEntry: rt.placeManualOrderEntry,
        placeManualOrderEntryAfter: rt.placeManualOrderEntryAfter,
        removeManualOrderEntry: rt.removeManualOrderEntry,
        syncWorkspaceOrderEntry: rt.syncWorkspaceOrderEntry,
        isRootWorkspace: rt.isRootWorkspace,
        createGroup: rt.createGroup,
        updateGroup: rt.updateGroup,
        deleteGroup: rt.deleteGroup,
        setGroupCollapsed: rt.setGroupCollapsed,
        setGroupHidden: rt.setGroupHidden,
        setShowHiddenGroups: rt.setShowHiddenGroups,
        collapseTabsForGroup: rt.collapseTabsForGroup,
        expandTabsForGroup: rt.expandTabsForGroup,
        collapseAllGroups: rt.collapseAllGroups,
        expandAllGroups: rt.expandAllGroups,
        canGroupWorkspaceInGroup: rt.canGroupWorkspaceInGroup,
        canPlaceGroupUnderWorkspace: rt.canPlaceGroupUnderWorkspace,
        moveRootWorkspaceToGroup: rt.moveRootWorkspaceToGroup
    };
})();
