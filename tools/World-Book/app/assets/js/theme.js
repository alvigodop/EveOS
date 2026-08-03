(function () {
  const WB = window.WorldBook;

  const NORMAL = {
    background: "#f6f3ee",
    panel: "#fffdf9",
    sidebar: "#f1ede7",
    text: "#282521",
    muted: "#756f67",
    accent: "#6d68a8",
    accentSoft: "#ebe9f8",
    border: "#ded8ce",
    danger: "#a95050"
  };

  const DARK = {
    background: "#16151b",
    panel: "#211f28",
    sidebar: "#1b1921",
    text: "#f2eef7",
    muted: "#aaa3b4",
    accent: "#9992e8",
    accentSoft: "#34304d",
    border: "#3b3745",
    danger: "#e08282"
  };

  function validHex(value, fallback) {
    const clean = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toLowerCase() : fallback;
  }

  function hexToRgb(hex) {
    const value = validHex(hex, "#000000").slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    const part = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
    return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
  }

  function mix(first, second, amount) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    return rgbToHex({
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    });
  }

  function luminance(hex) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map(value => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  WB.Theme = {
    normal: NORMAL,
    dark: DARK,
    keys: Object.keys(NORMAL),

    normalizeState(state) {
      state.ui = state.ui || {};
      const current = state.ui.theme && typeof state.ui.theme === "object"
        ? state.ui.theme
        : {};

      const mode = ["normal", "dark", "custom"].includes(current.mode)
        ? current.mode
        : "normal";

      const custom = {};
      this.keys.forEach(key => {
        custom[key] = validHex(current.custom?.[key], NORMAL[key]);
      });

      state.ui.theme = { mode, custom };
      return state.ui.theme;
    },

    clone(theme) {
      return JSON.parse(JSON.stringify(theme));
    },

    colors(theme) {
      const normalized = theme || { mode: "normal", custom: NORMAL };
      if (normalized.mode === "dark") return { ...DARK };
      if (normalized.mode === "custom") {
        const custom = {};
        this.keys.forEach(key => {
          custom[key] = validHex(normalized.custom?.[key], NORMAL[key]);
        });
        return custom;
      }
      return { ...NORMAL };
    },

    apply(theme) {
      const colors = this.colors(theme);
      const root = document.documentElement;
      const darkLike = luminance(colors.background) < 0.28;
      const accentText = luminance(colors.accent) > 0.53 ? "#17141d" : "#ffffff";

      const variables = {
        "--bg": colors.background,
        "--panel": colors.panel,
        "--panel-strong": colors.panel,
        "--sidebar-bg": colors.sidebar,
        "--text": colors.text,
        "--muted": colors.muted,
        "--accent": colors.accent,
        "--accent-soft": colors.accentSoft,
        "--line": colors.border,
        "--line-soft": mix(colors.border, colors.panel, 0.52),
        "--danger": colors.danger,
        "--danger-soft": mix(colors.danger, colors.panel, 0.84),
        "--danger-border": mix(colors.danger, colors.panel, 0.55),
        "--topbar-bg": mix(colors.panel, colors.background, 0.08),
        "--hover-bg": mix(colors.accentSoft, colors.panel, 0.42),
        "--badge-bg": mix(colors.panel, colors.background, 0.16),
        "--muted-surface": mix(colors.panel, colors.background, 0.32),
        "--selected-text": darkLike ? mix(colors.accent, "#ffffff", 0.18) : mix(colors.accent, "#000000", 0.28),
        "--accent-text": accentText,
        "--brand-start": mix(colors.accent, "#ffffff", darkLike ? 0.12 : 0.16),
        "--brand-end": mix(colors.accent, "#000000", 0.18),
        "--dialog-backdrop": darkLike ? "rgba(0, 0, 0, .62)" : "rgba(39, 34, 29, .32)",
        "--focus-backdrop-color": darkLike ? "rgba(0, 0, 0, .55)" : "rgba(34, 29, 25, .28)",
        "--shadow": darkLike
          ? "0 14px 36px rgba(0, 0, 0, .34)"
          : "0 14px 36px rgba(49, 42, 34, .08)"
      };

      Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
      root.dataset.theme = theme?.mode || "normal";
      root.style.colorScheme = darkLike ? "dark" : "light";
    }
  };
})();
