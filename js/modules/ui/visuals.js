// --- VISUAL SETTINGS ---

function parseThemeColor(colorValue) {
    if (typeof colorValue !== 'string') return null;
    const value = colorValue.trim();
    if (!value) return null;

    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        const expanded = hex.length === 3
            ? hex.split('').map((part) => part + part).join('')
            : hex;
        return {
            r: parseInt(expanded.slice(0, 2), 16),
            g: parseInt(expanded.slice(2, 4), 16),
            b: parseInt(expanded.slice(4, 6), 16)
        };
    }

    const rgbMatch = value.match(/^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})/i);
    if (rgbMatch) {
        return {
            r: Number(rgbMatch[1]),
            g: Number(rgbMatch[2]),
            b: Number(rgbMatch[3])
        };
    }

    return null;
}

function resolveThemeColorScheme(themeMode, nextConfig) {
    if (themeMode === 'light') return 'light';
    if (themeMode !== 'custom') return 'dark';

    const parsed = parseThemeColor(nextConfig.cardColor || nextConfig.bgColor || '');
    if (!parsed) return 'dark';

    const luminance = ((0.299 * parsed.r) + (0.587 * parsed.g) + (0.114 * parsed.b)) / 255;
    return luminance >= 0.62 ? 'light' : 'dark';
}

function resolveSurfaceScheme(colorValue, fallbackScheme) {
    const parsed = parseThemeColor(colorValue || '');
    if (!parsed) return fallbackScheme || 'dark';

    const luminance = ((0.299 * parsed.r) + (0.587 * parsed.g) + (0.114 * parsed.b)) / 255;
    return luminance >= 0.62 ? 'light' : 'dark';
}

function applyNativeThemeScheme(themeMode, nextConfig) {
    const scheme = resolveThemeColorScheme(themeMode, nextConfig);
    document.documentElement.dataset.nativeScheme = scheme;
    document.documentElement.style.colorScheme = scheme;
    if (document.body) {
        document.body.style.colorScheme = scheme;
    }
}

function toggleView() {
    if (config.viewMode === 'unidex') {
        if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
            window.UnidexView.resetSelection();
        }
        config.viewMode = 'grid';
        saveConfig();
        if (typeof window.EveSidebarRuntime?.syncSidebarViewState === 'function') {
            window.EveSidebarRuntime.syncSidebarViewState();
        }
        renderDashboard();
        return;
    }

    const orderedModes = ['grid', 'list'];
    const currentMode = config.viewMode === 'list' ? 'list' : 'grid';
    const currentIndex = orderedModes.indexOf(currentMode);
    config.viewMode = orderedModes[(currentIndex + 1) % orderedModes.length];

    saveConfig();
    if (typeof window.EveSidebarRuntime?.syncSidebarViewState === 'function') {
        window.EveSidebarRuntime.syncSidebarViewState();
    }
    renderDashboard();
}

function openUnidexView() {
    if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
        window.UnidexView.resetSelection();
    }
    config.viewMode = 'unidex';
    saveConfig();
    if (typeof window.EveSidebarRuntime?.syncSidebarViewState === 'function') {
        window.EveSidebarRuntime.syncSidebarViewState();
    }
    renderDashboard();
}

function applySettings() {
    // Apply Theme Mode (Light/Dark)
    const theme = config.themeMode || 'dark';
    const isCustom = theme === 'custom';

    if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
    } else {
        document.documentElement.classList.remove('light-theme');
    }
    applyNativeThemeScheme(theme, config);

    // Clear boot-time critical CSS prevents conflict
    const bootStyle = document.getElementById('theme-boot-styles');
    if (bootStyle) bootStyle.remove();

    // Apply Background
    if (config.background) {
        // Image overrides everything
        document.body.style.backgroundImage = `url('${config.background}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.removeProperty('background-color');
    } else {
        document.body.style.backgroundImage = 'none';
        let targetBg;
        if (isCustom) {
            targetBg = config.bgColor || '#222222';
        } else {
            // Enforce defaults for presets
            targetBg = theme === 'light' ? '#f0f2f5' : '#121212';
        }
        document.body.style.setProperty('background-color', targetBg, 'important');
    }

    const timerArea = document.getElementById('timer-area');
    if (timerArea) timerArea.style.display = config.timerEnabled ? 'flex' : 'none';
    const weatherSpan = document.getElementById('weather-span');
    if (weatherSpan) weatherSpan.style.display = config.weatherEnabled ? 'inline-flex' : 'none';

    // Apply accent only if custom, or force preset defaults? 
    // User asked for "override whatever color setting ive manually set"
    if (isCustom) {
        document.documentElement.style.setProperty('--accent', config.accent);
        // Custom Card/Feature Color
        if (config.cardColor) {
            document.documentElement.style.setProperty('--card-bg', config.cardColor);
            // Extend to other dark elements as requested
            document.documentElement.style.setProperty('--sidebar-bg', config.cardColor);
            document.documentElement.style.setProperty('--input-bg', config.cardColor);
        } else {
            // Default custom fallback if not set (Solid Dark)
            const fallback = '#1e1e1e';
            document.documentElement.style.setProperty('--card-bg', fallback);
            document.documentElement.style.setProperty('--sidebar-bg', fallback);
            document.documentElement.style.setProperty('--input-bg', fallback);
        }

        const popupBg = config.popupColor || '#1e1e1e';
        const popupScheme = resolveSurfaceScheme(popupBg, 'dark');
        document.documentElement.style.setProperty('--modal-bg', popupBg);
        document.documentElement.style.setProperty('--modal-text', popupScheme === 'light' ? '#222222' : '#e0e0e0');
        document.documentElement.style.setProperty('--modal-border', popupScheme === 'light' ? '#cccccc' : '#555555');
    } else {
        // Reset to defaults
        const defaultAccent = theme === 'light' ? '#0060df' : '#00d4ff';
        document.documentElement.style.setProperty('--accent', defaultAccent);
        // Remove override to let CSS handle defaults (preserves transparency in Dark Mode)
        document.documentElement.style.removeProperty('--card-bg');
        document.documentElement.style.removeProperty('--sidebar-bg');
        document.documentElement.style.removeProperty('--input-bg');
        document.documentElement.style.removeProperty('--modal-bg');
        document.documentElement.style.removeProperty('--modal-text');
        document.documentElement.style.removeProperty('--modal-border');
    }

    // Init Modules if loaded
    if (typeof initWeather === 'function') initWeather();
    if (typeof initTimer === 'function') initTimer();
    if (typeof refreshModalThemedControls === 'function') refreshModalThemedControls();
}
