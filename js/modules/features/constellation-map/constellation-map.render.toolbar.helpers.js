window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, getKindDisplayName } = shared;
    const moduleApi = ns._renderToolbarBase = ns._renderToolbarBase || {};

function getKindLockButtonLabel(kind, locked) {
        const label = getKindDisplayName(kind);
        return (locked ? 'Release ' : 'Freeze ') + label;
    }

function getControlsToggleText() {
        return state.controlsExpanded ? 'Hide Control Center' : 'Control Center';
    }

function setButtonActive(button, active, options) {
        if (!button) return;
        const opts = options || {};
        button.classList.toggle('active', !!active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.style.borderColor = active
            ? (opts.activeBorder || 'color-mix(in srgb, var(--map-theme-accent) 48%, transparent)')
            : (opts.inactiveBorder || 'color-mix(in srgb, var(--map-theme-border-base) 76%, transparent)');
        button.style.background = active
            ? (opts.activeBackground || 'color-mix(in srgb, var(--map-theme-accent) 16%, transparent)')
            : (opts.inactiveBackground || 'color-mix(in srgb, var(--map-theme-button-base) var(--map-theme-button-fill), transparent)');
        button.style.color = opts.color || 'var(--map-theme-text)';
        button.style.boxShadow = active
            ? (opts.activeShadow || '')
            : (opts.inactiveShadow || '');
        button.style.textShadow = active
            ? (opts.activeTextShadow || '')
            : (opts.inactiveTextShadow || '');
    }

function setButtonEnabled(button, enabled) {
        if (!button) return;
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.56';
        button.style.cursor = enabled ? 'pointer' : 'default';
    }

function queryAll(selector) {
        return Array.from(state.container?.querySelectorAll(selector) || []);
    }

function clampNumber(value, min, max) {
        return Math.min(Math.max(Number(value) || 0, min), max);
    }

    Object.assign(moduleApi, {
        getKindLockButtonLabel,
        getControlsToggleText,
        setButtonActive,
        setButtonEnabled,
        queryAll,
        clampNumber
    });
})(window.EveConstellationMap);
