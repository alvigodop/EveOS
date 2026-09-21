#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const ROOT = path.resolve(__dirname, '..', '..');
const RESULT_DIR = path.join(ROOT, 'data', 'runtime', 'smoke-results');

function safeName(value) {
    return String(value || 'browser-smoke').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'browser-smoke';
}

function relative(target) {
    return path.relative(ROOT, target).replace(/\\/g, '/');
}

async function writeFailureArtifacts({ name, page, context, events, error, traceStarted }) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
    const prefix = path.join(RESULT_DIR, safeName(name));
    const screenshotPath = `${prefix}-failure.png`;
    const htmlPath = `${prefix}-failure.html`;
    const jsonPath = `${prefix}-failure.json`;
    const tracePath = `${prefix}-trace.zip`;

    try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (screenshotError) {
        events.artifactErrors.push(`screenshot: ${screenshotError?.message || screenshotError}`);
    }
    try {
        fs.writeFileSync(htmlPath, await page.content(), 'utf8');
    } catch (htmlError) {
        events.artifactErrors.push(`html: ${htmlError?.message || htmlError}`);
    }
    if (traceStarted) {
        try {
            await context.tracing.stop({ path: tracePath });
            traceStarted.value = false;
        } catch (traceError) {
            events.artifactErrors.push(`trace: ${traceError?.message || traceError}`);
        }
    }

    const payload = {
        timestamp: new Date().toISOString(),
        name,
        url: page.url(),
        error: {
            message: error?.message || String(error),
            stack: error?.stack || ''
        },
        events
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return {
        screenshot: fs.existsSync(screenshotPath) ? relative(screenshotPath) : '',
        html: fs.existsSync(htmlPath) ? relative(htmlPath) : '',
        json: relative(jsonPath),
        trace: fs.existsSync(tracePath) ? relative(tracePath) : ''
    };
}

async function runBrowserSmoke(options, body) {
    const name = safeName(options?.name || 'browser-smoke');
    const events = {
        console: [],
        pageErrors: [],
        requestFailures: [],
        artifactErrors: []
    };
    const launched = await launchChromiumOrConnect({
        headless: options?.headless !== false,
        launchOptions: options?.launchOptions
    });
    const browser = launched.browser;
    const context = await browser.newContext({
        viewport: options?.viewport || { width: 1440, height: 1000 }
    });
    const traceStarted = { value: false };
    const page = await context.newPage();

    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
            events.console.push({
                type: message.type(),
                text: message.text().slice(0, 4000)
            });
        }
    });
    page.on('pageerror', (pageError) => {
        events.pageErrors.push((pageError?.stack || String(pageError)).slice(0, 12000));
    });
    page.on('requestfailed', (request) => {
        events.requestFailures.push({
            method: request.method(),
            url: request.url().slice(0, 2000),
            failure: request.failure()?.errorText || ''
        });
    });

    try {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        traceStarted.value = true;
        const result = await body({ page, context, browserMode: launched.mode, events });
        if (traceStarted.value) {
            await context.tracing.stop();
            traceStarted.value = false;
        }
        return result;
    } catch (error) {
        const artifacts = await writeFailureArtifacts({
            name, page, context, events, error, traceStarted
        });
        const artifactLine = Object.entries(artifacts)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');
        error.message = `${error.message}\n[BROWSER_DIAGNOSTIC] ${artifactLine}`;
        if (error.stack && !error.stack.includes('[BROWSER_DIAGNOSTIC]')) {
            error.stack += `\n[BROWSER_DIAGNOSTIC] ${artifactLine}`;
        }
        throw error;
    } finally {
        if (traceStarted.value) {
            try { await context.tracing.stop(); } catch (_) {}
        }
        try { await context.close(); } catch (_) {}
        try { await browser.close(); } catch (_) {}
    }
}

module.exports = { runBrowserSmoke };
