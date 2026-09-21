#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runBrowserSmoke } = require('./browser-smoke-diagnostics.shared');

const ROOT = path.resolve(__dirname, '..', '..');
const PORTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'eveos-ports.json'), 'utf8')).ports;
const WEB_PORT = Number(PORTS.EVEOS_WEB_PORT.port);
const LOCALHOST_URL = `http://127.0.0.1:${WEB_PORT}/EveOS.html`;
const FILE_URL = 'file:///' + path.join(ROOT, 'EveOS.html').replace(/\\/g, '/');
const INCLUDE_GEMINI = String(process.env.EVEOS_RUNTIME_INCLUDE_GEMINI || '') === '1';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function benignConsoleError(text) {
    return /Tracking Prevention blocked access to storage/i.test(text)
        || /Failed to load resource/i.test(text)
        || /Access to fetch at/i.test(text)
        || /QuotaExceededError/i.test(text)
        || /Critical module CacheManager is missing/i.test(text)
        || /ERR_FAILED 200 \(OK\)/i.test(text)
        || /ERR_CONNECTION_RESET/i.test(text)
        || /ERR_FAILED 403 \(Forbidden\)/i.test(text);
}

function requiredRuntimeRequest(url) {
    return /\/api\/(?:local-moe\/status|nexus-browser\/status|eve-state\/modular\/tlo\/(?:status|chat\/stream|chat\/cancel))/.test(url);
}

async function waitForStatus(page, selector, expected, entryMode, requiredFailures) {
    try {
        await page.waitForFunction(
            ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
            { selector, expected },
            { timeout: 30000 }
        );
    } catch (error) {
        const snapshot = await page.evaluate(() => ({
            localMoe: document.querySelector('[data-local-moe-state]')?.textContent?.trim() || '',
            localMoeMessage: document.querySelector('[data-local-moe-message]')?.textContent?.trim() || '',
            tlo: document.querySelector('[data-tlo-state]')?.textContent?.trim() || '',
            tloMessage: document.querySelector('[data-tlo-message]')?.textContent?.trim() || '',
            nexus: document.querySelector('[data-nexus-browser-state]')?.textContent?.trim() || '',
            nexusMessage: document.querySelector('[data-nexus-browser-message]')?.textContent?.trim() || ''
        }));
        throw new Error(
            `Search Monitor ${entryMode} status convergence timed out waiting for ${selector}=${expected}; `
            + `visible=${JSON.stringify(snapshot)} requiredFailures=${JSON.stringify(requiredFailures.slice(-8))}; `
            + (error?.message || String(error))
        );
    }
}

async function openRuntimeWorkspace(page, entryUrl, entryMode, requiredFailures, exerciseTloChat = false) {
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => (
        !!window.SearchMonitorBoot
        && !!window.EveOSSearchMonitorAiHome
        && !!window.EveOSAgentNexus
        && !!window.EveOSTloChat
        && !!window.EveOSNexusBrowser
        && !!document.querySelector('[data-ai-provider="agents"]')
    ), undefined, { timeout: 120000 });

    await page.evaluate(() => window.SearchMonitorBoot?.expand?.());
    await page.waitForFunction(() => !document.getElementById('loadingIndicator')?.classList.contains('compact'),
        undefined, { timeout: 10000 });
    await page.locator('[data-gemini-monitor-view-btn="full"]').click();
    await page.waitForFunction(() => {
        const root = document.getElementById('gemini-ui-root');
        const workspace = root?.querySelector('[data-ai-home-workspace]');
        return root?.dataset.geminiMonitorView === 'full' && !!workspace
            && window.getComputedStyle(workspace).display !== 'none';
    }, undefined, { timeout: 10000 });

    await waitForStatus(page, '[data-local-moe-state]', 'Online', entryMode, requiredFailures);
    const agents = page.locator('[data-ai-provider="agents"]');
    await agents.locator(':scope > summary').click();
    await page.waitForFunction(() => document.querySelector('[data-ai-provider="agents"]')?.open === true,
        undefined, { timeout: 10000 });
    await waitForStatus(page, '[data-tlo-state]', 'Ready', entryMode, requiredFailures);

    const tlo = await page.evaluate(() => ({
        state: document.querySelector('[data-tlo-state]')?.textContent?.trim() || '',
        model: document.querySelector('[data-tlo-model]')?.textContent?.trim() || '',
        provider: document.querySelector('[data-tlo-provider]')?.textContent?.trim() || '',
        message: document.querySelector('[data-tlo-message]')?.textContent?.trim() || '',
        sendDisabled: document.querySelector('[data-tlo-send]')?.disabled === true
    }));
    assert(tlo.state === 'Ready', `TLO is not ready from ${entryMode}: ${JSON.stringify(tlo)}`);
    assert(tlo.model && !/checking|selection/i.test(tlo.model), `TLO active model is missing from ${entryMode}: ${JSON.stringify(tlo)}`);
    assert(tlo.provider === 'Local MoE', `TLO provider drifted from ${entryMode}: ${JSON.stringify(tlo)}`);
    assert(tlo.sendDisabled === false, `TLO composer remained disabled from ${entryMode}`);

    let chat = null;
    if (exerciseTloChat) {
        const prompt = 'Reply with a short confirmation that file-origin TLO chat is working.';
        await page.locator('[data-tlo-input]').fill(prompt);
        await page.locator('[data-tlo-send]').click();
        await page.waitForFunction(() => {
            const turns = [...document.querySelectorAll('.eveos-tlo-turn.is-assistant p')];
            const latest = turns.at(-1)?.textContent?.trim() || '';
            const send = document.querySelector('[data-tlo-send]');
            return latest.length > 0 && send?.disabled === false;
        }, undefined, { timeout: 120000 });
        chat = await page.evaluate(() => {
            const turns = [...document.querySelectorAll('.eveos-tlo-turn.is-assistant p')];
            return {
                response: turns.at(-1)?.textContent?.trim() || '',
                sendDisabled: document.querySelector('[data-tlo-send]')?.disabled === true,
                state: document.querySelector('[data-tlo-state]')?.textContent?.trim() || ''
            };
        });
        assert(chat.response.length > 0 && chat.sendDisabled === false && chat.state === 'Ready',
            `File-origin TLO chat did not complete cleanly: ${JSON.stringify(chat)}`);
    }

    await page.locator('[data-agent-nexus-view="nexus-browser"]').first().click();
    await waitForStatus(page, '[data-nexus-browser-state]', 'Online', entryMode, requiredFailures);
    const nexus = await page.evaluate(() => ({
        state: document.querySelector('[data-nexus-browser-state]')?.textContent?.trim() || '',
        extension: document.querySelector('[data-nexus-browser-extension]')?.textContent?.trim() || '',
        targets: document.querySelector('[data-nexus-browser-targets]')?.textContent?.trim() || '',
        rooms: document.querySelector('[data-nexus-browser-rooms]')?.textContent?.trim() || ''
    }));
    assert(nexus.state === 'Online', `Nexus Browser is not online from ${entryMode}: ${JSON.stringify(nexus)}`);
    assert(/Connected|Ready/i.test(nexus.extension), `Nexus Browser extension readiness is missing from ${entryMode}: ${JSON.stringify(nexus)}`);

    const localMoe = await page.evaluate(() => ({
        state: document.querySelector('[data-local-moe-state]')?.textContent?.trim() || '',
        runtime: document.querySelector('[data-local-moe-runtime]')?.textContent?.trim() || '',
        model: document.querySelector('[data-local-moe-model]')?.textContent?.trim() || ''
    }));
    assert(localMoe.state === 'Online', `Local MoE is not online from ${entryMode}: ${JSON.stringify(localMoe)}`);
    assert(/Ready/i.test(localMoe.runtime), `Local MoE runtime is not ready from ${entryMode}: ${JSON.stringify(localMoe)}`);
    return { entryMode, url: page.url(), localMoe, tlo, nexus, chat };
}

async function main() {
    await runBrowserSmoke({
        name: 'search-monitor-live-browser',
        viewport: { width: 1600, height: 1200 }
    }, async ({ page, events, browserMode }) => {
        const consoleErrors = [];
        const requiredFailures = [];
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('requestfailed', (request) => {
            if (requiredRuntimeRequest(request.url())) {
                requiredFailures.push({
                    kind: 'network',
                    url: request.url(),
                    error: request.failure()?.errorText || 'request failed'
                });
            }
        });
        page.on('response', (response) => {
            if (requiredRuntimeRequest(response.url()) && response.status() >= 400) {
                requiredFailures.push({
                    kind: 'http',
                    url: response.url(),
                    status: response.status(),
                    statusText: response.statusText()
                });
            }
        });

        const localhost = await openRuntimeWorkspace(page, LOCALHOST_URL, 'localhost', requiredFailures);

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

        const beforeFileFailures = requiredFailures.length;
        const fileOrigin = await openRuntimeWorkspace(page, FILE_URL, 'file-origin', requiredFailures, true);
        const fileStatusFailures = requiredFailures.slice(beforeFileFailures);
        assert(fileStatusFailures.length === 0,
            `Required Search Monitor status requests failed from file origin: ${JSON.stringify(fileStatusFailures)}`);

        assert(events.pageErrors.length === 0, `Page errors detected:\n${events.pageErrors.join('\n')}`);
        const criticalConsoleErrors = consoleErrors.filter((entry) => !benignConsoleError(entry));
        assert(criticalConsoleErrors.length === 0, `Console errors detected:\n${criticalConsoleErrors.join('\n')}`);

        console.log('SEARCH_MONITOR_LIVE_BROWSER_SMOKE_OK ' + JSON.stringify({
            browserMode,
            localhost,
            fileOrigin,
            management,
            gemini,
            requiredStatusFailures: requiredFailures.length
        }));
    });
}

main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
});
