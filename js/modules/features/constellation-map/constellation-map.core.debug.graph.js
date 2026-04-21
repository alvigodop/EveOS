window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const physics = ns._physics || {};
    const helpers = ns._coreDebugGraphHelpers || {};

    const {
        state,
        MAP_PADDING,
        MOTION_TUNING_FIELDS,
        getViewportSize,
        getNodePolarityState,
        getPolarityStrengthValue,
        isNodeStatic,
        getStaticStateForNode,
        getPolaritySummary,
        getMotionTuningValue
    } = shared;
    const { getMotionProfile } = physics;
    const {
        getDebugViewport,
        getVisibleWorldBounds,
        countOutOfBounds,
        serializeMotionProfile,
        serializeWorldBounds,
        serializeTransform,
        serializeSampleNodes,
        serializeStaticSummary,
        serializePolaritySummary
    } = helpers;

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        if (normalized) return normalized;
        return String(fallback == null ? '' : fallback).trim();
    }

    function toNexusScope(scopeModel) {
        if (!scopeModel || scopeModel.scope === 'all') return {};
        if (scopeModel.scope === 'workspace') {
            return {
                scope: 'workspace',
                workspaceId: text(scopeModel.workspaceId, 'main')
            };
        }
        if (scopeModel.scope === 'card' || scopeModel.scope === 'folder' || scopeModel.scope === 'derived') {
            const base = {
                scope: text(scopeModel.scope, 'card'),
                workspaceId: text(scopeModel.workspaceId, 'main'),
                categoryName: text(scopeModel.categoryName, 'Unsorted')
            };
            if (scopeModel.scope === 'folder') {
                base.folderId = text(scopeModel.folderId, '');
                base.folderLabel = text(scopeModel.folderLabel, '');
            }
            if (scopeModel.scope === 'derived') {
                base.scopeLabel = text(scopeModel.scopeLabel, '');
                base.linkIds = Array.isArray(scopeModel.linkIds)
                    ? scopeModel.linkIds.map(function (value) { return text(value, ''); }).filter(Boolean)
                    : [];
            }
            return base;
        }
        return {};
    }

    function __debugGetGraphStats() {
        const viewport = getDebugViewport(state, getViewportSize);
        const visibleWorldBounds = getVisibleWorldBounds(state, viewport, MAP_PADDING);
        const outOfBounds = countOutOfBounds(state.nodes, visibleWorldBounds);
        const motionProfile = getMotionProfile(state.nodes.length);

        return {
            motionProfile: serializeMotionProfile(motionProfile),
            scope: state.scope,
            motionMode: state.motionMode,
            visible: !!state.container && state.container.style.display !== 'none',
            nodeCount: state.nodes.length,
            edgeCount: state.edges.length,
            labelCount: state.labelHitBoxes.length,
            outOfBounds,
            worldRadius: Number((state.worldRadius || 0).toFixed(2)),
            visibleWorldBounds,
            worldBounds: serializeWorldBounds(state.worldBounds),
            transform: serializeTransform(state.transform),
            sampleNodes: serializeSampleNodes(state.nodes, isNodeStatic, getStaticStateForNode, getNodePolarityState),
            staticSummary: serializeStaticSummary(state),
            polaritySummary: serializePolaritySummary(getPolaritySummary, getPolarityStrengthValue),
            motionTuning: Object.fromEntries(MOTION_TUNING_FIELDS.map((field) => [
                field.key,
                Number(getMotionTuningValue(field.key).toFixed(2))
            ])),
            kinds: state.nodes.reduce((acc, node) => {
                acc[node.kind] = (acc[node.kind] || 0) + 1;
                return acc;
            }, {})
        };
    }

    async function __debugGetNexusProjectionStats(scopeOverride) {
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
        if (!indexApi?.getIntegrityReport || !indexApi?.buildGraphProjection) return null;

        const nexusScope = toNexusScope(scopeOverride || state.scope);
        const [integrity, projection] = await Promise.all([
            indexApi.getIntegrityReport({ scope: nexusScope }),
            indexApi.buildGraphProjection({ scope: nexusScope })
        ]);
        const kinds = (projection?.nodes || []).reduce((acc, node) => {
            const key = text(node?.kind, 'node');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        return {
            scope: nexusScope,
            integrity,
            projection: {
                nodeCount: projection?.nodes?.length || 0,
                edgeCount: projection?.edges?.length || 0,
                kinds
            }
        };
    }

    const coreDebugGraph = ns._coreDebugGraph = ns._coreDebugGraph || {};
    Object.assign(coreDebugGraph, {
        __debugGetGraphStats,
        __debugGetNexusProjectionStats
    });
})(window.EveConstellationMap);
