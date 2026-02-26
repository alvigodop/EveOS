/**
 * CSE Recovery Module
 * 
 * Failsafe error recovery - catches Google CSE errors that break the site
 * Extracted from ScraperTest.html
 */

(function () {
    window.addEventListener('error', function (e) {
        // Check if error is related to Google CSE
        if (e && e.message && (
            e.message.includes('gapi') ||
            e.message.includes('google') ||
            e.message.includes('cse') ||
            e.message.includes('Cannot read') ||
            e.message.includes('undefined'))) {

            console.error('Detected possible CSE error:', e.message);

            // Add recovery button if not already present
            if (!document.getElementById('cse-recovery-button')) {
                const recoveryButton = document.createElement('div');
                recoveryButton.id = 'cse-recovery-button';
                recoveryButton.innerHTML = 'Recover From Error';

                recoveryButton.onclick = function () {
                    // Try to reset Google CSE
                    try {
                        // Clean up any Google artifacts
                        const googleElements = document.querySelectorAll('[class*="gsc-"], [id*="gsc-"], [class*="gs-"]');
                        googleElements.forEach(el => {
                            if (el.id !== 'google-searchbox-container' && el.id !== 'google-results-container') {
                                if (el.parentNode) {
                                    el.parentNode.removeChild(el);
                                }
                            }
                        });

                        // Clean containers
                        const searchContainer = document.getElementById('google-searchbox-container');
                        const resultsContainer = document.getElementById('google-results-container');

                        if (searchContainer) searchContainer.innerHTML = '';
                        if (resultsContainer) resultsContainer.innerHTML = '';

                        // Reset our module if possible
                        if (window.GoogleCSEEmbedded) {
                            console.log('Attempting to reinitialize GoogleCSEEmbedded');
                            GoogleCSEEmbedded._initialized = false;
                            GoogleCSEEmbedded._linkInterceptorActive = false;
                            GoogleCSEEmbedded._formInterceptorActive = false;
                            GoogleCSEEmbedded.init();
                        }

                        // Remove recovery button
                        if (this.parentNode) {
                            this.parentNode.removeChild(this);
                        }

                        // Add a toast message
                        const toast = document.createElement('div');
                        toast.className = 'recovery-toast';
                        toast.innerHTML = 'Recovery attempted - please try your search again';

                        document.body.appendChild(toast);

                        // Remove toast after 5 seconds
                        setTimeout(() => {
                            if (toast.parentNode) {
                                toast.parentNode.removeChild(toast);
                            }
                        }, 5000);

                    } catch (recoveryError) {
                        console.error('Error during recovery:', recoveryError);
                        alert('Could not recover automatically. Please refresh the page.');
                    }
                };

                document.body.appendChild(recoveryButton);
            }
        }
    });
})();
