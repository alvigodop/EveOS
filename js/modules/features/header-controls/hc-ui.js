window.EveOS = window.EveOS || {};
window.EveOS.HeaderControls = window.EveOS.HeaderControls || {};

(function () {
    function getStateApi() {
        return window.EveOS?.HeaderControls?.State || null;
    }

    const FONT_OPTIONS = [
        { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'System Sans' },
        { value: '"Segoe UI", Tahoma, sans-serif', label: 'Segoe UI' },
        { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: '"Times New Roman", serif', label: 'Times New Roman' },
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: '"Courier New", monospace', label: 'Courier New' },
        { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
        { value: '"Space Mono", monospace', label: 'Space Mono' },
        { value: '"Poppins", sans-serif', label: 'Poppins' },
        { value: '"Montserrat", sans-serif', label: 'Montserrat' },
        { value: '"Playfair Display", serif', label: 'Playfair Display' }
    ];

    function byId(id) {
        return document.getElementById(id);
    }

    const createUiFormHelpers = window.EveOS?.HeaderControls?.createUiFormHelpers;
    if (!createUiFormHelpers) {
        console.warn('[HeaderControls.UI] Form helpers module is missing.');
        return;
    }

    const form = createUiFormHelpers({ byId, fontOptions: FONT_OPTIONS });

    function persist() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        const payload = form.readForm();
        stateApi.updateSettings(payload.settings);
        config.headerMode = payload.mode;
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof updateTimeAndGreeting === 'function') updateTimeAndGreeting();
        form.updatePreview();
    }

    function resetToDefaults() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        stateApi.resetSettings();
        config.headerMode = 'greeting';
        if (typeof saveConfig === 'function') saveConfig();
        form.fillForm(stateApi.getSettings());
        if (typeof updateTimeAndGreeting === 'function') updateTimeAndGreeting();
    }

    function bindEvents() {
        const ids = [
            'hcMode',
            'hcShowDate',
            'hcUse24h',
            'hcIncludeName',
            'hcMorning',
            'hcAfternoon',
            'hcEvening',
            'hcFont',
            'hcTextColor',
            'hcEffect',
            'hcEffectColor'
        ];
        ids.forEach(id => {
            const element = byId(id);
            if (!element) return;
            element.addEventListener('change', persist);
            element.addEventListener('input', form.updatePreview);
        });

        const fontSize = byId('hcFontSize');
        if (fontSize) {
            fontSize.addEventListener('input', () => {
                form.updateRangeLabels();
                persist();
            });
        }

        const letterSpacing = byId('hcLetterSpacing');
        if (letterSpacing) {
            letterSpacing.addEventListener('input', () => {
                form.updateRangeLabels();
                persist();
            });
        }

        const resetBtn = byId('hcResetBtn');
        if (resetBtn) resetBtn.onclick = resetToDefaults;
    }

    function createModalIfNeeded() {
        if (byId('headerControlsModal')) return;
        const stateApi = getStateApi();
        if (!stateApi) return;
        const settings = stateApi.getSettings();

        const html = `
<div class="modal-overlay" id="headerControlsModal">
    <div class="modal hc-modal">
        <h2>Header Controls</h2>
        <div class="hc-note">Customize greeting/clock text, style, and time-based messages.</div>

        <div class="hc-grid">
            <label class="hc-field">
                <span>Display Mode</span>
                <select id="hcMode">
                    <option value="greeting">Greeting</option>
                    <option value="clock">Clock</option>
                </select>
            </label>
            <label class="hc-field">
                <span>Font Family</span>
                <select id="hcFont">${form.buildFontOptions(settings.fontFamily)}</select>
            </label>
            <label class="hc-field">
                <span>Text Color</span>
                <input type="color" id="hcTextColor" value="#00d4ff">
            </label>
            <label class="hc-field">
                <span>Effect Color</span>
                <input type="color" id="hcEffectColor" value="#00d4ff">
            </label>
            <label class="hc-field hc-field-full">
                <span>Text Effect</span>
                <select id="hcEffect">
                    <option value="none">None</option>
                    <option value="rainbow">Rainbow</option>
                    <option value="glow">Glow</option>
                    <option value="bounce">Bounce</option>
                    <option value="wave">Wave</option>
                    <option value="fade">Fade</option>
                    <option value="shake">Shake</option>
                    <option value="neon">Neon</option>
                    <option value="glitch">Glitch</option>
                </select>
            </label>
            <label class="hc-field hc-field-full">
                <span>Size <strong id="hcFontSizeValue">56px</strong></span>
                <input type="range" id="hcFontSize" min="24" max="120" step="1" value="56">
            </label>
            <label class="hc-field hc-field-full">
                <span>Letter Spacing <strong id="hcLetterSpacingValue">2px</strong></span>
                <input type="range" id="hcLetterSpacing" min="0" max="16" step="1" value="2">
            </label>
        </div>

        <div class="hc-toggles">
            <label class="hc-inline"><input type="checkbox" id="hcShowDate"> <span>Show Date</span></label>
            <label class="hc-inline"><input type="checkbox" id="hcUse24h"> <span>Use 24-Hour Clock</span></label>
            <label class="hc-inline"><input type="checkbox" id="hcIncludeName"> <span>Include User Name</span></label>
        </div>

        <div class="hc-grid">
            <label class="hc-field">
                <span>Morning Message</span>
                <input type="text" id="hcMorning" maxlength="60" placeholder="Good Morning">
            </label>
            <label class="hc-field">
                <span>Afternoon Message</span>
                <input type="text" id="hcAfternoon" maxlength="60" placeholder="Good Afternoon">
            </label>
            <label class="hc-field hc-field-full">
                <span>Evening Message</span>
                <input type="text" id="hcEvening" maxlength="60" placeholder="Good Evening">
            </label>
        </div>

        <div id="hcPreview" class="hc-preview">Header Preview</div>

        <div class="hc-actions">
            <button class="btn-primary" id="hcResetBtn" type="button">Reset Defaults</button>
            <button type="button" onclick="closeHeaderControlsModal()">Close</button>
        </div>
    </div>
</div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        bindEvents();
    }

    function openHeaderControlsModal() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        createModalIfNeeded();
        form.fillForm(stateApi.getSettings());
        const modal = byId('headerControlsModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeHeaderControlsModal() {
        const modal = byId('headerControlsModal');
        if (modal) modal.style.display = 'none';
    }

    window.openHeaderControlsModal = openHeaderControlsModal;
    window.closeHeaderControlsModal = closeHeaderControlsModal;
    window.EveOS.HeaderControls.UI = {
        openHeaderControlsModal,
        closeHeaderControlsModal
    };
})();
