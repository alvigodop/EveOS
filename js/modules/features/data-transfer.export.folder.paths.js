// --- Data Transfer Export Folder Path Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderPathHelpers = function createFolderPathHelpers(deps) {
        const getAppConfig = deps.getAppConfig;
        const getLayerPathInput = deps.getLayerPathInput;

        function getLayerDestinationPath() {
            const inputValue = String(getLayerPathInput()?.value || '').trim();
            if (inputValue) return inputValue;
            return String(getAppConfig().modularLayerPath || '').trim();
        }

        async function requireLayerDestinationPath() {
            const modularSync = window.EveDataStore?.ModularSync;
            if (modularSync?.pickFolderPath) {
                try {
                    const initialPath = getLayerDestinationPath() || String(getAppConfig().modularLayerPath || '').trim();
                    const picked = await modularSync.pickFolderPath(initialPath);
                    if (picked?.ok && !picked.canceled && picked.path) {
                        persistLayerDestinationPath(picked.path);
                        return picked.path;
                    }
                    if (picked?.ok && picked.canceled) {
                        showToast('Backup canceled: folder not selected.', 'info');
                        return '';
                    }
                } catch (error) {
                    console.warn('[DataTransfer] Could not open folder picker for layer path:', error);
                }
            }

            const path = getLayerDestinationPath();
            if (path) return path;
            showToast('Set Folder Path in Copy Between Packs (Advanced) before running server folder backups.', 'warning');
            return '';
        }

        function persistLayerDestinationPath(nextPath) {
            const value = String(nextPath || '').trim();
            if (!value) return;
            const input = getLayerPathInput();
            if (input) input.value = value;
            const appConfig = getAppConfig();
            if (appConfig && typeof appConfig === 'object') {
                appConfig.modularLayerPath = value;
            }
            if (typeof saveConfig === 'function') {
                saveConfig();
            }
        }

        return {
            getLayerDestinationPath,
            requireLayerDestinationPath,
            persistLayerDestinationPath
        };
    };
})();
