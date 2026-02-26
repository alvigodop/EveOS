/**
 * CORS Proxy Manager State
 * 
 * Manages state (proxies list, status) for CORS Proxy Manager
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CPMState = {
        /**
         * Collection of available CORS proxies with metadata
         */
        _proxies: [
            { url: 'https://corsproxy.io/?', working: true, priority: 1, failures: 0 },
            { url: 'https://corsproxy.org/?', working: true, priority: 2, failures: 0 },
            { url: 'https://api.allorigins.win/raw?url=', working: true, priority: 3, failures: 0 },
            { url: 'https://api.codetabs.com/v1/proxy?quest=', working: true, priority: 4, failures: 0 },
            { url: 'https://thingproxy.freeboard.io/fetch/', working: true, priority: 5, failures: 0 },
            { url: 'https://cors-anywhere-mjml.onrender.com/', working: true, priority: 6, failures: 0 },
            { url: 'https://api.allorigins.win/get?url=', working: true, priority: 7, failures: 0 }
        ],

        _localProxies: [
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ],

        /**
         * Status of the module and testing process
         */
        _status: {
            allProxiesTested: false,
            proxiesTestingInProgress: false,
            workingProxiesCount: 0,
            googleCapableProxiesCount: 0,
            lastTestTime: null
        },

        getProxies: function () {
            return this._proxies;
        },

        getLocalProxies: function () {
            return this._localProxies;
        },

        getStatus: function () {
            return this._status;
        },

        /**
         * Add a new proxy to the list
         */
        addProxy: function (proxyUrl) {
            if (!proxyUrl || typeof proxyUrl !== 'string') return;

            // Check if proxy already exists
            if (!this._proxies.some(p => p.url === proxyUrl)) {
                this._proxies.push({
                    url: proxyUrl,
                    working: true, // Assume working initially
                    priority: 10,
                    failures: 0
                });
                console.log('Added new CORS proxy:', proxyUrl);
                return true;
            }
            return false;
        },

        /**
         * Add a local proxy
         */
        addLocalProxy: function (proxy) {
            if (!proxy || typeof proxy !== 'string') return;

            // Check if proxy already exists
            if (!this._localProxies.includes(proxy)) {
                this._localProxies.push(proxy);
                console.log('Added new local proxy:', proxy);
            }
        },

        /**
         * Mark a proxy's working status
         */
        markProxyStatus: function (proxyUrl, isWorking) {
            const proxyObj = this._proxies.find(p => p.url === proxyUrl);
            if (proxyObj) {
                proxyObj.working = isWorking;
                if (!isWorking) {
                    proxyObj.failures = (proxyObj.failures || 0) + 1;
                } else {
                    proxyObj.failures = 0;
                }
            }
        },

        /**
         * Sort proxies by working status, priority, and response time
         */
        sortProxies: function () {
            this._proxies.sort((a, b) => {
                // Google-capable proxies first
                if (a.working && a.canAccessGoogle && !(b.working && b.canAccessGoogle)) return -1;
                if (!(a.working && a.canAccessGoogle) && b.working && b.canAccessGoogle) return 1;
                // Working proxies next
                if (a.working && !b.working) return -1;
                if (!a.working && b.working) return 1;
                // Then by priority
                if (a.priority < b.priority) return -1;
                if (a.priority > b.priority) return 1;
                // Then by response time
                return (a.responseTime || 9999) - (b.responseTime || 9999);
            });
        },

        updateStatusCounts: function () {
            this._status.workingProxiesCount = this._proxies.filter(p => p.working).length;
            this._status.googleCapableProxiesCount = this._proxies.filter(p => p.working && p.canAccessGoogle).length;
        },

        hasWorkingProxies: function () {
            return this._proxies.some(proxy => proxy.working);
        },

        hasGoogleCapableProxies: function () {
            return this._proxies.some(proxy => proxy.working && proxy.canAccessGoogle);
        }
    };

    window.CPMState = CPMState;
})();
