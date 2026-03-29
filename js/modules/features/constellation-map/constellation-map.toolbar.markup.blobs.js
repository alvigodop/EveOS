window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { escapeHtml, getBlobModeText, getBlobSummaryText } = shared;
    const builders = ns._toolbarMarkupBuilders || {};
    const { buildBlobTuningMarkup } = builders;

    function buildBlobControlsSection() {
        return [
            '<details class="map-controls-section">',
            '<summary class="map-section-title" style="cursor:pointer;">Blob View</summary>',
            '<div style="display:flex;flex-direction:column;gap:10px;padding-top:10px;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
            '<button type="button" data-map-blob-toggle="visuals" class="map-btn">Blob View: OFF</button>',
            '<button type="button" data-map-toolbar="blob-mode" class="map-btn">' + escapeHtml(getBlobModeText()) + '</button>',
            '<button type="button" data-map-blob-toggle="root-shells" class="map-btn">Root Blobs: ON</button>',
            '<button type="button" data-map-blob-toggle="layers" class="map-btn">Blob Layers: OFF</button>',
            '<button type="button" data-map-toolbar="blob-reset" class="map-btn">Reset Blobs</button>',
            '</div>',
            '<div data-map-blob-summary class="map-controls-summary">' + escapeHtml(getBlobSummaryText()) + '</div>',
            '<div class="map-section-copy">Blob-to-Blob keeps each shell scoped to direct children, so folders can sit inside a parent shell without forcing descendants into the same mass. Switch to Onion when you want nested descendant shells.</div>',
            '<div class="map-controls-grid map-controls-grid-2">',
            '<div class="map-controls-stack">',
            '<div class="map-section-title">Structure</div>',
            buildBlobTuningMarkup('structure'),
            '</div>',
            '<div class="map-controls-stack">',
            '<div class="map-section-title">Appearance</div>',
            buildBlobTuningMarkup('appearance'),
            '</div>',
            '</div>',
            '</div>',
            '</details>'
        ].join('');
    }

    ns._toolbarMarkupBlobs = Object.assign(ns._toolbarMarkupBlobs || {}, {
        buildBlobControlsSection
    });
})(window.EveConstellationMap);
