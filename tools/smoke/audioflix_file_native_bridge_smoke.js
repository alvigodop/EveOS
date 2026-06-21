const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 18765;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
    for (let i = 0; i < 60; i += 1) {
        try {
            const response = await fetch(`${BASE_URL}/api/audioflix/devices`);
            if (response.ok) return await response.json();
        } catch { }
        await wait(250);
    }
    throw new Error('Timed out waiting for EveOS Audioflix API server.');
}

async function main() {
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    const logs = [];
    server.stdout.on('data', (chunk) => logs.push(String(chunk)));
    server.stderr.on('data', (chunk) => logs.push(String(chunk)));

    let browser = null;
    try {
        const apiPayload = await waitForServer();
        if (!apiPayload.bridge) throw new Error('Audioflix API did not report bridge=true.');

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));
        await page.addInitScript(() => {
            window.__eveSmokeNoAutoGemini = true;
            try { localStorage.clear(); } catch { }
        });
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => !!window.EveAudioflixNative && !!window.EveAudioflixState, undefined, {
            timeout: 60000
        });

        const result = await page.evaluate(async (baseUrl) => {
            window.EveAudioflixState.update({ nativeBridgeBase: baseUrl }, 'file-native-smoke-base');
            const payload = await window.EveAudioflixNative.listSystemOutputs(true);
            const playable = (payload.devices || []).find((device) => device.playable === true);
            if (playable) {
                window.EveAudioflixNative.selectNativeOutput(playable.id, playable.label);
                window.EveAudioflixNative.setNativeBridgeEnabled(true);
            }
            const snapshot = window.EveAudioflixState.getSnapshot();
            return {
                href: location.href,
                ok: payload.ok,
                bridgeBase: snapshot.nativeBridgeBase,
                message: payload.message,
                deviceCount: (payload.devices || []).length,
                selected: snapshot.nativeOutputLabel,
                routeMode: snapshot.routeMode,
                nativeBridgeEnabled: snapshot.nativeBridgeEnabled,
                suppress: window.EveAudioflixNative.shouldSuppressBrowserPlayback()
            };
        }, BASE_URL);

        const failures = [];
        if (!result.href.startsWith('file:///')) failures.push(`not a file:// page: ${result.href}`);
        if (!result.ok) failures.push(`native payload not ok: ${result.message}`);
        if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(result.bridgeBase || '')) {
            failures.push(`bridge base is not a loopback EveOS bridge: ${result.bridgeBase}`);
        }
        if (result.deviceCount <= 0) failures.push('no native outputs visible from file:// EveOS');
        if (result.routeMode !== 'native-bridge') failures.push(`native route mode not selected: ${result.routeMode}`);
        if (!result.nativeBridgeEnabled) failures.push('native bridge did not enable from file:// EveOS');
        if (!result.suppress) failures.push('browser playback suppression is not active for native route');
        if (pageErrors.length) failures.push(`page errors: ${pageErrors.slice(0, 3).join('\n')}`);

        if (failures.length) {
            throw new Error(`AUDIOFLIX_FILE_NATIVE_BRIDGE_SMOKE_FAILED\n${failures.join('\n')}\n${logs.join('\n')}`);
        }
        console.log('AUDIOFLIX_FILE_NATIVE_BRIDGE_SMOKE_OK');
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
