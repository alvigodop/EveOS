// themeToggle.js - Handles light/dark mode theme switching with localStorage persistence

(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'gemini-chat-theme';
    const DARK_THEME = 'dark';
    const LIGHT_THEME = 'light';

    /**
     * Get the current theme from localStorage or system preference
     * @returns {string} 'dark' or 'light'
     */
    function getStoredTheme() {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored) {
            return stored;
        }
        // Check system preference as fallback
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return DARK_THEME;
        }
        return LIGHT_THEME;
    }

    /**
     * Apply the theme to the document
     * @param {string} theme - 'dark' or 'light'
     */
    function applyTheme(theme) {
        if (theme === DARK_THEME) {
            document.documentElement.setAttribute('data-theme', DARK_THEME);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateToggleIcon(theme);
    }

    /**
     * Update the toggle button icon based on current theme
     * @param {string} theme - 'dark' or 'light'
     */
    function updateToggleIcon(theme) {
        const iconElement = document.getElementById('theme-icon');
        if (iconElement) {
            // Show opposite icon (what clicking will switch to)
            iconElement.textContent = theme === DARK_THEME ? 'light_mode' : 'dark_mode';
        }
    }

    /**
     * Toggle between light and dark themes
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;

        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        applyTheme(newTheme);

        // Log theme change
        console.log(`Theme switched to: ${newTheme}`);
    }

    /**
     * Initialize theme toggle functionality
     */
    function initThemeToggle() {
        // Apply stored theme immediately
        const storedTheme = getStoredTheme();
        applyTheme(storedTheme);

        // Set up toggle button click handler
        const attachToggleListener = () => {
            const toggleButton = document.getElementById('theme-toggle-btn');
            if (toggleButton && !toggleButton.dataset.listenerAttached) {
                toggleButton.addEventListener('click', toggleTheme);
                toggleButton.dataset.listenerAttached = 'true';
                updateToggleIcon(getStoredTheme());
                console.log('Theme toggle listener attached');
                return true;
            }
            return false;
        };

        // Try to attach immediately
        if (!attachToggleListener()) {
            // If button not found, watch for it
            const observer = new MutationObserver((mutations, obs) => {
                if (attachToggleListener()) {
                    // We can't disconnect if we want to handle re-renders, 
                    // but for the header it's usually enough once.
                    // obs.disconnect(); 
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem(THEME_STORAGE_KEY)) {
                    applyTheme(e.matches ? DARK_THEME : LIGHT_THEME);
                }
            });
        }
    }

    // Expose functions globally for potential external use
    window.ThemeToggle = {
        toggle: toggleTheme,
        setTheme: function (theme) {
            if (theme === DARK_THEME || theme === LIGHT_THEME) {
                localStorage.setItem(THEME_STORAGE_KEY, theme);
                applyTheme(theme);
            }
        },
        getTheme: function () {
            return document.documentElement.getAttribute('data-theme') === DARK_THEME ? DARK_THEME : LIGHT_THEME;
        },
        init: initThemeToggle
    };

    // Initialize on script load
    initThemeToggle();

    // Also run when DOM is ready to ensure button is attached
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    }

})();
