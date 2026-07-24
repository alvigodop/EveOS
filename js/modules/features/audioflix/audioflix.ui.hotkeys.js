// Soundboard hotkey feedback + in-app matcher for the Audioflix panel. Split out of
// audioflix.ui.js to keep that view under the project line cap. Two jobs: (1) poll the native
// bridge so a globally-fired hotkey flashes its card and, when the global hook isn't live, run an
// in-app keydown matcher so hotkeys still work while the tab is focused; (2) surface bypass state.
// The poll's own timers live here; everything shared with the view (overlay ref, active tab,
// settings-open flag, native-hotkeys-live flag) is reached through the `ctx` accessor facade.
window.EveAudioflixUiHotkeys = window.EveAudioflixUiHotkeys || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiHotkeys;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        let hotkeyPollTimer = null, lastFiredAt = 0, hotkeyPollTick = 0;

        // Surface Audioflix activity in the nexus trace log (no-op if the search monitor isn't up).
        function recordAudioflixNexus(summary) {
            try { window.SearchMonitorBoot?.recordNexusTrace?.({ id: 'af-' + Date.now().toString(36), kind: 'audioflix', summary: String(summary || 'Audioflix activity'), totalMs: 0, endedAt: Date.now() }); } catch (e) {}
        }

        function flashHotkey(idx) {
            const card = ctx.overlay?.querySelector('.audioflix-item-grid[data-af-active-group]')?.children?.[idx];
            if (card) { card.classList.add('is-hotkey-hit'); setTimeout(() => card.classList.remove('is-hotkey-hit'), 220); }
        }

        function startHotkeyFeedbackPoll() {
            if (hotkeyPollTimer) clearInterval(hotkeyPollTimer);
            hotkeyPollTick = 0;
            window.EveAudioflixNative?.hotkeyStatus?.().then(r => lastFiredAt = r?.lastFired?.at || 0).catch(() => {});
            hotkeyPollTimer = setInterval(() => {
                if (!ctx.overlay || ctx.overlay.hidden) return;
                const onSoundboardFrontend = ctx.activeTab === 'soundboard' && (ctx.state().soundboardViewMode || 'backend') === 'frontend';
                if (!onSoundboardFrontend && !ctx.settingsOpen) return;
                hotkeyPollTick++;
                // Bridge isn't live (server off): the fast poll is only for hotkey-hit feedback from
                // the GLOBAL hook, which doesn't exist right now — the in-app matcher flashes its own
                // hits. Just peek every ~10s for a server coming back, and re-register when it does.
                if (!ctx.nativeHotkeysLive) {
                    if (hotkeyPollTick % 40 !== 0) return;
                    window.EveAudioflixNative?.hotkeyStatus?.().then(r => { if (r?.ok !== false) ctx.pushHotkeysToBridge(); }).catch(() => {});
                    return;
                }
                window.EveAudioflixNative?.hotkeyStatus?.().then(r => {
                    // Bridge stopped answering (server died mid-session): re-arm the in-app matcher
                    // so hotkeys keep working while the tab is focused.
                    if (r?.ok === false) ctx.nativeHotkeysLive = false;
                    if (ctx.settingsOpen) {
                        const el = ctx.overlay.querySelector('.audioflix-bypass-state');
                        if (el) {
                            const bp = r?.bypassed === true;
                            el.textContent = bp ? 'BYPASSED — typing mode' : 'ACTIVE';
                            el.dataset.state = bp ? 'bypassed' : 'active';
                        }
                    }
                    if (!onSoundboardFrontend) return;
                    const lf = r?.lastFired;
                    if (lf?.at && lf.at !== lastFiredAt) {
                        lastFiredAt = lf.at;
                        const card = String(lf.vid || '').startsWith('hk:') && ctx.overlay.querySelector(`.audioflix-item-grid[data-af-active-group] [data-af-id="${lf.vid.slice(3)}"]`)?.closest('.audioflix-item-card');
                        if (card) { card.classList.add('is-hotkey-hit'); setTimeout(() => card.classList.remove('is-hotkey-hit'), 220); }
                        recordAudioflixNexus(`Hotkey ${lf.combo || ''} fired a soundboard clip`);
                    }
                }).catch(() => {});
            }, 250);
        }

        function stopHotkeyFeedbackPoll() { if (hotkeyPollTimer) { clearInterval(hotkeyPollTimer); hotkeyPollTimer = null; } }

        function matchEventToHotkey(e, hotkeyStr) {
            if (!hotkeyStr) return false;
            const parts = hotkeyStr.split('+').map(p => p.trim().toLowerCase());
            let ctrl = parts.includes('ctrl') || parts.includes('control'), alt = parts.includes('alt'), shift = parts.includes('shift'), win = parts.includes('win') || parts.includes('meta') || parts.includes('cmd') || parts.includes('super');
            if (e.ctrlKey !== ctrl || e.altKey !== alt || e.shiftKey !== shift || e.metaKey !== win) return false;
            const main = parts.find(p => !['ctrl', 'control', 'alt', 'shift', 'win', 'meta', 'cmd', 'super'].includes(p)), pk = e.key.toLowerCase();
            return main && (pk === main || (main === 'space' && pk === ' ') || ((main === 'enter' || main === 'return') && pk === 'enter'));
        }

        function handleHotkey(e) {
            if (!ctx.overlay || ctx.overlay.hidden || ctx.activeTab !== 'soundboard' || ctx.activeInfoItem || (ctx.state().soundboardViewMode || 'backend') !== 'frontend') return;
            // When the system-wide global hook is LIVE (bridge accepted our bindings), it already
            // plays these combos even while focused — running the in-app matcher too would
            // double-fire. But stand down only on confirmed liveness: gating on mere configuration
            // left zero hotkeys on file:// with the server off (bridge armed in state, no process).
            if (ctx.nativeHotkeysLive && ctx.state().nativeBridgeEnabled && ctx.state().nativeOutputId) return;
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
            const { items } = ctx.frontendActiveGroup(), matched = items.find(item => matchEventToHotkey(e, item.hotkey));
            if (!matched) return; e.preventDefault();
            const idx = items.indexOf(matched); if (idx >= 0) flashHotkey(idx);
            Promise.resolve(window.EveAudioflixAudio?.playItem?.(matched)).catch(() => {});
        }

        return { startHotkeyFeedbackPoll, stopHotkeyFeedbackPoll, handleHotkey };
    };

    ns.ready = true;
})();
