/**
 * Status HTML Templates Module
 * 
 * Provides HTML generation functions for the Status View.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const StatusTemplates = {
        /**
         * Generate the summary section HTML
         * @param {Object} statusInfo 
         * @returns {string} HTML string
         */
        getSummaryHTML: function (statusInfo) {
            return `
            <div style="padding: 15px 20px; background-color: white;">
                <p style="margin-bottom: 10px; font-weight: bold;">Total Modules: ${statusInfo.moduleCount || 0}</p>
                
                <p style="margin-bottom: 5px; display: flex; align-items: center;">
                    <span style="color: #2e7d32; margin-right: 5px;">✓</span> Properly Loaded: ${statusInfo.initializedCount || 0}
                </p>
                
                <p style="margin-bottom: 5px; display: flex; align-items: center;">
                    <span style="color: #f57f17; margin-right: 5px;">⚠</span> Unregistered: ${statusInfo.uninitialized ? statusInfo.uninitialized.length : 0}
                </p>
                
                <p style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="color: #1565c0; margin-right: 5px;">ℹ</span> Initialized: ${statusInfo.initializedCount || 0} of ${statusInfo.moduleCount || 0}
                </p>
                
                <p style="margin-bottom: 5px; font-weight: bold;">Total Scripts: ${statusInfo.scriptLoadInfo.total || 0}</p>
                <p style="margin-bottom: 5px;">Loaded: ${statusInfo.scriptLoadInfo.loaded || 0}</p>
                <p style="margin-bottom: 15px;">Failed: ${statusInfo.scriptLoadInfo.failed || 0}</p>
            </div>`;
        },

        /**
         * Generate the active errors section HTML
         * @param {Object} moduleErrors - Grouped module errors
         * @returns {string} HTML string
         */
        getErrorSectionHTML: function (moduleErrors) {
            let html = `
            <div style="margin-bottom: 15px; padding: 15px; background-color: #ffebee; border-radius: 4px;">
                <h4 style="margin-top: 0; color: #c62828; margin-bottom: 10px; font-size: 14px;">Loading Errors:</h4>
                <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
            `;

            Object.keys(moduleErrors).sort().forEach(moduleName => {
                const errors = moduleErrors[moduleName];

                // Add module header
                html += `<li style="color: #c62828; margin-bottom: 8px; font-weight: bold;">
                           ${moduleName} module: ${errors.length} error${errors.length > 1 ? 's' : ''}
                         </li>`;

                // Add each error under this module
                errors.forEach(errorText => {
                    html += `<li style="color: #c62828; margin-bottom: 5px; margin-left: 20px;">
                               ${errorText}
                             </li>`;
                });
            });

            html += '</ul></div>';
            return html;
        },

        /**
         * Generate the minimized CORS log section HTML
         * @param {Array} scriptErrors 
         * @returns {string} HTML string
         */
        getCorsLogHTML: function (scriptErrors) {
            return `
                <div style="margin-bottom: 15px; padding: 10px; background-color: #e3f2fd; border-radius: 4px;">
                    <details>
                        <summary style="cursor: pointer; color: #0d47a1; font-size: 13px; font-weight: normal;">
                            CORS Log (${scriptErrors.length} entries) - Safe to ignore
                        </summary>
                        <div style="margin-top: 10px; font-size: 12px; color: #666;">
                            <p>These are just CORS restrictions from loading local files and don't affect functionality.</p>
                            <ul style="margin: 5px 0 0 20px; padding-left: 0;">
                            ${scriptErrors.slice(0, 3).map(err =>
                `<li style="color: #777; margin-bottom: 3px;">${err.module || 'Script'}: CORS restriction</li>`
            ).join('')}
                            ${scriptErrors.length > 3 ? `<li style="color: #777;">And ${scriptErrors.length - 3} more...</li>` : ''}
                            </ul>
                        </div>
                    </details>
                </div>
            `;
        },

        /**
         * Generate the global CORS warning section HTML
         * @param {Array} corsErrors 
         * @returns {string} HTML string
         */
        getGlobalCorsHTML: function (corsErrors) {
            return `
                <div style="margin-bottom: 15px; padding: 10px; background-color: #e3f2fd; border-radius: 4px;">
                    <details>
                        <summary style="cursor: pointer; color: #0d47a1; font-size: 13px; font-weight: normal;">
                            CORS Info (${corsErrors.length} entries) - Safe to ignore
                        </summary>
                        <div style="margin-top: 10px; font-size: 12px; color: #666;">
                            <p>CORS errors are common when running from a local file system. This doesn't affect functionality.</p>
                            <p style="margin-top: 5px; margin-bottom: 10px;">Total CORS errors: ${corsErrors.length}</p>
                            
                            <p style="margin-bottom: 5px;"><strong>Tips:</strong></p>
                            <ul style="margin: 0; padding-left: 20px; list-style-type: disc; color: #777;">
                                <li style="margin-bottom: 3px;">Try disabling web security in your browser (for testing only)</li>
                                <li style="margin-bottom: 3px;">Use embedded modules instead of loading separate files</li>
                            </ul>
                        </div>
                    </details>
                </div>
            `;
        },

        /**
         * Generate the module list table HTML
         * @param {Array} modules 
         * @returns {string} HTML string
         */
        getModuleListHTML: function (modules) {
            let html = '<div style="padding: 0 20px 20px 20px; background-color: white;">';

            // Sort modules by name
            const sortedModules = [...(modules || [])].sort((a, b) => a.name.localeCompare(b.name));

            // Generate module table with rows
            sortedModules.forEach(module => {
                const isLoaded = module.loaded || module.initialized;
                // registered might be undefined or false
                const versionText = module.version || '1.0.0';
                const isFunctional = module.functional !== false;

                html += `
                    <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">
                        <div style="width: 160px; font-weight: bold;">${module.name}</div>
                        <div style="width: 100px; margin-right: 10px;">
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.9em; background-color: ${isLoaded ? '#e6f7e6' : '#ffebee'}; color: ${isLoaded ? '#2e7d32' : '#c62828'};">
                                ${isLoaded ? '✓ Loaded' : '✗ Not Loaded'}
                            </span>
                        </div>
                        <div style="width: 110px; margin-right: 10px;">
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.9em; background-color: #e3f2fd; color: #1565c0;">
                                ${module.initialized ? 'Initialized' : 'Pending'}
                            </span>
                        </div>
                        <div style="width: 70px; margin-right: 10px; text-align: center;">
                            ${versionText}
                        </div>
                        <div style="flex-grow: 1; text-align: right;">
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.9em; background-color: ${isFunctional ? '#e6f7e6' : '#ffebee'}; color: ${isFunctional ? '#2e7d32' : '#c62828'};">
                                ${isFunctional ? '✓ Functional' : '✗ Not Functional'}
                            </span>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            return html;
        }
    };

    window.StatusTemplates = StatusTemplates;
})();
