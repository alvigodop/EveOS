window.EveAudioflixAudioLayers = window.EveAudioflixAudioLayers || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioLayers;
    if (ns.ready) return;

    function createController(deps) {
        const activeLayers = new Map();

        async function layerPlay(item) {
            if (!item?.url) return false;
            let safeItem = typeof item === 'object' ? { ...item } : { url: item };

            if (deps.shouldPreferUrl?.(safeItem)) return deps.playUrlItem(safeItem);
            if (window.EveAudioflixAudioSource?.needsResolution?.(safeItem.url)) {
                try {
                    safeItem = await window.EveAudioflixAudioSource.resolveItem(safeItem);
                } catch (error) {
                    if (deps.canPlayUrl?.(safeItem)) return deps.playUrlItem(safeItem);
                    console.warn('[Audioflix] Failed to resolve stream URL for layer:', error);
                    return false;
                }
            }

            if (await deps.tryNativePlayback(safeItem)) return true;
            if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
                try {
                    const buffer = await deps.getDecodedBuffer(safeItem.url);
                    const id = safeItem.id || safeItem.url;
                    const ok = await window.EveAudioflixNative.playVoice(deps.encodeBufferToBase64(buffer), {
                        sampleRate: buffer.sampleRate,
                        channels: 1,
                        volume: safeItem.volume ?? 1,
                        voiceId: id
                    });
                    if (ok) {
                        window.EveAudioflixAudio?.getWaveformController?.()?.playBufferWaveform?.(buffer);
                        activeLayers.set(id, [{ stop: () => window.EveAudioflixNative?.clearVoices?.(id) }]);
                        return true;
                    }
                } catch (error) {
                    console.warn('[Audioflix] native voice failed for layer, falling back:', error);
                }
            }

            const player = new Audio();
            player.crossOrigin = 'anonymous';
            player.src = safeItem.url;
            player.loop = false;
            player.volume = window.EveAudioflixState.normalizeVolume(safeItem.volume, 1);
            window.EveAudioflixAudio?.getWaveformController?.()?.attachPlayer?.(player);
            const sinkId = deps.state().preferredSinkId;
            if (sinkId && typeof player.setSinkId === 'function') {
                try { await player.setSinkId(sinkId); } catch { }
            }
            const id = safeItem.id || safeItem.url;
            if (!activeLayers.has(id)) activeLayers.set(id, []);
            activeLayers.get(id).push(player);
            player.addEventListener('ended', () => removeLayer(id, player));
            await player.play();
            return true;
        }

        function removeLayer(id, player) {
            const layers = activeLayers.get(id);
            if (!layers) return;
            const index = layers.indexOf(player);
            if (index >= 0) layers.splice(index, 1);
            if (!layers.length) activeLayers.delete(id);
        }

        function stopLayer(layer) {
            try {
                if (typeof layer?.stop === 'function') return layer.stop();
                layer?.pause?.();
                if (layer) layer.currentTime = 0;
            } catch { }
            return null;
        }

        function stopItemLayers(itemId) {
            const layers = activeLayers.get(itemId) || [];
            const pending = layers.map(stopLayer).filter((result) => result?.then);
            activeLayers.delete(itemId);
            return pending;
        }

        function stopAll() {
            const pending = [];
            activeLayers.forEach((layers) => layers.forEach((layer) => {
                const result = stopLayer(layer);
                if (result?.then) pending.push(result);
            }));
            activeLayers.clear();
            return pending;
        }

        function updateVolume(itemId, volume) {
            const safe = Math.max(0, Math.min(1, Number(volume || 0)));
            (activeLayers.get(itemId) || []).forEach((layer) => {
                if (layer && typeof layer.volume !== 'undefined') layer.volume = safe;
            });
            window.EveAudioflixNative?.setVoiceVolume?.(itemId, safe);
        }

        return { layerPlay, stopItemLayers, stopAll, updateVolume };
    }

    Object.assign(ns, { ready: true, createController });
})();
