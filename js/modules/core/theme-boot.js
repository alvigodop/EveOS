(function () {
    console.log("Theme Boot: Initializing...");
    try {
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
            bgStyle += ` :root { 
                --card-bg: ${config.cardColor}; 
                --sidebar-bg: ${config.cardColor};
                --input-bg: ${config.cardColor};
            }`;
        } else if (isCustom && !config.cardColor) {
            // Fallback for custom mode if no color set
            bgStyle += ` :root { --card-bg: #1e1e1e; --sidebar-bg: #1e1e1e; --input-bg: #1e1e1e; }`;
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
