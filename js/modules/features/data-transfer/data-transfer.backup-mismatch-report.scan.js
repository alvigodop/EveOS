// --- Data Transfer Backup Mismatch Report Folder Scanner ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.backupMismatchReportScanReady) return;
    if (!ns.importParseFsReady || !ns.BackupMismatchReportCore) {
        console.warn('[DataTransfer] Backup mismatch scan helpers missing; scanner not initialized.');
        return;
    }

    const readJsonFromFileHandle = ns.readJsonFromFileHandle;
    const listDirectoryEntries = ns.listDirectoryEntries;
    const core = ns.BackupMismatchReportCore;

    function isStatePath(path) {
        const lowerPath = String(path || '').toLowerCase();
        return lowerPath.includes('/state/') || lowerPath.startsWith('state/');
    }

    function isManifestPath(path) {
        const lowerPath = String(path || '').toLowerCase();
        return lowerPath.endsWith('/manifest.json') || lowerPath === 'manifest.json';
    }

    function hasEntityShape(payload) {
        return !!payload?.entityLink
            || !!payload?.entityId
            || /^eveos\.(tab|card|bookmark|bookmark-folder|workspace)/i.test(String(payload?.schema || ''));
    }

    function makeParseFailureRecord(path, name, error) {
        return {
            path,
            schema: '',
            entityLink: '',
            fallbackLink: '',
            fallbackSource: {},
            parsed: null,
            type: '',
            entityId: '',
            displayName: name,
            payload: {},
            validation: null,
            fallbackValidation: null,
            issues: [{
                code: 'json_parse_failed',
                severity: 'broken',
                label: 'JSON file could not be parsed.',
                detail: error?.message || String(error)
            }],
            severity: 'broken',
            status: 'Broken'
        };
    }

    async function scanJsonFiles(rootHandle, options = {}) {
        const maxFiles = Number.isFinite(Number(options.maxFiles)) ? Number(options.maxFiles) : 50000;
        const records = [];
        const stateFiles = [];
        let scannedFiles = 0;
        let manifest = null;

        async function walk(handle, relativePath) {
            if (!handle || scannedFiles >= maxFiles) return;
            const entries = await listDirectoryEntries(handle);
            for (const { name, handle: childHandle } of entries) {
                const childPath = relativePath ? `${relativePath}/${name}` : name;
                if (childHandle.kind === 'directory') {
                    await walk(childHandle, childPath);
                    continue;
                }
                if (childHandle.kind !== 'file' || !String(name).toLowerCase().endsWith('.json')) continue;
                scannedFiles += 1;
                let payload = null;
                try {
                    payload = await readJsonFromFileHandle(childHandle);
                } catch (error) {
                    records.push(makeParseFailureRecord(childPath, name, error));
                    continue;
                }
                if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
                if (isManifestPath(childPath)) manifest = payload;
                if (isStatePath(childPath)) stateFiles.push({ path: childPath, payload });
                if (hasEntityShape(payload)) records.push(core.makeRecord(childPath, payload));
            }
        }

        await walk(rootHandle, '');
        return { records, stateFiles, scannedFiles, manifest };
    }

    async function buildBackupMismatchReportFromFolder(rootHandle, options = {}) {
        if (!rootHandle) {
            return core.buildBackupMismatchReportFromRecords([], { errors: ['missing_root_handle'] });
        }
        const scanned = await scanJsonFiles(rootHandle, options);
        return core.buildBackupMismatchReportFromRecords(scanned.records, {
            ...scanned,
            rootName: options.rootName || rootHandle.name || ''
        });
    }

    Object.assign(ns, {
        scanBackupMismatchJsonFiles: scanJsonFiles,
        buildBackupMismatchReportFromFolder
    });

    ns.backupMismatchReportScanReady = true;
})();
