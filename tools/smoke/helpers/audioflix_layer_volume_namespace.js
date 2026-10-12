'use strict';

module.exports = async function verifyLayerVolumeNamespace(window, players, assert) {
    const controller = window.EveAudioflixAudioLayers.createController({
        state: () => ({}), shouldPreferUrl: () => false, tryNativePlayback: async () => false
    });
    await controller.layerPlay({ id: 'layer-a', url: 'a.mp3' });
    await controller.layerPlay({ id: 'layer-b', url: 'b.mp3' });
    const playerA = players.find(player => player.src === 'a.mp3');
    const playerB = players.find(player => player.src === 'b.mp3');
    controller.stopItemLayers('layer-a');
    assert(playerA?.paused && playerA.currentTime === 0, 'the requested browser layer stops and rewinds');
    assert(playerB && !playerB.paused, 'stopping one layer leaves unrelated layers playing');

    await controller.layerPlay({ id: 0, type: 'music', isPorted: true, isMusicPort: true, url: 'music-port.mp3', volume: 0.5 });
    await controller.layerPlay({ id: 0, type: 'sound', isPorted: true, url: 'sound-port.mp3', volume: 0.5 });
    const music = players.find(player => player.src === 'music-port.mp3');
    const sound = players.find(player => player.src === 'sound-port.mp3');
    controller.updateVolume('0', 0.2, { type: 'sound', persist: false });
    assert(sound.volume === 0.2 && music.volume === 0.5, 'sound preview cannot change same-ID music port gain');
    controller.updateVolume(0, 0.3, { type: 'music', persist: false });
    assert(music.volume === 0.3 && sound.volume === 0.2, 'music preview cannot change same-ID sound port gain');
    controller.updateVolume(0, 0.4, { type: 'soundboard', persist: false });
    assert(sound.volume === 0.4 && music.volume === 0.3, 'readonly soundboard alias targets sound only');
    controller.updateVolume(0, 0.9, { type: 'episode', persist: false });
    assert(sound.volume === 0.4 && music.volume === 0.3, 'unknown library namespace fails closed');
    controller.updateVolume(0, 0.6);
    assert(sound.volume === 0.6 && music.volume === 0.6, 'legacy ID-only layer volume keeps old behavior');
    assert(controller.getSnapshot(0).length === 2, 'numeric zero layer identity is observable');
    controller.stopItemLayers(0);
    assert(music.paused && sound.paused && controller.getSnapshot('0').length === 0,
        'numeric zero stop still owns every same-ID layer');
    controller.stopAll();
};
