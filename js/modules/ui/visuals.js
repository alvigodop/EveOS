// --- VISUAL SETTINGS ---

function toggleView() {
    if (config.viewMode === 'unidex') {
        if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
            window.UnidexView.resetSelection();
        }
        config.viewMode = 'grid';
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        renderDashboard();
        return;
    }

    const orderedModes = ['grid', 'list'];
    const currentMode = config.viewMode === 'list' ? 'list' : 'grid';
    const currentIndex = orderedModes.indexOf(currentMode);
    config.viewMode = orderedModes[(currentIndex + 1) % orderedModes.length];

    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    renderDashboard();
}

function openUnidexView() {
    if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
        window.UnidexView.resetSelection();
    }
    config.viewMode = 'unidex';
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
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
    } else {
        // Reset to defaults
        const defaultAccent = theme === 'light' ? '#0060df' : '#00d4ff';
        document.documentElement.style.setProperty('--accent', defaultAccent);
        // Remove override to let CSS handle defaults (preserves transparency in Dark Mode)
        document.documentElement.style.removeProperty('--card-bg');
        document.documentElement.style.removeProperty('--sidebar-bg');
        document.documentElement.style.removeProperty('--input-bg');
    }

    // Init Modules if loaded
    if (typeof initWeather === 'function') initWeather();
    if (typeof initTimer === 'function') initTimer();
}
