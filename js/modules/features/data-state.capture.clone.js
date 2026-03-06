/**
 * Unified State Store Capture Clone Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureCloneHelpers = function createCaptureCloneHelpers() {
        const VERSION = 1;

        function getLibraryStateModule() {
            return window.EveLibrary?.State;
        }

        function getLibraryStorageModule() {
            return window.EveLibrary?.Storage;
        }

        function getLinks() {
            return window.eveState?.links || window.links || [];
        }

        function getConfig() {
            if (window.eveState?.config) return window.eveState.config;
            if (typeof config !== 'undefined') return config;
            return window.config || {};
        }

        function cloneLinks() {
            return getLinks().map(entry => ({ ...entry }));
        }

        function cloneConfig() {
            const current = getConfig();
            return { ...current };
        }

        function cloneLibraries() {
            const stateModule = getLibraryStateModule();
            if (!stateModule) return {};
            try {
                return JSON.parse(JSON.stringify(stateModule.getAllLibraries()));
            } catch (error) {
                return {};
            }
        }

        function cloneConnections() {
            const apiConnections = window.EveLibrary?.ConnectionsAPI?.getAll?.();
            const connections = Array.isArray(apiConnections) ? apiConnections : (window.EveLibrary?.Connections || []);
            return connections.map(entry => ({ ...entry }));
        }

        function captureState() {
            return {
                metadata: {
                    version: VERSION,
                    date: new Date().toISOString(),
                    generator: 'EveOS Unified Backup'
                },
                bookmarks: {
                    links: cloneLinks(),
                    config: cloneConfig()
                },
                library: {
                    categories: cloneLibraries(),
                    connections: cloneConnections()
                }
            };
        }

        return {
            getLibraryStateModule,
            getLibraryStorageModule,
            getLinks,
            getConfig,
            cloneLinks,
            cloneConfig,
            cloneConnections,
            captureState
        };
    };
})();
