window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    const h = searchNs._NebulaJsonPatchShared || {};
    const parts = searchNs._NebulaJsonPatchParts = searchNs._NebulaJsonPatchParts || {};
    const {
        cloneData,
        getConfig,
        getLiveLinks,
        setLiveLinks,
        getFolderStores
    } = h;
    const buildTransaction = (...args) => parts.buildTransaction(...args);
    const validatePatch = (...args) => parts.validatePatch(...args);
    const previewPatch = (...args) => parts.previewPatch(...args);
    const applyPatch = (...args) => parts.applyPatch(...args);
    const persistAndRender = (...args) => parts.persistAndRender(...args);

    function snapshotMutableState() {
        const cfg = getConfig();
        return {
            configRef: cfg,
            configSnapshot: cloneData(cfg),
            linksSnapshot: cloneData(getLiveLinks()),
            librarySnapshot: cloneData(window.EveLibrary?.State?.getAllLibraries?.() || {}),
            folderSnapshots: getFolderStores().map(function (store) {
                return { ref: store, snapshot: cloneData(store) };
            })
        };
    }

    function restoreObject(ref, snapshot) {
        if (!ref || typeof ref !== 'object') return;
        Object.keys(ref).forEach(function (key) {
            delete ref[key];
        });
        Object.assign(ref, cloneData(snapshot) || {});
    }

    function restoreMutableState(snapshot) {
        if (!snapshot) return;
        restoreObject(snapshot.configRef, snapshot.configSnapshot);
        setLiveLinks(cloneData(snapshot.linksSnapshot) || []);
        window.EveLibrary?.State?.setAllLibraries?.(cloneData(snapshot.librarySnapshot) || {});
        (snapshot.folderSnapshots || []).forEach(function (entry) {
            restoreObject(entry.ref, entry.snapshot);
        });
    }

    function validateTransaction(transaction) {
        const tx = transaction && typeof transaction === 'object'
            ? transaction
            : buildTransaction([], { source: 'invalid-transaction' });
        const patches = Array.isArray(tx.patches) ? tx.patches : [];
        const patchValidations = patches.map(validatePatch);
        const errors = [];
        const warnings = [];
        if (!patches.length) errors.push('empty_transaction');
        patchValidations.forEach(function (validation, index) {
            validation.errors.forEach(function (error) {
                errors.push('patch_' + index + ':' + error);
            });
            validation.warnings.forEach(function (warning) {
                warnings.push('patch_' + index + ':' + warning);
            });
        });
        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            transaction: tx,
            patches: patchValidations,
            errors,
            warnings
        };
    }

    function previewTransaction(transaction) {
        const tx = transaction && typeof transaction === 'object' ? transaction : buildTransaction([], {});
        const previews = (Array.isArray(tx.patches) ? tx.patches : []).map(previewPatch);
        const errors = [];
        const warnings = [];
        previews.forEach(function (preview, index) {
            (preview.errors || []).forEach(function (error) {
                errors.push('patch_' + index + ':' + error);
            });
            (preview.warnings || []).forEach(function (warning) {
                warnings.push('patch_' + index + ':' + warning);
            });
        });
        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            transaction: tx,
            previews,
            summary: previews.map(function (preview) { return preview.summary; }).join('\n'),
            errors,
            warnings
        };
    }

    function applyTransaction(transaction, options) {
        const tx = transaction && typeof transaction === 'object' ? transaction : buildTransaction([], {});
        const validation = validateTransaction(tx);
        const preview = previewTransaction(tx);
        if (!validation.ok) {
            return {
                ok: false,
                applied: false,
                transaction: tx,
                validation,
                preview,
                rolledBack: false,
                errors: validation.errors,
                warnings: validation.warnings
            };
        }

        const snapshot = snapshotMutableState();
        const results = [];
        let aggregate = { dataChanged: false, configChanged: false, libraryChanged: false, changed: 0 };
        try {
            tx.patches.forEach(function (patch) {
                const result = applyPatch(patch, { persist: false, skipRender: true });
                results.push(result);
                if (!result.ok) throw new Error((result.errors || ['patch_apply_failed']).join(','));
                aggregate.dataChanged = aggregate.dataChanged || !!result.dataChanged;
                aggregate.configChanged = aggregate.configChanged || !!result.configChanged;
                aggregate.libraryChanged = aggregate.libraryChanged || !!result.libraryChanged;
                aggregate.changed += Number(result.changed || 0);
            });
        } catch (error) {
            restoreMutableState(snapshot);
            return {
                ok: false,
                applied: false,
                transaction: tx,
                validation,
                preview,
                results,
                rolledBack: true,
                errors: [String(error?.message || error || 'transaction_failed')],
                warnings: validation.warnings
            };
        }

        const result = {
            ok: true,
            applied: aggregate.changed > 0 || aggregate.dataChanged || aggregate.configChanged || aggregate.libraryChanged,
            transaction: tx,
            validation,
            preview,
            results,
            rolledBack: false,
            changed: aggregate.changed,
            dataChanged: aggregate.dataChanged,
            configChanged: aggregate.configChanged,
            libraryChanged: aggregate.libraryChanged,
            op: 'transaction',
            errors: [],
            warnings: validation.warnings
        };
        persistAndRender(result, options || {});
        return result;
    }

    Object.assign(parts, {
        snapshotMutableState,
        restoreMutableState,
        validateTransaction,
        previewTransaction,
        applyTransaction
    });
})();
