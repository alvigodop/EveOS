/**
 * Data Manager Export Module
 * Handles exporting data to JSON
 */
const DMExport = {};

/**
 * Export all application data to a JSON file
 */
DMExport.exportData = async function () {
    console.log('Exporting data...');

    // Gather all data from StorageManager/CacheManager
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        fandomDomains: await StorageManager.loadFandomDomains(),
        wikiEntries: await StorageManager.loadWikiEntries(),
        wikiDataStore: await StorageManager.loadFromDataStore(),
        wikiCacheStore: await StorageManager.loadFromCacheStore(),
        wikiCategories: await StorageManager.loadDataAsync('wikiCategories', [])
    };


    try {
        const jsonStr = JSON.stringify(data, null, 2);
        const filename = 'wiki-data-backup.json';

        // Check if running from file:// protocol
        const isFileProtocol = window.location.protocol === 'file:';

        if (isFileProtocol) {
            // For file:// protocol, use Data URI which respects filename better
            // and show a save dialog alternative
            this._showExportDialog(jsonStr, filename);
        } else {
            // Standard blob download for http/https
            const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            if (window.DMUtils) DMUtils.showToast('Data exported successfully!', 'success');
        }
        return true;
    } catch (e) {
        console.error('Export failed:', e);
        if (window.DMUtils) DMUtils.showToast('Export failed: ' + e.message, 'error');
        return false;
    }
};

/**
 * Show export dialog for file:// protocol with copy-to-clipboard option
 */
DMExport._showExportDialog = function (jsonStr, filename) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'export-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = 'background:white;padding:20px;border-radius:8px;max-width:600px;width:90%;max-height:80vh;display:flex;flex-direction:column;';

    modal.innerHTML = `
        <h3 style="margin:0 0 15px 0;color:#333;">Export Data</h3>
        <p style="margin:0 0 10px 0;color:#666;font-size:14px;">
            Running from local file. Choose how to save your data:
        </p>
        <div style="display:flex;gap:10px;margin-bottom:15px;">
            <button id="export-copy-btn" style="flex:1;padding:10px;background:#2196f3;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                📋 Copy to Clipboard
            </button>
            <button id="export-download-btn" style="flex:1;padding:10px;background:#4caf50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                💾 Download
            </button>
        </div>
        <textarea id="export-textarea" readonly style="flex:1;min-height:200px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ddd;border-radius:4px;resize:vertical;">${jsonStr}</textarea>
        <p style="margin:10px 0 0 0;color:#888;font-size:12px;">
            Save as: <strong>${filename}</strong>
        </p>
        <button id="export-close-btn" style="margin-top:15px;padding:8px 20px;background:#9e9e9e;color:white;border:none;border-radius:4px;cursor:pointer;align-self:flex-end;">
            Close
        </button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('export-copy-btn').onclick = () => {
        const textarea = document.getElementById('export-textarea');
        textarea.select();
        document.execCommand('copy');
        if (window.DMUtils) DMUtils.showToast('Data copied to clipboard! Save as ' + filename, 'success');
    };

    document.getElementById('export-download-btn').onclick = async () => {
        // Try File System Access API first (modern browsers)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'JSON File',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                if (window.DMUtils) DMUtils.showToast('File saved successfully!', 'success');
                overlay.remove();
                return;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Save failed:', err);
                }
                // User cancelled or error - fall through silently
            }
        } else {
            // Fallback: show instructions
            if (window.DMUtils) DMUtils.showToast('Save dialog not available. Please use "Copy to Clipboard" and paste into a text file.', 'warning');
        }
    };

    document.getElementById('export-close-btn').onclick = () => {
        overlay.remove();
    };

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
};

// Ensure global availability
window.DMExport = DMExport;
console.log('[DMExport] Loaded');
