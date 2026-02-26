/**
 * Loads the External Stylesheets and Scripts HTML component into the page head.
 * This component includes Material Design Lite, Dialog Polyfill, Google Fonts, and favicon.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadExternalStylesheetsAndScripts() {
    console.log('externalStylesheetsAndScriptsUILoader.js: Loading External Stylesheets and Scripts component...');

    try {
        const headElement = document.head;
        if (!headElement) {
            throw new Error('Document head element not found');
        }

        // Define resources to load (Source: main_html_files/external_dependencies/external_stylesheets_and_scripts/external_stylesheets_and_scripts.html)
        const resources = [
            // Google Fonts for Material Icons
            { type: 'link', rel: 'stylesheet', href: 'https://fonts.googleapis.com/icon?family=Material+Icons' },
            // Material Design Lite (MDL) CSS (Cyan theme to match Eve OS)
            { type: 'link', rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.cyan-light_blue.min.css' },
            // Favicon
            { type: 'link', rel: 'icon', href: '/server/images/favicon.ico', customType: 'image/x-icon' },
            // Dialog Polyfill CSS
            { type: 'link', rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/dialog-polyfill/0.5.6/dialog-polyfill.min.css' },
            // Material Design Lite (MDL) JavaScript
            { type: 'script', src: 'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.min.js' },
            // Dialog Polyfill JavaScript
            { type: 'script', src: 'https://cdnjs.cloudflare.com/ajax/libs/dialog-polyfill/0.5.6/dialog-polyfill.min.js' }
        ];

        // Process resources
        for (const resource of resources) {
            if (resource.type === 'link') {
                const link = document.createElement('link');
                link.rel = resource.rel;
                link.href = resource.href;
                if (resource.customType) link.type = resource.customType;
                headElement.appendChild(link);
            } else if (resource.type === 'script') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = resource.src;

                    const timeoutId = setTimeout(() => {
                        console.warn(`externalStylesheetsAndScriptsUILoader.js: Timeout waiting for script: ${resource.src}`);
                        resolve(); // Resolve anyway to allow application to proceed
                    }, 5000); // 5 second timeout

                    script.onload = () => {
                        clearTimeout(timeoutId);
                        console.log(`externalStylesheetsAndScriptsUILoader.js: Script loaded: ${resource.src}`);
                        resolve();
                    };
                    script.onerror = (error) => {
                        clearTimeout(timeoutId);
                        // Don't reject, just log and continue. Rejecting stops the whole init chain.
                        console.warn(`externalStylesheetsAndScriptsUILoader.js: Script failed to load: ${resource.src}`, error);
                        resolve();
                    };
                    headElement.appendChild(script);
                });
            }
        }

        // Wait for Material Design Lite to be fully available and ready
        await waitForMaterialDesignLite();

        console.log('externalStylesheetsAndScriptsUILoader.js: External Stylesheets and Scripts loaded successfully.');

        return Promise.resolve();

    } catch (error) {
        console.error('externalStylesheetsAndScriptsUILoader.js: Error loading External Stylesheets and Scripts:', error);
        return Promise.reject(error);
    }
}

/**
 * Loads a script element and waits for it to finish loading
 */
function loadScriptElement(originalScript) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');

        // Copy all attributes from the original script
        for (let attr of originalScript.attributes) {
            script.setAttribute(attr.name, attr.value);
        }

        // Copy the script content if it has any
        if (originalScript.textContent) {
            script.textContent = originalScript.textContent;
        }

        script.onload = () => {
            console.log(`externalStylesheetsAndScriptsUILoader.js: Script loaded: ${script.src || 'inline script'}`);
            resolve();
        };

        script.onerror = (error) => {
            console.error(`externalStylesheetsAndScriptsUILoader.js: Script failed to load: ${script.src || 'inline script'}`, error);
            reject(error);
        };

        document.head.appendChild(script);
    });
}

/**
 * Waits for Material Design Lite componentHandler to be available and fully ready
 * Returns a Promise that resolves when MDL is ready
 */
function waitForMaterialDesignLite() {
    return new Promise((resolve) => {
        // Check if componentHandler is already available
        if (typeof window.componentHandler !== 'undefined' && window.componentHandler.upgradeAllRegistered) {
            console.log('externalStylesheetsAndScriptsUILoader.js: Material Design Lite componentHandler already available and ready.');
            resolve();
            return;
        }

        // If not available, wait for it with polling
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds max wait time (increased)
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof window.componentHandler !== 'undefined' && window.componentHandler.upgradeAllRegistered) {
                console.log(`externalStylesheetsAndScriptsUILoader.js: Material Design Lite componentHandler is now available and ready (attempt ${attempts}).`);
                clearInterval(checkInterval);
                resolve();
            } else if (attempts >= maxAttempts) {
                console.warn('externalStylesheetsAndScriptsUILoader.js: Material Design Lite componentHandler not available after waiting. Continuing anyway.');
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}

// Export the function globally for use by other scripts
window.loadExternalStylesheetsAndScripts = loadExternalStylesheetsAndScripts; 