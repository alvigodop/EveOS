const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(
    path.join(root, 'js', 'modules', 'gemini', 'server_control', 'geminiServerNetwork.js'),
    'utf8'
);

const context = {
    AbortController,
    URL,
    fetch,
    console,
    window: {
        location: {
            protocol: 'http:',
            hostname: '127.0.0.1',
            origin: 'http://127.0.0.1:8765',
            href: 'http://127.0.0.1:8765/EveOS.html'
        },
        config: {},
        setTimeout,
        clearTimeout
    }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'geminiServerNetwork.js' });

async function main() {
    let earlyExitCount = 0;
    const startedAt = Date.now();
    const running = await context.window.GeminiServerNetwork.waitForServerReady({
        timeoutMs: 45000,
        refreshStatus: async () => ({ serverState: 'stopped' }),
        isRunning: () => false,
        isError: () => false,
        onEarlyExit: () => {
            earlyExitCount += 1;
        }
    });
    const elapsedMs = Date.now() - startedAt;

    if (running) throw new Error('Stopped Gemini process was reported as running.');
    if (earlyExitCount !== 1) {
        throw new Error(`Expected one early-exit notification, received ${earlyExitCount}.`);
    }
    if (elapsedMs > 5000) {
        throw new Error(`Failed startup recovery took too long: ${elapsedMs}ms.`);
    }

    console.log(`GEMINI_SERVER_READINESS_SMOKE_OK ${elapsedMs}ms`);
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
