window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    function getShared() {
        return ns._shared || {};
    }

    function getState() {
        return getShared().state || { nodes: [] };
    }

    function isAuraEffectsEnabled() {
        return !!getShared().isAuraEffectsEnabled?.();
    }

    function getNodePolarityState(node) {
        return getShared().getNodePolarityState?.(node) || {};
    }

    function getPeerTerritoryRadius(node) {
        const polarity = getNodePolarityState(node);
        const motionMode = String(polarity.mode || '').toUpperCase();

        if (node.kind === 'folder') {
            if (motionMode === 'DISPERSION') return 140;
            if (motionMode === 'POLARIZED') return 120;
            if (motionMode === 'DRIFT') return 100;
            return 110;
        }

        if (node.kind === 'link') {
            if (motionMode === 'DISPERSION') return 90;
            if (motionMode === 'POLARIZED') return 75;
            if (motionMode === 'DRIFT') return 65;
            return 70;
        }

        return 0;
    }

    function applyPeerAuraRepulsion(nodeA, nodeB) {
        if (!nodeA || !nodeB) return;
        if (nodeA.kind !== nodeB.kind) return;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy;

        const rA = getPeerTerritoryRadius(nodeA);
        const rB = getPeerTerritoryRadius(nodeB);
        const sumRadii = rA + rB;
        const effectiveRadius = sumRadii * 0.88;

        if (distSq >= effectiveRadius * effectiveRadius) return;

        const dist = Math.max(1, Math.sqrt(distSq));
        const penetration = 1 - (dist / effectiveRadius);

        nodeA._peerOverlap = Math.max(nodeA._peerOverlap || 0, penetration);
        nodeB._peerOverlap = Math.max(nodeB._peerOverlap || 0, penetration);
        nodeA._peerTerritoryRadius = rA;
        nodeB._peerTerritoryRadius = rB;

        const force = 4.0 * penetration + 12.0 * Math.pow(penetration, 2);

        const nx = dx / dist;
        const ny = dy / dist;

        nodeA.vx -= nx * force * 0.5;
        nodeA.vy -= ny * force * 0.5;
        nodeB.vx += nx * force * 0.5;
        nodeB.vy += ny * force * 0.5;

        if (penetration > 0.3) {
            const damp = 0.85;
            nodeA.vx *= damp;
            nodeA.vy *= damp;
            nodeB.vx *= damp;
            nodeB.vy *= damp;
        }
    }

    function runPeerAuraPass() {
        const state = getState();
        if (!isAuraEffectsEnabled()) return;

        for (let i = 0; i < state.nodes.length; i++) {
            state.nodes[i]._peerOverlap = 0;
        }

        const peerGroups = new Map();
        for (let i = 0; i < state.nodes.length; i++) {
            const node = state.nodes[i];
            if (node.kind !== 'folder' && node.kind !== 'link') continue;
            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            if (!pId) continue;

            const groupKey = pId + '|' + (node.data?.depth || 0);
            if (!peerGroups.has(groupKey)) peerGroups.set(groupKey, []);
            peerGroups.get(groupKey).push(node);
        }

        peerGroups.forEach(function (group) {
            if (group.length < 2) return;
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    applyPeerAuraRepulsion(group[i], group[j]);
                }
            }
        });
    }

    ns._physicsAuraPeerHelpers = Object.assign(ns._physicsAuraPeerHelpers || {}, {
        runPeerAuraPass
    });
})(window.EveConstellationMap);
