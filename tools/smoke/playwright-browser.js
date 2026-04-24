const { chromium, firefox, webkit } = require('playwright');

function getCdpEndpoint() {
    return process.env.PW_CDP_ENDPOINT
        || process.env.PLAYWRIGHT_CDP_ENDPOINT
        || process.env.PW_BROWSER_WS_ENDPOINT
        || process.env.PLAYWRIGHT_BROWSER_WS_ENDPOINT
        || '';
}

function getBrowserChannel() {
    return process.env.PW_BROWSER_CHANNEL
        || process.env.PLAYWRIGHT_BROWSER_CHANNEL
        || '';
}

function getBrowserName() {
    const name = String(
        process.env.PW_BROWSER_NAME
        || process.env.PLAYWRIGHT_BROWSER_NAME
        || 'chromium'
    ).trim().toLowerCase();
    if (name === 'firefox' || name === 'webkit') return name;
    return 'chromium';
}

function getExecutablePath() {
    return process.env.PW_EXECUTABLE_PATH
        || process.env.PLAYWRIGHT_EXECUTABLE_PATH
        || '';
}

function getBrowserType(browserName) {
    if (browserName === 'firefox') return firefox;
    if (browserName === 'webkit') return webkit;
    return chromium;
}

async function launchChromiumOrConnect(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const headless = opts.headless !== false;
    const browserName = String(opts.browserName || getBrowserName()).trim().toLowerCase();
    const browserType = getBrowserType(browserName);
    const launchOptions = Object.assign({}, opts.launchOptions || {}, { headless: headless });
    const cdpEndpoint = String(opts.cdpEndpoint || getCdpEndpoint()).trim();
    const channel = String(opts.channel || getBrowserChannel()).trim();
    const executablePath = String(opts.executablePath || getExecutablePath()).trim();

    if (cdpEndpoint) {
        return {
            browser: await chromium.connectOverCDP(cdpEndpoint),
            mode: 'connectOverCDP',
            endpoint: cdpEndpoint
        };
    }

    if (channel) {
        launchOptions.channel = channel;
    }
    if (executablePath) {
        launchOptions.executablePath = executablePath;
    }

    try {
        return {
            browser: await browserType.launch(launchOptions),
            mode: 'launch',
            endpoint: ''
        };
    } catch (error) {
        if (cdpEndpoint) {
            return {
                browser: await chromium.connectOverCDP(cdpEndpoint),
                mode: 'connectOverCDP',
                endpoint: cdpEndpoint
            };
        }
        throw error;
    }
}

module.exports = {
    chromium,
    firefox,
    webkit,
    launchChromiumOrConnect,
    getCdpEndpoint,
    getBrowserChannel,
    getBrowserName,
    getExecutablePath
};
