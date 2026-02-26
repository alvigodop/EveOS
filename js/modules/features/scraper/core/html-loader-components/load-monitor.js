/**
 * HTML Script Loader - Monitor Component
 * 
 * Handles error monitoring and auto-hiding of error notifications.
 */
(function () {
    'use strict';

    const LoadMonitor = {
        /**
         * Set up a mutation observer to hide error sections 
         */
        setupErrorSectionRemover: function () {
            // Function to hide any CORS error sections
            function hideErrorSections() {
                // Target the red error box (Loading Errors)
                const errorSections = document.querySelectorAll('#moduleStatusPopup .popup-body div[style*="background-color: #ffebee"]');
                errorSections.forEach(section => {
                    // Only hide if it contains "Loading Errors" and script errors
                    if (section.textContent.includes('Script error') ||
                        section.textContent.includes('CORS') ||
                        section.textContent.includes('Loading Errors')) {

                        // If it also mentions local file system, definitely hide it
                        if (section.textContent.includes('local file system')) {
                            section.style.display = 'none';
                        }
                    }
                });
            }

            // Run immediately
            hideErrorSections();

            // Setup mutation observer to detect when the module status popup is updated
            const observer = new MutationObserver(mutations => {
                // Look for relevant changes
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' &&
                        (mutation.target.id === 'moduleStatusPopup' ||
                            mutation.target.classList.contains('popup-body'))) {
                        hideErrorSections();
                    }
                }
            });

            // Start observing the document body for added nodes
            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                });
            }

            // Also call it periodically just to be sure
            setInterval(hideErrorSections, 500);
        }
    };

    window.LoadMonitor = LoadMonitor;
})();
