window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (!api.dropActionsReady) {
        console.warn('[EveBookmarkFolders] Drop actions missing; drop facade not initialized.');
        return;
    }

    if (!window.__eveBookmarkFolderEditorBinding) {
        window.__eveBookmarkFolderEditorBinding = true;
        document.addEventListener('input', (event) => {
            if (event.target?.id !== 'newCategory') return;
            refreshEditorFolderSelect();
        });
        document.addEventListener('change', (event) => {
            if (event.target?.id !== 'newCategory') return;
            refreshEditorFolderSelect();
        });
    }

    api.dropReady = true;
})(window.EveBookmarkFolders);
