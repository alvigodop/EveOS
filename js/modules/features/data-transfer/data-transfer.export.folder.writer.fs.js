// --- Data Transfer Export Folder Writer File Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderWriterFsHelpers = function createFolderWriterFsHelpers(deps) {
        const sanitizePathSegment = deps.sanitizePathSegment;
        const BACKUP_DIRS = deps.BACKUP_DIRS;

        async function writeTextFileToFolder(rootHandle, relativePath, content) {
            // ZIP path — delegate to the zip writer
            if (rootHandle && rootHandle._zipInstance) {
                rootHandle.writeTextFile(relativePath, content);
                return;
            }

            const segments = String(relativePath || '')
                .replace(/\\/g, '/')
                .split('/')
                .map((segment) => segment.trim())
                .filter(Boolean);
            if (!segments.length) return;

            const sanitizedSegments = segments.map((segment, index) => (
                index === segments.length - 1
                    ? sanitizePathSegment(segment, 'file.txt', 64)
                    : sanitizePathSegment(segment, 'folder', 40)
            ));
            const sanitizedPath = sanitizedSegments.join('/');

            try {
                let currentHandle = rootHandle;
                for (let i = 0; i < sanitizedSegments.length - 1; i += 1) {
                    currentHandle = await currentHandle.getDirectoryHandle(sanitizedSegments[i], { create: true });
                }

                const fileName = sanitizedSegments[sanitizedSegments.length - 1];
                const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch (error) {
                const isLongPathSuspect = error?.name === 'NotFoundError'
                    || /could not be found at the time/i.test(String(error?.message || ''));
                const baseDetail = error?.message ? ` ${error.message}` : '';
                const lengthHint = isLongPathSuspect
                    ? ` (likely Windows MAX_PATH=260 exceeded — relative path is ${sanitizedPath.length} chars; pick a shallower parent folder)`
                    : '';
                throw new Error(`Failed to write backup file "${sanitizedPath}".${baseDetail}${lengthHint}`);
            }
        }

        async function writeJsonFileToFolder(rootHandle, relativePath, payload) {
            await writeTextFileToFolder(rootHandle, relativePath, JSON.stringify(payload, null, 2));
        }

        function normalizeWorkspaceNode(workspace, seenIds) {
            if (typeof workspace === 'string') {
                workspace = { id: workspace, name: workspace, icon: 'folder', subTabs: [] };
            }
            if (!workspace || typeof workspace !== 'object') return null;

            const id = String(workspace.id || '').trim() || 'main';
            if (seenIds.has(id)) return null;
            seenIds.add(id);

            const normalized = {
                ...workspace,
                id,
                name: workspace.name || id,
                icon: workspace.icon || 'folder',
                subTabs: []
            };

            (Array.isArray(workspace.subTabs) ? workspace.subTabs : []).forEach((child) => {
                const normalizedChild = normalizeWorkspaceNode(child, seenIds);
                if (normalizedChild) normalized.subTabs.push(normalizedChild);
            });

            return normalized;
        }

        function normalizeWorkspaceTree(workspaces) {
            const seenIds = new Set();
            const normalized = [];
            (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
                const normalizedWorkspace = normalizeWorkspaceNode(workspace, seenIds);
                if (normalizedWorkspace) normalized.push(normalizedWorkspace);
            });
            return normalized.length > 0
                ? normalized
                : [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }];
        }

        async function writeStoreMetaFiles(rootHandle, scopedConfig, workspaces, activeWorkspaceId) {
            const workspaceTree = normalizeWorkspaceTree(workspaces);
            const activeWorkspace = String(activeWorkspaceId || scopedConfig?.activeWorkspace || workspaceTree[0]?.id || 'main').trim() || 'main';
            const normalizedConfig = {
                ...(scopedConfig || {}),
                workspaces: workspaceTree,
                activeWorkspace
            };
            const sidebarGroups = Array.isArray(scopedConfig?.sidebarGroups) ? scopedConfig.sidebarGroups : [];
            await writeJsonFileToFolder(rootHandle, `${BACKUP_DIRS.meta}/store.json`, {
                format: 'eveos.modular-state.v1',
                version: 1,
                updatedAt: new Date().toISOString(),
                activeWorkspace,
                workspaces: workspaceTree,
                sidebarGroups,
                sidebarOrderMode: scopedConfig?.sidebarOrderMode || 'auto',
                sidebarManualOrder: scopedConfig?.sidebarManualOrder || null
            });
            await writeJsonFileToFolder(rootHandle, `${BACKUP_DIRS.meta}/config.json`, normalizedConfig);
            return normalizedConfig;
        }

        async function writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta) {
            return writeStoreMetaFiles(rootHandle, scopedConfig, [workspaceMeta], workspaceMeta.id);
        }

        return {
            writeTextFileToFolder,
            writeJsonFileToFolder,
            writeStoreMetaFiles,
            writeFallbackMetaFiles,
            BACKUP_DIRS
        };
    };
})();
