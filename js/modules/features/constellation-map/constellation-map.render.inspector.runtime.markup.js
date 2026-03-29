window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {


    const shared = ns._shared || {};

    const {

        state,

        KIND_ORDER,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

        getScopeText,

        getLabelModeText,

        getMotionModeText,

        MOTION_TUNING_FIELDS,

        getKindDisplayName,

        getNodePolarityState,

        getPolaritySummary,

        getPolarityStrengthValue,

        getPolarityStrengthText,

        getMotionTuningText,

        getNodeCoverUrl,

        scheduleInspectorCoverRotation,

        getStaticStateForNode,

        isStaticBranchRoot,

        getStaticSummary,

        escapeHtml,

        text

    } = shared;



    const renderToolbarHelpers = ns._renderToolbarHelpers || {};

    const { renderToolbarState } = renderToolbarHelpers;


    const inspectorCore = ns._renderInspectorCore || {};
    const {
        getPrimaryAction,
        applyInspectorShellStyle,
        getSecondaryActions
    } = inspectorCore;

function getCompactInspectorMarkup(headerLabel, headerKindLabel) {



        const shortLabel = text(headerLabel, 'Info').slice(0, 14);



        return [



            '<button type="button" data-map-info-toggle="1" title="Expand inspector" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:78px;height:78px;border:1px solid color-mix(in srgb, var(--map-theme-border-base) 74%, transparent);background:radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--map-theme-panel-base) 94%, transparent), color-mix(in srgb, var(--map-theme-panel-strong-base) 94%, transparent));color:var(--map-theme-text);border-radius:999px;cursor:pointer;box-shadow:0 16px 32px rgba(0,0,0,0.28);padding:10px;gap:4px;backdrop-filter:blur(calc(var(--map-theme-blur) * 0.8));">',



            '<span style="font-size:0.6rem;opacity:0.72;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">' + escapeHtml(headerKindLabel) + '</span>',



            '<span style="font-size:0.7rem;font-weight:700;line-height:1.15;max-width:100%;white-space:normal;word-break:break-word;">' + escapeHtml(shortLabel) + '</span>',



            '</button>'



        ].join('');



    }

    const moduleApi = ns._renderInspectorRuntimeMarkup = ns._renderInspectorRuntimeMarkup || {};
    Object.assign(moduleApi, { getCompactInspectorMarkup });
})(window.EveConstellationMap);
