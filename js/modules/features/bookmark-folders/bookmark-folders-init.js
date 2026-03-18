/**
 * Bookmark Folders Initializer for Eve OS
 */
window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    function init() {
        console.log('BookmarkFolders initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window.EveBookmarkFolders);
