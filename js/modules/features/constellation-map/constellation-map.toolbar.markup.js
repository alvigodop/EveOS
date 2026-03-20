window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, MOTION_TUNING_FIELDS, escapeHtml, getMotionTuningText } = shared;

    function getInteractionTargetNode() {
        return state.selected || state.hovered || null;
    }

    function buildMotionTuningMarkup() {
        return MOTION_TUNING_FIELDS.map((field) => [
            '<label style="display:grid;grid-template-columns:92px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input data-map-motion-tuning="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMotionTuningText(field.key)) + '" style="width:100%;">',
            '<span data-map-motion-tuning-value="' + escapeHtml(field.key) + '" style="min-width:42px;text-align:right;">' + escapeHtml(getMotionTuningText(field.key)) + '</span>',
            '<input data-map-motion-tuning-number="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMotionTuningText(field.key)) + '" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',
            '</label>'
        ].join('')).join('');
    }

    function buildOverlayMarkup() {
        return [
            '<div class="map-fx-layer"></div>',
            '<div style="position:absolute;z-index:3;top:16px;left:20px;display:flex;flex-direction:column;gap:4px;max-width:min(48vw,680px);pointer-events:auto;">',
            '<div data-map-title style="font-size:1.05rem;font-weight:700;letter-spacing:0.06em;color:#f3f8ff;">NEURAL CORE :: CONSTELLATION MAP</div>',
            '<div data-map-scope style="font-size:0.82rem;color:rgba(255,255,255,0.76);"></div>',
            '<div data-map-stats style="font-size:0.78rem;color:rgba(255,255,255,0.58);"></div>',
            '</div>',
            '<div style="position:absolute;z-index:3;top:16px;right:20px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-width:min(52vw,900px);pointer-events:auto;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<input data-map-find type="search" placeholder="Find bookmark, card, folder..." style="min-width:240px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;outline:none;">',
            '<button type="button" data-map-toolbar="find" class="map-btn">Find</button>',
            '<button type="button" data-map-toolbar="zoom-out" class="map-btn">-</button>',
            '<button type="button" data-map-toolbar="zoom-in" class="map-btn">+</button>',
            '<button type="button" data-map-toolbar="fit" class="map-btn">Fit</button>',
            '<button type="button" data-map-toolbar="reset" class="map-btn">Reset</button>',
            '<button type="button" data-map-toolbar="labels" class="map-btn">Labels: Auto</button>',
            '<button type="button" data-map-toolbar="fx" class="map-btn">Background FX</button>',
            '<button type="button" data-map-toolbar="motion" class="map-btn">Motion: Web</button>',
            '<button type="button" data-map-toolbar="controls" class="map-btn">Settings</button>',
            '<button type="button" data-map-toolbar="close" class="map-btn" style="border-color:rgba(255,80,120,0.3);background:rgba(255,80,120,0.14);">Close</button>',
            '</div>',
            '<div data-map-fx-panel class="fx-panel-popup">',
            '<div class="fx-row">',
            '<div class="fx-label">Background Engine</div>',
            '<div class="fx-grid">',
            '<button class="fx-item-btn" data-fx-engine="none">None</button>',
            '<button class="fx-item-btn" data-fx-engine="solaris">Solaris</button>',
            '<button class="fx-item-btn" data-fx-engine="neural">Neural</button>',
            '<button class="fx-item-btn" data-fx-engine="waves">Waves</button>',
            '<button class="fx-item-btn" data-fx-engine="tokamak">Tokamak</button>',
            '<button class="fx-item-btn" data-fx-engine="memento">Memento</button>',
            '<button class="fx-item-btn" data-fx-engine="art">Art</button>',
            '<button class="fx-item-btn" data-fx-engine="raymarching">Raymarch</button>',
            '<button class="fx-item-btn" data-fx-engine="attraction">Attract</button>',
            '<button class="fx-item-btn" data-fx-engine="ascii">ASCII</button>',
            '<button class="fx-item-btn" data-fx-engine="blurred">Blurred</button>',
            '<button class="fx-item-btn" data-fx-engine="svgfilters">SVG Filter</button>',
            '<button class="fx-item-btn" data-fx-engine="particles">Particles</button>',
            '<button class="fx-item-btn" data-fx-engine="shaderedit">Shader Edit</button>',
            '<button class="fx-item-btn" data-fx-engine="dotwave">Dot Wave</button>',
            '<button class="fx-item-btn" data-fx-engine="cosmicsun">Cosmic Sun</button>',
            '<button class="fx-item-btn" data-fx-engine="auracursor">Aura Cursor</button>',
            '</div>',
            '</div>',
            '<div class="fx-row">',
            '<div class="fx-label">Visual Layers</div>',
            '<div class="fx-toggle-group">',
            '<div class="fx-toggle-chip" data-fx-toggle="grid">Grid</div>',
            '<div class="fx-toggle-chip" data-fx-toggle="scanline">Scanline</div>',
            '<div class="fx-toggle-chip" data-fx-toggle="tech">Tech</div>',
            '<div class="fx-toggle-chip" data-fx-toggle="circuit">Circuit</div>',
            '<div class="fx-toggle-chip" data-fx-toggle="neuralhud">Neural HUD</div>',
            '</div>',
            '</div>',
            '</div>',
            '<div data-map-controls-panel style="display:none;flex-direction:column;gap:12px;align-items:stretch;align-self:stretch;min-width:min(440px,calc(100vw - 40px));max-width:min(52vw,900px);padding:14px 16px;border:1px solid rgba(255,255,255,0.14);background:rgba(4,10,20,0.88);border-radius:16px;box-shadow:0 18px 34px rgba(0,0,0,0.28);">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<button type="button" data-map-toolbar="static-node" class="map-btn">Static Node</button>',
            '<button type="button" data-map-toolbar="static-chain" class="map-btn">Static Chain</button>',
            '<button type="button" data-map-toolbar="static-kind" class="map-btn">Static Type</button>',
            '<button type="button" data-map-toolbar="static-clear" class="map-btn">Clear Static</button>',
            '<div data-map-static-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">Static: none</div>',
            '<button type="button" data-map-toolbar="stability" class="map-btn">Stability: ON</button>',
            '<button type="button" data-map-toolbar="chain-internal" class="map-btn">Internal Chain: ON</button>',
            '<button type="button" data-map-toolbar="chain-external" class="map-btn">External Chain: ON</button>',
            '<button type="button" data-map-toolbar="chain-hierarchy" class="map-btn">Hierarchy Order: ON</button>',
            '<button type="button" data-map-toolbar="bookmark-hierarchy" class="map-btn">Bookmark Hierarchy: ON</button>',
            '<button type="button" data-map-toolbar="physics-auras" class="map-btn">Physics Auras: OFF</button>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<button type="button" data-map-static-kind="workspace" class="map-btn">Freeze Tab</button>',
            '<button type="button" data-map-static-kind="category" class="map-btn">Freeze Card</button>',
            '<button type="button" data-map-static-kind="folder" class="map-btn">Freeze Folder</button>',
            '<button type="button" data-map-static-kind="link" class="map-btn">Freeze Bookmark</button>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<button type="button" data-map-toolbar="polarity-node" class="map-btn">Node: Inherit</button>',
            '<button type="button" data-map-toolbar="polarity-kind" class="map-btn">Type: Push</button>',
            '<button type="button" data-map-toolbar="polarity-clear" class="map-btn">Clear Flow</button>',
            '<button type="button" data-map-toolbar="motion-reset" class="map-btn">Reset Forces</button>',
            '<div data-map-polarity-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">Flow: push default</div>',
            '</div>',
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;align-items:start;">',
            '<label style="display:grid;grid-template-columns:42px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',
            '<span>Push</span>',
            '<input data-map-polarity-strength="repel" type="range" min="0" max="2.5" step="0.01" value="0.76" style="width:100%;">',
            '<span data-map-polarity-strength-value="repel" style="min-width:42px;text-align:right;">0.76</span>',
            '<input data-map-polarity-strength-number="repel" type="number" min="0" max="2.5" step="0.01" value="0.76" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',
            '</label>',
            '<label style="display:grid;grid-template-columns:42px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',
            '<span>Pull</span>',
            '<input data-map-polarity-strength="attract" type="range" min="0" max="2.5" step="0.01" value="0.62" style="width:100%;">',
            '<span data-map-polarity-strength-value="attract" style="min-width:42px;text-align:right;">0.62</span>',
            '<input data-map-polarity-strength-number="attract" type="number" min="0" max="2.5" step="0.01" value="0.62" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',
            '</label>',
            '</div>',
            '<div style="display:flex;flex-direction:column;gap:8px;">',
            buildMotionTuningMarkup(),
            '</div>',
            '<div style="font-size:0.78rem;line-height:1.5;color:rgba(255,255,255,0.74);padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);">Drag background to pan. Hold Space to force-pan through dense clusters. Drag nodes to reorganize. Mouse wheel zooms. Double-click a bookmark node to open it.</div>',
            '</div>',
            '</div>',
            '<canvas data-map-canvas style="position:absolute;z-index:1;inset:0;width:100%;height:100%;display:block;cursor:grab;"></canvas>',
            '<div data-map-info style="position:absolute;z-index:3;right:108px;bottom:20px;max-width:min(360px,calc(100vw - 200px));min-width:260px;border:1px solid rgba(255,255,255,0.14);background:rgba(3,10,20,0.86);border-radius:16px;padding:14px 16px;color:#fff;box-shadow:0 18px 40px rgba(0,0,0,0.35);pointer-events:auto;"></div>'
        ].join('');
    }

    const toolbarMarkup = ns._toolbarMarkup = ns._toolbarMarkup || {};
    Object.assign(toolbarMarkup, {
        getInteractionTargetNode,
        buildMotionTuningMarkup,
        buildOverlayMarkup
    });
})(window.EveConstellationMap);
