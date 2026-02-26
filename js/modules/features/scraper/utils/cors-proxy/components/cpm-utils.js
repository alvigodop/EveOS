/**
 * CORS Proxy Manager Utils
 * 
 * Utility functions for CORS Proxy Manager
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CPMUtils = {
        _localDevMode: false,
        _isFileProtocol: false,

        /**
         * Check if we're in local development mode
         */
        checkLocalDevMode: function () {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;

            // Detect file:// protocol (running local HTML file without server)
            this._isFileProtocol = protocol === 'file:';

            this._localDevMode = hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.');

            if (this._isFileProtocol) {
                if (!window._cpmFileProtocolLogged) {
                    window._cpmFileProtocolLogged = true;
                    console.log('CORSProxyManager: Running from file:// protocol - CORS proxies will not work');
                    console.log('CORSProxyManager: Will use cache-only mode and direct API calls with origin=* parameter');
                }
            } else if (this._localDevMode) {
                console.log('Running in local development mode');
            }
        },

        isLocalDevMode: function () {
            return this._localDevMode;
        },

        isFileProtocol: function () {
            return this._isFileProtocol;
        },

        setLocalDevMode: function (enabled) {
            this._localDevMode = enabled;
        },

        /**
         * Initialize status indicators
         */
        initStatusIndicators: function (proxies, localProxies) {
            // Removed auto-creation of global indicators (moved to Scraper Panel UI)
            /*
            const createIndicators = () => {
                // ... (Removed)
            };
            if (document.body) { createIndicators(); } else { document.addEventListener('DOMContentLoaded', createIndicators); }
            */

            this.updateStatusIndicators(proxies);
        },

        /**
         * Update status indicators
         */
        updateStatusIndicators: function (proxies) {
            const localIndicator = document.querySelector('.local-server-indicator');
            const proxyIndicator = document.querySelector('.cors-proxy-status');

            if (localIndicator) {
                localIndicator.classList.toggle('active', this._localDevMode);
            }

            if (proxyIndicator) {
                // Ensure proxies is an array before checking length
                const hasProxies = Array.isArray(proxies) && proxies.length > 0;
                proxyIndicator.classList.toggle('active', hasProxies);
            }
        },

        /**
         * Helper to construct proxy URL
         */
        constructProxyUrl: function (targetUrl, proxyBase) {
            if (proxyBase.endsWith('?')) {
                return `${proxyBase}${encodeURIComponent(targetUrl)}`;
            } else if (proxyBase.includes('${url}')) {
                return proxyBase.replace('${url}', encodeURIComponent(targetUrl));
            } else if (proxyBase.includes('url=')) {
                const urlParam = 'url=';
                const urlParamIndex = proxyBase.indexOf(urlParam) + urlParam.length;
                return proxyBase.slice(0, urlParamIndex) + encodeURIComponent(targetUrl) + proxyBase.slice(urlParamIndex);
            } else {
                return `${proxyBase}${proxyBase.endsWith('/') ? '' : '/'}${targetUrl}`;
            }
        },

        /**
         * Check if a URL needs proxying
         */
        needsProxying: function (url) {
            if (!url) return false;

            try {
                const urlObj = new URL(url);
                const currentOrigin = window.location.origin;

                // Check if URL is from a different origin
                return urlObj.origin !== currentOrigin;
            } catch (e) {
                console.warn('Invalid URL:', url);
                return false;
            }
        }
    };

    window.CPMUtils = CPMUtils;
})();
