/**
 * Google CSE Toggle Handler - Interceptor Component
 * 
 * Handles strict link interception to prevent Google CSE from hijacking the window.
 * 
 * @version 1.0.0
 */

const CTHInterceptor = {
    /**
     * Attach "Nuclear" Global Interceptor
     * Blocks Google's click hijacking by capturing events at the window level.
     */
    attachLinkInterceptor: function () {
        // We capture MULTIPLE event types to be safe
        const eventTypes = ['click', 'mousedown', 'mouseup'];

        eventTypes.forEach(eventType => {
            window.addEventListener(eventType, function (e) {
                const resultsContainer = document.getElementById('google-results-container');

                // 1. Must be valid and present
                if (!resultsContainer) return;

                // 2. Must be interaction INSIDE the container
                if (!resultsContainer.contains(e.target)) return;

                // 3. Must be on an Anchor tag (or inside one)
                const link = e.target.closest('a');
                if (!link) return;

                // 4. Must have a URL
                const url = link.getAttribute('href') || link.href;
                if (!url || url.startsWith('javascript:') || url.startsWith('#')) return;

                // Determine Mode
                let mode = 'popup'; // Default
                if (resultsContainer.closest('.wiki-discovery')) {
                    const radio = document.querySelector('input[name="wikiOpenMode"]:checked');
                    if (radio) mode = radio.value;
                } else if (resultsContainer.closest('#fandom-search-container')) {
                    const radio = document.querySelector('input[name="fandomOpenMode"]:checked');
                    if (radio) mode = radio.value;
                }
                // Fallback check
                if (resultsContainer.parentElement && resultsContainer.parentElement.closest('.wiki-discovery')) {
                    const radio = document.querySelector('input[name="wikiOpenMode"]:checked');
                    if (radio) mode = radio.value;
                }

                // Logic
                if (mode === 'popup') {
                    // STOP EVERYTHING
                    e.stopImmediatePropagation();
                    e.stopPropagation();

                    // On CLICK, we perform the action AND prevent default
                    if (eventType === 'click') {
                        e.preventDefault();
                        console.log(`CSE Intercept (Nuclear): Opening '${url}' in Popup`);

                        let title = link.textContent || 'Search Result';
                        if (link.classList.contains('gs-title')) title = link.innerText;

                        if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                            PopupManager.openPopup(url, title);
                        } else {
                            window.open(url, '_blank');
                        }
                    } else {
                        // On mousedown/mouseup:
                        // Just stop propagation to prevent Google's listeners from firing.
                        // We DO NOT preventDefault here, as that might stop the 'click' from ever firing.
                        // (Browsers need mousedown/up checks to generate click)
                        // However, stopping propagation is key.
                        console.log(`CSE Intercept: Blocked ${eventType} propagation`);
                    }
                } else {
                    // New Tab Mode
                    // Force _blank on the link itself
                    if (link.target !== '_blank') link.target = '_blank';
                }

            }, true); // CAPTURE PHASE is critical
        });
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CTHInterceptor', CTHInterceptor);
}

window.CTHInterceptor = CTHInterceptor;
