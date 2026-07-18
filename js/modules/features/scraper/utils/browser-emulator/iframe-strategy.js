/**
 * BrowserEmulator Iframe Strategy
 * 
 * Extends BrowserEmulator with iframe rendering capabilities.
 */

(function () {
    const MAX_RENDERED_CONTENT_LENGTH = 5_000_000;

    // Determine if BrowserEmulator is loaded
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before iframe strategy');
        return;
    }

    // Add methods to the existing object
    Object.assign(window.BrowserEmulator, {
        /**
         * Set up event listeners for iframe rendering method
         * @private
         */
        _setupIframeListeners: function () {
            if (this._iframeListenersReady) return;
            this._iframeListenersReady = true;

            // Listen for iframe rendering messages
            window.addEventListener('message', (event) => {
                const data = event.data;
                const sourceFrame = Array.from(document.querySelectorAll('iframe[data-browser-emulator-frame="1"]'))
                    .find((frame) => frame.contentWindow === event.source);
                const expectedKey = sourceFrame?.dataset?.renderKey || '';
                const content = typeof data?.content === 'string' ? data.content : '';
                if (data?.type === 'browser-emulator-render-complete'
                    && sourceFrame
                    && expectedKey
                    && String(data.renderKey || '') === expectedKey
                    && content.length <= MAX_RENDERED_CONTENT_LENGTH) {
                    // Handle the rendered content
                    const renderKey = data.renderKey;
                    const renderedContent = content;

                    // Dispatch event for pending renders
                    const customEvent = new CustomEvent('browser-emulator-render-complete', {
                        detail: {
                            renderKey: renderKey,
                            content: renderedContent
                        }
                    });

                    // Dispatch to document
                    document.dispatchEvent(customEvent);
                }
            }, false);

            console.log('BrowserEmulator: Iframe listeners setup');
        },

        /**
         * Render a URL using iframe method
         * @private
         * @param {string} url - URL to render
         * @param {string} renderKey - Unique identifier for this rendering request
         * @param {Object} options - Rendering options
         * @returns {Promise<string>} - Promise resolving to rendered HTML content
         */
        _renderWithIframe: function (url, renderKey, options) {
            return new Promise((resolve, reject) => {
                console.log(`BrowserEmulator: Attempting iframe rendering for ${url}`);

                // Create container for the iframe
                const container = document.createElement('div');
                container.style.position = 'absolute';
                container.style.top = '-9999px';
                container.style.left = '-9999px';
                container.style.width = '1024px';
                container.style.height = '768px';

                // Create the iframe
                const iframe = document.createElement('iframe');
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.setAttribute('sandbox', 'allow-scripts');
                iframe.dataset.browserEmulatorFrame = '1';
                iframe.setAttribute('data-render-key', renderKey);

                // Set up timeout for iframe loading
                const iframeTimeout = setTimeout(() => {
                    cleanup();
                    reject(new Error(`Iframe rendering timed out after ${options.iframeTimeout}ms`));
                }, options.iframeTimeout);

                // Set up listener for rendered content
                const renderListener = function (event) {
                    if (event.detail && event.detail.renderKey === renderKey) {
                        cleanup();
                        resolve(event.detail.content);
                    }
                };

                // Function to clean up resources
                function cleanup() {
                    clearTimeout(iframeTimeout);
                    document.removeEventListener('browser-emulator-render-complete', renderListener);
                    if (container.parentNode) {
                        container.parentNode.removeChild(container);
                    }
                }

                // Add listener for render complete event
                document.addEventListener('browser-emulator-render-complete', renderListener);

                // Add iframe to container and container to document
                container.appendChild(iframe);
                document.body.appendChild(container);

                // Set up a script to capture the rendered content
                const parentOrigin = window.location.protocol === 'file:'
                    ? '*'
                    : window.location.origin;
                const escapedUrl = String(url || '')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;');
                const capturingScript = `
                    <script>
                        // Wait for page to fully load
                        window.addEventListener('load', function() {
                            setTimeout(function() {
                                // Get the rendered content
                                const renderedContent = document.documentElement.outerHTML;
                                
                                // Send message to parent window
                                window.parent.postMessage({
                                    type: 'browser-emulator-render-complete',
                                    renderKey: ${JSON.stringify(String(renderKey))},
                                    content: renderedContent
                                }, ${JSON.stringify(parentOrigin)});
                            }, 1000); // Wait an additional second for dynamic content
                        });
                    </script>
                `;

                // Try to load the URL via srcdoc to bypass some CORS restrictions
                iframe.srcdoc = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <base href="${escapedUrl}" />
                        <script>
                            // Set up to capture errors
                            window.addEventListener('error', function(event) {
                                console.warn('Iframe rendering error:', event.message);
                            });
                        </script>
                        ${capturingScript}
                    </head>
                    <body>
                        <iframe src="${escapedUrl}" style="width:100%;height:100%;border:none;"></iframe>
                    </body>
                    </html>
                `;
            });
        }
    });

    console.log('BrowserEmulator: Iframe strategy loaded');
})();
