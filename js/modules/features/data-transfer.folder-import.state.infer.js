// --- Data Transfer Folder Import State Infer Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseStateInferReady) return;
    if (!ns.sharedReady) {
        console.warn('[DataTransfer] Shared helpers missing; import state infer helpers not initialized.');
        return;
    }

    const slugifyFolderSegment = ns.slugifyFolderSegment;

    function inferWorkspaceIdFromFolderName(folderName, fallback = 'main') {
        const raw = String(folderName || '').trim();
        if (!raw) return fallback;
        const preHash = raw.split('--')[0] || raw;
        const tokens = preHash.split('-').filter(Boolean);
        if (!tokens.length) return fallback;
        return String(tokens[0]).toLowerCase();
    }

    function inferCategoryFromFolderName(folderName, fallback = 'Unsorted') {
        const raw = String(folderName || '').trim();
        if (!raw) return fallback;
        const preHash = raw.split('--')[0] || raw;
        const normalized = preHash.replace(/[_]+/g, '-').replace(/-+/g, ' ').trim();
        if (!normalized) return fallback;
        return normalized.split(' ').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

    function makePlaceholderBookmark(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const slug = slugifyFolderSegment(cat, 'card');
        return {
            id: `placeholder-${ws}-${slug}`,
            title: `${cat} Placeholder`,
            url: '',
            category: cat,
            workspace: ws,
            notes: 'Auto-generated placeholder for empty card import.',
            tags: ['placeholder'],
            createdAt: new Date().toISOString()
        };
    }

    Object.assign(ns, {
        inferWorkspaceIdFromFolderName,
        inferCategoryFromFolderName,
        makePlaceholderBookmark
    });
    ns.importParseStateInferReady = true;
})();
