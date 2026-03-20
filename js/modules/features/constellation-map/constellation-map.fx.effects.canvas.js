window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxCanvasAmbient = ns._fxCanvasAmbient || {};
    const fxCanvasInteractive = ns._fxCanvasInteractive || {};
    const fxCanvasWaveforms = ns._fxCanvasWaveforms || {};

    const { MementoEffect, ArtEffect, AsciiEffect } = fxCanvasAmbient;
    const { AttractionEffect, LinesDotsEffect, AuraCursorEffect } = fxCanvasInteractive;
    const { WavesEffect, DotWaveEffect } = fxCanvasWaveforms;

    const fxCanvas = ns._fxCanvas = ns._fxCanvas || {};
    Object.assign(fxCanvas, {
        MementoEffect,
        AttractionEffect,
        ArtEffect,
        AsciiEffect,
        WavesEffect,
        LinesDotsEffect,
        DotWaveEffect,
        AuraCursorEffect
    });
})(window.EveConstellationMap);
