// Panel markup and transient projection. Library/queue state stays with its existing owners.
window.EveAudioflixUiPanel = window.EveAudioflixUiPanel || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixUiPanel;
    if (ns.ready) return;
    ns.syncButtons = function (container, html) {
        const next = document.createElement('template'); next.innerHTML = html;
        const wanted = [...next.content.children], retained = new Set();
        for (const [index, child] of wanted.entries()) {
            const key = child.dataset.afAction;
            const current = [...container.children].find(node => node.dataset.afAction === key);
            const node = current || child;
            if (current) {
                for (const attribute of [...current.attributes]) if (!child.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
                for (const attribute of [...child.attributes]) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
                if (current.innerHTML !== child.innerHTML) current.innerHTML = child.innerHTML;
            }
            retained.add(node);
            if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
        }
        for (const child of [...container.children]) if (!retained.has(child)) child.remove();
    };
    ns.create = function (ctx) {
        const { state, esc, closeSvg, hotkeyComboIssue, renderItems, renderAddSection } = ctx;
        let addMarkup = '', drawerState = {};
        const renderModalHost = () => ctx.modal();
        const renderLibrary = (items, type) => { addMarkup = renderAddSection(type); return `<div class="audioflix-add-host" style="display:contents">${addMarkup}</div><div class="audioflix-library-host" style="display:contents">${renderItems(items, type)}</div>`; };
        const focusIdentity = element => element ? ['afAction', 'afId', 'afType', 'afScope', 'afGroup', 'afDimension']
            .reduce((out, key) => { if (element.dataset[key] !== undefined) out[key] = element.dataset[key]; return out; }, {}) : null;
        const restoreFocus = (root, identity) => {
            if (!identity || !Object.keys(identity).length) return;
            const target = [...root.querySelectorAll('[data-af-action]')].find(node => Object.entries(identity).every(([key, value]) => node.dataset[key] === value));
            target?.focus?.({ preventScroll: true });
        };
        function render() {
            const { activeTab, fullscreenOn, settingsOpen, portedSounds } = ctx.view(), tools = ctx.tools();
            const snapshot = state(), musicCount = snapshot.music?.length || 0, soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length, routedCount = snapshot.counters?.routedGeminiEvents || 0;
            drawerState = { settingsOpen, routingOpen: ctx.view().routingOpen, combo: snapshot.hotkeyBypassCombo || '' };
            const soundboardItems = [...(snapshot.soundboard || []), ...portedSounds];
            const tabBody = activeTab === 'music'
                ? renderLibrary(snapshot.music || [], 'music')
                : activeTab === 'piano' ? (tools.piano?.render?.() || '<div class="audioflix-empty">Piano-Auto-Player is unavailable.</div>') : activeTab === 'soundlab'
                    ? (tools.soundLab?.render?.() || '<div class="audioflix-empty">Sonic Forge is unavailable.</div>')
                    : activeTab === 'router'
                        ? (ctx.tools().routing?.renderRouter?.(snapshot) || '')
                        : renderLibrary(soundboardItems, 'sound');
            return `<div class="audioflix-panel" data-af-tab="${esc(activeTab)}" role="dialog" aria-modal="true" aria-labelledby="audioflix-title"><header class="audioflix-header"><div><span class="audioflix-kicker">EveOS Audio Backend</span><h2 id="audioflix-title">Audioflix</h2><p>Soundboard, music library, piano automation, generative audio, and routed playback in one workspace.</p></div><div class="audioflix-header-actions"><button type="button" class="audioflix-clear-events" data-af-action="clear-gemini-events">Clear events</button><span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span><button type="button" class="audioflix-settings-toggle${settingsOpen ? ' is-active' : ''}" data-af-action="toggle-settings" title="Audioflix settings (hotkey bypass)" aria-label="Audioflix settings">⚙</button><button type="button" class="audioflix-fullscreen-toggle${fullscreenOn ? ' is-active' : ''}" data-af-action="toggle-fullscreen">⛶</button><button type="button" data-af-action="close">${closeSvg}</button></div></header><nav class="audioflix-tabs">${tabButton('soundboard', 'Soundboard')}${tabButton('music', 'Music Library')}${tabButton('piano', 'Piano-Auto-Player')}${tabButton('soundlab', 'Sonic Forge')}${tabButton('router', 'Routing Notes')}</nav>${renderSettings(snapshot)}${renderRoutingDrawer(snapshot)}<div class="audioflix-content">${tabBody}</div><div class="audioflix-modal-host">${renderModalHost()}</div></div>`;
        }

        const renderSettings = (snapshot) => { const { settingsOpen } = ctx.view(); const combo = snapshot.hotkeyBypassCombo || '', issue = hotkeyComboIssue(combo), summary = combo ? esc(combo) : 'Not set'; return !settingsOpen ? `<section class="audioflix-settings-drawer"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Open settings</b></button></section>` : `<section class="audioflix-settings-drawer is-open"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Collapse</b></button><div class="audioflix-settings-body"><label class="audioflix-settings-field"><span>Hotkey bypass toggle key</span><input type="text" class="audioflix-bypass-input${issue?.invalid ? ' audioflix-input-invalid' : ''}" placeholder="e.g. ctrl+shift+b" value="${esc(combo)}" title="${issue ? esc(issue.msg) : 'Press this to suspend/resume all sound hotkeys'}"></label><p class="audioflix-settings-hint">Press this key while in-game to <strong>suspend</strong> every sound hotkey so the keys type/act normally — press again to re-arm. Use a modifier combo (e.g. <strong>ctrl+shift+b</strong>) so it never clashes with normal typing. Single plain keys get grabbed globally.</p><div class="audioflix-bypass-status">Sound hotkeys: <span class="audioflix-bypass-state" data-state="unknown">—</span></div></div></section>`; };
        const renderRoutingDrawer = (snapshot) => { const { routingOpen, playbackStatus } = ctx.view(); const routeLabel = snapshot.nativeBridgeEnabled && snapshot.nativeOutputLabel ? snapshot.nativeOutputLabel : (snapshot.preferredSinkLabel || 'Default browser output'), stateLabel = snapshot.nativeBridgeEnabled ? 'Native route active' : (snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback'); return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-routing-drawer"><span>Audio Output / Voice Port</span><strong>${esc(stateLabel)}</strong><em>${esc(routeLabel)}</em><b>${routingOpen ? 'Collapse' : 'Open routing'}</b></button>${routingOpen ? `<div class="audioflix-routing-body">${ctx.tools().routing?.renderStatusCards?.(snapshot, playbackStatus) || ''}${ctx.tools().narration?.renderAudioflixSummary?.() || ''}<section class="audioflix-player"><div><strong>Waveform</strong><span>${esc(playbackStatus)}</span></div><canvas id="audioflix-waveform" height="90"></canvas><button type="button" data-af-action="pause">Pause</button></section></div>` : ''}</section>`; };

        const tabButton = (tab, label) => `<button type="button" class="${ctx.view().activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;

        function library(root) {
            const tab = ctx.view().activeTab, panel = root?.querySelector('.audioflix-panel');
            if (!['music', 'soundboard'].includes(tab) || panel?.dataset.afTab !== tab) return false;
            const addHost = panel.querySelector('.audioflix-add-host'), host = panel.querySelector('.audioflix-library-host');
            if (!addHost || !host) return false;
            const focus = focusIdentity(document.activeElement?.closest?.('[data-af-action]'));
            const scrollTop = panel.scrollTop, scrollLeft = panel.scrollLeft, snapshot = state(), type = tab === 'music' ? 'music' : 'sound';
            const items = type === 'music' ? (snapshot.music || []) : [...(snapshot.soundboard || []), ...(ctx.view().portedSounds || [])];
            const nextAdd = renderAddSection(type);
            if (addMarkup !== nextAdd) { addHost.innerHTML = nextAdd; addMarkup = nextAdd; }
            host.innerHTML = renderItems(items, type);
            panel.scrollTop = scrollTop; panel.scrollLeft = scrollLeft;
            restoreFocus(panel, focus);
            window.EveAudioflixTransport?.sync?.(host); window.EveAudioflixLayerVoices?.render?.(host);
            return true;
        }

        function transient(root) {
            const tab = ctx.view().activeTab, panel = root?.querySelector('.audioflix-panel');
            if (!['music', 'soundboard'].includes(tab) || panel?.dataset.afTab !== tab) return false;
            const host = panel.querySelector('.audioflix-add-host');
            if (!host) return false;
            const html = renderAddSection(tab === 'music' ? 'music' : 'sound');
            if (addMarkup !== html) { host.innerHTML = html; addMarkup = html; }
            const snapshot = state(), view = ctx.view(), changes = [];
            if (drawerState.settingsOpen !== view.settingsOpen || drawerState.combo !== (snapshot.hotkeyBypassCombo || '')) changes.push(['.audioflix-settings-drawer', renderSettings(snapshot)]);
            if (drawerState.routingOpen !== view.routingOpen) changes.push(['.audioflix-routing-drawer', renderRoutingDrawer(snapshot)]);
            for (const [selector, markup] of changes) {
                const current = panel.querySelector(selector), template = document.createElement('template');
                template.innerHTML = markup;
                if (current && current.outerHTML !== template.content.firstElementChild.outerHTML) {
                    current.replaceWith(template.content.firstElementChild);
                    if (selector === '.audioflix-routing-drawer') {
                        window.EveAudioflixAudio?.attachWaveform?.(panel.querySelector('#audioflix-waveform'));
                        window.EveAudioflixRouting?.populateOutputSelectors?.(panel);
                        ctx.tools().narration?.syncAudioflixSummary?.();
                    }
                }
            }
            drawerState = { settingsOpen: view.settingsOpen, routingOpen: view.routingOpen, combo: snapshot.hotkeyBypassCombo || '' };
            panel.querySelector('.audioflix-settings-toggle')?.classList.toggle('is-active', ctx.view().settingsOpen);
            return true;
        }
        function playback(root) {
            if (!root || root.hidden) return;
            const live = ctx.playback();
            live.queue.syncQueueControls(root); live.status(); window.EveAudioflixTransport?.sync?.(root);
            if (live.nexus.open) {
                const results = root.querySelector(`[data-af-nexus-results="${live.nexus.type}"]`);
                if (results) results.innerHTML = live.nexusUi.renderResults(live.nexus.type);
            }
        }
        return { render, library, transient, playback };
    };
    ns.ready = true;
})();
