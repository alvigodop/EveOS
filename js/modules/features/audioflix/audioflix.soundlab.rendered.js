window.EveAudioflixSoundLabRendered = window.EveAudioflixSoundLabRendered || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabRendered;
    if (ns.ready) return;

    const listeners = new Set();
    let blob = null;
    let url = '';
    let status = {
        phase: 'idle',
        generating: false,
        available: false,
        message: 'Render a bounded Lyria 3 clip from the current scene.'
    };

    function publish(patch) {
        status = Object.assign({}, status, patch || {});
        listeners.forEach((listener) => {
            try { listener(Object.assign({}, status)); } catch {}
        });
        window.dispatchEvent(new CustomEvent('eve:audioflix-soundlab-rendered', {
            detail: Object.assign({}, status)
        }));
    }

    function release() {
        if (url) URL.revokeObjectURL(url);
        url = '';
        blob = null;
    }

    function scenePrompt() {
        const state = window.EveAudioflixSoundLabState?.ensure?.() || {};
        const explicit = String(state.render?.prompt || '').trim();
        if (explicit) return explicit;
        return (state.prompts || [])
            .filter((entry) => entry.text && Number(entry.weight) > 0)
            .sort((a, b) => Number(b.weight) - Number(a.weight))
            .map((entry) => `${entry.text} (${Number(entry.weight).toFixed(2)})`)
            .join(', ') || 'ambient instrumental music';
    }

    function findAudio(value, seen = new Set()) {
        if (!value || seen.has(value)) return null;
        if (typeof value === 'object') seen.add(value);
        if (typeof value === 'string' && value.length > 100
            && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
            return { data: value, mimeType: 'audio/mpeg' };
        }
        if (Array.isArray(value)) {
            for (const entry of value) {
                const found = findAudio(entry, seen);
                if (found) return found;
            }
            return null;
        }
        if (typeof value !== 'object') return null;
        const data = value.data || value.audioData || value.audio_data;
        const mimeType = value.mimeType || value.mime_type || value.type;
        if (typeof data === 'string' && data.length > 100
            && String(mimeType || '').toLowerCase().includes('audio')) {
            return { data, mimeType: mimeType || 'audio/mpeg' };
        }
        const priority = [
            value.output_audio, value.outputAudio, value.inlineData, value.inline_data,
            value.output, value.candidates, value.parts
        ];
        for (const entry of priority) {
            const found = findAudio(entry, seen);
            if (found) return found;
        }
        for (const entry of Object.values(value)) {
            const found = findAudio(entry, seen);
            if (found) return found;
        }
        return null;
    }

    function decodeAudio(audio) {
        const clean = String(audio.data || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: audio.mimeType || 'audio/mpeg' });
    }

    async function createInteraction(ai, request, apiKey) {
        if (ai.interactions?.create) return ai.interactions.create(request);
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(request)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result?.error?.message || `Lyria render failed (${response.status}).`);
        }
        return result;
    }

    async function generate(options) {
        if (status.generating) return false;
        const state = window.EveAudioflixSoundLabState?.ensure?.() || {};
        const model = options?.model || state.render?.model || 'lyria-3-clip-preview';
        const prompt = String(options?.prompt || scenePrompt()).trim();
        const apiKey = window.EveAudioflixSoundLabSdk?.getApiKey?.() || '';
        if (!apiKey) throw new Error('Save a Gemini API key in Search Monitor before rendering.');
        publish({
            phase: 'generating',
            generating: true,
            message: model.includes('pro') ? 'Rendering a longer Lyria 3 composition...' : 'Rendering a 30-second Lyria 3 clip...'
        });
        try {
            const sdk = await window.EveAudioflixSoundLabSdk.load();
            const ai = new sdk.GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
            const result = await createInteraction(ai, { model, input: prompt }, apiKey);
            const audio = findAudio(result);
            if (!audio) throw new Error('Lyria returned no audio payload.');
            release();
            blob = decodeAudio(audio);
            url = URL.createObjectURL(blob);
            publish({
                phase: 'ready',
                generating: false,
                available: true,
                bytes: blob.size,
                url,
                model,
                message: 'Rendered audio is ready to preview, download, or add to Music Library.'
            });
            return true;
        } catch (error) {
            publish({
                phase: 'error',
                generating: false,
                message: error?.message || 'Could not render the scene.'
            });
            throw error;
        }
    }

    function download(name) {
        if (!blob || !url) throw new Error('Render a scene first.');
        const extension = blob.type.includes('wav') ? 'wav' : 'mp3';
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = window.EveAudioflixSoundLabCodec.safeFilename(name || 'Sonic Forge Render', extension);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return true;
    }

    async function addToLibrary(options) {
        if (!blob) throw new Error('Render a scene first.');
        return window.EveAudioflixSoundLabRecording.saveBlobToLibrary(blob, Object.assign({
            recordingName: 'Sonic Forge Render',
            sourceProvider: 'lyria-3',
            folder: 'Sonic Forge Renders',
            category: 'Rendered Music'
        }, options || {}));
    }

    Object.assign(ns, {
        ready: true,
        generate,
        download,
        addToLibrary,
        getStatus: () => Object.assign({}, status),
        getBlob: () => blob,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            listener(Object.assign({}, status));
            return () => listeners.delete(listener);
        }
    });
})();
