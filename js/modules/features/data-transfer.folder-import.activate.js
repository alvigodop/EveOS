// --- Data Transfer Folder Import Activate Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importActivateReady) return;
    if (!ns.sharedReady || !ns.exportReady || !ns.importParseReady) {
        console.warn('[DataTransfer] Shared, export, or import parse helpers missing; import activate helpers not initialized.');
        return;
    }

    async function activateDataPackFolderFromPicker(options = {}) {
        const pickDirectory = typeof options.pickDirectory === 'function'
            ? options.pickDirectory
            : window.showDirectoryPicker;
        const confirmDialog = typeof options.confirmDialog === 'function'
            ? options.confirmDialog
            : (typeof ns.confirmDialog === 'function'
                ? ns.confirmDialog
                : async function (message) { return showConfirm(message); });

        if (typeof pickDirectory !== 'function') {
            return { ok: false, error: 'Folder picker is not supported in this browser.' };
        }
        const dataStore = typeof ns.getDataStore === 'function' ? ns.getDataStore() : null;
        if (!dataStore?.applyState) {
            return { ok: false, error: 'Unified state restore is unavailable right now.' };
        }
        try {
            const rootHandle = await pickDirectory({ mode: 'read' });
            const parsed = await ns.parseAnyDataPackFolder(rootHandle, options);
            const summary = ns.summarizeStateCounts(parsed.state);
            const confirmMessage = options.confirmMessage || `Set selected folder as active data pack (${summary.tabs} tabs, ${summary.cards} cards, ${summary.bookmarks} bookmarks)?`;
            if (options.confirm !== false) {
                const confirmed = await confirmDialog(confirmMessage);
                if (!confirmed) return { ok: false, canceled: true };
                if (options.confirmTwice) {
                    const finalConfirmMessage = options.finalConfirmMessage || 'Final confirmation: apply selected data pack now? This overwrites current bookmarks & library.';
                    const finalConfirmed = await confirmDialog(finalConfirmMessage);
                    if (!finalConfirmed) return { ok: false, canceled: true };
                }
            }
            const applied = !!dataStore.applyState(parsed.state);
            if (!applied) return { ok: false, error: 'Could not apply selected data pack.' };
            return { ok: true, sourceType: parsed.sourceType, summary };
        } catch (error) {
            if (error?.name === 'AbortError') return { ok: false, canceled: true };
            return { ok: false, error: error?.message || String(error) };
        }
    }

    Object.assign(ns, { activateDataPackFolderFromPicker });
    window.activateDataPackFolderFromPicker = activateDataPackFolderFromPicker;
    ns.importActivateReady = true;
})();
