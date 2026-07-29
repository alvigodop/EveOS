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
        output.textContent = `${formatTime(timeline.elapsedSeconds)} live · ${formatTime(timeline.generatedSeconds)} generated`;
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

    function subscribe() {
        if (subscribed) return;
        subscribed = true;
        window.EveAudioflixSoundLabEngine?.subscribe?.(updateEngine);
        window.EveAudioflixSoundLabRecording?.subscribe?.(updateRecording);
        window.EveAudioflixSoundLabMidi?.subscribe?.(updateMidi);
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
        updateRecording(window.EveAudioflixSoundLabRecording?.getStatus?.() || {});
        updateMidi(window.EveAudioflixSoundLabMidi?.getStatus?.() || {});
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
        deferOuterRender
    });
})();
