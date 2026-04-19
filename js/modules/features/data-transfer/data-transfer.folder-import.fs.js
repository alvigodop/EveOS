// --- Data Transfer Folder Import Filesystem Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseFsReady) return;

    async function getDirectoryHandleIfExists(parentHandle, name) {
        try {
            return await parentHandle.getDirectoryHandle(name);
        } catch {
            return null;
        }
    }

    async function getDirectoryHandleByAliases(parentHandle, names) {
        const candidates = Array.isArray(names) ? names : [names];
        for (const name of candidates) {
            const handle = await getDirectoryHandleIfExists(parentHandle, name);
            if (handle) return handle;
        }
        return null;
    }

    async function getFileHandleIfExists(parentHandle, name) {
        try {
            return await parentHandle.getFileHandle(name);
        } catch {
            return null;
        }
    }

    async function getFileHandleByAliases(parentHandle, names) {
        const candidates = Array.isArray(names) ? names : [names];
        for (const name of candidates) {
            const handle = await getFileHandleIfExists(parentHandle, name);
            if (handle) return handle;
        }
        return null;
    }

    async function readJsonFromFileHandle(fileHandle) {
        const file = await fileHandle.getFile();
        const text = await file.text();
        try {
            return ns.robustParseJson(text);
        } catch (err) {
            console.warn(`[DataTransfer] Failed to parse JSON from ${fileHandle.name}:`, err.message);
            throw err;
        }
    }
    async function readJsonFileIfExists(parentHandle, name) {
        const fileHandle = await getFileHandleIfExists(parentHandle, name);
        if (!fileHandle) return null;
        try {
            return await readJsonFromFileHandle(fileHandle);
        } catch {
            return null;
        }
    }

    async function listDirectoryEntries(parentHandle) {
        const entries = [];
        for await (const [name, handle] of parentHandle.entries()) {
            entries.push({ name, handle });
        }
        return entries;
    }

    async function collectTabFoldersRecursive(tabsRoot, bucket = []) {
        if (!tabsRoot) return bucket;
        const entries = await listDirectoryEntries(tabsRoot);
        for (const { handle } of entries) {
            if (handle.kind !== 'directory') continue;
            // Group folders contain group.json — recurse into their children
            const hasGroupJson = !!(await getFileHandleIfExists(handle, 'group.json'));
            if (hasGroupJson) {
                await collectTabFoldersRecursive(handle, bucket);
                continue;
            }
            const hasTabJson = !!(await getFileHandleIfExists(handle, 'tab.json'));
            const hasCardsDir = !!(await getDirectoryHandleByAliases(handle, ['cards', 'c']));
            const nestedTabsHandle = await getDirectoryHandleByAliases(handle, ['tabs', 't']);
            if (hasTabJson || hasCardsDir || nestedTabsHandle) {
                bucket.push(handle);
            }
            if (nestedTabsHandle) {
                await collectTabFoldersRecursive(nestedTabsHandle, bucket);
            }
        }
        return bucket;
    }

    async function resolveCardFoldersFromRoot(rootHandle) {
        const cardsRoot = await getDirectoryHandleByAliases(rootHandle, ['cards', 'c']);
        if (cardsRoot) {
            const cardFolders = [];
            const entries = await listDirectoryEntries(cardsRoot);
            entries.forEach(({ handle }) => {
                if (handle.kind === 'directory') cardFolders.push(handle);
            });
            return cardFolders;
        }

        const hasCardFile = !!(await getFileHandleIfExists(rootHandle, 'card.json'));
        const hasEntriesDir = !!(await getDirectoryHandleByAliases(rootHandle, ['entries', 'e']));
        
        // If neither special file/folder exists, check if there are ANY bookmark-like JSON files
        let hasBookmarkFiles = false;
        if (!hasCardFile && !hasEntriesDir) {
            const directEntries = await listDirectoryEntries(rootHandle);
            for (const { name, handle } of directEntries) {
                if (handle.kind === 'file' && name.toLowerCase().endsWith('.json') && !name.startsWith('_') && name.toLowerCase() !== 'card.json' && name.toLowerCase() !== 'folder.json') {
                    hasBookmarkFiles = true;
                    break;
                }
            }
        }

        if (hasCardFile || hasEntriesDir || hasBookmarkFiles) {
            return [rootHandle];
        }

        const directCardFolders = [];
        const directEntries = await listDirectoryEntries(rootHandle);
        for (const { name, handle } of directEntries) {
            if (handle.kind !== 'directory') continue;
            if (['state', 'knowledge', '_meta'].includes(name.toLowerCase())) continue;
            
            const childHasCard = !!(await getFileHandleIfExists(handle, 'card.json'));
            const childHasEntries = !!(await getDirectoryHandleByAliases(handle, ['entries', 'e']));
            if (childHasCard || childHasEntries) {
                directCardFolders.push(handle);
            }
        }
        if (directCardFolders.length > 0) return directCardFolders;

        const tabsRoot = await getDirectoryHandleByAliases(rootHandle, ['tabs', 't']);
        if (!tabsRoot) return [];

        const fromTabs = [];
        const tabFolders = await collectTabFoldersRecursive(tabsRoot);
        for (const tabHandle of tabFolders) {
            const tabCardsRoot = await getDirectoryHandleByAliases(tabHandle, ['cards', 'c']);
            if (!tabCardsRoot) continue;
            const cardEntries = await listDirectoryEntries(tabCardsRoot);
            cardEntries.forEach(({ handle }) => {
                if (handle.kind === 'directory') fromTabs.push(handle);
            });
        }
        return fromTabs;
    }

    async function resolveTabFoldersFromRoot(rootHandle) {
        const tabsRoot = await getDirectoryHandleByAliases(rootHandle, ['tabs', 't']);
        if (tabsRoot) {
            return collectTabFoldersRecursive(tabsRoot, []);
        }

        const hasTabJson = !!(await getFileHandleIfExists(rootHandle, 'tab.json'));
        if (hasTabJson) {
            return [rootHandle];
        }

        const directEntries = await listDirectoryEntries(rootHandle);
        const directTabs = [];
        for (const { handle } of directEntries) {
            if (handle.kind !== 'directory') continue;
            const childHasTabJson = !!(await getFileHandleIfExists(handle, 'tab.json'));
            const childHasCardsDir = !!(await getDirectoryHandleByAliases(handle, ['cards', 'c']));
            if (childHasTabJson || childHasCardsDir) {
                directTabs.push(handle);
            }
        }
        return directTabs;
    }

    Object.assign(ns, {
        getDirectoryHandleIfExists,
        getDirectoryHandleByAliases,
        getFileHandleIfExists,
        getFileHandleByAliases,
        readJsonFromFileHandle,
        readJsonFileIfExists,
        listDirectoryEntries,
        collectTabFoldersRecursive,
        resolveCardFoldersFromRoot,
        resolveTabFoldersFromRoot
    });
    ns.importParseFsReady = true;
})();
