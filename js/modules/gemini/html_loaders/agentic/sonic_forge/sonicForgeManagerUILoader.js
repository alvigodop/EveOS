window.SonicForgeManagerAgentic = window.SonicForgeManagerAgentic || {};

(function () {
    'use strict';

    const ns = window.SonicForgeManagerAgentic;
    if (ns.ready) return;
    const EVENT_NAME = 'eve:sonic-forge-paid-features-changed';
    let bound = false;

    function enabled() {
        return window.EveAudioflixSoundLabState?.ensure?.().showPaidApiFeatures === true;
    }

    function note(value) {
        return value
            ? 'Paid API features are visible. Lyria 3 Render is now available in Sonic Forge and may incur API charges.'
            : 'Paid API features are hidden. Turn this on to make the Lyria 3 Render box available in Sonic Forge.';
    }

    function sync(value) {
        const input = document.getElementById('sonicForgePaidApiToggle');
        const output = document.querySelector('[data-sonic-forge-paid-note]');
        if (output) output.textContent = note(value);
        if (!input || input.checked === value) return;
        input.checked = value;
        const control = input.parentElement?.MaterialSwitch;
        if (value) control?.on?.();
        else control?.off?.();
    }

    function setEnabled(value) {
        const next = value === true;
        window.EveAudioflixSoundLabState?.update?.(
            { showPaidApiFeatures: next },
            'audioflix-soundlab-paid-api-features'
        );
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled: next } }));
        sync(next);
        return next;
    }

    async function loadSonicForgeManagerCard() {
        const placeholder = document.getElementById('sonic-forge-manager-card-placeholder');
        if (!placeholder) throw new Error('Sonic Forge Manager placeholder not found.');
        placeholder.innerHTML = `
            <div class="agentic-function-card gemini-agentic-card gemini-agentic-card--sonic-forge">
                <div class="gemini-agentic-card-head">
                    <div>
                        <div class="gemini-agentic-card-kicker">Sonic Forge</div>
                        <span class="gemini-agentic-card-title">Sonic Forge Manager</span>
                    </div>
                    <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch"
                        for="sonicForgePaidApiToggle">
                        <input type="checkbox" id="sonicForgePaidApiToggle" class="mdl-switch__input">
                        <span class="mdl-switch__label"></span>
                    </label>
                </div>
                <div class="gemini-agentic-card-copy">
                    Show paid API features
                </div>
                <div class="gemini-agentic-card-note" data-sonic-forge-paid-note></div>
            </div>`;
        window.componentHandler?.upgradeElements?.(placeholder);
    }

    function initialize() {
        const input = document.getElementById('sonicForgePaidApiToggle');
        if (!input) return false;
        if (!input.dataset.sonicForgeBound) {
            input.dataset.sonicForgeBound = '1';
            input.addEventListener('change', () => setEnabled(input.checked));
        }
        if (!bound) {
            bound = true;
            window.addEventListener(EVENT_NAME, (event) => sync(event.detail?.enabled === true));
        }
        sync(enabled());
        return true;
    }

    Object.assign(ns, {
        ready: true,
        initialize,
        setEnabled,
        isEnabled: enabled
    });
    window.loadSonicForgeManagerCard = loadSonicForgeManagerCard;
})();
