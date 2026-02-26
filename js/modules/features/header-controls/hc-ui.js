window.EveOS = window.EveOS || {};
window.EveOS.HeaderControls = window.EveOS.HeaderControls || {};

(function () {
    function getStateApi() {
        return window.EveOS?.HeaderControls?.State || null;
    }

    const FONT_OPTIONS = [
        { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: "System Sans" },
        { value: '"Segoe UI", Tahoma, sans-serif', label: "Segoe UI" },
        { value: '"Trebuchet MS", sans-serif', label: "Trebuchet" },
        { value: "Georgia, serif", label: "Georgia" },
        { value: '"Times New Roman", serif', label: "Times New Roman" },
        { value: "Arial, sans-serif", label: "Arial" },
        { value: '"Courier New", monospace', label: "Courier New" },
        { value: '"JetBrains Mono", monospace', label: "JetBrains Mono" },
        { value: '"Space Mono", monospace', label: "Space Mono" },
        { value: '"Poppins", sans-serif', label: "Poppins" },
        { value: '"Montserrat", sans-serif', label: "Montserrat" },
        { value: '"Playfair Display", serif', label: "Playfair Display" }
    ];

    function byId(id) {
        return document.getElementById(id);
    }

    function buildFontOptions(currentValue) {
        return FONT_OPTIONS.map(option => {
            const selected = option.value === currentValue ? " selected" : "";
            return `<option value="${option.value.replace(/"/g, "&quot;")}"${selected}>${option.label}</option>`;
        }).join("");
    }

    function createModalIfNeeded() {
        if (byId("headerControlsModal")) return;
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
                <select id="hcFont">${buildFontOptions(settings.fontFamily)}</select>
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

        document.body.insertAdjacentHTML("beforeend", html);
        bindEvents();
    }

    function updateRangeLabels() {
        const sizeValue = byId("hcFontSize")?.value || "56";
        const spacingValue = byId("hcLetterSpacing")?.value || "2";
        if (byId("hcFontSizeValue")) byId("hcFontSizeValue").textContent = `${sizeValue}px`;
        if (byId("hcLetterSpacingValue")) byId("hcLetterSpacingValue").textContent = `${spacingValue}px`;
    }

    function isHexColor(value) {
        return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
    }

    function readForm() {
        const modeValue = byId("hcMode")?.value === "clock" ? "clock" : "greeting";
        const textColor = byId("hcTextColor")?.value || "";
        const effectColor = byId("hcEffectColor")?.value || "#00d4ff";

        return {
            mode: modeValue,
            settings: {
                showDate: !!byId("hcShowDate")?.checked,
                use24HourClock: !!byId("hcUse24h")?.checked,
                includeName: !!byId("hcIncludeName")?.checked,
                morningMessage: byId("hcMorning")?.value || "",
                afternoonMessage: byId("hcAfternoon")?.value || "",
                eveningMessage: byId("hcEvening")?.value || "",
                fontFamily: byId("hcFont")?.value || "",
                fontSize: Number(byId("hcFontSize")?.value || 56),
                letterSpacing: Number(byId("hcLetterSpacing")?.value || 2),
                textColor: isHexColor(textColor) ? textColor : "",
                effect: byId("hcEffect")?.value || "none",
                effectColor: isHexColor(effectColor) ? effectColor : "#00d4ff"
            }
        };
    }

    function fillForm(settings) {
        const mode = config.headerMode === "clock" ? "clock" : "greeting";
        if (byId("hcMode")) byId("hcMode").value = mode;

        const textColor = isHexColor(settings.textColor) ? settings.textColor : "#00d4ff";
        const effectColor = isHexColor(settings.effectColor) ? settings.effectColor : "#00d4ff";

        if (byId("hcShowDate")) byId("hcShowDate").checked = settings.showDate !== false;
        if (byId("hcUse24h")) byId("hcUse24h").checked = !!settings.use24HourClock;
        if (byId("hcIncludeName")) byId("hcIncludeName").checked = settings.includeName !== false;
        if (byId("hcMorning")) byId("hcMorning").value = settings.morningMessage || "";
        if (byId("hcAfternoon")) byId("hcAfternoon").value = settings.afternoonMessage || "";
        if (byId("hcEvening")) byId("hcEvening").value = settings.eveningMessage || "";
        if (byId("hcFont")) byId("hcFont").value = settings.fontFamily || FONT_OPTIONS[0].value;
        if (byId("hcFontSize")) byId("hcFontSize").value = String(settings.fontSize || 56);
        if (byId("hcLetterSpacing")) byId("hcLetterSpacing").value = String(settings.letterSpacing || 2);
        if (byId("hcTextColor")) byId("hcTextColor").value = textColor;
        if (byId("hcEffect")) byId("hcEffect").value = settings.effect || "none";
        if (byId("hcEffectColor")) byId("hcEffectColor").value = effectColor;

        updateRangeLabels();
        updatePreview();
    }

    function updatePreview() {
        const preview = byId("hcPreview");
        if (!preview) return;

        const payload = readForm();
        const now = new Date();
        let previewText = payload.mode === "clock"
            ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: !payload.settings.use24HourClock })
            : payload.settings.morningMessage;

        if (payload.mode !== "clock") {
            const hour = now.getHours();
            if (hour >= 18) previewText = payload.settings.eveningMessage;
            else if (hour >= 12) previewText = payload.settings.afternoonMessage;
        }
        if (payload.settings.includeName && config.userName) {
            previewText = `${previewText}, ${config.userName}`;
        }

        preview.textContent = previewText;
        preview.style.fontFamily = payload.settings.fontFamily;
        preview.style.fontSize = `${payload.settings.fontSize}px`;
        preview.style.letterSpacing = `${payload.settings.letterSpacing}px`;
        preview.style.color = payload.settings.textColor || "var(--accent)";
        preview.style.setProperty("--header-effect-color", payload.settings.effectColor || "#00d4ff");

        preview.classList.remove(
            "hc-effect-rainbow",
            "hc-effect-glow",
            "hc-effect-bounce",
            "hc-effect-wave",
            "hc-effect-fade",
            "hc-effect-shake",
            "hc-effect-neon",
            "hc-effect-glitch"
        );
        if (payload.settings.effect && payload.settings.effect !== "none") {
            preview.classList.add(`hc-effect-${payload.settings.effect}`);
        }
    }

    function persist() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        const payload = readForm();
        stateApi.updateSettings(payload.settings);
        config.headerMode = payload.mode;
        if (typeof saveConfig === "function") saveConfig();
        if (typeof updateTimeAndGreeting === "function") updateTimeAndGreeting();
        updatePreview();
    }

    function resetToDefaults() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        stateApi.resetSettings();
        config.headerMode = "greeting";
        if (typeof saveConfig === "function") saveConfig();
        fillForm(stateApi.getSettings());
        if (typeof updateTimeAndGreeting === "function") updateTimeAndGreeting();
    }

    function bindEvents() {
        const ids = [
            "hcMode",
            "hcShowDate",
            "hcUse24h",
            "hcIncludeName",
            "hcMorning",
            "hcAfternoon",
            "hcEvening",
            "hcFont",
            "hcTextColor",
            "hcEffect",
            "hcEffectColor"
        ];
        ids.forEach(id => {
            const element = byId(id);
            if (!element) return;
            element.addEventListener("change", persist);
            element.addEventListener("input", updatePreview);
        });

        const fontSize = byId("hcFontSize");
        if (fontSize) {
            fontSize.addEventListener("input", () => {
                updateRangeLabels();
                persist();
            });
        }

        const letterSpacing = byId("hcLetterSpacing");
        if (letterSpacing) {
            letterSpacing.addEventListener("input", () => {
                updateRangeLabels();
                persist();
            });
        }

        const resetBtn = byId("hcResetBtn");
        if (resetBtn) resetBtn.onclick = resetToDefaults;
    }

    function openHeaderControlsModal() {
        const stateApi = getStateApi();
        if (!stateApi) return;
        createModalIfNeeded();
        fillForm(stateApi.getSettings());
        const modal = byId("headerControlsModal");
        if (modal) modal.style.display = "flex";
    }

    function closeHeaderControlsModal() {
        const modal = byId("headerControlsModal");
        if (modal) modal.style.display = "none";
    }

    window.openHeaderControlsModal = openHeaderControlsModal;
    window.closeHeaderControlsModal = closeHeaderControlsModal;
    window.EveOS.HeaderControls.UI = {
        openHeaderControlsModal,
        closeHeaderControlsModal
    };
})();
