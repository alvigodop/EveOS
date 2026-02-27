// Library Connections Facade
// Core implementation lives in library-connections.core.js.
window.EveLibrary = window.EveLibrary || {};

(function () {
    if (!window.EveLibrary.ConnectionsAPI) {
        console.warn('[EveLibrary.ConnectionsAPI] Core module not loaded (library-connections.core.js).');
    }
})();
