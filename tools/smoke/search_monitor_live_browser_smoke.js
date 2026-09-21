#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runBrowserSmoke } = require('./browser-smoke-diagnostics.shared');

const ROOT = path.resolve(__dirname, '..', '..');
const PORTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'eveos-ports.json'), 'utf8')).ports;
const WEB_PORT = Number(PORTS.EVEOS_WEB_PORT.port);
const FILE_URL = `http://127.0.0.1:${WEB_PORT}/EveOS.html`;
const INCLUDE_GEMINI = String(process.env.EVEOS_RUNTIME_INCLUDE_GEMINI || '') === '1';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function benignConsoleError(text) {
    return /Failed to load resource/i.test(text)
        || /Tracking Prevention blocked/i.test(text)
        || /ERR_CONNECTION_RESET/i.test(text)
        || /ERR_FAILED 403/i.test(text);
}

async function main() {
    await runBrowserSmoke({
        name: 'search-monitor-live-browser',
        viewport: { width: 1600, height: 1200 }
    }, async ({ page, events, browserMode }) => {
        const consoleErrors = [];
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });

        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await page.waitForFunction(() => (
            !!window.SearchMonitorBoot
            && !!window.EveOSSearchMonitorAiHome
            && !!window.EveOSAgentNexus
            && !!window.EveOSTloChat
            && !!window.EveOSNexusBrowser
            && !!document.querySelector('[data-ai-provider="agents"]')
        ), undefined, { timeout: 120000 });

        await page.evaluate(() => window.SearchMonitorBoot?.expand?.());
        await page.waitForFunction(() => (
            !document.getElementById('loadingIndicator')?.classList.contains('compact')
        ), undefined, { timeout: 10000 });

        await page.locator('[data-gemini-monitor-view-btn="full"]').click();
        await page.waitForFunction(() => {
            const root = document.getElementById('gemini-ui-root');
            const workspace = root?.querySelector('[data-ai-home-workspace]');
            return root?.dataset.geminiMonitorView === 'full'
                && !!workspace
                && window.getComputedStyle(workspace).display !== 'none';
        }, undefined, { timeout: 10000 });

        await page.waitForFunction(() => (
            document.querySelector('[data-local-moe-state]')?.textContent?.trim() === 'Online'
        ), undefined, { timeout: 30000 });

        const agents = page.locator('[data-ai-provider="agents"]');
        await agents.locator(':scope > summary').click();
        await page.waitForFunction(() => (
            document.querySelector('[data-ai-provider="agents"]')?.open === true
        ), undefined, { timeout: 10000 });

        await page.waitForFunction(() => (
            document.querySelector('[data-tlo-state]')?.textContent?.trim() === 'Ready'
        ), undefined, { timeout: 30000 });

        const tlo = await page.evaluate(() => ({
            state: document.querySelector('[data-tlo-state]')?.textContent?.trim() || '',
            model: document.querySelector('[data-tlo-model]')?.textContent?.trim() || '',
            provider: document.querySelector('[data-tlo-provider]')?.textContent?.trim() || '',
            sendDisabled: document.querySelector('[data-tlo-send]')?.disabled === true
        }));
        assert(tlo.state === 'Ready', `TLO is not ready in live Search Monitor: ${JSON.stringify(tlo)}`);
        assert(tlo.model && !/checking|selection/i.test(tlo.model), `TLO active model is missing: ${JSON.stringify(tlo)}`);
        assert(tlo.provider === 'Local MoE', `TLO provider drifted: ${JSON.stringify(tlo)}`);
        assert(tlo.sendDisabled === false, 'TLO composer remained disabled while runtime is ready');

        await page.locator('[data-agent-nexus-view="nexus-browser"]').first().click();
        await page.waitForFunction(() => (
            document.querySelector('[data-nexus-browser-state]')?.textContent?.trim() === 'Online'
        ), undefined, { timeout: 30000 });

        const nexus = await page.evaluate(() => ({
            state: document.querySelector('[data-nexus-browser-state]')?.textContent?.trim() || '',
            extension: document.querySelector('[data-nexus-browser-extension]')?.textContent?.trim() || '',
            targets: document.querySelector('[data-nexus-browser-targets]')?.textContent?.trim() || '',
            rooms: document.querySelector('[data-nexus-browser-rooms]')?.textContent?.trim() || ''
        }));
        assert(nexus.state === 'Online', `Nexus Browser is not online in Search Monitor: ${JSON.stringify(nexus)}`);
        assert(/Connected|Ready/i.test(nexus.extension), `Nexus Browser extension readiness is missing: ${JSON.stringify(nexus)}`);

        await page.locator('[data-agent-nexus-view="management"]').first().click();
        await page.waitForFunction(() => {
            const form = document.querySelector('[data-agent-management-form]');
            const status = document.querySelector('[data-agent-management-status]')?.textContent || '';
            return form?.hidden === false && /loaded|safe TLO template/i.test(status);
        }, undefined, { timeout: 15000 });

        const management = await page.evaluate(() => ({
            id: document.querySelector('[data-agent-management-form] [name="id"]')?.value || '',
            displayName: document.querySelector('[data-agent-management-form] [name="displayName"]')?.value || '',
            status: document.querySelector('[data-agent-management-status]')?.textContent?.trim() || ''
        }));
        assert(management.id === 'tlo', `Agent Management did not expose TLO: ${JSON.stringify(management)}`);
        assert(!!management.displayName, `TLO display name is missing: ${JSON.stringify(management)}`);

        let gemini = null;
        if (INCLUDE_GEMINI) {
            gemini = await page.evaluate(() => ({
                control: document.querySelector('[data-eveos-control-status]')?.textContent?.trim() || '',
                action: document.querySelector('[data-eveos-control-action-label]')?.textContent?.trim() || ''
            }));
            assert(gemini.control, 'Gemini/EveOS control-plane status did not render.');
        }

        assert(events.pageErrors.length === 0, `Page errors detected:\n${events.pageErrors.join('\n')}`);
        const criticalConsoleErrors = consoleErrors.filter((entry) => !benignConsoleError(entry));
        assert(criticalConsoleErrors.length === 0, `Console errors detected:\n${criticalConsoleErrors.join('\n')}`);

        console.log('SEARCH_MONITOR_LIVE_BROWSER_SMOKE_OK ' + JSON.stringify({
            browserMode,
            tlo,
            nexus,
            management,
            gemini
        }));
    });
}

main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
});
