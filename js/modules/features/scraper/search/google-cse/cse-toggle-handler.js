/**
 * Google CSE Toggle Handler (Facade)
 * 
 * Allows switching between normal search (Wikipedia API / Fandom Discovery) 
 * and Google Custom Search Engine mode.
 * 
 * Delegates to:
 * - CTHUI: For UI updates and container management
 * - CTHInterceptor: For link interception
 * 
 * @version 1.0.1 (Modularized)
 */

(function () {
    'use strict';

    // Track CSE mode state
    let _cseEnabled = false;

    // Check for submodules
    const checkComponents = () => {
        if (!window.CTHUI) console.warn('CSEToggleHandler: CTHUI not found');
        if (!window.CTHInterceptor) console.warn('CSEToggleHandler: CTHInterceptor not found');
    };

    /**
     * Set Google CSE mode based on dropdown selection
     * @param {string} mode - Selected search mode/engine
     * @param {string} tab - Which tab this applies to ('wikipedia' or 'fandom')
     */
    window.setCSEMode = function (mode, tab) {
        // Ensure components are available
        if (!window.CTHUI) {
            console.error('CSEToggleHandler: Cannot set mode, CTHUI missing');
            return;
        }

        const enabled = (mode === 'google-cse');
        _cseEnabled = enabled;

        console.log(`Google CSE: ${enabled ? 'Enabled' : 'Disabled'} for ${tab}`);

        // Handle the container visibility and position via delegate
        CTHUI.updateCSEContainer(tab, enabled);

        // If enabling, start monitoring for tab changes (or just one-time move)
        if (enabled) {
            // Manually trigger deferred rendering if needed
            if (window.GoogleCSEEmbedded && typeof window.GoogleCSEEmbedded.renderCSE === 'function') {
                window.GoogleCSEEmbedded.renderCSE();
            }

            // Focus search box after render
            setTimeout(() => {
                const cseInput = document.querySelector('#google-searchbox-container input.gsc-input');
                if (cseInput) cseInput.focus();
            }, 300);
        }
    };

    // Deprecated: toggleGoogleCSE (redirects to setCSEMode)
    window.toggleGoogleCSE = function (enabled, tab) {
        window.setCSEMode(enabled ? 'google-cse' : 'default', tab);
    };

    /**
     * Initialize 
     */
    function initCSEHandler() {
        console.log('Google CSE Handler initialized (Dropdown Mode)');

        checkComponents();

        if (window.CTHInterceptor) {
            CTHInterceptor.attachLinkInterceptor();
        } else {
            console.warn('CSEToggleHandler: CTHInterceptor not available, links may not work strictly');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCSEHandler);
    } else {
        initCSEHandler();
    }
})();
