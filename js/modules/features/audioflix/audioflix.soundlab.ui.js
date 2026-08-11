window.EveAudioflixSoundLabUi = window.EveAudioflixSoundLabUi || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabUi;
    if (ns.ready) return;

    let root = null;
    let visible = false;
    let subscribed = false;
    let midiRestored = false;
    let transientError = '';
    let timelineTimer = 0;
    let deferredOuterRender = null;

    function activePromptEditor() {
        const active = document.activeElement;
        return !!root
            && root.contains(active)
            && active?.matches?.('[data-sf-field="prompt-text"]');
    }

    function deferOuterRender(render) {
        if (!activePromptEditor()) {
            deferredOuterRender = null;
            return false;
        }
        if (typeof render === 'function') deferredOuterRender = render;
        return true;
    }

    function flushDeferredOuterRender() {
        const render = deferredOuterRender;
        if (!render) return;
        window.setTimeout(() => {
            if (activePromptEditor() || deferredOuterRender !== render) return;
            deferredOuterRender = null;
            render();
        }, 0);
    }

    function formatTime(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(total / 60);
        return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    function updateTimeline() {
        const output = root?.querySelector?.('[data-sf-session-time]');
        if (!output) return;
        const timeline = window.EveAudioflixSoundLabEngine?.getTimeline?.() || {};
        output.textContent = `${formatTime(timeline.elapsedSeconds)} live / ${formatTime(timeline.generatedSeconds)} generated`;
        const diagnostics = window.EveAudioflixSoundLabEngine?.getDiagnostics?.() || {};
        const values = {
            jitter: `${Number(diagnostics.playback?.jitterMs || 0).toFixed(0)} ms`,
            underruns: String(Number(diagnostics.playback?.underruns || 0)),
            native: `${Number(diagnostics.native?.queuedMs || 0).toFixed(0)} ms`,
            drops: String(Number(diagnostics.native?.dropped || 0))
        };
        Object.entries(values).forEach(([key, value]) => {
            const metric = root?.querySelector?.(`[data-sf-metric="${key}"]`);
            if (metric) metric.textContent = value;
        });
    }

    function syncTimelineTimer() {
        if (timelineTimer && (!visible || !root)) {
            window.clearInterval(timelineTimer);
            timelineTimer = 0;
        }
        if (!timelineTimer && visible && root) {
            timelineTimer = window.setInterval(updateTimeline, 250);
        }
        updateTimeline();
    }

    function bindPromptCommits() {
        root?.querySelectorAll?.('[data-sf-field="prompt-text"]').forEach((input) => {
            if (input.dataset.sfPromptCommitBound === '1') return;
            input.dataset.sfPromptCommitBound = '1';
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') input.blur();
            });
            input.addEventListener('blur', () => {
                handleChange(input, new Event('change'))
                    .catch(showError)
                    .finally(flushDeferredOuterRender);
            });
        });
    }

    function updateEngine(status) {
        if (!root) return;
        const message = root.querySelector('[data-sf-status-message]');
        const shell = root.querySelector('.sonic-forge-status');
        const connect = root.querySelector('[data-sf-connect]');
        const play = root.querySelector('[data-sf-play]');
        const buffer = root.querySelector('[data-sf-buffer]');
        const currentMessage = transientError || status?.message || 'Ready.';
        if (message) message.textContent = currentMessage;
        shell?.classList.toggle('is-error', !!transientError || status?.phase === 'error');
        if (connect) {
            connect.textContent = status?.connected ? 'Disconnect' : 'Connect';
            connect.dataset.afAction = status?.connected ? 'soundlab-disconnect' : 'soundlab-connect';
        }
        if (play) {
            play.textContent = status?.playing ? 'Pause' : 'Generate';
            play.dataset.afAction = status?.playing ? 'soundlab-pause' : 'soundlab-play';
        }
        if (buffer) buffer.textContent = `${Number(status?.bufferedSeconds || 0).toFixed(1)}s buffered`;
    }

    function updateCredential(status) {
        const note = root?.querySelector?.('[data-sf-credential]');
        if (!note) return;
        note.dataset.state = status?.state || 'unknown';
        note.classList.toggle('is-ready', status?.configured === true);
        note.classList.toggle('is-missing', status?.configured !== true);
        const message = note.querySelector('b');
        if (message) message.textContent = status?.message || 'Checking the secure Gemini credential vault...';
    }

    function updateRecording(status) {
        if (!root) return;
        const message = root.querySelector('[data-sf-recording-status]');
        const toggle = root.querySelector('[data-af-action="soundlab-toggle-record"]');
        const download = root.querySelector('[data-af-action="soundlab-download-recording"]');
        const save = root.querySelector('[data-af-action="soundlab-save-recording"]');
        if (message) message.textContent = status?.message || '';
        if (toggle) {
            toggle.textContent = status?.recording ? 'Stop Recording' : 'Record';
            toggle.classList.toggle('is-recording', status?.recording === true);
        }
        if (download) download.disabled = status?.available !== true;
        if (save) save.disabled = status?.available !== true;
    }

    function updateMidi(status) {
        if (!root) return;
        const message = root.querySelector('[data-sf-midi-status]');
        const select = root.querySelector('[data-sf-field="midi-input"]');
        if (message) message.textContent = status?.message || '';
        if (!select) return;
        const current = window.EveAudioflixSoundLabState?.ensure?.() || {};
        const signature = JSON.stringify((status?.inputs || []).map((input) => [input.id, input.name]));
        if (select.dataset.signature !== signature) {
            select.replaceChildren(new Option('All MIDI inputs', ''));
            (status?.inputs || []).forEach((input) => select.add(new Option(input.name, input.id)));
            select.dataset.signature = signature;
        }
        select.value = current.midiInputId || '';
        select.disabled = current.midiEnabled !== true;
    }

    function updateRendered(status) {
        if (!root) return;
        const message = root.querySelector('[data-sf-render-status]');
        const generate = root.querySelector('[data-af-action="soundlab-render"]');
        const download = root.querySelector('[data-af-action="soundlab-render-download"]');
        const save = root.querySelector('[data-af-action="soundlab-render-library"]');
        if (message) message.textContent = status?.message || '';
        if (generate) {
            generate.disabled = status?.generating === true;
            generate.textContent = status?.generating ? 'Rendering...' : 'Render Scene';
        }
        if (download) download.disabled = status?.available !== true;
        if (save) save.disabled = status?.available !== true;
    }

    function updatePaidFeatures(enabled) {
        const panel = root?.querySelector?.('.sonic-forge-rendered');
        if (panel) panel.hidden = enabled !== true;
    }

    function subscribe() {
        if (subscribed) return;
        subscribed = true;
        window.EveAudioflixSoundLabEngine?.subscribe?.(updateEngine);
        window.EveAudioflixSoundLabRecording?.subscribe?.(updateRecording);
        window.EveAudioflixSoundLabMidi?.subscribe?.(updateMidi);
        window.EveAudioflixSoundLabRendered?.subscribe?.(updateRendered);
        window.addEventListener('eve:sonic-forge-credential-status', (event) => {
            updateCredential(event.detail || {});
        });
        window.addEventListener('eve:gemini-server-status', (event) => {
            if (event.detail?.credentialsConfigured === true) {
                window.EveAudioflixSoundLabSdk?.refreshCredentialStatus?.(true);
            }
        });
        window.addEventListener('eve:sonic-forge-paid-features-changed', (event) => {
            updatePaidFeatures(event.detail?.enabled === true);
        });
        window.addEventListener('eve:audioflix-soundlab-midi', (event) => {
            if (!root) return;
            const id = event.detail?.promptId;
            const weight = Number(event.detail?.weight || 0);
            const slider = root.querySelector(`[data-sf-field="prompt-weight"][data-sf-prompt="${CSS.escape(id || '')}"]`);
            const output = root.querySelector(`[data-sf-prompt-weight="${CSS.escape(id || '')}"]`);
            if (slider) slider.value = String(weight);
            if (output) output.textContent = weight.toFixed(2);
        });
    }

    // Drift moves parameters on a timer, and a state write does not re-render anything, so the
    // controls would otherwise show stale numbers while the audio genuinely changed. Patch just the
    // one slider and its readout — a full rerender on a timer would reintroduce the jank that moving
    // the settings modal out of the panel rebuild was meant to remove.
    function reflectDrift(change) {
        if (!root || !change) return false;
        const selector = change.kind === 'prompt'
            ? `[data-sf-field="prompt-weight"][data-sf-prompt="${CSS.escape(String(change.id))}"]`
            : `[data-sf-field="config"][data-sf-config="${CSS.escape(String(change.key))}"]`;
        const input = root.querySelector(selector);
        if (!input) return false;
        // Never fight the user: leave a control alone while it has focus or is being dragged.
        if (document.activeElement === input) return false;
        input.value = String(change.value);
        const shell = input.closest('.sonic-forge-knob-shell');
        if (shell) {
            const min = Number(input.min || 0);
            const max = Number(input.max || 1);
            const progress = Math.max(0, Math.min(1, (Number(change.value) - min) / ((max - min) || 1)));
            shell.style.setProperty('--sf-knob', String(progress));
        }
        const output = change.kind === 'prompt'
            ? root.querySelector(`[data-sf-prompt-weight="${CSS.escape(String(change.id))}"]`)
            : root.querySelector(`[data-sf-output="${CSS.escape(String(change.key))}"]`);
        if (output) {
            output.textContent = change.kind === 'prompt'
                ? Number(change.value).toFixed(2)
                : String(change.value);
        }
        return true;
    }

    function afterRender(host) {
        root = host?.querySelector?.('[data-audioflix-soundlab]') || null;
        const canvas = root?.querySelector?.('[data-sf-visualizer]') || null;
        window.EveAudioflixSoundLabVisualizer?.mount?.(canvas);
        window.EveAudioflixSoundLabVisualizer?.setVisible?.(visible && !!root);
        window.EveAudioflixSoundLabKnobInput?.bind?.(root);
        bindPromptCommits();
        syncTimelineTimer();
        subscribe();
        updateEngine(window.EveAudioflixSoundLabEngine?.getStatus?.() || {});
        updateCredential(window.EveAudioflixSoundLabSdk?.getCredentialStatus?.() || {});
        window.EveAudioflixSoundLabSdk?.refreshCredentialStatus?.().catch?.(() => {});
        updateRecording(window.EveAudioflixSoundLabRecording?.getStatus?.() || {});
        updateMidi(window.EveAudioflixSoundLabMidi?.getStatus?.() || {});
        updateRendered(window.EveAudioflixSoundLabRendered?.getStatus?.() || {});
        updatePaidFeatures(window.EveAudioflixSoundLabState?.ensure?.().showPaidApiFeatures === true);
        if (!midiRestored) {
            midiRestored = true;
            window.EveAudioflixSoundLabMidi?.restore?.().catch(() => {});
        }
    }

    function setVisible(next) {
        visible = next === true;
        window.EveAudioflixSoundLabVisualizer?.setVisible?.(visible && !!root);
        syncTimelineTimer();
    }

    function showError(error) {
        transientError = error?.message || String(error || 'Sonic Forge action failed.');
        updateEngine(window.EveAudioflixSoundLabEngine?.getStatus?.() || {});
        window.setTimeout(() => {
            transientError = '';
            updateEngine(window.EveAudioflixSoundLabEngine?.getStatus?.() || {});
        }, 7000);
    }

    async function handleAction(target, event) {
        try {
            transientError = '';
            return await window.EveAudioflixSoundLabUiEvents?.handleAction?.(target, event);
        } catch (error) {
            showError(error);
            return { rerender: false };
        }
    }

    function handleInput(target, event) {
        try {
            return window.EveAudioflixSoundLabUiEvents?.handleInput?.(target, event) === true;
        } catch (error) {
            showError(error);
            return true;
        }
    }

    async function handleChange(target, event) {
        try {
            const handled = await window.EveAudioflixSoundLabUiEvents?.handleChange?.(target, event);
            updateMidi(window.EveAudioflixSoundLabMidi?.getStatus?.() || {});
            return handled === true;
        } catch (error) {
            showError(error);
            return true;
        }
    }

    Object.assign(ns, {
        ready: true,
        render: () => window.EveAudioflixSoundLabUiRender?.render?.() || '',
        afterRender,
        setVisible,
        handleAction,
        handleInput,
        handleChange,
        reflectDrift,
        deferOuterRender
    });
})();
