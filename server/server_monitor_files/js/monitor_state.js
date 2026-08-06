(function () {
    'use strict';

    const hostedLocally = /^https?:$/.test(window.location.protocol)
        && /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname);
    const currentPort = hostedLocally ? Number(window.location.port || 80) : 0;

    window.MonitorState = {
        CONTROL_URL: 'http://127.0.0.1:9082',
        STATUS_URL: 'http://127.0.0.1:9086/status',
        WS_URL: 'ws://127.0.0.1:9085',
        EVEOS_URL: hostedLocally
            ? window.location.origin + '/EveOS.html'
            : 'http://127.0.0.1:8765/EveOS.html',
        INTERFACE_URL: new URL('gemini_chat_interface.html', window.location.href).href,
        CHECK_INTERVAL: 10000,
        REQUEST_TIMEOUT: 1200,
        lastCheckTime: 0,
        isCheckingStatus: false,
        userRequestedStop: false,
        serverStates: {
            control: { running: false, port: 9082 },
            gemini: { running: false, port: 9085 },
            web: { running: hostedLocally || window.location.protocol === 'file:', port: currentPort }
        }
    };
})();