window.EveAudioflixRouting = window.EveAudioflixRouting || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixRouting;
    if (ns.ready) return;

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function isCableLabel(label) {
        return /(?:cable input|vb-audio virtual cable|vb-cable|voicemeeter input)/i.test(String(label || ''));
    }

    function isAnonymousOutput(label) {
        const text = String(label || '').trim();
        return !text || /^Output device\s+\d+$/i.test(text);
    }

    function hasAnonymousOutputs(devices) {
        return (devices || []).some((device) => isAnonymousOutput(device.label));
    }

    function routeLabel(snapshot, audioStatus) {
        if (snapshot.routeMode === 'native-bridge') return snapshot.nativeOutputLabel || 'Native Audioflix bridge';
        if (snapshot.routeMode === 'manual') return 'Windows Mixer -> CABLE Input';
        return snapshot.preferredSinkLabel || (audioStatus.hasSetSinkId ? 'Default browser output' : 'Default output');
    }

    function browserCoreState(snapshot, audioStatus) {
        if (snapshot.routeMode === 'manual') {
            return {
                selected: false,
                canPick: audioStatus.hasSetSinkId && audioStatus.hasOutputPicker,
                labelsVisible: audioStatus.hasEnumerate && !!snapshot.preferredSinkLabel,
                title: 'Windows mixer route active',
                detail: 'Browser APIs stay available, but Windows is currently the source of truth for routing Edge/EveOS to CABLE Input.'
            };
        }
        const selected = ['browser', 'browser-selective', 'vb-cable'].includes(snapshot.routeMode) && !!snapshot.preferredSinkId;
        const canPick = audioStatus.hasSetSinkId && audioStatus.hasOutputPicker;
        const labelsVisible = audioStatus.hasEnumerate && !!snapshot.preferredSinkLabel;
        return {
            selected,
            canPick,
            labelsVisible,
            title: selected ? 'Selective site output ready' : (canPick ? 'Ready to pick output' : 'Manual mixer fallback'),
            detail: selected
                ? `EveOS can route Audioflix and Gemini WebAudio to ${snapshot.preferredSinkLabel || 'the selected output'} without moving all Edge audio.`
                : (canPick
                    ? 'Edge/Chromium can grant EveOS permission to route Audioflix and supported Gemini audio to a chosen output.'
                    : 'Use Windows Volume mixer when this browser cannot expose a permitted output sink.')
        };
    }

    function healthItems(snapshot, audioStatus) {
        const hasRouteApi = !!audioStatus.hasSetSinkId;
        const hasOutput = !!snapshot.preferredSinkLabel;
        const manualMixer = snapshot.routeMode === 'manual';
        const browserCore = browserCoreState(snapshot, audioStatus);
        const nativeRoute = snapshot.routeMode === 'native-bridge' && snapshot.nativeBridgeEnabled === true;
        const onCable = manualMixer || isCableLabel(snapshot.preferredSinkLabel) || (nativeRoute && isCableLabel(snapshot.nativeOutputLabel));
        const armed = snapshot.geminiVoicePortEnabled === true || manualMixer || nativeRoute;
        return [
            { label: 'Output routing', state: manualMixer || hasRouteApi ? 'ready' : 'manual', text: manualMixer ? 'Windows mixer' : (browserCore.selected ? 'Browser permitted' : (hasRouteApi ? 'Browser ready' : 'Use Windows mixer')) },
            { label: 'Voice sink', state: onCable ? 'ready' : (hasOutput ? 'warn' : 'manual'), text: onCable ? 'CABLE route' : 'Needs CABLE Input' },
            { label: 'Voice port', state: armed ? 'ready' : 'manual', text: armed ? 'Gemini only' : 'Not armed' },
            { label: 'Voicemeeter mic', state: 'manual', text: 'Route B1/B2 in Banana' }
        ];
    }

    function nextStep(snapshot, audioStatus) {
        if (snapshot.routeMode === 'manual' && snapshot.geminiVoicePortEnabled === true) {
            return {
                state: 'ready',
                title: 'Windows mixer route is marked',
                body: 'EveOS will treat Edge/browser audio as already routed to CABLE Input. Use Test Route and Copy Route to verify or share the setup.'
            };
        }
        if (snapshot.routeMode === 'native-bridge' && snapshot.nativeBridgeEnabled === true) {
            return {
                state: 'ready',
                title: 'Native EveOS-only route active',
                body: `Gemini PCM chunks are sent to ${snapshot.nativeOutputLabel || 'the selected native output'} through the local EveOS server, so Edge default can stay unchanged.`
            };
        }
        if (audioStatus.hasOutputPicker && audioStatus.hasSetSinkId && !snapshot.preferredSinkId) {
            return {
                state: 'warn',
                title: 'Pick a permitted browser output',
                body: 'Use Pick Browser Output to grant EveOS permission to route Audioflix and supported Gemini playback to CABLE Input or another output.'
            };
        }
        if (!audioStatus.hasSetSinkId) {
            return {
                state: 'manual',
                title: 'Use Windows mixer routing',
                body: 'This browser cannot directly pick an output sink here. Use Windows volume mixer to route the EveOS browser to CABLE Input.'
            };
        }
        if (!isCableLabel(snapshot.preferredSinkLabel)) {
            return {
                state: 'warn',
                title: 'Choose your routing source',
                body: 'Use Auto CABLE + Arm for selective Gemini-only routing, or mark Windows Mixer Routed if you already route all Edge/EveOS audio in Windows.'
            };
        }
        if (snapshot.geminiVoicePortEnabled !== true) {
            return {
                state: 'manual',
                title: 'Arm selective Gemini route',
                body: 'CABLE Input is selected. Arm the port so Gemini WebAudio goes to VB-CABLE while normal Edge audio can stay on your default speakers.'
            };
        }
        return {
            state: 'ready',
            title: 'Selective Gemini route is ready',
            body: 'Use Test Route to verify the WebAudio path, then select Voicemeeter Out B1/B2 as the microphone in the target app.'
        };
    }

    function renderHealth(snapshot, audioStatus) {
        return `<div class="audioflix-route-health">
            ${healthItems(snapshot, audioStatus).map((item) => `<span class="audioflix-health-${item.state}">
                <b>${esc(item.label)}</b>${esc(item.text)}
            </span>`).join('')}
        </div>`;
    }

    function renderStatusCards(snapshot, playbackStatus) {
        const audioStatus = window.EveAudioflixAudio?.getStatus?.() || {};
        const geminiStatus = window.EveAudioflixGemini?.getStatus?.() || {};
        const mode2Tokens = window.EveGeminiMode2?.getTokenTotals?.() || null;
        const label = routeLabel(snapshot, audioStatus);
        const monitorOn = snapshot.geminiVoiceMonitorEnabled !== false;
        const monitorLabel = snapshot.geminiVoiceMonitorSinkLabel || 'Default monitor output';
        const nativeLabel = snapshot.nativeOutputLabel || 'No native output selected';
        const guidance = nextStep(snapshot, audioStatus);
        const browserCore = browserCoreState(snapshot, audioStatus);
        return `<section class="audioflix-route-board" aria-label="Gemini voice route">
            <div class="audioflix-route-node"><span>Gemini Voice</span><strong>${snapshot.geminiVoicePortEnabled ? 'Selective route armed' : 'Default playback'}</strong></div>
            <div class="audioflix-route-arrow">-&gt;</div>
            <div class="audioflix-route-node ${snapshot.geminiVoicePortEnabled ? 'is-hot' : ''}"><span>Output Sink</span><strong>${esc(label)}</strong></div>
            <div class="audioflix-route-arrow">-&gt;</div>
            <div class="audioflix-route-node"><span>Voicemeeter</span><strong>B1/B2 virtual mic</strong></div>
            <div class="audioflix-route-monitor"><span>Listen locally</span><strong>${monitorOn ? esc(monitorLabel) : 'Muted'}</strong></div>
            <div class="audioflix-route-guide audioflix-health-${guidance.state}">
                <span>Next useful action</span>
                <strong>${esc(guidance.title)}</strong>
                <p>${esc(guidance.body)}</p>
            </div>
            ${renderHealth(snapshot, audioStatus)}
            <div class="audioflix-route-actions">
                <button data-af-action="local-only">Local Playback</button>
                <button data-af-action="open-windows-mixer">Open Mixer</button>
                <button data-af-action="mark-windows-route">Windows Mixer Routed</button>
                <button data-af-action="arm-cable">Auto CABLE + Arm</button>
                <button data-af-action="test-signal">Test Route</button>
                <button data-af-action="copy-route-status">Copy Route</button>
            </div>
        </section>
        <section class="audioflix-status-grid">
            <article class="audioflix-status-card is-core">
                <span>Browser Output Core</span>
                <strong>${esc(browserCore.title)}</strong>
                <p>${esc(browserCore.detail)}</p>
                <p class="audioflix-mini-status">Secure: ${audioStatus.secureContext ? 'yes' : 'limited'} · Output API: ${audioStatus.hasSetSinkId ? 'yes' : 'no'} · Picker: ${audioStatus.hasOutputPicker ? 'yes' : 'no'}</p>
                <div class="audioflix-output-picker">
                    <select data-af-control="output-select" aria-label="Audio output device">
                        <option value="">Loading devices...</option>
                    </select>
                    <p class="audioflix-output-note" data-af-output-note>Checking browser output permissions...</p>
                </div>
                <button data-af-action="unlock-output-names">Unlock Device Names</button>
                <button data-af-action="select-output">Pick Browser Output</button>
            </article>
            <article class="audioflix-status-card ${snapshot.nativeBridgeEnabled ? 'is-on' : ''}">
                <span>Native Bridge Output</span>
                <strong>${esc(snapshot.nativeBridgeEnabled ? nativeLabel : 'Optional EveOS-only route')}</strong>
                <p>Draws real Windows endpoints from the EveOS server. Use this when you want EveOS/Gemini audio routed without moving all Edge audio.</p>
                <div class="audioflix-output-picker">
                    <select data-af-control="native-output-select" aria-label="Native Audioflix output device">
                        <option value="">Checking native bridge...</option>
                    </select>
                    <p class="audioflix-output-note" data-af-native-output-note>Server device bridge not checked yet.</p>
                </div>
                <button data-af-action="refresh-native-devices">Refresh System Outputs</button>
                <button data-af-action="toggle-native-bridge">${snapshot.nativeBridgeEnabled ? 'Disable Native Route' : 'Use Native Route'}</button>
            </article>
            <article class="audioflix-status-card ${snapshot.geminiVoicePortEnabled ? 'is-on' : ''}">
                <span>Gemini Voice Port</span>
                <strong>${snapshot.geminiVoicePortEnabled ? 'Selective route armed' : 'Default playback'}</strong>
                <p>${snapshot.geminiVoicePortEnabled && !isCableLabel(snapshot.preferredSinkLabel)
                    ? 'Port is armed, but Output Router is not CABLE Input yet unless Windows Mixer is handling it.'
                    : 'Routes Gemini WebAudio into VB-CABLE/Voicemeeter without requiring all Edge audio to move.'}</p>
                <button data-af-action="toggle-gemini-port">${snapshot.geminiVoicePortEnabled ? 'Disable Selective Route' : 'Arm Selective Route'}</button>
            </article>
            <article class="audioflix-status-card ${monitorOn ? 'is-on' : ''}">
                <span>Local Monitor</span>
                <strong>${monitorOn ? esc(monitorLabel) : 'Monitor muted'}</strong>
                <p>Mirrors Gemini voice to real speakers/headphones while CABLE Input feeds the mic route.</p>
                <div class="audioflix-output-picker">
                    <select data-af-control="monitor-output-select" aria-label="Gemini monitor output device">
                        <option value="">Loading devices...</option>
                    </select>
                </div>
                <button data-af-action="toggle-gemini-monitor">${monitorOn ? 'Mute Monitor' : 'Hear Monitor'}</button>
            </article>
            <article class="audioflix-status-card">
                <span>Conversation Mode</span>
                <strong>${snapshot.geminiConversationMode === 'text-brain-live-voice' ? 'Text Brain -> Live Voice' : 'Direct Live'}</strong>
                <p>${mode2Tokens?.calls
                    ? `Text brain: ${mode2Tokens.textBrain.total} tokens across ${mode2Tokens.calls} call${mode2Tokens.calls === 1 ? '' : 's'}.`
                    : 'Mode 2 routes plain typed or spoken turns through the text brain, then Live speaks the reply.'}</p>
                <button data-af-action="toggle-gemini-mode">${snapshot.geminiConversationMode === 'text-brain-live-voice' ? 'Use Direct Live' : 'Use Mode 2'}</button>
            </article>
            <article class="audioflix-status-card">
                <span>Signal</span>
                <strong>${esc(playbackStatus)}</strong>
                <p>${esc(geminiStatus.lastEvent ? `Gemini audio seen: ${new Date(geminiStatus.lastEvent.at).toLocaleTimeString()}` : 'Waiting for local or Gemini playback.')}</p>
            </article>
        </section>`;
    }

    function renderRouter(snapshot) {
        const armed = snapshot.geminiVoicePortEnabled === true;
        const onCable = isCableLabel(snapshot.preferredSinkLabel);
        return `<div class="audioflix-vbcable-preset ${armed && onCable ? 'is-done' : ''}">
            <div class="audioflix-vbcable-copy">
                <h3>Voicemeeter Banana Route</h3>
                <p>${armed && onCable
                    ? 'EveOS side is ready: Gemini voice is routed to CABLE Input and the port is armed.'
                    : 'Route Gemini voice to CABLE Input, then use Voicemeeter B1/B2 as the target-app microphone.'}</p>
            </div>
            <button data-af-action="arm-cable">${armed && onCable ? 'Re-apply Voice Port' : 'Apply Voice Port'}</button>
        </div>
        <div class="audioflix-router-notes">
            <article>
                <h3>1. Audioflix</h3>
                <ol>
                    <li>Set <strong>Output Router</strong> to <strong>CABLE Input</strong>.</li>
                    <li>Enable <strong>Gemini Voice Port</strong>.</li>
                    <li>Use <strong>Test Signal</strong> to confirm the route.</li>
                </ol>
            </article>
            <article>
                <h3>2. Voicemeeter</h3>
                <ol>
                    <li>Use <strong>CABLE Output</strong> as an input strip.</li>
                    <li>Send that strip to <strong>B1</strong> or <strong>B2</strong>.</li>
                    <li>Optionally route it to <strong>A1/A2</strong> so you can hear it.</li>
                </ol>
            </article>
            <article>
                <h3>3. Target App</h3>
                <ol>
                    <li>Select <strong>Voicemeeter Out B1/B2</strong> as microphone.</li>
                    <li>Keep Gemini's input on your real laptop mic to avoid feedback.</li>
                </ol>
            </article>
        </div>`;
    }

    async function listOutputs() {
        return await window.EveAudioflixAudio?.listOutputs?.() || [];
    }

    async function listNativeOutputs(force) {
        const payload = await window.EveAudioflixNative?.listSystemOutputs?.(force);
        return payload || { devices: [], message: 'Native bridge unavailable.' };
    }

    async function findCableDevice() {
        const devices = await listOutputs();
        return devices.find((device) => isCableLabel(device.label));
    }

    async function populateOutputSelectors(overlay) {
        if (!overlay) return;
        const devices = await listOutputs();
        const snapshot = state();
        const note = overlay.querySelector('[data-af-output-note]');
        if (note) {
            if (!devices.length) {
                note.textContent = 'No browser output list yet. Unlock names or use Windows Mixer.';
            } else if (hasAnonymousOutputs(devices)) {
                note.textContent = 'Names are hidden by browser permission. Unlock once so CABLE Input appears.';
            } else {
                note.textContent = `${devices.length} output device${devices.length === 1 ? '' : 's'} visible.`;
            }
        }
        [
            { selector: '[data-af-control="output-select"]', current: snapshot.preferredSinkId || '' },
            { selector: '[data-af-control="monitor-output-select"]', current: snapshot.geminiVoiceMonitorSinkId || '', blocked: snapshot.preferredSinkId || '' }
        ].forEach(function (entry) {
            const select = overlay.querySelector(entry.selector);
            if (!select) return;
            if (!devices.length) {
                select.innerHTML = '<option value="">No device list; grant mic permission once or use browser picker</option>';
                return;
            }
            select.innerHTML = ['<option value="">Default output</option>'].concat(devices.map((device) => {
                const blocked = entry.blocked && device.deviceId === entry.blocked;
                const label = blocked ? `${device.label || 'Output device'} (Voice Port route)` : device.label;
                return `<option value="${esc(device.deviceId)}"${blocked ? ' disabled' : ''}>${esc(label)}</option>`;
            })).join('');
            select.value = entry.current && entry.current !== entry.blocked ? entry.current : '';
        });
        listNativeOutputs(false).then((payload) => {
            const select = overlay.querySelector('[data-af-control="native-output-select"]');
            const nativeNote = overlay.querySelector('[data-af-native-output-note]');
            const nativeDevices = payload.devices || [];
            if (nativeNote) nativeNote.textContent = payload.message || `${nativeDevices.length} system output device${nativeDevices.length === 1 ? '' : 's'} visible.`;
            if (!select) return;
            if (!nativeDevices.length) {
                select.innerHTML = '<option value="">No native output bridge devices found</option>';
                return;
            }
            select.innerHTML = ['<option value="">Choose native output...</option>'].concat(nativeDevices.map((device) => {
                const playable = device.playable === true;
                const suffix = playable ? '' : ' (discovery only)';
                return `<option value="${esc(device.id)}"${playable ? '' : ' disabled'}>${esc((device.label || device.id) + suffix)}</option>`;
            })).join('');
            select.value = snapshot.nativeOutputId || '';
        }).catch(() => { });
    }

    function routeStatusText(playbackStatus) {
        const snapshot = state();
        const audioStatus = window.EveAudioflixAudio?.getStatus?.() || {};
        const geminiStatus = window.EveAudioflixGemini?.getStatus?.() || {};
        const browserCore = browserCoreState(snapshot, audioStatus);
        return [
            'EveOS Audioflix Routing Status',
            `Generated: ${new Date().toISOString()}`,
            '',
            `[Browser Core] ${browserCore.title}`,
            `[Output Router] ${routeLabel(snapshot, audioStatus)}`,
            `[Voice Port] ${snapshot.geminiVoicePortEnabled ? 'selective Gemini WebAudio route armed' : 'default playback'}`,
            `[Route Mode] ${snapshot.routeMode || 'browser'}`,
            `[Native Bridge] ${snapshot.nativeBridgeEnabled ? (snapshot.nativeOutputLabel || snapshot.nativeOutputId || 'enabled') : 'off'}`,
            `[Local Monitor] ${snapshot.geminiVoiceMonitorEnabled === false ? 'muted' : (snapshot.geminiVoiceMonitorSinkLabel || 'default output')}`,
            `[Conversation Mode] ${snapshot.geminiConversationMode || 'direct-live'}`,
            `[Signal] ${playbackStatus || 'Idle'}`,
            `[Last Gemini Audio] ${geminiStatus.lastEvent ? new Date(geminiStatus.lastEvent.at).toLocaleString() : 'none'}`,
            `[Next Step] ${nextStep(snapshot, audioStatus).title}`,
            '',
            'Native bridge route: EveOS server enumerates Windows output endpoints and can receive Gemini PCM chunks for EveOS-only output routing when sounddevice is installed.',
            'Selective browser route: Pick Browser Output/Auto CABLE + Arm uses browser permission and AudioContext.setSinkId when supported, so Gemini WebAudio can go to VB-CABLE without moving all Edge audio.',
            'Windows mixer route: Settings -> System -> Sound -> Volume mixer -> Edge/EveOS output = CABLE Input.',
            'Target app mic path: CABLE Output -> Voicemeeter strip -> B1/B2 -> target app microphone.'
        ].join('\n');
    }

    async function copyRouteStatus(playbackStatus) {
        const text = routeStatusText(playbackStatus);
        await navigator.clipboard?.writeText?.(text);
        return text;
    }

    Object.assign(ns, {
        ready: true,
        isCableLabel,
        hasAnonymousOutputs,
        renderStatusCards,
        renderRouter,
        populateOutputSelectors,
        findCableDevice,
        copyRouteStatus,
        routeStatusText
    });
})();
