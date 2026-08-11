window.EveAudioflixAudioLayers = window.EveAudioflixAudioLayers || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioLayers;
    if (ns.ready) return;

    function createController(deps) {
        const activeLayers = new Map();
        const itemEpochs = new Map();
        let globalEpoch = 0;

        const itemId = (item) => String(item?.id || item?.url || '');
        const epoch = (id) => Number(itemEpochs.get(id) || 0);
        const isCancelled = (id, itemEpoch, startEpoch) => (
            epoch(id) !== itemEpoch || globalEpoch !== startEpoch
        );

        async function cancelStartedUrl(id) {
            try { await deps.stopUrlPlayback?.(id); } catch {}
        }

        async function layerPlay(item) {
            if (!item?.url) return false;
            let safeItem = typeof item === 'object' ? { ...item } : { url: item };
            const id = itemId(safeItem);
            const itemStartEpoch = epoch(id);
            const globalStartEpoch = globalEpoch;
            const cancelled = () => isCancelled(id, itemStartEpoch, globalStartEpoch);

            if (deps.shouldPreferUrl?.(safeItem)) {
                const played = await deps.playUrlItem(safeItem);
                if (!cancelled()) return played;
                await cancelStartedUrl(id);
                return false;
            }
            if (window.EveAudioflixAudioSource?.needsResolution?.(safeItem.url)) {
                try {
                    safeItem = await window.EveAudioflixAudioSource.resolveItem(safeItem);
                } catch (error) {
                    if (cancelled()) return false;
                    if (deps.canPlayUrl?.(safeItem)) {
                        const played = await deps.playUrlItem(safeItem);
                        if (!cancelled()) return played;
                        await cancelStartedUrl(id);
                        return false;
                    }
                    console.warn('[Audioflix] Failed to resolve stream URL for layer:', error);
                    return false;
                }
            }
            if (cancelled()) return false;

            if (await deps.tryNativePlayback(safeItem)) {
                if (!cancelled()) return true;
                await deps.stopNativeItem?.(id);
                return false;
            }
            if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
                try {
                    const buffer = await deps.getDecodedBuffer(safeItem.url);
                    if (cancelled()) return false;
                    const ok = await window.EveAudioflixNative.playVoice(deps.encodeBufferToBase64(buffer), {
                        sampleRate: buffer.sampleRate,
                        channels: 1,
                        volume: safeItem.volume ?? 1,
                        voiceId: id
                    });
                    if (cancelled()) {
                        if (ok) await window.EveAudioflixNative?.clearVoices?.(id);
                        return false;
                    }
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
            if (cancelled()) return false;
            if (!activeLayers.has(id)) activeLayers.set(id, []);
            activeLayers.get(id).push(player);
            player.addEventListener('ended', () => removeLayer(id, player));
            try {
                await player.play();
            } catch (error) {
                removeLayer(id, player);
                throw error;
            }
            if (cancelled()) {
                stopLayer(player);
                removeLayer(id, player);
                return false;
            }
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
            const id = String(itemId || '');
            itemEpochs.set(id, epoch(id) + 1);
            const layers = activeLayers.get(id) || [];
            const pending = layers.map(stopLayer).filter((result) => result?.then);
            activeLayers.delete(id);
            return pending;
        }

        function stopAll() {
            globalEpoch += 1;
            itemEpochs.clear();
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
