/**
 * Debug Panel Logger Module
 * Handles module scanning, status checking, and log HTML generation.
 */
(function () {
    const DPLogger = {
        name: 'DPLogger',
        version: '1.0.0',

        init: function () {
            console.log('DPLogger initialized');
            this._initialized = true;
            return true;
        },

        refreshErrorLog: function (logContainer) {
            if (!logContainer) return;

            // Create log display HTML
            let logHtml = '<div class="error-log-header" style="color:#f44336;font-weight:bold;margin-bottom:10px;">Console log capture</div>';

            // Display module status information
            logHtml += '<div class="module-status" style="margin-top:20px;color:#4caf50;font-weight:bold;">Module Status</div>';

            try {
                // Method 1: Try ModuleRegistry first
                let moduleInfo = [];
                let source = 'Registry';

                if (window.ModuleRegistry) {
                    let registryModules = null;

                    if (typeof ModuleRegistry.getAllModules === 'function') {
                        registryModules = ModuleRegistry.getAllModules();
                    } else if (ModuleRegistry.modules) {
                        registryModules = ModuleRegistry.modules;
                    } else if (ModuleRegistry._modules) {
                        registryModules = ModuleRegistry._modules;
                    }

                    if (registryModules && typeof registryModules === 'object') {
                        moduleInfo = Object.keys(registryModules).map(name => {
                            const mod = registryModules[name];
                            // mod could be either:
                            // 1. A registry entry object with { name, instance, version, initialized }
                            // 2. The module instance directly
                            const instance = mod.instance || mod;
                            const version = mod.version || instance.version || 'unknown';

                            // Check initialized: prefer instance._initialized, fall back to registry flag
                            const isInitialized = instance._initialized === true ||
                                mod.initialized === true;

                            // Check if it expects initialization
                            const hasInitMethod = typeof instance.init === 'function';

                            return {
                                name: name,
                                instance: instance,
                                version: version,
                                initialized: isInitialized,
                                hasInitMethod: hasInitMethod
                            };
                        });
                    }
                }

                // Method 2: Fallback to robust window scanning
                if (!moduleInfo || moduleInfo.length === 0) {
                    source = 'Window Scan (Direct)';
                    moduleInfo = this.scanWindowForModules();
                }

                if (moduleInfo && moduleInfo.length) {
                    logHtml += this.generateModuleTable(moduleInfo, source);
                } else {
                    logHtml += '<p style="color:#f44336;">No module information available. (Diagnostics: Registry=' + (window.ModuleRegistry ? 'Yes' : 'No') + ', Scan=' + source + ')</p>';
                }
            } catch (error) {
                logHtml += `<p style="color:#f44336;">Error retrieving module information: ${error.message}</p>`;
            }

            // Add application info
            logHtml += this.generateAppInfo();

            logContainer.innerHTML = logHtml;
        },

        scanWindowForModules: function () {
            const possibleModules = [];
            for (const prop in window) {
                try {
                    if (typeof window[prop] === 'object' && window[prop] !== null) {
                        const obj = window[prop];
                        const isModule = (
                            typeof obj.init === 'function' ||
                            obj._initialized !== undefined ||
                            obj.name !== undefined ||
                            prop.endsWith('Manager') ||
                            prop.endsWith('Helper') ||
                            prop.includes('Module')
                        );

                        if (isModule && this.isValidModuleProp(prop)) {
                            possibleModules.push({
                                name: prop,
                                instance: obj,
                                version: obj.version || 'unknown',
                                initialized: !!obj._initialized || (typeof obj.init === 'function' && !!obj._initialized),
                                hasInitMethod: typeof obj.init === 'function'
                            });
                        }
                    }
                } catch (e) {
                    // access denied or other error
                }
            }
            return possibleModules.sort((a, b) => a.name.localeCompare(b.name));
        },

        isValidModuleProp: function (prop) {
            return (
                prop !== 'window' &&
                prop !== 'document' &&
                prop !== 'location' &&
                prop !== 'localStorage' &&
                prop !== 'sessionStorage' &&
                prop !== 'console' &&
                !prop.startsWith('webkit')
            );
        },

        generateModuleTable: function (moduleInfo, source) {
            let html = `<div style="font-size:0.8em;color:#888;margin-bottom:5px;">Source: ${source}</div>`;
            html += '<table style="width:100%; border-collapse:collapse;">';
            html += '<tr style="background-color:#2c2c2c;"><th style="text-align:left;padding:5px;">Module</th><th style="text-align:left;padding:5px;">Version</th><th style="text-align:left;padding:5px;">Status</th></tr>';

            moduleInfo.forEach((module, index) => {
                const bgColor = index % 2 === 0 ? '#1c1c1c' : '#252525';

                let statusText, statusIcon, statusColor;

                if (module.initialized) {
                    statusText = 'Initialized';
                    statusIcon = '✅';
                    statusColor = '#4caf50'; // Green
                } else if (!module.hasInitMethod) {
                    statusText = 'Ready (Stateless)';
                    statusIcon = '✓';
                    statusColor = '#2196f3'; // Blue
                } else {
                    statusText = 'Not Initialized';
                    statusIcon = '⚠️';
                    statusColor = '#ff9800'; // Orange
                }

                html += `<tr style="background-color:${bgColor};">`;
                html += `<td style="padding:5px;">${module.name || 'Unknown'}</td>`;
                html += `<td style="padding:5px;">${module.version || (module.instance && module.instance.version) || 'unknown'}</td>`;
                html += `<td style="padding:5px;color:${statusColor};">${statusIcon} ${statusText}</td>`;
                html += '</tr>';
            });

            html += '</table>';
            return html;
        },

        generateAppInfo: function () {
            let html = '<div class="app-info" style="margin-top:20px;color:#2196f3;font-weight:bold;">Application Information</div>';
            html += '<table style="width:100%; border-collapse:collapse;">';
            html += `<tr style="background-color:#1c1c1c;"><td style="padding:5px;">Current Source</td><td style="padding:5px;">${window.currentSource || 'Not set'}</td></tr>`;
            html += `<tr style="background-color:#252525;"><td style="padding:5px;">Tab Manager Available</td><td style="padding:5px;">${!!window.TabManager}</td></tr>`;
            html += `<tr style="background-color:#1c1c1c;"><td style="padding:5px;">Search Manager Available</td><td style="padding:5px;">${!!window.SearchManager}</td></tr>`;
            html += `<tr style="background-color:#252525;"><td style="padding:5px;">Event Manager Available</td><td style="padding:5px;">${!!window.EventManager}</td></tr>`;
            html += '</table>';
            return html;
        }
    };

    window.DPLogger = DPLogger;
})();
