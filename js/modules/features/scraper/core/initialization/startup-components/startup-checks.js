/**
 * Startup Checks Module
 * 
 * Handles environment verification, legacy tab fallbacks, and server module usage detection.
 */

(function () {
    // Extend existing StartupHelper or wait for it
    const extendStartupChecks = () => {
        if (!window.StartupHelper) {
            console.error('StartupHelper not found for Checks extension');
            return;
        }

        const Checks = {
            /**
             * Setup direct tab switching as a fallback
             * NOTE: Only used if TabManager is not available
             */
            setupTabFallbacks: function () {
                // Skip if TabManager is handling tabs
                if (window.TabManager && TabManager._initialized) {
                    return;
                }

                const wikipediaTab = document.getElementById('wikipediaTab');
                const fandomTab = document.getElementById('fandomTab');

                // Skip if handlers already installed
                if (wikipediaTab && wikipediaTab._startupHelperTabHandler) {
                    return;
                }

                if (wikipediaTab) {
                    wikipediaTab.addEventListener('click', function () {
                        // Update tab buttons
                        wikipediaTab.classList.add('active');
                        if (fandomTab) fandomTab.classList.remove('active');

                        // Show/hide panels
                        const wikipediaOptions = document.getElementById('wikipediaOptions');
                        const fandomOptions = document.getElementById('fandomOptions');
                        if (wikipediaOptions) wikipediaOptions.style.display = 'flex';
                        if (fandomOptions) fandomOptions.style.display = 'none';

                        const wikipediaManagement = document.getElementById('wikipediaManagement');
                        const fandomManagement = document.getElementById('fandomManagement');
                        if (wikipediaManagement) wikipediaManagement.style.display = 'block';
                        if (fandomManagement) fandomManagement.style.display = 'none';

                        // Store the current source
                        window.currentSource = 'wikipedia';
                    });
                    wikipediaTab._startupHelperTabHandler = true;
                }

                if (fandomTab) {
                    fandomTab.addEventListener('click', function () {
                        // Update tab buttons
                        fandomTab.classList.add('active');
                        if (wikipediaTab) wikipediaTab.classList.remove('active');

                        // Show/hide panels
                        const wikipediaOptions = document.getElementById('wikipediaOptions');
                        const fandomOptions = document.getElementById('fandomOptions');
                        if (wikipediaOptions) wikipediaOptions.style.display = 'none';
                        if (fandomOptions) fandomOptions.style.display = 'flex';

                        const wikipediaManagement = document.getElementById('wikipediaManagement');
                        const fandomManagement = document.getElementById('fandomManagement');
                        if (wikipediaManagement) wikipediaManagement.style.display = 'none';
                        if (fandomManagement) fandomManagement.style.display = 'block';

                        // Store the current source
                        window.currentSource = 'fandom';
                    });
                    fandomTab._startupHelperTabHandler = true;
                }
            },

            /**
             * Check for attempts to use server-side Python modules in browser code
             */
            detectServerModuleUsage: function () {
                const results = {
                    detected: false,
                    modules: [],
                    locations: [],
                    details: {}
                };

                // Common Python modules that might be accidentally used in browser code
                const pythonModules = [
                    'os', 'sys', 'io', 'flask', 'django', 'requests', 'http',
                    'socket', 'subprocess', 'threading', 'multiprocessing'
                ];

                // Check for common import patterns
                const scripts = document.querySelectorAll('script');
                scripts.forEach(script => {
                    const content = script.textContent || '';
                    constsrc = script.src || 'inline-script';

                    pythonModules.forEach(moduleName => {
                        const importRegex = new RegExp(`import\\s+${moduleName}`, 'g');
                        if (importRegex.test(content)) {
                            results.detected = true;
                            if (!results.modules.includes(moduleName)) results.modules.push(moduleName);
                            results.locations.push(`${src} (import)`);
                        }
                    });
                });

                if (results.detected) {
                    console.warn('StartupHelper: Detected potential server-side Python module usage in browser code:', results);
                }

                return results;
            }
        };

        Object.assign(window.StartupHelper, Checks);
    };

    // Initialize extension
    if (window.StartupHelper) {
        extendStartupChecks();
    } else {
        // Retry if loaded out of order
        window.addEventListener('DOMContentLoaded', extendStartupChecks);
    }
})();
