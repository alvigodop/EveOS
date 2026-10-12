'use strict';

const assert = require('node:assert/strict');

module.exports = async function verifyManagedVolumeRouting({ window, calls, originalVolumeCalls, windowListeners }) {
    const priorGain = window.EveAudioflixSpotifyAnyBrowser.snapshot().playback.item.volume;
    window.EveAudioflixAudio.updateItemVolume('song-1', 0.91, { type: 'sound', persist: false });
    await Promise.resolve();
    assert.equal(window.EveAudioflixSpotifyAnyBrowser.snapshot().playback.item.volume, priorGain,
        'same ID in sound namespace cannot mutate managed music gain');
    assert.deepEqual(originalVolumeCalls.at(-1), ['song-1', 0.91, { type: 'sound', persist: false }],
        'same-ID sound retains its typed route to the original layer controller instead of being swallowed');
    window.EveAudioflixAudio.updateItemVolume('song-1', 0.4);
    await Promise.resolve();
    const slider = calls.filter(entry => entry.action === 'volume').at(-1);
    assert.equal(slider.payload.effectiveVolume, 0.2, 'track slider sends one already-effective gain to the engine');

    windowListeners.get('eve:audioflix-output-volume')?.();
    await Promise.resolve();
    const master = calls.filter(entry => entry.action === 'volume').at(-1);
    assert.equal(master.payload.effectiveVolume, 0.2, 'master sync starts from saved raw track gain and does not double-attenuate');
};
