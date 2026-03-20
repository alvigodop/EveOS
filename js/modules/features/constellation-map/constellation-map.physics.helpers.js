window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsAura = ns._physicsAura || {};
    const physicsMotion = ns._physicsMotion || {};
    const physicsPolarity = ns._physicsPolarity || {};

    const physicsHelpers = ns._physicsHelpers = ns._physicsHelpers || {};

    Object.assign(physicsHelpers, physicsAura, physicsMotion, physicsPolarity);

})(window.EveConstellationMap);
