/**
 * sonic_forge_credential_smoke.js
 *
 * Sonic Forge must still have a credential after Session Controls secures one.
 *
 * A same-tab Session Controls save may temporarily hand the key to Sonic Forge through
 * sessionStorage. A fresh tab must instead recognize the encrypted vault and use the local Gemini
 * backend proxy; the vault deliberately never hands the raw key back to browser code.
 *
 * The consequence was that saving the key CORRECTLY is what broke Sonic Forge. It then reported
 * "Set it in Search Monitor Session Controls" to someone who had just done exactly that, and
 * Generate failed. The temporary handoff plus secure backend proxy closes both paths without
 * re-introducing a persisted browser key that can shadow the vault.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SDK = path.join(ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.soundlab.sdk.js');
const HANDLER = path.join(ROOT, 'js', 'modules', 'gemini', 'agentic', 'sess_ctrl',
    'session_controls_settings', 'sessionControlsSettingsHandler.js');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    // The handoff line itself is asserted as source, because the browser half of Session Controls
    // needs a live Gemini workspace to exercise and would otherwise go untested entirely.
    const handlerSource = fs.readFileSync(HANDLER, 'utf8');
    const syncBlock = handlerSource.slice(handlerSource.indexOf('await workflow(apiKey)'));
    const handoff = syncBlock.indexOf('EveAudioflixSoundLabSdk?.setApiKey?.(apiKey)');
    const clear = syncBlock.indexOf("localStorage.removeItem('geminiApiKey')");
    assert(handoff !== -1, 'the vault sync hands the key to the Sonic Forge SDK lane');
    assert(clear !== -1, 'the vault sync still clears the persisted key, so it cannot shadow the vault');
    assert(handoff < clear, 'the handoff happens BEFORE the clear, or there is nothing left to hand over');

    const fixture = path.join(os.tmpdir(), `sf-cred-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        <script src="${fileUrl(SDK)}"></script>
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(() => {
            const S = window.EveAudioflixSoundLabSdk;
            const out = { ready: !!S };
            if (!S) return out;

            sessionStorage.clear();
            localStorage.clear();
            out.emptyWhenUnset = S.getApiKey();

            // Before any vault exists, the persisted key is the source.
            localStorage.setItem('geminiApiKey', 'legacy-key');
            out.readsLocalStorage = S.getApiKey();

            // THE regression: Session Controls secures the key, then clears the persisted copy.
            S.setApiKey('vaulted-key');
            localStorage.removeItem('geminiApiKey');
            out.afterVaultSync = S.getApiKey();

            // sessionStorage must win while both exist, so a stale persisted key cannot shadow it.
            localStorage.setItem('geminiApiKey', 'stale-key');
            out.sessionWins = S.getApiKey();

            // Clearing is still possible, or signing out could not take effect.
            S.setApiKey('');
            localStorage.removeItem('geminiApiKey');
            out.afterClear = S.getApiKey();

            window.EveOSLocalControl = { baseUrl: () => 'http://127.0.0.1:9082' };
            window.GeminiCredentialBridge = {
                getStatus: async () => ({ ok: true, configured: true })
            };

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));
        assert(result.ready, 'the Sonic Forge SDK module loaded');

        assert(result.emptyWhenUnset === '', 'no credential reads as empty, not as a stray value');
        assert(result.readsLocalStorage === 'legacy-key', 'the pre-vault persisted key is still honoured');
        assert(result.afterVaultSync === 'vaulted-key',
            `the credential survives the post-sync clear (got ${result.afterVaultSync})`);
        assert(result.sessionWins === 'vaulted-key',
            `sessionStorage wins over a stale persisted key (got ${result.sessionWins})`);
        assert(result.afterClear === '', 'clearing still works, so signing out takes effect');

        const vaultStatus = await page.evaluate(async () => {
            const S = window.EveAudioflixSoundLabSdk;
            await S.refreshCredentialStatus(true);
            return { status: S.getCredentialStatus(), exposedKey: S.getApiKey() };
        });
        assert(vaultStatus.status.state === 'vault' && vaultStatus.status.configured === true,
            'a fresh tab recognizes the configured secure Gemini vault');
        assert(vaultStatus.exposedKey === '', 'vault recognition never exposes the raw key');

        const clearedVault = await page.evaluate(async () => {
            window.GeminiCredentialBridge.getStatus = async () => ({ ok: true, configured: false });
            const S = window.EveAudioflixSoundLabSdk;
            await S.refreshCredentialStatus(true);
            return S.getCredentialStatus();
        });
        assert(clearedVault.state === 'missing' && clearedVault.configured === false,
            'a forced refresh clears stale vault-ready UI after credentials are removed');

        console.log('sonic forge credential OK — survives the vault sync, session beats stale local');
        console.log('SONIC_FORGE_CREDENTIAL_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
