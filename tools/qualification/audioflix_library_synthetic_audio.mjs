export function installSyntheticAudioFixtureBridge() {
    window.__installLibrarySyntheticAudio = () => {
        const audio = window.EveAudioflixAudio;
        const fake = window.__librarySyntheticAudio = {
            item: null,
            paused: true,
            volume: 1
        };

        const emitPlayback = (status, item, paused) => {
            const detail = { status, item, synthetic: true };
            window.dispatchEvent(new CustomEvent('eve:audioflix-playback', { detail }));
            window.dispatchEvent(new CustomEvent('eve:audioflix-progress', {
                detail: {
                    item,
                    currentTime: paused ? 0 : 12,
                    duration: paused ? 0 : 120,
                    paused,
                    synthetic: true
                }
            }));
        };

        audio.playItem = async item => {
            Object.assign(fake, {
                item,
                paused: false,
                volume: item.volume ?? 1
            });
            emitPlayback(`Playing ${item.title || 'audio'}`, item, false);
            return true;
        };

        audio.stopItemLayers = async id => {
            if (String(fake.item?.id) === String(id)) {
                const stopped = fake.item;
                Object.assign(fake, { item: null, paused: true });
                emitPlayback('Stopped', stopped, true);
            }
            return true;
        };

        audio.stopAll = async () => {
            const stopped = fake.item;
            Object.assign(fake, { item: null, paused: true });
            if (stopped) emitPlayback('Stopped', stopped, true);
            return true;
        };

        audio.getPlaybackState = () => ({
            ...fake,
            duration: fake.paused ? 0 : 120,
            currentTime: fake.paused ? 0 : 12,
            browserOnly: false
        });

        audio.updateItemVolume = (id, volume) => {
            if (String(fake.item?.id) === String(id)) {
                fake.volume = volume;
            }
        };

        audio.attachWaveform = () => {};
    };
}
