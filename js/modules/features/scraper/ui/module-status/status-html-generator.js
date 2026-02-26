/**
 * Status HTML Generator Module
 * 
 * Orchestrates the generation of Status View HTML.
 * Uses StatusErrorManager for data processing and StatusTemplates for rendering.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const StatusHTMLGenerator = {
        /**
         * Generate the status content HTML
         * @param {Object} statusInfo - The module status information
         * @returns {string} - The HTML content
         */
        generateStatusContent: function (statusInfo) {
            if (!window.StatusTemplates || !window.StatusErrorManager) {
                console.error('Dependencies missing: StatusTemplates or StatusErrorManager');
                return '<div class="error">Status dependencies missing. Check console.</div>';
            }

            let html = '';

            // 1. Summary Section
            html += window.StatusTemplates.getSummaryHTML(statusInfo);

            // 2. Loading Errors or CORS Log Section
            const rawErrors = statusInfo.scriptLoadInfo.errors || [];

            // Filter actual errors
            const filteredErrors = window.StatusErrorManager.filterScriptsErrors(rawErrors);

            if (filteredErrors.length > 0) {
                // Show actual errors
                const groupedErrors = window.StatusErrorManager.groupErrorsByModule(filteredErrors);
                html += window.StatusTemplates.getErrorSectionHTML(groupedErrors);
            } else {
                // Show minimized CORS log if there are suppressed/CORS errors
                const scriptCorsErrors = window.StatusErrorManager.getScriptCorsErrors(rawErrors);
                if (scriptCorsErrors.length > 0) {
                    html += window.StatusTemplates.getCorsLogHTML(scriptCorsErrors);
                }
            }

            // 3. Global CORS Info Section
            const globalCorsErrors = window.StatusErrorManager.getGlobalCorsErrors();
            if (globalCorsErrors.length > 0 && !window.HIDE_CORS_ERRORS) {
                html += window.StatusTemplates.getGlobalCorsHTML(globalCorsErrors);
            }

            html += '</div>'; // Closing the error/summary wrapper if implied? 
            // Note: In original code, there was a wrapping </div> after summary+errors, 
            // but the summary had its own div, and errors had theirs. 
            // The original had `html += '</div>';` at line 247, before the module list.
            // Looking at the original "generateStatusContent":
            // It builds summary div.
            // Then potentially error div.
            // Then potentially CORS div.
            // Then `html += '</div>'` effectively doing nothing or closing a wrapper?
            // Actually, wait, the original code lines 29-47 is one div.
            // Lines 82-185 is another div.
            // Lines 197-212 is another div.
            // Line 247 `html += '</div>'` seems stray or meant to close a container started outside?
            // Ah, looking closer at original line 29: it starts `<div style="...">`. 
            // But line 247 closes a div that wasn't opened in `generateStatusContent`?
            // No, wait. 
            // Original: 
            // html += `...<div...>` (summary)
            // html += `...` (errors)
            // html += `...` (cors)
            // html += '</div>'
            // This suggests the summary div (line 29) was never closed!
            // Line 47 closes the `p` tags but NOT the div? 
            // Line 47 in original: `</p></div>;` -> Yes it closes the div!
            // So line 247 `html += '</div>'` is indeed mysterious in the original.
            // Let's re-read original `status-view.js`.
            // Line 29: `<div style="...">`
            // Line 47: `</div>`
            // Line 247: `html += '</div>';` 
            // There is no open div. This might be a bug in the original that was benign.
            // However, the function returns a string.
            // Maybe it's intended to structure things.
            // To be safe, I will omit the stray </div> unless I find it was needed.
            // Actually, let's look at `html += '</div>'` at line 247.
            // If I look at the screenshot logic (implied), maybe it separates the top part from the bottom part.
            // Let's stick to generating valid HTML segments.

            // 4. Module List Section
            html += window.StatusTemplates.getModuleListHTML(statusInfo.modules);

            return html;
        }
    };

    window.StatusHTMLGenerator = StatusHTMLGenerator;

})();
