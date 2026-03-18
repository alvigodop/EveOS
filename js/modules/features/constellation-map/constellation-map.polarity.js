window.EveConstellationMap = window.EveConstellationMap || {};
(function (ns) {
    const shared = ns._shared || {};
    const { state, clamp } = shared;
    const DEFAULT_KIND_POLARITIES = Object.freeze({
        workspace: 'repel',
        category: 'repel',
        folder: 'repel',
        link: 'repel'
    });

    function normalizePolarityStrength(value, fallback) {

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, 0, 2.5);

        }

        return clamp(Number(fallback) || 1, 0, 2.5);

    }



    function getPolarityStrengthValue(mode) {

        const key = mode === 'attract' ? 'attract' : 'repel';

        return normalizePolarityStrength(state.polarityStrength?.[key], key === 'attract' ? 0.62 : 0.76);

    }



    function setPolarityStrengthValue(mode, value) {

        const key = mode === 'attract' ? 'attract' : 'repel';

        state.polarityStrength[key] = normalizePolarityStrength(value, getPolarityStrengthValue(key));

        return state.polarityStrength[key];

    }



    function getPolarityStrengthText(mode) {

        return getPolarityStrengthValue(mode).toFixed(2);

    }



    function normalizePolarityMode(value, fallback, allowInherit) {

        const normalized = String(value || '').trim().toLowerCase();

        if (normalized === 'attract' || normalized === 'repel') return normalized;

        if (allowInherit && (normalized === 'inherit' || normalized === '')) return 'inherit';

        return fallback === 'attract' ? 'attract' : 'repel';

    }



    function getKindPolarity(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return 'repel';

        const current = state.kindPolarities?.[normalizedKind];

        if (current === 'attract' || current === 'repel') return current;

        return DEFAULT_KIND_POLARITIES[normalizedKind] || 'repel';

    }



    function getNodePolarityState(node) {

        if (!node?.id) {

            return {

                effective: 'repel',

                nodeOverride: 'inherit',

                kind: 'repel',

                source: 'default'

            };

        }

        const nodeId = String(node.id);

        const nodeOverride = normalizePolarityMode(state.nodePolarities.get(nodeId), 'repel', true);

        const kindPolarity = getKindPolarity(node.kind);

        if (nodeOverride === 'attract' || nodeOverride === 'repel') {

            return {

                effective: nodeOverride,

                nodeOverride,

                kind: kindPolarity,

                source: 'node'

            };

        }

        return {

            effective: kindPolarity,

            nodeOverride: 'inherit',

            kind: kindPolarity,

            source: kindPolarity === (DEFAULT_KIND_POLARITIES[String(node.kind || '')] || 'repel') ? 'default' : 'kind'

        };

    }



    function getEffectivePolarity(node) {

        return getNodePolarityState(node).effective;

    }



    function cycleNodePolarity(node) {

        if (!node?.id) return 'inherit';

        const nodeId = String(node.id);

        const current = normalizePolarityMode(state.nodePolarities.get(nodeId), 'repel', true);

        if (current === 'inherit') {

            state.nodePolarities.set(nodeId, 'attract');

            return 'attract';

        }

        if (current === 'attract') {

            state.nodePolarities.set(nodeId, 'repel');

            return 'repel';

        }

        state.nodePolarities.delete(nodeId);

        return 'inherit';

    }



    function toggleKindPolarity(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return 'repel';

        const next = getKindPolarity(normalizedKind) === 'attract' ? 'repel' : 'attract';

        state.kindPolarities[normalizedKind] = next;

        return next;

    }



    function clearPolarityOverrides() {

        state.kindPolarities = {
            workspace: 'repel',
            category: 'repel',
            folder: 'repel',
            link: 'repel'
        };

        state.polarityStrength = {
            attract: 0.62,
            repel: 0.76
        };

        state.nodePolarities = new Map();

    }



    function getPolaritySummary() {

        const attractKinds = Object.entries(state.kindPolarities || {})
            .filter(([, value]) => value === 'attract')
            .map(([kind]) => kind);

        const visibleNodeIds = new Set((Array.isArray(state.nodes) ? state.nodes : []).map((node) => String(node?.id || '')).filter(Boolean));

        let nodeOverrideCount = 0;

        state.nodePolarities.forEach((value, nodeId) => {

            if (!visibleNodeIds.has(String(nodeId || ''))) return;

            if (normalizePolarityMode(value, 'repel', true) === 'inherit') return;

            nodeOverrideCount += 1;

        });

        return {
            attractKinds,
            nodeOverrideCount,
            total: attractKinds.length + nodeOverrideCount
        };

    }

const sharedState = ns._shared = ns._shared || {};
    Object.assign(sharedState, {
        getKindPolarity,
        getNodePolarityState,
        getEffectivePolarity,
        cycleNodePolarity,
        toggleKindPolarity,
        getPolarityStrengthValue,
        setPolarityStrengthValue,
        getPolarityStrengthText,
        clearPolarityOverrides,
        getPolaritySummary
    });
})(window.EveConstellationMap);
