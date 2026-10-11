// Opt-in qualification adapter: approve only the exact pending session of the supplied file tab.
// The trusted approval page owns CSRF and sends its normal POST; no capability is copied or returned.
import assert from 'node:assert/strict';

const BLOCKED_BY = 'audioflix-own-file-approval-isolation';
const APPROVE_PATH = '/api/audioflix/spotify-client/approve';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function trustedOrigin(base) {
    try {
        const url = new URL(base), host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '::1'].includes(host)
            && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : '';
    } catch { return ''; }
}

export function approvalWriteAllowed(method, rawUrl, body, permit = {}) {
    const origin = trustedOrigin(permit.base);
    if (!origin || method !== 'POST' || rawUrl !== origin + APPROVE_PATH) return false;
    if (permit.armed !== true || permit.codeMatched !== true || permit.approvalPosts !== 0) return false;
    if (typeof permit.pairId !== 'string' || !/^[A-Za-z0-9_-]{16,120}$/.test(permit.pairId)) return false;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return Object.keys(body).sort().join(',') === 'csrf,pairId' && body.pairId === permit.pairId
        && typeof body.csrf === 'string' && body.csrf.length > 0 && body.csrf.length <= 240;
}

async function waitFor(check, milliseconds, message) {
    const deadline = Date.now() + milliseconds;
    do {
        const result = await check();
        if (result) return result;
        await sleep(Math.min(250, Math.max(1, deadline - Date.now())));
    } while (Date.now() < deadline);
    throw Error(message);
}

async function prepareApprovalPointer(approvalPage) {
    const button = approvalPage.locator('#approve'), deadline = Date.now() + 15000;
    let last = 'not ready';
    while (Date.now() < deadline) {
        const timeout = () => Math.max(1, Math.min(2000, deadline - Date.now()));
        try {
            await button.waitFor({ state: 'visible', timeout: timeout() });
            assert.equal(await button.count(), 1, 'Expected one normal approval button');
            await button.scrollIntoViewIfNeeded({ timeout: timeout() });
            const bounds = await button.evaluate(element => {
                const rect = element.getBoundingClientRect();
                const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                    visible: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
                    hit: element === hit || element.contains(hit), enabled: element.disabled === false };
            }, undefined, { timeout: timeout() });
            assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.visible && bounds.hit && bounds.enabled,
                'Normal approval button is not pointer reachable');
            return bounds;
        } catch (error) { last = error.message; }
        await sleep(Math.min(250, Math.max(1, deadline - Date.now())));
    }
    throw Error(`Approval pointer preparation did not converge: ${last}`);
}

// helperIdle is a passive check that must return literal true after proving the helper remains idle.
// audit, when supplied, receives only the owned approval page and a surface label, never credentials.
export async function approveOwnFileSession({ browser, page, base, helperIdle, audit }) {
    const origin = trustedOrigin(base);
    assert.ok(origin, 'Own-file approval requires an exact trusted loopback base');
    assert.equal(typeof helperIdle, 'function', 'A passive helper-idle check is required');
    const controllerUrl = new URL(page.url());
    assert.ok(controllerUrl.protocol === 'file:' && !controllerUrl.hostname, 'Own-file approval requires the supplied local file tab');

    const pending = await waitFor(() => page.evaluate(() => {
        const relay = window.EveAudioflixSpotifyRemote.snapshot();
        if (relay.approvalRequired !== true) return false;
        const prompt = document.querySelector('[data-eve-spotify-approval="true"]');
        const rect = prompt?.getBoundingClientRect(), style = prompt && getComputedStyle(prompt);
        const visible = Boolean(rect?.width > 0 && rect?.height > 0 && rect.bottom > 0 && rect.right > 0
            && rect.top < innerHeight && rect.left < innerWidth && style.visibility !== 'hidden' && style.display !== 'none');
        if (!visible || !relay.code || !prompt.textContent.includes(relay.code)) return false;
        return { code: relay.code, url: relay.approvalUrl, connected: relay.connected };
    }), 20000, 'The supplied file tab did not expose its matching visible approval code');
    assert.equal(pending.connected, false, 'Pending file session must not already be connected');
    assert.ok(/^\d{6}$/.test(pending.code), 'Own-session approval code must have six digits');
    const observed = new URL(pending.url);
    assert.ok(observed.origin === origin && observed.pathname === '/api/audioflix/spotify-approval'
        && !observed.username && !observed.password && !observed.hash,
    'Own-session approval URL must use only the trusted approval page');
    assert.deepEqual([...observed.searchParams.keys()], ['pair'], 'Only the exact own-pair query is allowed');
    const pairId = observed.searchParams.get('pair');
    assert.ok(/^[A-Za-z0-9_-]{16,120}$/.test(pairId || ''), 'Own-session pair identity is malformed');
    assert.equal(await helperIdle(), true, 'Unapproved file tab must leave managed Spotify idle');

    let approvalContext;
    const stats = { base: origin, pairId, deniedWrites: 0, approvalPosts: 0, codeMatched: false, armed: false };
    try {
        approvalContext = await browser.newContext({ viewport: { width: 760, height: 700 }, serviceWorkers: 'block' });
        await approvalContext.route('**/*', async route => {
            const request = route.request(), method = request.method().toUpperCase();
            if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
            let body; try { body = request.postDataJSON(); } catch {}
            if (approvalWriteAllowed(method, request.url(), body, stats)) {
                // Consume the one-shot permit before any await so concurrent/repeated POSTs cannot pass.
                stats.approvalPosts++; stats.armed = false;
                return route.fallback();
            }
            stats.deniedWrites++;
            return route.fulfill({ status: 403, contentType: 'application/json',
                body: JSON.stringify({ ok: false, blockedBy: BLOCKED_BY }) });
        });
        const approvalPage = await approvalContext.newPage();
        audit?.(approvalPage, 'trusted-approval');
        await approvalPage.goto(observed.href, { waitUntil: 'load', timeout: 30000 });
        const displayed = await approvalPage.evaluate(() => {
            const code = document.querySelector('main code'), rect = code?.getBoundingClientRect();
            return { url: location.href, code: code?.textContent.trim(), visible: Boolean(rect?.width > 0 && rect?.height > 0),
                enabled: document.querySelector('#approve')?.disabled === false };
        });
        assert.ok(displayed.url === observed.href && displayed.code === pending.code,
            'Trusted approval page must display the exact own-session code');
        assert.equal(displayed.enabled, true); assert.equal(displayed.visible, true);
        const denial = await approvalPage.evaluate(async endpoint => {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: '{"isolationProbe":true}' });
            return { status: response.status, blockedBy: (await response.json()).blockedBy };
        }, origin + '/api/eve-state/modular/save');
        assert.deepEqual(denial, { status: 403, blockedBy: BLOCKED_BY }, 'Approval context must deny unrelated backend writes');
        await approvalPage.bringToFront();
        const bounds = await prepareApprovalPointer(approvalPage);
        const current = await page.evaluate(() => {
            const relay = window.EveAudioflixSpotifyRemote.snapshot();
            return { code: relay.code, url: relay.approvalUrl, required: relay.approvalRequired, connected: relay.connected };
        });
        assert.ok(current.code === pending.code && current.url === pending.url && current.required === true
            && current.connected === false, 'The supplied file tab must still require its exact own-session approval');
        assert.equal(await helperIdle(), true, 'Approval preparation must not start managed Spotify');
        stats.codeMatched = true; stats.armed = true;
        // Real pointer input is intentionally outside preparation retries and issued exactly once.
        await approvalPage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await approvalPage.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await waitFor(() => page.evaluate(() => {
            const relay = window.EveAudioflixSpotifyRemote.snapshot();
            return relay.connected === true && relay.approvalRequired === false;
        }), 20000, 'Own-session UI approval did not connect the supplied file tab');
        assert.equal(stats.approvalPosts, 1, 'Exactly one normal own-session approval POST required');
        return { codeMatched: true, exactOwnPairOnly: true, actualPointerApproval: true,
            approvalPosts: stats.approvalPosts, deniedWrites: stats.deniedWrites };
    } catch (error) {
        // Navigation errors may contain the ephemeral pair URL; keep portable evidence capability-free.
        throw Error(String(error?.message || error).replace(/([?&](?:pair|token|csrf|secret)=)[^&#\s]+/gi, '$1[redacted]'));
    } finally {
        stats.armed = false;
        await approvalContext?.close();
        await page.bringToFront();
    }
}
