window.EveAudioflixSoundLabMidi = window.EveAudioflixSoundLabMidi || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabMidi;
    if (ns.ready) return;

    const listeners = new Set();
    let access = null;
    let boundInputs = [];
    let status = { supported: !!navigator.requestMIDIAccess, enabled: false, inputs: [], message: 'MIDI is off.' };
    let updateTimer = 0;
    const pendingWeights = new Map();

    function publish(patch) {
        status = Object.assign({}, status, patch || {});
        listeners.forEach((listener) => {
            try { listener(Object.assign({}, status)); } catch {}
        });
        return status;
    }

    function listInputs() {
        return access ? [...access.inputs.values()].map((input) => ({
            id: input.id,
            name: input.name || input.manufacturer || 'MIDI input',
            manufacturer: input.manufacturer || '',
            state: input.state || ''
        })) : [];
    }

    function flushWeights() {
        updateTimer = 0;
        const current = window.EveAudioflixSoundLabState?.ensure?.();
        if (!current || !pendingWeights.size) return;
        const prompts = (current.prompts || []).map((prompt) => pendingWeights.has(prompt.id)
            ? Object.assign({}, prompt, { weight: pendingWeights.get(prompt.id) })
            : prompt);
        const changed = [...pendingWeights.entries()];
        pendingWeights.clear();
        window.EveAudioflixSoundLabState?.update?.({
            prompts,
            activePresetId: ''
        }, 'audioflix-soundlab-midi');
        window.EveAudioflixSoundLabEngine?.queueSteering?.();
        changed.forEach(([promptId, weight]) => {
            window.dispatchEvent(new CustomEvent('eve:audioflix-soundlab-midi', {
                detail: { promptId, weight }
            }));
        });
    }

    function onMessage(event) {
        const data = event?.data || [];
        if ((data[0] & 0xf0) !== 0xb0) return;
        const controller = Number(data[1]);
        const value = Number(data[2]);
        const prompts = window.EveAudioflixSoundLabState?.ensure?.().prompts || [];
        prompts.filter((prompt) => Number(prompt.cc) === controller).forEach((prompt) => {
            pendingWeights.set(prompt.id, Math.round((value / 127) * 200) / 100);
        });
        if (!pendingWeights.size) return;
        if (updateTimer) window.clearTimeout(updateTimer);
        updateTimer = window.setTimeout(flushWeights, 48);
    }

    function unbind() {
        boundInputs.forEach((input) => { input.onmidimessage = null; });
        boundInputs = [];
    }

    function bindSelected() {
        unbind();
        if (!access) return;
        const current = window.EveAudioflixSoundLabState?.ensure?.() || {};
        const selected = String(current.midiInputId || '');
        boundInputs = [...access.inputs.values()].filter((input) => !selected || input.id === selected);
        boundInputs.forEach((input) => { input.onmidimessage = onMessage; });
        publish({
            enabled: current.midiEnabled === true,
            inputs: listInputs(),
            message: boundInputs.length
                ? `Listening to ${boundInputs.map((input) => input.name || 'MIDI input').join(', ')}.`
                : 'No matching MIDI input is connected.'
        });
    }

    async function ensureAccess() {
        if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is unavailable in this browser.');
        if (!access) {
            access = await navigator.requestMIDIAccess({ sysex: false });
            access.onstatechange = () => {
                bindSelected();
                publish({ inputs: listInputs() });
            };
        }
        return access;
    }

    async function setEnabled(enabled) {
        if (enabled !== true) {
            unbind();
            window.EveAudioflixSoundLabState?.update?.({ midiEnabled: false }, 'audioflix-soundlab-midi-off');
            publish({ enabled: false, inputs: listInputs(), message: 'MIDI is off.' });
            return false;
        }
        publish({ message: 'Requesting MIDI access...' });
        try {
            await ensureAccess();
            window.EveAudioflixSoundLabState?.update?.({ midiEnabled: true }, 'audioflix-soundlab-midi-on');
            bindSelected();
            return true;
        } catch (error) {
            window.EveAudioflixSoundLabState?.update?.({ midiEnabled: false }, 'audioflix-soundlab-midi-denied');
            publish({ enabled: false, message: error?.message || 'MIDI access was denied.' });
            throw error;
        }
    }

    async function selectInput(inputId) {
        await ensureAccess();
        window.EveAudioflixSoundLabState?.update?.({
            midiEnabled: true,
            midiInputId: String(inputId || '')
        }, 'audioflix-soundlab-midi-input');
        bindSelected();
        return true;
    }

    async function restore() {
        const current = window.EveAudioflixSoundLabState?.ensure?.() || {};
        if (current.midiEnabled !== true) return false;
        try { return await setEnabled(true); } catch { return false; }
    }

    Object.assign(ns, {
        ready: true,
        setEnabled,
        selectInput,
        restore,
        getStatus: () => Object.assign({}, status, { inputs: listInputs() }),
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            listener(Object.assign({}, status));
            return () => listeners.delete(listener);
        }
    });
})();
