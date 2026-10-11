import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { launchChromiumOrConnect, getCdpEndpoint } = require('../smoke/playwright-browser.js');
const ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/eveos-ports.json'), 'utf8')).ports;
const ports = Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, Number(value.port)]));
for (const port of Object.values(ports)) assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const controlBase = `http://127.0.0.1:${ports.GEMINI_CONTROL_PORT}`;
const READ = new Set(['GET', 'HEAD', 'OPTIONS']);
const args = process.argv.slice(2);
let evidence, directory, browser, context, page, permit, webPort;
const redact = (value, limit = 1200) => String(value || '').replace(/([?&](?:token|key|api_key|pair|secret)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, limit);
const safeUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return redact(value); } };
const save = () => fs.writeFileSync(path.join(directory, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const push = (field, value) => { if (evidence[field].length < 1200) evidence[field].push(value); };

function writeAllowed(method, rawUrl, body, originMode) {
    const url = new URL(rawUrl);
    if (method !== 'POST' || url.origin !== controlBase) return false;
    if (url.pathname === '/api/services/updates/check') return url.search === '';
    if (url.pathname !== '/api/services/restart' || !permit || permit.remaining !== 1) return false;
    if (!body || Object.keys(body).length !== 1 || body.service !== permit.service) return false;
    const query = [...url.searchParams];
    return query.length === 0 || (originMode === 'http' && body.service === 'web' && query.length === 1
        && query[0][0] === 'port' && Number(query[0][1]) === webPort);
}

function deterministicCheck() {
    const url = controlBase + '/api/services/restart';
    webPort = ports.EVEOS_WEB_PORT;
    permit = { service: 'web', remaining: 1 };
    assert.equal(writeAllowed('POST', url, { service: 'web' }, 'file'), true);
    assert.equal(writeAllowed('POST', url + `?port=${webPort}`, { service: 'web' }, 'file'), false);
    assert.equal(writeAllowed('POST', url, { service: 'spotifyEngine' }, 'http'), false);
    assert.equal(writeAllowed('POST', url, { service: 'web', extra: true }, 'http'), false);
    assert.equal(writeAllowed('POST', controlBase + '/api/services/updates/applied', {}, 'http'), false);
    assert.equal(writeAllowed('POST', controlBase + '/api/eve-state/modular/save', {}, 'file'), false);
    assert.equal(writeAllowed('DELETE', url, { service: 'web' }, 'file'), false);
    assert.equal(writeAllowed('POST', 'https://example.invalid/api/services/restart', { service: 'web' }, 'http'), false);
    permit.remaining = 0;
    assert.equal(writeAllowed('POST', url, { service: 'web' }, 'file'), false);
    permit = null;
    console.log('EVEOS_LANE4_DRIVER_CONTRACT_OK (write policy; no endpoints or browser launched)');
}

async function readJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    assert.ok(response.ok, `Read failed: ${safeUrl(url)} HTTP ${response.status}`);
    return response.json();
}

function branded(value, service) {
    assert.equal(value?.ok, true, `${service} health is not OK`);
    assert.equal(value.service, service, `Unbranded listener: expected ${service}`);
    assert.match(String(value.instanceId || ''), /^[a-zA-Z0-9-]{16,}$/);
    assert.match(String(value.sourceFingerprint || ''), /^[a-f0-9]{64}$/);
    if (service === 'eveos-control-plane') {
        assert.equal(value.controllerAvailable, true);
        assert.equal(value.running, true);
        assert.equal(value.port, ports.GEMINI_CONTROL_PORT);
    } else assert.equal(value.port, webPort);
    return value;
}

function preferenceHashes() {
    const runtime = path.join(ROOT, 'data/runtime');
    const names = [...new Set(['eveos-consoles.json', 'eveos-web-service.json',
        ...fs.readdirSync(runtime).filter(name => name.endsWith('-service.json'))])].sort();
    return Object.fromEntries(names.map(name => {
        const file = path.join(runtime, name);
        return [name, fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null];
    }));
}

function listenerInventory() {
    const selected = [...new Set([...Object.values(ports), webPort])].join(',');
    const script = `$taskPorts=@(${selected}); $taskRows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | `
        + `Where-Object { $taskPorts -contains $_.LocalPort } | ForEach-Object { `
        + `$taskProcess=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; $taskStarted=$null; `
        + `try { $taskStarted=$taskProcess.StartTime.ToUniversalTime().ToString('o') } catch {} `
        + `[pscustomobject]@{port=[int]$_.LocalPort;address=$_.LocalAddress;pid=[int]$_.OwningProcess; `
        + `name=$taskProcess.ProcessName;startedAt=$taskStarted} } | Sort-Object port,address,pid -Unique); `
        + `ConvertTo-Json -InputObject $taskRows -Compress`;
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 512000 }).trim();
    return JSON.parse(raw || '[]');
}

async function snapshot() {
    const [control, web, consoles, spotify] = await Promise.all([
        readJson(controlBase + '/api/control-plane/health'),
        readJson(`http://127.0.0.1:${webPort}/api/status`),
        readJson(controlBase + `/api/control-plane/consoles?port=${webPort}`),
        readJson(`http://127.0.0.1:${webPort}/api/audioflix/spotify-browser/status`)
    ]);
    branded(control, 'eveos-control-plane'); branded(web, 'eveos-local-server');
    assert.equal(consoles.ok, true, 'Passive console inventory unavailable');
    assert.equal(consoles.default, false, 'Headed service consoles must be the existing default');
    assert.equal(consoles.envForced, false, 'Hidden service override blocks live qualification');
    assert.equal(consoles.services.find(service => service.key === 'web')?.headless, false,
        'Web/Local Control replacement must retain headed console presentation');
    assert.equal(spotify.ok, true, 'Spotify passive status unavailable');
    assert.equal(spotify.helperReachable, false, 'Spotify helper must already be stopped; no takeover');
    assert.equal(spotify.browserRunning, false, 'Spotify browser must already be stopped; no takeover');
    assert.equal(Number(spotify.playingCount || 0), 0, 'Active Spotify playback blocks qualification');
    assert.equal((spotify.trackIds || []).length, 0, 'Active Spotify tracks block qualification');
    return { control, web, consoles, spotify: { helperReachable: false, browserRunning: false },
        preferences: preferenceHashes(), listeners: listenerInventory() };
}

function preserve(before, after, replaced) {
    assert.deepEqual(after.preferences, before.preferences, 'Desired-state or console preference file changed');
    const consoleState = value => ({ default: value.default, envForced: value.envForced,
        keepLocalControlAfterToolStop: value.keepLocalControlAfterToolStop,
        services: value.services.map(({ key, running, ports: servicePorts, headless, overridden }) =>
            ({ key, running, ports: servicePorts, headless, overridden })) });
    assert.deepEqual(consoleState(after.consoles), consoleState(before.consoles), 'Console/lifecycle intent changed');
    const untouched = value => value.listeners.filter(row => row.port !== replaced);
    assert.deepEqual(untouched(after), untouched(before), 'Unrelated listener process identity changed');
    const oldRows = before.listeners.filter(row => row.port === replaced);
    const newRows = after.listeners.filter(row => row.port === replaced);
    assert.ok(oldRows.length && newRows.length, 'Selected listener process proof missing');
    assert.ok(newRows.every(row => !oldRows.some(old => old.pid === row.pid)), 'Selected listener PID was not replaced');
}

async function until(check, milliseconds = 60000) {
    const deadline = Date.now() + milliseconds;
    let last;
    while (Date.now() < deadline) {
        try { const value = await check(); if (value) return value; } catch (error) { last = error.message; }
        await sleep(500);
    }
    throw Error(`Timed out in ${evidence.phase}: ${last || 'fresh health not observed'}`);
}

async function openEntry(mode) {
    context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
        const request = route.request(), method = request.method();
        if (READ.has(method)) return route.continue();
        let body; try { body = request.postDataJSON(); } catch {}
        const allowed = writeAllowed(method, request.url(), body, mode);
        push(allowed ? 'allowedWrites' : 'blockedWrites',
            { mode, phase: evidence.phase, method, url: safeUrl(request.url()), service: allowed ? body?.service : undefined });
        if (allowed) {
            if (new URL(request.url()).pathname === '/api/services/restart') permit.remaining = 0;
            return route.continue();
        }
        return route.fulfill({ status: 403, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: false, blockedBy: 'lane4-write-isolation' }) });
    });
    page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => push('pageErrors', { mode, phase: evidence.phase, message: redact(error.message) }));
    page.on('console', message => push('console', { mode, phase: evidence.phase, type: message.type(), text: redact(message.text()) }));
    page.on('requestfailed', request => push('requests', { mode, phase: evidence.phase,
        method: request.method(), url: safeUrl(request.url()), failed: redact(request.failure()?.errorText) }));
    page.on('response', async response => {
        push('requests', { mode, phase: evidence.phase, method: response.request().method(),
            url: safeUrl(response.url()), status: response.status() });
        const url = new URL(response.url());
        if (url.origin === controlBase && ['/api/services/restart', '/api/services/updates/check'].includes(url.pathname)) {
            const payload = await response.json().catch(() => ({ unreadable: true }));
            push('controlReplies', { mode, phase: evidence.phase, route: url.pathname, status: response.status(), payload });
            save();
        }
    });
    const url = mode === 'file' ? pathToFileURL(path.join(ROOT, 'EveOS.html')).href
        : `http://127.0.0.1:${webPort}/EveOS.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => window.SearchMonitorBoot && window.EveOSServiceReload && window.EveOSLocalControl);
    await page.evaluate(() => window.SearchMonitorBoot.expand());
    await page.locator('#gemini-ui-root [data-gemini-monitor-view-btn="full"]').click();
    await page.locator('#gemini-ui-root [data-search-monitor-check-updates]:visible').waitFor();
    assert.equal(await page.evaluate(() => window.EveOSLocalControl.baseUrl()), controlBase,
        'Production client resolved a different Local Control port');
    if (mode === 'file') {
        const discovery = await page.evaluate(async () => {
            const client = window.EveOSLocalControl;
            const value = await client.fetchJson(client.baseUrl() + '/api/eveos-server/status', null, 15000);
            return value?.payload || value;
        });
        assert.equal(discovery.running, true, 'File entrypoint did not discover a verified web service');
        assert.equal(discovery.port, webPort, 'File entrypoint discovered a different web listener');
        evidence.fileDiscovery = discovery;
    }
    await page.setViewportSize({ width: 340, height: 1100 });
    await page.evaluate(() => document.fonts.ready);
    return url;
}

async function pointerCheck(mode) {
    const response = page.waitForResponse(value => value.url() === controlBase + '/api/services/updates/check'
        && value.request().method() === 'POST', { timeout: 90000 });
    await page.locator('#gemini-ui-root [data-search-monitor-check-updates]:visible').click();
    const reply = await response;
    assert.equal(reply.status(), 200, 'Pointer Check updates failed');
    const plan = await reply.json();
    assert.equal(plan.ok, true);
    for (const key of ['web', 'localControl']) assert.match(String(plan.componentFingerprints?.[key] || ''), /^[a-f0-9]{64}$/);
    await page.waitForFunction(() => [...document.querySelectorAll('#gemini-ui-root [data-update-stage]')]
        .some(element => ['Ready', 'Review'].includes(element.textContent)));
    const geometry = await page.evaluate(() => {
        const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
        const rect = element => { const r = element.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const toolbar = [...document.querySelectorAll('#gemini-ui-root .gemini-monitor-shell-toolbar')].find(visible);
        const buttons = [...toolbar.querySelectorAll('button')].filter(visible).map(element => {
            const bounds = rect(element), hit = document.elementFromPoint(
                (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
            return { text: element.getAttribute('aria-label') || element.textContent.trim(),
                hit: element === hit || element.contains(hit), ...bounds };
        });
        const label = toolbar.querySelector('[data-search-monitor-check-updates] [data-update-button-label]');
        const style = getComputedStyle(label);
        const sheets = [], seen = new Set();
        const collectSheet = sheet => {
            if (!sheet || seen.has(sheet)) return;
            seen.add(sheet);
            const entry = { href: sheet.href || sheet.ownerNode?.href || '', disabled: sheet.disabled, ruleCount: null };
            sheets.push(entry);
            try {
                const rules = [...sheet.cssRules]; entry.ruleCount = rules.length;
                for (const rule of rules) if (rule.styleSheet) collectSheet(rule.styleSheet);
            } catch (error) { entry.readError = error.name; }
        };
        [...document.styleSheets, ...[...document.querySelectorAll('link[rel="stylesheet"]')]
            .map(link => link.sheet)].forEach(collectSheet);
        const toolbarStyle = getComputedStyle(toolbar);
        const actionsStyle = getComputedStyle(toolbar.querySelector('.gemini-monitor-toolbar-actions'));
        const checkStyle = getComputedStyle(label.closest('button'));
        return { viewport: innerWidth, buttons, checkButton: rect(label.closest('button')), label: { ...rect(label), text: label.textContent,
            lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 },
            css: sheets.filter(sheet => /gemini_link_surfaces.*\.css/.test(sheet.href)),
            computed: { toolbarDisplay: toolbarStyle.display, toolbarGap: toolbarStyle.gap,
                actionsDisplay: actionsStyle.display, actionsDirection: actionsStyle.flexDirection,
                checkDisplay: checkStyle.display, checkBoxSizing: checkStyle.boxSizing, labelWhiteSpace: style.whiteSpace },
            resourceTimingCss: performance.getEntriesByType('resource').map(entry => entry.name)
                .filter(name => /gemini_link_surfaces.*\.css/.test(name)) };
    });
    assert.equal(geometry.viewport, 340);
    assert.ok(geometry.css.some(sheet => /\/gemini_link_surfaces\.css(?:[?#]|$)/.test(sheet.href)
        && sheet.disabled !== true), 'Production Gemini CSS facade has no loaded stylesheet');
    assert.equal(geometry.computed.toolbarDisplay, 'flex', 'Production toolbar flex styling is missing');
    assert.equal(geometry.computed.actionsDisplay, 'flex', 'Production toolbar action styling is missing');
    assert.equal(geometry.computed.actionsDirection, 'column', 'Production 340px toolbar styling is missing');
    assert.equal(geometry.computed.checkBoxSizing, 'border-box', 'Production update button sizing is missing');
    assert.equal(geometry.label.text, 'Check updates');
    assert.ok(geometry.label.height <= geometry.label.lineHeight * 2 + 2, 'Update label exceeds two lines');
    assert.ok(geometry.label.width > 0 && geometry.label.height > 0
        && geometry.label.left >= geometry.checkButton.left - 1 && geometry.label.right <= geometry.checkButton.right + 1
        && geometry.label.bottom <= geometry.checkButton.bottom + 1, 'Update label overflows its toolbar button');
    for (const [index, button] of geometry.buttons.entries()) {
        assert.ok(button.left >= -1 && button.right <= 341 && button.top >= -1 && button.bottom <= 1101
            && button.width > 0 && button.height > 0 && button.hit,
            `Toolbar button leaves 340px viewport: ${button.text}`);
        for (const other of geometry.buttons.slice(index + 1)) assert.ok(
            Math.min(button.right, other.right) - Math.max(button.left, other.left) <= 1
            || Math.min(button.bottom, other.bottom) - Math.max(button.top, other.top) <= 1,
            `Toolbar overlap: ${button.text} / ${other.text}`);
    }
    await page.screenshot({ path: path.join(directory, `${mode}-340px.png`) });
    return { plan, geometry };
}

async function restart(service, mode) {
    permit = { service, remaining: 1 };
    const startedAt = new Date().toISOString(), started = performance.now();
    try {
        const result = await page.evaluate(async key => window.EveOSServiceReload.restart(key, { timeoutS: 100 }), service);
        assert.equal(permit.remaining, 0, 'Production shared client did not issue the permitted request');
        return { ...result, driverTiming: { mode, startedAt, acknowledgedAt: new Date().toISOString(),
            milliseconds: Math.round(performance.now() - started) } };
    } finally { permit = null; }
}

async function record(name, run) {
    evidence.phase = name; save();
    const startedAt = new Date().toISOString(), started = performance.now();
    const details = await run();
    evidence.cases.push({ name, startedAt, milliseconds: Math.round(performance.now() - started), details }); save();
}

async function main() {
    assert.ok(args.includes('--restart'), 'Explicit --restart required: two web restarts and one Local Control replacement');
    assert.equal(process.platform, 'win32', 'This live driver requires Windows listener/process proof');
    assert.equal(getCdpEndpoint(), '', 'Use a fresh browser; existing CDP/user browsers are prohibited');
    directory = path.join(ROOT, 'data/runtime/smoke-results', `lane4-reload-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    evidence = { schemaVersion: 1, ok: false, phase: 'preflight', startedAt: new Date().toISOString(),
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
        worktree: execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim(),
        scope: 'Focused HTTP/file web restart and one scoped Local Control replacement; no full Lane4 seal',
        cases: [], console: [], requests: [], controlReplies: [], pageErrors: [], allowedWrites: [], blockedWrites: [] };
    save();
    branded(await readJson(controlBase + '/api/control-plane/health'), 'eveos-control-plane');
    const discovered = await readJson(controlBase + '/api/eveos-server/status');
    assert.equal(discovered.running, true, 'An already-running web service is required');
    webPort = Number(discovered.port);
    assert.ok(Number.isInteger(webPort) && webPort > 0 && webPort < 65536);
    evidence.webPort = webPort;
    evidence.initial = await snapshot(); save();
    const launched = await launchChromiumOrConnect({ headless: args.includes('--headless'), browserName: 'chromium',
        channel: args.includes('--edge') ? 'msedge' : undefined });
    browser = launched.browser;
    assert.equal(launched.mode, 'launch', 'Fresh browser launch required');
    for (const mode of ['http', 'file']) {
        await record(`${mode}-web-restart`, async () => {
            const entry = await openEntry(mode);
            const { plan, geometry } = await pointerCheck(mode);
            const before = await snapshot();
            evidence.current = { mode, entry, geometry, plan, before }; save();
            const receipt = await restart('web', mode);
            evidence.current.receipt = receipt; save();
            assert.equal(receipt.serviceKey, 'web'); assert.equal(receipt.serviceRestarted, true);
            assert.equal(receipt.port, webPort, 'Restart receipt belongs to a different web port');
            assert.equal(receipt.previousInstanceId, before.web.instanceId);
            assert.equal(receipt.expectedSourceFingerprint, plan.componentFingerprints.web);
            assert.notEqual(receipt.instanceId, before.web.instanceId);
            assert.equal(receipt.sourceFingerprint, plan.componentFingerprints.web);
            assert.equal(receipt.spotify?.prepared?.helperWasRunning, false, 'Unexpected Spotify helper takeover');
            assert.equal(receipt.spotify?.restored?.ok, true, 'Stopped-helper dependency check failed');
            assert.equal(receipt.spotify?.restored?.helperRestored, false, 'Previously stopped helper was started');
            const after = await snapshot();
            evidence.current.after = after; save();
            assert.equal(after.web.instanceId, receipt.instanceId);
            assert.equal(after.web.sourceFingerprint, plan.componentFingerprints.web);
            assert.equal(after.control.instanceId, before.control.instanceId, 'Web restart replaced Local Control');
            assert.equal(after.control.sourceFingerprint, before.control.sourceFingerprint);
            preserve(before, after, webPort);
            if (mode === 'http') { await context.close(); context = null; page = null; }
            return { entry, geometry, before, receipt, after };
        });
    }
    await record('file-local-control-replacement', async () => {
        const plan = await page.evaluate(() => window.EveOSServiceReload.checkUpdates());
        const before = await snapshot();
        evidence.current = { mode: 'file', plan, before }; save();
        const receipt = await restart('localControl', 'file');
        evidence.current.receipt = receipt; save();
        assert.equal(receipt.accepted, true); assert.equal(receipt.controlPlaneStopping, true);
        assert.ok(receipt.operationId); assert.equal(receipt.previousInstanceId, before.control.instanceId);
        assert.equal(receipt.expectedSourceFingerprint, plan.componentFingerprints.localControl);
        const healthy = await until(async () => {
            const status = branded(await readJson(controlBase + '/api/control-plane/health'), 'eveos-control-plane');
            return status.instanceId !== before.control.instanceId && status.scopedStartup === true
                && status.sourceFingerprint === receipt.expectedSourceFingerprint && status;
        });
        evidence.current.healthy = healthy; save();
        const after = await snapshot();
        evidence.current.after = after; save();
        assert.equal(after.control.instanceId, healthy.instanceId);
        assert.equal(after.web.instanceId, before.web.instanceId, 'Local Control replacement restarted web');
        preserve(before, after, ports.GEMINI_CONTROL_PORT);
        return { before, receipt, healthy, after, verifiedAt: new Date().toISOString(),
            replacementMilliseconds: Date.now() - Date.parse(receipt.driverTiming.startedAt) };
    });
    assert.equal(evidence.pageErrors.length, 0, 'Application page errors occurred; inspect evidence');
    evidence.ok = true;
}

if (args.includes('--help')) {
    console.log('Usage: node tools/qualification/eveos_lane4_reload_acceptance.mjs --restart [--edge] [--headless]\n'
        + 'Requires running branded Local Control/web and stopped Spotify helper. Leaves services running.\n'
        + '--check validates write isolation without endpoints, browser launch or restart.');
} else if (args.includes('--check')) {
    deterministicCheck();
} else {
    try { await main(); }
    catch (error) {
        if (evidence) evidence.error = { message: redact(error.message), stack: redact(error.stack, 24000) };
        if (page) {
            await page.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
            evidence.failurePanel = await page.locator('#gemini-ui-root').innerText().then(redact).catch(() => 'unavailable');
        }
        console.error(`EVEOS_LANE4_RELOAD_ACCEPTANCE_FAIL ${redact(error.message)}`);
        process.exitCode = 1;
    } finally {
        permit = null;
        await context?.close().catch(() => {});
        await browser?.close().catch(() => {});
        if (evidence) { evidence.finishedAt = new Date().toISOString(); save();
            console.log(`${evidence.ok ? 'EVEOS_LANE4_RELOAD_ACCEPTANCE_OK' : 'EVIDENCE'} ${path.relative(ROOT, directory)}`); }
    }
}
