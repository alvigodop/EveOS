/**
 * BrowserEmulator Proxy Manager Module
 * 
 * Manages proxy lists, prioritization, and statistics.
 */

(function () {
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before proxy manager module');
        return;
    }

    // List of JS render proxies
    window.BrowserEmulator._jsRenderProxies = [
        'http://localhost:3000/api/proxy?url=', // Prioritize local server
        'https://js-render.proxy-server.io/render',
        'https://render-service.proxied-apis.com/api/v1/render',
        'https://proxy-render.distributed-web.app/render',
        'https://cors-proxy.htmldriven.com/api/v1/render',
        'https://prerender.web-toolkit.workers.dev/',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://thingproxy.freeboard.io/fetch/',
        // Local rendering fallbacks
        'local://iframe-render',
        'local://document-proxy',
        'local://srcdoc-render'
    ];

    // Track successful and failed proxies
    window.BrowserEmulator._proxyStats = {
        successful: [],
        failed: {},
        lastSuccessful: null,
        currentProxyIndex: 0
    };

    Object.assign(window.BrowserEmulator, {
        /**
         * Prioritize successful proxies in the list
         * @private
         */
        _prioritizeSuccessfulProxies: function () {
            // Move successful proxies to the front of the list, but not the local ones
            const remoteProxies = this._jsRenderProxies.filter(p => !p.startsWith('local://'));
            const localProxies = this._jsRenderProxies.filter(p => p.startsWith('local://'));

            // Filter out successful proxies that are also in the remote list
            const successfulRemoteProxies = this._proxyStats.successful.filter(p =>
                remoteProxies.includes(p) && !p.startsWith('local://'));

            // Remaining remote proxies that weren't in the successful list
            const otherRemoteProxies = remoteProxies.filter(p =>
                !this._proxyStats.successful.includes(p));

            // Reorder the proxy list: successful remote, other remote, local
            this._jsRenderProxies = [...successfulRemoteProxies, ...otherRemoteProxies, ...localProxies];
        },

        /**
         * Get a list of all available proxies
         * @returns {Array<string>} - Array of proxy URLs
         */
        getAvailableProxies: function () {
            return [...this._jsRenderProxies];
        }
    });

    console.log('BrowserEmulator: Proxy Manager module loaded');
})();
