/**
 * Data Manager Import Module
 * Handles importing data from JSON
 */
const DMImport = {};

/**
 * Import data from a JSON file
 * @param {File} file - The file to import
 */
DMImport.importData = function (file) {
    if (!file) {
        // trigger file picker if no file provided
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        // Track if file was selected
        let fileSelected = false;

        input.onchange = e => {
            if (e.target.files.length > 0) {
                fileSelected = true;
                this.importData(e.target.files[0]);
            }
        };

        // Detect cancellation (focus returns to window without file)
        const checkCancel = () => {
            setTimeout(() => {
                if (!fileSelected && document.body.contains(input) === false) {
                    // User likely cancelled - no feedback needed, silent
                }
            }, 300);
        };

        input.addEventListener('cancel', () => {
            if (window.DMUtils) DMUtils.showToast('No file selected', 'info');
        });

        window.addEventListener('focus', checkCancel, { once: true });
        input.click();
        return;
    }

    console.log('Importing data from:', file.name);
    // Show immediate feedback
    if (window.DMUtils) DMUtils.showToast('Reading ' + file.name + '...', 'info');

    const reader = new FileReader();

    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);

            // Validate basic structure
            if (!data.fandomDomains && !data.wikiEntries) {
                throw new Error('Invalid backup file format');
            }

            // Count items to report
            const domainCount = (data.fandomDomains || []).length;
            const entryCount = (data.wikiEntries || []).length;

            // Restore data
            if (data.fandomDomains) StorageManager.saveFandomDomains(data.fandomDomains);
            if (data.wikiEntries) StorageManager.saveWikiEntries(data.wikiEntries);
            if (data.wikiDataStore) StorageManager.saveToDataStore(data.wikiDataStore);
            if (data.wikiCacheStore) StorageManager.saveToCacheStore(data.wikiCacheStore);
            if (data.wikiCategories) StorageManager.saveData('wikiCategories', data.wikiCategories);

            // Update Global State & UI
            if (data.fandomDomains) {
                window.wikiDomains = data.fandomDomains;
                window.fandomDomains = data.fandomDomains;
            }
            if (data.wikiEntries) {
                window.wikiEntries = data.wikiEntries;
            }
            if (data.wikiDataStore) {
                window.wikiDataStore = data.wikiDataStore;
            }
            if (data.wikiCacheStore) {
                window.wikiCacheStore = data.wikiCacheStore;
            }

            // Trigger UI updates
            if (typeof updateFandomDomainList === 'function') updateFandomDomainList();
            if (typeof updateWikiEntryList === 'function') updateWikiEntryList();

            if (window.DMUtils) DMUtils.showToast(`Imported ${entryCount} entries, ${domainCount} domains. Reloading...`, 'success');

            // Reload page to ensure everything syncs up
            setTimeout(() => window.location.reload(), 1500);

        } catch (err) {
            console.error('Import failed:', err);
            if (window.DMUtils) DMUtils.showToast('Import failed: ' + err.message, 'error');
        }
    };

    reader.onerror = () => {
        if (window.DMUtils) DMUtils.showToast('Failed to read file', 'error');
    };

    reader.readAsText(file);
};

// Ensure global availability
window.DMImport = DMImport;
console.log('[DMImport] Loaded');
