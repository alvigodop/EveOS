window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsHierarchy = ns._physicsHierarchy = ns._physicsHierarchy || {};

function lerpAngle(current, target, factor) {
        let diff = target - current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return current + diff * factor;
    }

    function normalizeAngle(angle) {
        let value = Number.isFinite(angle) ? angle : 0;
        while (value <= -Math.PI) value += Math.PI * 2;
        while (value > Math.PI) value -= Math.PI * 2;
        return value;
    }

    function getAngleDelta(current, target) {
        return normalizeAngle(target - current);
    }

    function compareNodeOrder(a, b) {
        const labelA = a?.label || '';
        const labelB = b?.label || '';
        return labelA.localeCompare(labelB) || String(a?.id || '').localeCompare(String(b?.id || ''));
    }

    

    Object.assign(physicsHierarchy, {
        lerpAngle,
        normalizeAngle,
        getAngleDelta,
        compareNodeOrder
    });
})(window.EveConstellationMap);
