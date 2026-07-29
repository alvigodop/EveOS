window.EveAudioflixSoundLabPresets = window.EveAudioflixSoundLabPresets || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabPresets;
    if (ns.ready) return;

    const MAX_FILE_BYTES = 1024 * 1024;
    let message = 'Scenes are included in normal EveOS datapack backups.';

    function snapshot() {
        return window.EveAudioflixSoundLabState?.ensure?.() || {};
    }

    function safeFileName(value) {
        return String(value || 'sonic-forge-scenes')
            .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80) || 'sonic-forge-scenes';
    }

    function exportScenes() {
        const state = snapshot();
        const payload = {
            kind: 'eveos-sonic-forge-scenes',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            currentScene: {
                prompts: state.prompts || [],
                config: state.config || {},
                visualizerMode: state.visualizerMode,
                masterVolume: state.masterVolume
            },
            presets: state.presets || []
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${safeFileName('Sonic Forge Scenes')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        message = `Exported ${payload.presets.length} saved scene${payload.presets.length === 1 ? '' : 's'}.`;
        return payload;
    }

    function legacyPreset(entry, index) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') return entry;
        const name = entry[0];
        if (Array.isArray(entry[1])) {
            return {
                name,
                prompts: entry[1].map((pair, promptIndex) => {
                    const source = Array.isArray(pair) ? pair[1] : pair;
                    return Object.assign({}, source || {}, {
                        id: source?.id || source?.promptId || pair?.[0] || `legacy_prompt_${promptIndex}`
                    });
                })
            };
        }
        if (entry[1] && typeof entry[1] === 'object') {
            const source = entry[1];
            return {
                name,
                config: Object.assign({}, source, {
                    scale: source.scale || source.currentScale,
                    musicGenerationMode: source.musicGenerationMode || source.generationMode
                })
            };
        }
        return { name: name || `Imported Preset ${index + 1}` };
    }

    function importedPresets(payload) {
        const raw = Array.isArray(payload) ? payload : payload?.presets;
        const candidates = Array.isArray(raw) ? raw.map(legacyPreset) : [];
        if (!candidates.length && payload?.currentScene) {
            candidates.push({
                name: `Imported Scene ${new Date().toLocaleDateString()}`,
                prompts: payload.currentScene.prompts,
                config: payload.currentScene.config
            });
        }
        return window.EveAudioflixSoundLabState?.normalize?.({ presets: candidates })?.presets || [];
    }

    async function importFile(file) {
        if (!file) throw new Error('Choose a Sonic Forge scene JSON file.');
        if (Number(file.size || 0) > MAX_FILE_BYTES) throw new Error('Scene file exceeds the 1 MB safety limit.');
        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch {
            throw new Error('Scene file is not valid JSON.');
        }
        if (!Array.isArray(payload) && payload?.kind && payload.kind !== 'eveos-sonic-forge-scenes') {
            throw new Error('This JSON file is not a Sonic Forge scene export.');
        }
        const incoming = importedPresets(payload);
        if (!incoming.length) throw new Error('No valid Sonic Forge scenes were found.');

        const state = snapshot();
        const merged = [...(state.presets || [])];
        incoming.forEach((preset) => {
            const name = String(preset.name || '').trim().toLowerCase();
            const index = merged.findIndex((entry) => entry.id === preset.id
                || String(entry.name || '').trim().toLowerCase() === name);
            if (index >= 0) merged[index] = preset;
            else merged.push(preset);
        });
        window.EveAudioflixSoundLabState?.update?.({
            presets: merged.slice(-24)
        }, 'audioflix-soundlab-import-presets');
        const legacy = Array.isArray(payload) && payload.some(Array.isArray);
        message = `Imported ${incoming.length} ${legacy ? 'legacy ' : ''}scene${incoming.length === 1 ? '' : 's'}; ${Math.min(24, merged.length)} retained.`;
        return incoming.length;
    }

    Object.assign(ns, {
        ready: true,
        exportScenes,
        importFile,
        getMessage: () => message
    });
})();
