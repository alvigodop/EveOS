/**
 * API Test Info Component
 * Collects system and network information.
 */
const ApiTestInfo = {};

/**
 * Initialize the module
 */
ApiTestInfo.init = function () {
    console.log('ApiTestInfo initialized');
};

/**
 * Get browser information
 * @returns {Object} Browser information
 */
ApiTestInfo.getBrowserInfo = function () {
    const ua = navigator.userAgent;
    const browserInfo = {
        userAgent: ua,
        isMobile: /Mobi|Android/i.test(ua),
        isChrome: /Chrome/.test(ua) && !/Edge/.test(ua),
        isFirefox: /Firefox/.test(ua),
        isSafari: /Safari/.test(ua) && !/Chrome/.test(ua),
        isEdge: /Edg/.test(ua),
        isIE: /Trident/.test(ua)
    };

    // Determine likely browser
    if (browserInfo.isChrome) browserInfo.browser = 'Chrome';
    else if (browserInfo.isFirefox) browserInfo.browser = 'Firefox';
    else if (browserInfo.isSafari) browserInfo.browser = 'Safari';
    else if (browserInfo.isEdge) browserInfo.browser = 'Edge';
    else if (browserInfo.isIE) browserInfo.browser = 'Internet Explorer';
    else browserInfo.browser = 'Unknown';

    return browserInfo;
};

/**
 * Get network information
 * @returns {Promise<Object>} Network information
 */
ApiTestInfo.getNetworkInfo = async function () {
    const networkInfo = {
        online: navigator.onLine,
        protocol: window.location.protocol,
        isLocalFile: window.location.protocol === 'file:',
        hostname: window.location.hostname || 'local file',
        connection: null
    };

    // Get connection info if available
    if (navigator.connection) {
        networkInfo.connection = {
            type: navigator.connection.type,
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink,
            rtt: navigator.connection.rtt,
            saveData: navigator.connection.saveData
        };
    }

    return networkInfo;
};

window.ApiTestInfo = ApiTestInfo;
