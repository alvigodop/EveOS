// Bulk Library Auto-Add Facade
// Core implementation lives in library-bulk-auto.core.js.
(function () {
    if (typeof window.openBulkLibraryAutoModal !== 'function' || typeof window.runBulkLibraryAutoUpdate !== 'function') {
        console.warn('[LibraryBulkAuto] Core module not loaded (library-bulk-auto.core.js).');
    }
})();
