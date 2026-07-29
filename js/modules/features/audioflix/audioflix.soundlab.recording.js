window.EveAudioflixSoundLabRecording = window.EveAudioflixSoundLabRecording || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabRecording;
    if (ns.ready) return;

    const listeners = new Set();
    let recorder = null;
    let chunks = [];
    let lastBlob = null;
    let lastUrl = '';
    let stopPromise = null;
    let resolveStop = null;
    let status = { recording: false, available: false, message: 'No recording captured yet.' };

    function publish(patch) {
        status = Object.assign({}, status, patch || {});
        listeners.forEach((listener) => {
            try { listener(Object.assign({}, status)); } catch {}
        });
        return status;
    }

    function extensionFor(type) {
        return String(type || '').includes('ogg') ? 'ogg' : 'webm';
    }

    function releaseUrl() {
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = '';
    }

    async function start() {
        if (recorder?.state === 'recording') return true;
        if (!window.MediaRecorder) throw new Error('Recording is unavailable in this browser.');
        await window.EveAudioflixSoundLabEngine?.connect?.();
        const stream = window.EveAudioflixSoundLabEngine?.getRecordingStream?.();
        if (!stream) throw new Error('Sonic Forge audio is not ready to record.');
        const mimeType = window.EveAudioflixSoundLabCodec?.bestRecordingMimeType?.() || '';
        chunks = [];
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
            if (event.data?.size) chunks.push(event.data);
        };
        stopPromise = new Promise((resolve) => { resolveStop = resolve; });
        recorder.onstop = () => {
            releaseUrl();
            lastBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            lastUrl = URL.createObjectURL(lastBlob);
            publish({
                recording: false,
                available: lastBlob.size > 0,
                bytes: lastBlob.size,
                message: lastBlob.size ? 'Recording ready to download or add to Music Library.' : 'Recording was empty.'
            });
            resolveStop?.(lastBlob);
            resolveStop = null;
        };
        recorder.start(1000);
        publish({ recording: true, available: !!lastBlob, message: 'Recording Sonic Forge output...' });
        return true;
    }

    async function stop() {
        if (!recorder || recorder.state === 'inactive') return lastBlob;
        recorder.stop();
        return stopPromise;
    }

    function download(name) {
        if (!lastBlob || !lastUrl) throw new Error('Record a Sonic Forge session first.');
        const extension = extensionFor(lastBlob.type);
        const anchor = document.createElement('a');
        anchor.href = lastUrl;
        anchor.download = window.EveAudioflixSoundLabCodec.safeFilename(name, extension);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        publish({ message: `Downloaded ${anchor.download}.` });
        return true;
    }

    function candidateBases() {
        const root = window.EveAudioflixState?.ensure?.() || {};
        const bases = [root.nativeBridgeBase];
        if (/^https?:$/.test(location.protocol)) bases.push(location.origin);
        ['8765', '8766', '8767', '8768', '8769', '8770', '3000'].forEach((port) => {
            bases.push(`http://127.0.0.1:${port}`);
        });
        return [...new Set(bases.filter(Boolean).map((base) => String(base).replace(/\/+$/, '')))];
    }

    function blobBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Could not read the recording for local save.'));
            reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
            reader.readAsDataURL(blob);
        });
    }

    async function postRecording(payload) {
        const errors = [];
        for (const base of candidateBases()) {
            try {
                const response = await fetch(`${base}/api/audioflix/save-soundlab-recording`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json().catch(() => ({}));
                if (response.ok && result.ok) return result;
                errors.push(result.message || `${base} returned ${response.status}.`);
            } catch (error) {
                errors.push(error?.message || `${base} did not respond.`);
            }
        }
        throw new Error(errors[0] || 'Start EveOS localhost to save the recording into Music Library.');
    }

    async function addToLibrary(options) {
        if (!lastBlob) throw new Error('Record a Sonic Forge session first.');
        const settings = Object.assign({}, window.EveAudioflixSoundLabState?.ensure?.(), options || {});
        const directory = String(settings.recordingDir || '').trim();
        if (!directory) throw new Error('Choose a local recording folder first.');
        publish({ message: 'Saving recording through the local Audioflix bridge...' });
        const result = await postRecording({
            audio: await blobBase64(lastBlob),
            mimeType: lastBlob.type,
            directory,
            name: settings.recordingName
        });
        const item = window.EveAudioflixState?.addItem?.('music', {
            title: String(settings.recordingName || 'Sonic Forge Session').trim(),
            localPath: result.path,
            sourceProvider: 'sonic-forge',
            folder: 'Sonic Forge',
            category: 'Generated Music',
            exposed: true
        });
        if (item?.id) {
            window.EveAudioflixState?.addMusicGroup?.('Sonic Forge');
            window.EveAudioflixState?.toggleMusicGroup?.(item.id, 'Sonic Forge', true);
        }
        publish({ message: `Added ${result.fileName} to Music Library.` });
        return item;
    }

    Object.assign(ns, {
        ready: true,
        start,
        stop,
        download,
        addToLibrary,
        getStatus: () => Object.assign({}, status),
        getLastBlob: () => lastBlob,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            listener(Object.assign({}, status));
            return () => listeners.delete(listener);
        }
    });
})();
