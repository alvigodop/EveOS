window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const {
        state,
        MOTION_TUNING_FIELDS,
        AURA_TUNING_FIELDS,
        AURA_PRESETS,
        AURA_DEPTH_ORDER,
        escapeHtml,
        getMotionTuningText,
        getAuraTuningText,
        getAuraPresetText,
        getKindDisplayName
    } = shared;

    function getInteractionTargetNode() {
        return state.selected || state.hovered || null;
    }

    function buildRangeNumberRows(fields, rangeAttr, numberAttr, valueAttr) {
        return fields.map((field) => [
            '<label style="display:grid;grid-template-columns:128px minmax(112px,1fr) 54px 68px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input ' + rangeAttr + '="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '" style="width:100%;">',
            '<span ' + valueAttr + '="' + escapeHtml(field.key) + '" style="min-width:42px;text-align:right;">' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '</span>',
            '<input ' + numberAttr + '="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '" style="width:68px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',
            '</label>'
        ].join('')).join('');
    }

    function buildAuraTuningMarkup(section) {
        const fields = AURA_TUNING_FIELDS.filter((field) => field.section === section);
        return buildRangeNumberRows(fields, 'data-map-aura-tuning', 'data-map-aura-tuning-number', 'data-map-aura-tuning-value');
    }

    function buildMotionTuningMarkup() {
        return buildRangeNumberRows(MOTION_TUNING_FIELDS, 'data-map-motion-tuning', 'data-map-motion-tuning-number', 'data-map-motion-tuning-value');
    }

    function buildPresetButtons() {
        return Object.entries(AURA_PRESETS).map(([key, preset]) => {
            return '<button type="button" data-map-aura-preset="' + escapeHtml(key) + '" class="map-btn">' + escapeHtml(preset.label) + '</button>';
        }).join('');
    }

    function buildDepthButtons() {
        const labels = {
            root: 'Root Layer',
            layer1: 'Layer 1',
            layer2: 'Layer 2',
            layer3plus: 'Layer 3+'
        };
        return AURA_DEPTH_ORDER.map((key) => {
            return '<button type="button" data-map-aura-depth="' + escapeHtml(key) + '" class="map-btn">' + escapeHtml(labels[key] || key) + '</button>';
        }).join('');
    }

    function buildOverlayMarkup() {
        return [
            '<style>',
            '.map-controls-panel{display:none;flex-direction:column;gap:12px;align-items:stretch;align-self:stretch;min-width:min(520px,calc(100vw - 40px));max-width:min(62vw,1080px);max-height:min(calc(100vh - 112px),820px);padding:14px 16px;border:1px solid rgba(255,255,255,0.14);background:linear-gradient(180deg,rgba(7,16,30,0.96) 0%,rgba(4,10,20,0.92) 100%);border-radius:16px;box-shadow:0 18px 34px rgba(0,0,0,0.28);backdrop-filter:blur(12px);}',
            '.map-controls-scroll{display:flex;flex-direction:column;gap:12px;overflow-y:auto;overflow-x:hidden;padding-right:8px;scrollbar-width:thin;scrollbar-color:rgba(96,218,255,0.62) rgba(255,255,255,0.08);}',
            '.map-controls-scroll::-webkit-scrollbar{width:10px;}',
            '.map-controls-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.07);border-radius:999px;}',
            '.map-controls-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(84,205,255,0.95) 0%,rgba(34,129,210,0.95) 100%);border-radius:999px;border:2px solid rgba(3,10,20,0.86);}',
            '.map-controls-scroll::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(112,222,255,1) 0%,rgba(49,154,235,1) 100%);}',
            '.map-controls-section{border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);border-radius:14px;padding:10px 12px;}',
            '.map-controls-section summary{list-style:none;}',
            '.map-controls-section summary::-webkit-details-marker{display:none;}',
            '.map-controls-section[open] summary{margin-bottom:2px;}',
            '</style>',
            '<div class="map-fx-layer"></div>',
            '<div style="position:absolute;z-index:3;top:16px;left:20px;display:flex;flex-direction:column;gap:4px;max-width:min(48vw,680px);pointer-events:auto;">',
            '<div data-map-title style="font-size:1.05rem;font-weight:700;letter-spacing:0.06em;color:#f3f8ff;">NEURAL CORE :: CONSTELLATION MAP</div>',
            '<div data-map-scope style="font-size:0.82rem;color:rgba(255,255,255,0.76);"></div>',
            '<div data-map-stats style="font-size:0.78rem;color:rgba(255,255,255,0.58);"></div>',
            '</div>',
            '<div style="position:absolute;z-index:3;top:16px;right:20px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-width:min(56vw,980px);pointer-events:auto;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<input data-map-find type="search" placeholder="Find bookmark, card, folder..." style="min-width:240px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;outline:none;">',
            '<button type="button" data-map-toolbar="find" class="map-btn">Find</button>',
            '<button type="button" data-map-toolbar="zoom-out" class="map-btn">-</button>',
            '<button type="button" data-map-toolbar="zoom-in" class="map-btn">+</button>',
            '<button type="button" data-map-toolbar="fit" class="map-btn">Fit</button>',
            '<button type="button" data-map-toolbar="reset" class="map-btn">Reset</button>',
            '<button type="button" data-map-toolbar="labels" class="map-btn">Labels: Auto</button>',
            '<button type="button" data-map-toolbar="motion" class="map-btn">Motion: Web</button>',
            '<button type="button" data-map-toolbar="controls" class="map-btn">Control Center</button>',
            '<button type="button" data-map-toolbar="close" class="map-btn" style="border-color:rgba(255,80,120,0.3);background:rgba(255,80,120,0.14);">Close</button>',
            '</div>',
            '<div data-map-controls-panel class="map-controls-panel">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between;">',
            '<div style="font-size:0.86rem;font-weight:700;letter-spacing:0.04em;color:#f3f8ff;">Constellation Control Center</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',
            '<button type="button" data-map-toolbar="aura-reset" class="map-btn">Reset Auras</button>',
            '<button type="button" data-map-toolbar="motion-reset" class="map-btn">Reset Motion</button>',
            '<button type="button" data-map-toolbar="controls-reset" class="map-btn">Reset All</button>',
            '</div>',
            '</div>',
            '<div class="map-controls-scroll">',
            '<details open class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Background FX</summary>',
            '<div data-map-fx-panel style="display:flex;flex-direction:column;gap:10px;padding-top:10px;">',
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
            '</details>',
            '<details open class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Auras</summary>',
            '<div style="display:flex;flex-direction:column;gap:10px;padding-top:10px;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
            '<button type="button" data-map-aura-toggle="visuals" class="map-btn">Aura Volumes: ON</button>',
            '<button type="button" data-map-aura-toggle="effects" class="map-btn">Aura Forces: ON</button>',
            '<button type="button" data-map-aura-emitter="workspace" class="map-btn">Tab Auras</button>',
            '<button type="button" data-map-aura-emitter="category" class="map-btn">Card Auras</button>',
            '<button type="button" data-map-aura-emitter="folder" class="map-btn">Folder Auras</button>',
            '<span data-map-aura-preset-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">' + escapeHtml(getAuraPresetText()) + '</span>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
            buildDepthButtons(),
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
            buildPresetButtons(),
            '</div>',
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 18px;align-items:start;">',
            '<div style="display:flex;flex-direction:column;gap:8px;">',
            '<div style="font-size:0.76rem;font-weight:700;color:rgba(255,255,255,0.82);">Tab Shape</div>',
            buildAuraTuningMarkup('workspace'),
            '</div>',
            '<div style="display:flex;flex-direction:column;gap:8px;">',
            '<div style="font-size:0.76rem;font-weight:700;color:rgba(255,255,255,0.82);">Card Shape</div>',
            buildAuraTuningMarkup('card'),
            '</div>',
            '<div style="display:flex;flex-direction:column;gap:8px;">',
            '<div style="font-size:0.76rem;font-weight:700;color:rgba(255,255,255,0.82);">Folder Shape</div>',
            buildAuraTuningMarkup('folder'),
            '</div>',
            '</div>',
            '</div>',
            '</details>',
            '<details open class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Motion</summary>',
            '<div style="display:flex;flex-direction:column;gap:10px;padding-top:10px;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
            '<button type="button" data-map-toolbar="motion" class="map-btn">Motion: Web</button>',
            '<button type="button" data-map-toolbar="stability" class="map-btn">Hold Main Nodes: ON</button>',
            '</div>',
            '<div style="display:flex;flex-direction:column;gap:8px;">',
            buildMotionTuningMarkup(),
            '</div>',
            '</div>',
            '</details>',
            '<details open class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Structure</summary>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:10px;">',
            '<button type="button" data-map-toolbar="chain-internal" class="map-btn">Same-Chain Forces: ON</button>',
            '<button type="button" data-map-toolbar="chain-external" class="map-btn">Cross-Chain Forces: ON</button>',
            '<button type="button" data-map-toolbar="chain-hierarchy" class="map-btn">Enforce Folder Layers: ON</button>',
            '<button type="button" data-map-toolbar="bookmark-hierarchy" class="map-btn">Keep Bookmark Lanes: ON</button>',
            '</div>',
            '</details>',
            '<details open class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Static and Flow</summary>',
            '<div style="display:flex;flex-direction:column;gap:10px;padding-top:10px;">',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-start;">',
            '<button type="button" data-map-toolbar="static-node" class="map-btn">Static Node</button>',
            '<button type="button" data-map-toolbar="static-chain" class="map-btn">Static Chain</button>',
            '<button type="button" data-map-toolbar="static-kind" class="map-btn">Static Type</button>',
            '<button type="button" data-map-toolbar="static-clear" class="map-btn">Clear Static</button>',
            '<div data-map-static-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">Static: none</div>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-start;">',
            '<button type="button" data-map-static-kind="workspace" class="map-btn">Freeze ' + escapeHtml(getKindDisplayName('workspace')) + '</button>',
            '<button type="button" data-map-static-kind="category" class="map-btn">Freeze ' + escapeHtml(getKindDisplayName('category')) + '</button>',
            '<button type="button" data-map-static-kind="folder" class="map-btn">Freeze ' + escapeHtml(getKindDisplayName('folder')) + '</button>',
            '<button type="button" data-map-static-kind="link" class="map-btn">Freeze ' + escapeHtml(getKindDisplayName('link')) + '</button>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-start;">',
            '<button type="button" data-map-toolbar="polarity-node" class="map-btn">Node: Inherit</button>',
            '<button type="button" data-map-toolbar="polarity-kind" class="map-btn">Type: Push</button>',
            '<button type="button" data-map-toolbar="polarity-clear" class="map-btn">Clear Flow</button>',
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
            '</div>',
            '</details>',
            '<details class="map-controls-section">',
            '<summary style="cursor:pointer;font-size:0.82rem;font-weight:700;color:#f7fbff;">Help</summary>',
            '<div style="font-size:0.78rem;line-height:1.55;color:rgba(255,255,255,0.74);padding-top:10px;">',
            'Drag background to pan. Hold Space to force-pan through dense clusters. Drag nodes to reorganize. Mouse wheel zooms. Double-click a bookmark node to open it. Use Auras to control volumes and chain shaping, Motion to tune physics, and Structure to clamp layer rules.',
            '</div>',
            '</details>',
            '</div>',
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
