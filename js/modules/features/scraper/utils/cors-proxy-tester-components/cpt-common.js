/**
 * CORS Proxy Tester Common Utilities
 * Shared helper functions for CORS Proxy Tester components.
 */
const CPTCommon = {
    /**
     * Helper to construct proxy URL
     * @param {string} targetUrl - The target URL to access
     * @param {string} proxyBase - The proxy base URL
     * @returns {string} Constructed proxy URL
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
    }
};

window.CPTCommon = CPTCommon;
