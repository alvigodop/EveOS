window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const fxBase = ns._fxBase || {};

    const fxWebGlThree = ns._fxWebGlThree || {};

    const fxWebGlQuantum = ns._fxWebGlQuantum || {};

    const fxWebGlShaders = ns._fxWebGlShaders || {};

    const fxCanvas = ns._fxCanvas || {};

    const fxDom = ns._fxDom || {};



    const { FXManager } = fxBase;

    const {

        SolarisEffect,

        TokamakEffect

    } = fxWebGlThree;

    const {

        QuantumNeuralEffect

    } = fxWebGlQuantum;

    const {

        RaymarchingEffect,

        FragmentShaderEditorEffect,

        CosmicSunEffect

    } = fxWebGlShaders;

    const {

        MementoEffect,

        AttractionEffect,

        ArtEffect,

        AsciiEffect,

        WavesEffect,

        LinesDotsEffect,

        DotWaveEffect,

        AuraCursorEffect

    } = fxCanvas;

    const {

        BlurredLoaderEffect,

        SVGFiltersEffect,

        NeuralNexusHUD

    } = fxDom;



    ns.FX = {

        manager: new FXManager(),

        SolarisEffect,

        QuantumNeuralEffect,

        WavesEffect,

        TokamakEffect,

        MementoEffect,

        ArtEffect,

        RaymarchingEffect,

        AttractionEffect,

        AsciiEffect,

        BlurredLoaderEffect,

        SVGFiltersEffect,

        LinesDotsEffect,

        FragmentShaderEditorEffect,

        DotWaveEffect,

        CosmicSunEffect,

        AuraCursorEffect,

        NeuralNexusHUD

    };



    ns.FX.manager.register('solaris', SolarisEffect);

    ns.FX.manager.register('neural', QuantumNeuralEffect);

    ns.FX.manager.register('waves', WavesEffect);

    ns.FX.manager.register('tokamak', TokamakEffect);

    ns.FX.manager.register('memento', MementoEffect);

    ns.FX.manager.register('art', ArtEffect);

    ns.FX.manager.register('raymarching', RaymarchingEffect);

    ns.FX.manager.register('attraction', AttractionEffect);

    ns.FX.manager.register('ascii', AsciiEffect);

    ns.FX.manager.register('blurred', BlurredLoaderEffect);

    ns.FX.manager.register('svgfilters', SVGFiltersEffect);

    ns.FX.manager.register('particles', LinesDotsEffect);

    ns.FX.manager.register('shaderedit', FragmentShaderEditorEffect);

    ns.FX.manager.register('dotwave', DotWaveEffect);

    ns.FX.manager.register('cosmicsun', CosmicSunEffect);

    ns.FX.manager.register('auracursor', AuraCursorEffect);

    ns.FX.manager.register('neuralhud', NeuralNexusHUD);



})(window.EveConstellationMap);

