window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {


    const shared = ns._shared;

    const state = shared.state;

class FXManager {

        constructor() {

            this.engines = new Map();

            this.activeEngine = null;

            this.activeOverlays = new Map(); // Store togglable overlays

            this.container = null;

            this.initialized = false;

        }



        init(container) {

            this.container = container;

            this.initialized = true;

            this.update();

        }



        register(name, EngineClass) {

            this.engines.set(name, EngineClass);

        }



        update() {

            if (!this.initialized) return;



            const targetFx = state.activeWebGlFx || 'none';

            

            // Background Engine

            if (this.activeEngine?.name !== targetFx) {

                if (this.activeEngine) {

                    this.activeEngine.instance.dispose();

                    this.activeEngine = null;

                }



                if (targetFx !== 'none' && this.engines.has(targetFx)) {

                    const EngineClass = this.engines.get(targetFx);

                    const instance = new EngineClass();

                    instance.init(this.container);

                    this.activeEngine = { name: targetFx, instance };

                }

            }

            if (this.activeEngine?.instance?.syncSettings) {
                this.activeEngine.instance.syncSettings();
            }



            // Overlays (Toggles)

            const handleOverlay = (id, enabled) => {

                const current = this.activeOverlays.get(id);

                if (enabled && !current) {

                    const EngineClass = this.engines.get(id);

                    if (EngineClass) {

                        const instance = new EngineClass();

                        instance.init(this.container);

                        this.activeOverlays.set(id, instance);

                    }

                } else if (!enabled && current) {

                    current.dispose();

                    this.activeOverlays.delete(id);

                }

                const next = this.activeOverlays.get(id);
                if (next?.syncSettings) {
                    next.syncSettings();
                }

            };



            handleOverlay('neuralhud', !!state.fxNeuralHudEnabled);



            this.updateCssLayers();

        }



        updateCssLayers() {

            if (!this.container) return;

            this.container.classList.toggle('fx-grid-enabled', !!state.fxGridEnabled);

            this.container.classList.toggle('fx-scanline-enabled', !!state.fxScanlineEnabled);

            this.container.classList.toggle('fx-tech-enabled', !!state.fxTechEnabled);

            this.container.classList.toggle('fx-circuit-enabled', !!state.fxCircuitEnabled);

            const contrast = shared.getFxTuningValue ? shared.getFxTuningValue('contrast') : 1;
            const layerOpacity = shared.getFxTuningValue ? shared.getFxTuningValue('layerOpacity') : 1;
            const gridScale = shared.getFxTuningValue ? shared.getFxTuningValue('gridScale') : 1;
            const glow = shared.getFxTuningValue ? shared.getFxTuningValue('glow') : 1;
            const speed = shared.getFxTuningValue ? shared.getFxTuningValue('speed') : 1;

            if (this.container.style && typeof this.container.style.setProperty === 'function') {
                this.container.style.setProperty('--map-fx-contrast', String(contrast.toFixed(3)));
                this.container.style.setProperty('--map-fx-layer-opacity', String(layerOpacity.toFixed(3)));
                this.container.style.setProperty('--map-fx-grid-size', `${Math.max(24, Math.round(60 * gridScale))}px`);
                this.container.style.setProperty('--map-fx-grid-opacity', String((0.028 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-scanline-opacity', String((0.18 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-tech-opacity', String((0.12 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-circuit-opacity', String((0.11 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-glow-strength', String(glow.toFixed(3)));
                this.container.style.setProperty('--map-fx-motion-speed', String(speed.toFixed(3)));
            }

        }



        dispose() {

            if (this.activeEngine) {

                this.activeEngine.instance.dispose();

                this.activeEngine = null;

            }

            this.activeOverlays.forEach(overlay => overlay.dispose());

            this.activeOverlays.clear();

            this.initialized = false;

        }

    }

    const moduleApi = ns._fxBaseManager = ns._fxBaseManager || {};
    Object.assign(moduleApi, { FXManager });
})(window.EveConstellationMap);
