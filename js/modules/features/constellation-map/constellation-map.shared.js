window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedState = ns._sharedState || {};
    const {
        state,
        KIND_ORDER,
        MAP_PADDING,
        MAX_TAG_EDGES_PER_CLUSTER,
        LINK_LABEL_LIMIT,
        DOUBLE_CLICK_MS,
        MAX_VIEW_SCALE,
        MIN_VIEW_SCALE,
        FIT_MAX_SCALE,
        LABEL_MODE_ORDER,
        MOTION_MODE_ORDER,
        FX_MODE_ORDER,
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        DEFAULT_KIND_POLARITIES,
        AURA_DEPTH_ORDER,
        AURA_TUNING_FIELDS,
        BLOB_MODE_ORDER,
        BLOB_TUNING_FIELDS,
        AURA_PRESETS,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
        LABEL_CURSOR_RADIUS,
        LABEL_FOCUS_LIMIT
    } = sharedState;

    const sharedHelpers = ns._sharedHelpers || {};
    const {
        getConfig,
        getAllLinks,
        text,
        escapeHtml,
        clamp,
        getViewportSize,
        getWorkspaceName,
        getScopeText,
        normalizeScope,
        getGroupOverviewWorkspaceIds,
        createNode,
        getKindDisplayName,
        placeOnRing,
        getAllWorkspaceIds,
        getScopedLinks,
        getCategoryNames,
        getFolderView,
        collectFolderSubtree
    } = sharedHelpers;

    const controls = ns._sharedControls || {};
    const blobs = ns._sharedBlobs || {};
    const theme = ns._sharedTheme || {};
    const geometry = ns._sharedGeometry || {};

    const shared = ns._shared = ns._shared || {};

    Object.assign(shared, {
        state,
        KIND_ORDER,
        MAP_PADDING,
        MAX_TAG_EDGES_PER_CLUSTER,
        LINK_LABEL_LIMIT,
        DOUBLE_CLICK_MS,
        MAX_VIEW_SCALE,
        MIN_VIEW_SCALE,
        FIT_MAX_SCALE,
        LABEL_MODE_ORDER,
        MOTION_MODE_ORDER,
        FX_MODE_ORDER,
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        AURA_TUNING_FIELDS,
        BLOB_MODE_ORDER,
        BLOB_TUNING_FIELDS,
        AURA_PRESETS,
        AURA_DEPTH_ORDER,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
        LABEL_CURSOR_RADIUS,
        LABEL_FOCUS_LIMIT,
        DEFAULT_KIND_POLARITIES,
        getConfig,
        getAllLinks,
        text,
        escapeHtml,
        clamp,
        getViewportSize,
        getWorkspaceName,
        getScopeText,
        normalizeScope,
        getGroupOverviewWorkspaceIds,
        createNode,
        getKindDisplayName,
        placeOnRing,
        getAllWorkspaceIds,
        getScopedLinks,
        getCategoryNames,
        getFolderView,
        collectFolderSubtree
    }, controls, blobs, theme, geometry);
})(window.EveConstellationMap);
