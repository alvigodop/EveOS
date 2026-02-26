/**
 * Loads the Local Stylesheet HTML component into the page head.
 * This component includes the main.css local stylesheet.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadLocalStylesheet() {
    console.log('localStylesheetUILoader.js: Loading Local Stylesheet component...');

    try {
        // Create the link element directly instead of fetching HTML
        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.href = 'main.css';

        // Get the document head where local stylesheet should be inserted
        const headElement = document.head;
        if (!headElement) {
            throw new Error('Document head element not found');
        }

        headElement.appendChild(linkElement);

        console.log('localStylesheetUILoader.js: Local Stylesheet loaded successfully.');

        return Promise.resolve();

    } catch (error) {
        console.error('localStylesheetUILoader.js: Error loading Local Stylesheet:', error);
        return Promise.reject(error);
    }
}

// Export the function globally for use by other scripts
window.loadLocalStylesheet = loadLocalStylesheet; 