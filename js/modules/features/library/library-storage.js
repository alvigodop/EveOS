/**
 * Library Storage Module for Eve OS
 * Handles localStorage persistence and backup management
 * Adapted from MegaBase storage-manager.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Ratings = window.EveLibrary.Ratings;
    const STORAGE_KEY = 'eveLibraryData';
    const BACKUP_KEY = 'eveLibraryBackups';
    const maxBackups = 5;

    let backups = [];

    function migrateLibraryDataStructure(rawData) {
        if (!rawData || typeof rawData !== 'object') return {};
        const migrated = JSON.parse(JSON.stringify(rawData));
        Object.values(migrated).forEach(category => {
            if (!category || typeof category !== 'object') return;
            if (!Array.isArray(category.entries)) category.entries = [];
            category.entries.forEach(entry => {
                if (!entry || typeof entry !== 'object') return;
                if (Ratings?.applyDerivedRatings) {
                    Ratings.applyDerivedRatings(entry);
                } else {
                    entry.apiRatings = entry.apiRatings || {};
                    entry.derivedRatings = entry.derivedRatings || {};
                }
            });
        });
        return migrated;
    }

    function loadLibrary() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data = migrateLibraryDataStructure(JSON.parse(stored));
                State.setAllLibraries(data);
            } catch (e) {
                console.error('Failed to load library data:', e);
            }
        }
        loadBackups();
    }

    function saveLibrary() {
        const data = migrateLibraryDataStructure(State.getAllLibraries());
        State.setAllLibraries(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        createBackup();
    }

    function loadBackups() {
        const stored = localStorage.getItem(BACKUP_KEY);
        if (stored) {
            try {
                backups = JSON.parse(stored);
            } catch (e) {
                backups = [];
            }
        }
    }

    function saveBackups() {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
    }

    function createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            data: JSON.stringify(State.getAllLibraries())
        };
        backups.push(backup);
        if (backups.length > maxBackups) {
            backups.shift();
        }
        saveBackups();
    }

    function getBackups() { return backups; }

    function restoreBackup(index) {
        const backup = backups[index];
        if (backup) {
            try {
                const data = JSON.parse(backup.data);
                State.setAllLibraries(data);
                saveLibrary();
                return true;
            } catch (e) {
                console.error('Failed to restore backup:', e);
                return false;
            }
        }
        return false;
    }

    function exportCategoryLibrary(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataStr = JSON.stringify(lib, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `library-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importCategoryLibrary(categoryName, file, callback) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                let data = JSON.parse(evt.target.result);

                // Handle Legacy Format: Array wrapper
                if (Array.isArray(data) && data.length > 0 && (data[0].graphicNovels || data[0].films || data[0].novels)) {
                    data = data[0];
                }

                // Handle Legacy Format: Global Object with type keys (graphicNovels, films, novels)
                // We need to decide which entries to import based on the current Category's dataType
                const currentLib = State.getCategoryLibrary(categoryName);
                const targetType = currentLib.dataType || 'graphicNovels';

                if (!data.entries && (data.graphicNovels || data.films || data.novels)) {
                    // It's a legacy file. Extract the relevant section.
                    const legacyEntries = data[targetType];

                    if (!legacyEntries) {
                        throw new Error(`Legacy file does not contain data for type: ${targetType}`);
                    }

                    // Convert legacy entries to new format if needed (currently compatible, just ensure ID)
                    const convertedEntries = legacyEntries.map(e => ({
                        ...e,
                        id: e.id || Date.now() + Math.random().toString(36).substr(2, 9),
                        // Legacy used 'readStatus' boolean, new uses 'status' string. 
                        // If status is missing but readStatus exists, map it? 
                        // The user's snippet has "status": "Reading", so it seems compatible.
                        favorite: e.favorite || false
                    }));

                    data = {
                        dataType: targetType,
                        entries: convertedEntries
                    };
                }

                // Standard Format Check
                if (typeof data !== 'object' || !Array.isArray(data.entries)) {
                    throw new Error('Invalid library data structure. Expected { entries: [] } or valid legacy format.');
                }

                // Merge or Replace? 
                // The prompt implies "import", which usually might mean Replace or Merge. 
                // The current implementation was replace (SetCategoryLibrary).
                // Let's stick to Replace for "Import Library" matching standard behavior, 
                // OR arguably "Add to library". 
                // MegaBase implementation: "State.setLibrary(newData)" -> Replace.


                State.setCategoryLibrary(categoryName, data);
                saveLibrary();
                if (window.EveLibrary.UI && typeof window.EveLibrary.UI.refreshLibrary === 'function') {
                    window.EveLibrary.UI.refreshLibrary(categoryName);
                }
                if (callback) callback(true);
            } catch (error) {
                console.error('Import error:', error);
                if (callback) callback(false, error.message);
            }
        };
        reader.readAsText(file);
    }

    window.EveLibrary.Storage = {
        loadLibrary,
        saveLibrary,
        getBackups,
        restoreBackup,
        exportCategoryLibrary,
        importCategoryLibrary
    };
})();
