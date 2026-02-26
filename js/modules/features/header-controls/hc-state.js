window.EveOS = window.EveOS || {};
window.EveOS.HeaderControls = window.EveOS.HeaderControls || {};

(function () {
    const DEFAULTS = {
        showDate: true,
        use24HourClock: false,
        includeName: true,
        morningMessage: "Good Morning",
        afternoonMessage: "Good Afternoon",
        eveningMessage: "Good Evening",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 56,
        letterSpacing: 2,
        textColor: "",
        effect: "none",
        effectColor: "#00d4ff"
    };

    function clampNumber(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function normalizeMessages(value, fallback) {
        const trimmed = String(value ?? "").trim();
        return trimmed || fallback;
    }

    function normalizeBucket(bucket) {
        const next = { ...DEFAULTS, ...(bucket || {}) };
        next.showDate = next.showDate !== false;
        next.use24HourClock = !!next.use24HourClock;
        next.includeName = next.includeName !== false;
        next.morningMessage = normalizeMessages(next.morningMessage, DEFAULTS.morningMessage);
        next.afternoonMessage = normalizeMessages(next.afternoonMessage, DEFAULTS.afternoonMessage);
        next.eveningMessage = normalizeMessages(next.eveningMessage, DEFAULTS.eveningMessage);
        next.fontFamily = normalizeMessages(next.fontFamily, DEFAULTS.fontFamily);
        next.fontSize = clampNumber(next.fontSize, 24, 120, DEFAULTS.fontSize);
        next.letterSpacing = clampNumber(next.letterSpacing, 0, 16, DEFAULTS.letterSpacing);
        next.textColor = String(next.textColor || "").trim();
        next.effect = normalizeMessages(next.effect, DEFAULTS.effect);
        next.effectColor = normalizeMessages(next.effectColor, DEFAULTS.effectColor);
        return next;
    }

    function ensureConfigBucket() {
        if (typeof config === "undefined") return { ...DEFAULTS };
        config.headerControls = normalizeBucket(config.headerControls);
        if (config.headerMode !== "clock" && config.headerMode !== "greeting") {
            config.headerMode = "greeting";
        }
        return config.headerControls;
    }

    function getSettings() {
        return { ...ensureConfigBucket() };
    }

    function updateSettings(patch) {
        const merged = normalizeBucket({ ...ensureConfigBucket(), ...(patch || {}) });
        if (typeof config !== "undefined") config.headerControls = merged;
        if (typeof saveConfig === "function") saveConfig();
        return { ...merged };
    }

    function resetSettings() {
        if (typeof config !== "undefined") {
            config.headerControls = { ...DEFAULTS };
            if (typeof saveConfig === "function") saveConfig();
            return { ...config.headerControls };
        }
        return { ...DEFAULTS };
    }

    window.EveOS.HeaderControls.State = {
        DEFAULTS: { ...DEFAULTS },
        ensureConfigBucket,
        getSettings,
        updateSettings,
        resetSettings
    };
})();
