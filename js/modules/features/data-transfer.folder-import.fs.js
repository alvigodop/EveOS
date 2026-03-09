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
        return JSON.parse(text);
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
        if (hasCardFile || hasEntriesDir) {
            return [rootHandle];
        }

        const directCardFolders = [];
        const directEntries = await listDirectoryEntries(rootHandle);
        for (const { handle } of directEntries) {
            if (handle.kind !== 'directory') continue;
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
        const tabEntries = await listDirectoryEntries(tabsRoot);
        for (const { handle: tabHandle } of tabEntries) {
            if (tabHandle.kind !== 'directory') continue;
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
            const tabFolders = [];
            const entries = await listDirectoryEntries(tabsRoot);
            entries.forEach(({ handle }) => {
                if (handle.kind === 'directory') tabFolders.push(handle);
            });
            return tabFolders;
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
        resolveCardFoldersFromRoot,
        resolveTabFoldersFromRoot
    });
    ns.importParseFsReady = true;
})();
