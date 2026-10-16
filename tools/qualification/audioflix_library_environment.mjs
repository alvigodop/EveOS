import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function qualificationLaunchOptions() {
    return { headless: true, args: ['--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] };
}

export function qualificationContextOptions() {
    return { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' };
}

// Collect once before qualification; never query host/browser identity inside a measured action.
export function captureQualificationEnvironment({ root, chromium }) {
    return {
        node: process.version,
        os: { platform: os.platform(), arch: os.arch(), release: os.release(), version: os.version() },
        playwright: require('playwright/package.json').version,
        gitTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(),
        browser: { name: chromium.name(), playwrightExecutablePath: chromium.executablePath(), executablePath: null, version: null,
            launchOptions: qualificationLaunchOptions(), contextOptions: qualificationContextOptions() }
    };
}

export async function captureQualificationBrowser(environment, browser) {
    environment.browser.version = browser.version();
    const cdp = await browser.newBrowserCDPSession();
    try {
        const { arguments: commandLine } = await cdp.send('Browser.getBrowserCommandLine');
        environment.browser.commandLine = [...commandLine];
        environment.browser.executablePath = commandLine[0] || null;
    } finally { await cdp.detach(); }
}

export function recordQualificationCohort(report, kind, label, entrypoint) {
    report.cohortOrder.push({ sequence: report.cohortOrder.length + 1, kind, label, entrypoint });
}
