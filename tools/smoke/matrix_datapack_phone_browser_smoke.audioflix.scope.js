async function seedHostedAudioflix(page) {
    await page.evaluate(() => {
        const track = window.EveAudioflixState.addItem('music', {
            id: 'hosted-audio-track',
            title: 'Hosted Audio Link',
            artist: 'Audioflix Smoke',
            url: 'https://example.test/hosted-audio.mp3'
        });
        window.EveAudioflixLinks.add([track.id], {
            scopeType: 'workspace',
            workspaceId: 'alpha'
        }, 'music');
        window.__matrixPhonePlayed = null;
        window.EveAudioflixAudio.playItem = async (item) => {
            window.__matrixPhonePlayed = { id: item.id, type: item.type };
            return true;
        };
    });
}

async function runHostedAudioflixPlayback({ page, frame }) {
    await frame.getByText('Audioflix Links', { exact: true }).click();
    await frame.getByText('Hosted Audio Link', { exact: true }).click();
    await frame.getByText('Playing through Audioflix', { exact: true }).waitFor({
        state: 'visible',
        timeout: 30000
    });
    const playedAudio = await page.evaluate(() => window.__matrixPhonePlayed);
    if (playedAudio?.id !== 'hosted-audio-track' || playedAudio?.type !== 'music') {
        throw new Error(`Hosted Matrix Audioflix playback mismatch: ${JSON.stringify(playedAudio)}`);
    }
    await frame.locator('[data-phone-home]').click();
    return playedAudio;
}

module.exports = {
    seedHostedAudioflix,
    runHostedAudioflixPlayback
};
