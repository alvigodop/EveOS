window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const graph = ns._graph || {};
    const render = ns._render || {};
    const physics = ns._physics || {};
    const view = ns._view || {};
    const events = ns._events || {};
    const toolbarMarkup = ns._toolbarMarkup || {};

    const {
        state, LABEL_MODE_ORDER, MOTION_MODE_ORDER, cycleNodePolarity, toggleKindPolarity, setPolarityStrengthValue, setFxTuningValue, setMotionTuningValue, resetMotionTuning, resetFxControls, clearPolarityOverrides, toggleStaticForNode, toggleStaticForKind, toggleStaticBranch, clearStaticLocks, setAuraTuningValue, resetAuraControls, applyAuraPreset, toggleAuraVisuals, toggleAuraEffects, toggleAuraEmitterKind, toggleAuraDepth, setMapThemeColor, setMapThemeTuningValue, resetMapThemeControls, toggleMapThemeFollowSite, resetConstellationControls, ensureMapThemeControls, toggleFxControl, toggleBlobVisuals, cycleBlobMode, toggleBlobRootShells, toggleBlobLayers, resetBlobControls, setBlobTuningValue
    } = shared;
    const { buildGraphData } = graph;
    const { requestDraw, renderHeader, renderInspector, renderToolbarState } = render;
    const { syncMotionAnchors } = physics;
    const { fitToGraph, resetView, zoomAt } = view;
    const { runFind } = events;
    const { getInteractionTargetNode } = toolbarMarkup;

    function handleToolbarClick(event) {
            const wheelActionEl = event.target.closest('[data-map-wheel-action]');
            const wheelAction = wheelActionEl?.dataset?.mapWheelAction;
            if (wheelAction) {
                const wheelNodeId = String(state.actionWheel?.nodeId || '').trim();
                const wheelNode = wheelNodeId
                    ? (state.nodes.find((node) => node.id === wheelNodeId) || null)
                    : null;
                if (wheelNode && typeof ns._runNodeAction === 'function') {
                    ns._runNodeAction(wheelNode, wheelAction);
                }
                return;
            }

            const fxEngineEl = event.target.closest('[data-fx-engine]');
            if (fxEngineEl) {
                state.activeWebGlFx = fxEngineEl.dataset.fxEngine;
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }

            const fxToggleEl = event.target.closest('[data-fx-toggle]');
            if (fxToggleEl) {
                const type = fxToggleEl.dataset.fxToggle;
                if (type === 'grid') state.fxGridEnabled = !state.fxGridEnabled;
                if (type === 'scanline') state.fxScanlineEnabled = !state.fxScanlineEnabled;
                if (type === 'tech') state.fxTechEnabled = !state.fxTechEnabled;
                if (type === 'circuit') state.fxCircuitEnabled = !state.fxCircuitEnabled;
                if (type === 'neuralhud') state.fxNeuralHudEnabled = !state.fxNeuralHudEnabled;
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }

            const fxFlagEl = event.target.closest('[data-map-fx-flag]');
            if (fxFlagEl) {
                toggleFxControl(fxFlagEl.dataset.mapFxFlag);
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }

            const auraToggleEl = event.target.closest('[data-map-aura-toggle]');
            if (auraToggleEl) {
                if (auraToggleEl.dataset.mapAuraToggle === 'effects') toggleAuraEffects();
                else toggleAuraVisuals();
                renderToolbarState();
                requestDraw();
                return;
            }

            const auraEmitterEl = event.target.closest('[data-map-aura-emitter]');
            if (auraEmitterEl) {
                toggleAuraEmitterKind(auraEmitterEl.dataset.mapAuraEmitter);
                renderToolbarState();
                requestDraw();
                return;
            }

            const auraDepthEl = event.target.closest('[data-map-aura-depth]');
            if (auraDepthEl) {
                toggleAuraDepth(auraDepthEl.dataset.mapAuraDepth);
                renderToolbarState();
                requestDraw();
                return;
            }

            const auraPresetEl = event.target.closest('[data-map-aura-preset]');
            if (auraPresetEl) {
                applyAuraPreset(auraPresetEl.dataset.mapAuraPreset);
                renderToolbarState();
                requestDraw();
                return;
            }

            const blobToggleEl = event.target.closest('[data-map-blob-toggle]');
            if (blobToggleEl) {
                const blobMode = blobToggleEl.dataset.mapBlobToggle;
                if (blobMode === 'visuals') toggleBlobVisuals();
                else if (blobMode === 'root-shells') toggleBlobRootShells();
                else if (blobMode === 'layers') toggleBlobLayers();
                renderToolbarState();
                requestDraw();
                return;
            }

            const staticKindEl = event.target.closest('[data-map-static-kind]');
            const directStaticKind = staticKindEl?.dataset?.mapStaticKind;
            if (directStaticKind) {
                toggleStaticForKind(directStaticKind);
                renderInspector();
                requestDraw();
                return;
            }

            const toolbarEl = event.target.closest('[data-map-toolbar]');
            const toolbarAction = toolbarEl?.dataset?.mapToolbar;
            if (!toolbarAction) return;

            if (toolbarAction === 'find') {
                runFind();
            } else if (toolbarAction === 'zoom-in') {
                zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);
            } else if (toolbarAction === 'zoom-out') {
                zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);
            } else if (toolbarAction === 'fit') {
                fitToGraph();
            } else if (toolbarAction === 'reset') {
                resetView();
            } else if (toolbarAction === 'labels') {
                const currentIndex = LABEL_MODE_ORDER.indexOf(state.labelMode);
                state.labelMode = LABEL_MODE_ORDER[(currentIndex + 1) % LABEL_MODE_ORDER.length];
                requestDraw();
                renderToolbarState();
            } else if (toolbarAction === 'fx') {
                if (!state.controlsExpanded) {
                    state.controlsExpanded = true;
                    state.fxExpanded = true;
                } else {
                    state.fxExpanded = !state.fxExpanded;
                }
                renderToolbarState();
            } else if (toolbarAction === 'motion') {
                const currentIndex = MOTION_MODE_ORDER.indexOf(state.motionMode);
                state.motionMode = MOTION_MODE_ORDER[(currentIndex + 1) % MOTION_MODE_ORDER.length];
                syncMotionAnchors(true);
                requestDraw();
                renderToolbarState();
            } else if (toolbarAction === 'controls') {
                state.controlsExpanded = !state.controlsExpanded;
                renderToolbarState();
            } else if (toolbarAction === 'blob-mode') {
                cycleBlobMode();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'blob-reset') {
                resetBlobControls();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'theme-follow-site') {
                toggleMapThemeFollowSite();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'theme-reset') {
                resetMapThemeControls();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'open-site-theme') {
                if (typeof window.openSettings === 'function') {
                    window.openSettings();
                }
            } else if (toolbarAction === 'rewire-mode') {
                if (typeof ns._setConstellationRewireEnabled === 'function') {
                    ns._setConstellationRewireEnabled();
                }
            } else if (toolbarAction === 'rewire-cancel') {
                if (typeof ns._cancelConstellationRewire === 'function') {
                    ns._cancelConstellationRewire();
                }
            } else if (toolbarAction === 'static-node') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticForNode(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-chain') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticBranch(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-kind') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticForKind(targetNode.kind);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-clear') {
                clearStaticLocks();
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-node') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                cycleNodePolarity(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-kind') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleKindPolarity(targetNode.kind);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-clear') {
                clearPolarityOverrides();
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'motion-reset') {
                resetMotionTuning();
                syncMotionAnchors(true);
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'fx-reset') {
                resetFxControls();
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'aura-reset') {
                resetAuraControls();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'controls-reset') {
                resetConstellationControls();
                clearStaticLocks();
                clearPolarityOverrides();
                syncMotionAnchors(true);
                buildGraphData(state.scope);
                renderHeader();
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'stability') {
                state.stableMainNodes = !state.stableMainNodes;
                buildGraphData(state.scope);
                renderHeader();
                requestDraw();
            } else if (toolbarAction === 'chain-internal') {
                state.chainInternalForcesEnabled = !state.chainInternalForcesEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'chain-external') {
                state.chainExternalForcesEnabled = !state.chainExternalForcesEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'chain-hierarchy') {
                state.chainHierarchyEnabled = !state.chainHierarchyEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'bookmark-hierarchy') {
                state.bookmarkHierarchyEnabled = !state.bookmarkHierarchyEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'physics-auras') {
                toggleAuraVisuals();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'close') {
                ns.closeMap();
            }
    }

    function handleToolbarInput(event) {
            const polarityMode = event.target?.dataset?.mapPolarityStrength;
            const polarityNumberMode = event.target?.dataset?.mapPolarityStrengthNumber;
            const motionTuningMode = event.target?.dataset?.mapMotionTuning;
            const motionTuningNumberMode = event.target?.dataset?.mapMotionTuningNumber;
            const fxTuningMode = event.target?.dataset?.mapFxTuning;
            const fxTuningNumberMode = event.target?.dataset?.mapFxTuningNumber;
            const auraTuningMode = event.target?.dataset?.mapAuraTuning;
            const auraTuningNumberMode = event.target?.dataset?.mapAuraTuningNumber;
            const blobTuningMode = event.target?.dataset?.mapBlobTuning;
            const blobTuningNumberMode = event.target?.dataset?.mapBlobTuningNumber;
            const themeTuningMode = event.target?.dataset?.mapThemeTuning;
            const themeTuningNumberMode = event.target?.dataset?.mapThemeTuningNumber;
            const themeColorMode = event.target?.dataset?.mapThemeColor;

            if (polarityMode || polarityNumberMode) {
                setPolarityStrengthValue(polarityMode || polarityNumberMode, event.target.value);
                renderToolbarState();
                renderInspector();
                requestDraw();
                return;
            }

            if (motionTuningMode || motionTuningNumberMode) {
                setMotionTuningValue(motionTuningMode || motionTuningNumberMode, event.target.value);
                renderToolbarState();
                requestDraw();
                return;
            }

            if (fxTuningMode || fxTuningNumberMode) {
                setFxTuningValue(fxTuningMode || fxTuningNumberMode, event.target.value);
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }

            if (auraTuningMode || auraTuningNumberMode) {
                setAuraTuningValue(auraTuningMode || auraTuningNumberMode, event.target.value);
                renderToolbarState();
                requestDraw();
                return;
            }

            if (blobTuningMode || blobTuningNumberMode) {
                setBlobTuningValue(blobTuningMode || blobTuningNumberMode, event.target.value);
                renderToolbarState();
                requestDraw();
                return;
            }

            if (themeTuningMode || themeTuningNumberMode) {
                const themeControls = ensureMapThemeControls();
                themeControls.followSiteTheme = false;
                setMapThemeTuningValue(themeTuningMode || themeTuningNumberMode, event.target.value);
                renderToolbarState();
                requestDraw();
                return;
            }

            if (themeColorMode) {
                const themeControls = ensureMapThemeControls();
                themeControls.followSiteTheme = false;
                setMapThemeColor(themeColorMode, event.target.value);
                renderToolbarState();
                requestDraw();
            }
    }

    const moduleApi = ns._toolbarHandlers = ns._toolbarHandlers || {};
    Object.assign(moduleApi, { handleToolbarClick, handleToolbarInput });
})(window.EveConstellationMap);
