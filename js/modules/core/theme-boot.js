(function () {
    console.log("Theme Boot: Initializing...");
    try {
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

        const storedConfig = localStorage.getItem('eveV22Config');
        let config = {};

        if (storedConfig) {
            try {
                config = JSON.parse(storedConfig);
            } catch (e) {
                console.error("Theme Boot: Config parse error", e);
            }
        }

        // Default to Dark if not specified or config missing
        const theme = config.themeMode || 'dark';
        const isCustom = theme === 'custom';

        // 1. Apply Theme Mode (Light/Dark) on HTML element
        if (theme === 'light') {
            document.documentElement.classList.add('light-theme');
        } else {
            document.documentElement.classList.remove('light-theme');
        }

        const colorScheme = resolveThemeColorScheme(theme, config);
        document.documentElement.dataset.nativeScheme = colorScheme;
        document.documentElement.style.colorScheme = colorScheme;

        // 2. Determine Background Style
        let bgStyle = '';

        if (config.background) {
            bgStyle = `body { background-image: url('${config.background}'); background-size: cover; background-position: center; background-attachment: fixed; background-color: transparent !important; }`;
        } else {
            let bgColor = '#121212'; // Default dark matches main.css

            if (isCustom) {
                bgColor = config.bgColor || '#222222';
            } else if (theme === 'light') {
                bgColor = '#f0f2f5';
            }

            bgStyle = `body { background-image: none !important; background-color: ${bgColor} !important; }`;
        }

        // 3. Apply Accent (if custom)
        if (isCustom && config.accent) {
            bgStyle += ` :root { --accent: ${config.accent}; }`;
        } else if (!isCustom) {
            // Enforce preset accents to prevent stale custom values
            const defaultAccent = theme === 'light' ? '#0060df' : '#00d4ff';
            bgStyle += ` :root { --accent: ${defaultAccent}; }`;
        }

        // 4. Apply Feature Color (if custom)
        if (isCustom && config.cardColor) {
            const popupBg = config.popupColor || '#1e1e1e';
            const popupScheme = resolveSurfaceScheme(popupBg, 'dark');
            bgStyle += ` :root { 
                --card-bg: ${config.cardColor}; 
                --sidebar-bg: ${config.cardColor};
                --input-bg: ${config.cardColor};
                --modal-bg: ${popupBg};
                --modal-text: ${popupScheme === 'light' ? '#222222' : '#e0e0e0'};
                --modal-border: ${popupScheme === 'light' ? '#cccccc' : '#555555'};
            }`;
        } else if (isCustom && !config.cardColor) {
            // Fallback for custom mode if no color set
            const popupBg = config.popupColor || '#1e1e1e';
            const popupScheme = resolveSurfaceScheme(popupBg, 'dark');
            bgStyle += ` :root { --card-bg: #1e1e1e; --sidebar-bg: #1e1e1e; --input-bg: #1e1e1e; --modal-bg: ${popupBg}; --modal-text: ${popupScheme === 'light' ? '#222222' : '#e0e0e0'}; --modal-border: ${popupScheme === 'light' ? '#cccccc' : '#555555'}; }`;
        }

        // 5. Inject Style Tag
        const style = document.createElement('style');
        style.id = 'theme-boot-styles';
        style.textContent = bgStyle;
        document.head.appendChild(style);
        console.log("Theme Boot: Applied theme", theme);

    } catch (e) {
        console.error("Theme Boot Error:", e);
        // Emergency Fallback to Dark
        const style = document.createElement('style');
        style.textContent = `body { background-color: #121212 !important; }`;
        document.head.appendChild(style);
    }
})();
