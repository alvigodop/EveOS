/**
 * Library Connections Module
 * Maintains optional bookmark -> library entry links.
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

    if (!Core || !Core.loadConnections || !Core.promoteLink) {
        console.warn('[EveLibrary.ConnectionsAPI] Connection core components are missing.');
        return;
    }

    window.EveLibrary.ConnectionsAPI = {
        loadConnections: Core.loadConnections,
        setAll: Core.setAll,
        saveConnections: Core.saveConnections,
        getAll: Core.getAll,
        findConnectionByLinkId: Core.findConnectionByLinkId,
        promoteLink: Core.promoteLink,
        promoteLinkWithData: Core.promoteLinkWithData,
        unlinkLink: Core.unlinkLink,
        removeByLinkId: Core.removeByLinkId,
        removeByLibraryEntry: Core.removeByLibraryEntry,
        syncFromLibraryEntry: Core.syncFromLibraryEntry,
        syncFromLink: Core.syncFromLink,
        syncFromLinks: Core.syncFromLinks,
        getLinkedEntry: Core.getLinkedEntry,
        updateLinkedEntry: Core.updateLinkedEntry,
        moveLinkedEntryToScope: Core.moveLinkedEntryToScope,
        moveLinkedEntryToCategory: Core.moveLinkedEntryToCategory
    };
})();
