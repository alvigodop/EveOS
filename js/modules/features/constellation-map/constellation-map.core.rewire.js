window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const rewire = ns._coreRewire = ns._coreRewire || {};

    Object.assign(rewire, {
        canRewireNode: rewire.canRewireNode,
        canDetachNodeToRoot: rewire.canDetachNodeToRoot,
        canDetachNodeToParking: rewire.canDetachNodeToParking,
        hasArmedSource: rewire.hasArmedSource,
        getArmedSourceCount: rewire.getArmedSourceCount,
        getRewireSummary: rewire.getRewireSummary,
        setRewireEnabled: rewire.setRewireEnabled,
        armNodeForRewire: rewire.armNodeForRewire,
        cancelRewire: rewire.cancelRewire,
        beginRewireDrag: rewire.beginRewireDrag,
        updateRewireDrag: rewire.updateRewireDrag,
        finishRewireDrag: rewire.finishRewireDrag,
        detachNodeToRoot: rewire.detachNodeToRoot,
        detachNodeToParking: rewire.detachNodeToParking,
        refreshGraphAfterMove: rewire.refreshGraphAfterMove,
        commitArmedSourceToTarget: rewire.commitArmedSourceToTarget
    });

    ns._canConstellationRewireNode = rewire.canRewireNode;
    ns._setConstellationRewireEnabled = rewire.setRewireEnabled;
    ns._armConstellationRewireNode = rewire.armNodeForRewire;
    ns._cancelConstellationRewire = rewire.cancelRewire;
    ns._beginConstellationRewireDrag = rewire.beginRewireDrag;
    ns._updateConstellationRewireDrag = rewire.updateRewireDrag;
    ns._finishConstellationRewireDrag = rewire.finishRewireDrag;
    ns._detachConstellationNodeToRoot = rewire.detachNodeToRoot;
    ns._detachConstellationNodeToParking = rewire.detachNodeToParking;
    ns._refreshConstellationGraphAfterMove = rewire.refreshGraphAfterMove;
    ns._commitConstellationRewireTarget = rewire.commitArmedSourceToTarget;
    ns._getConstellationRewireSummary = rewire.getRewireSummary;
})(window.EveConstellationMap);
