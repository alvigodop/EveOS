const {
    chromium,
    buildSeedPayload,
    clickAndWaitForMap,
    prepareSeededPage
} = require('./constellation_scope_browser_smoke.shared');

(async () => {
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await prepareSeededPage(page, buildSeedPayload());

        await page.evaluate(() => {
            const item = window.EveAudioflixState.addItem('music', {
                id: 'constellation-audio-track',
                title: 'Constellation Audio Track',
                artist: 'Audioflix Smoke',
                url: 'https://example.test/constellation.mp3'
            });
            window.EveAudioflixLinks.add([item.id], {
                scopeType: 'card',
                workspaceId: 'main',
                categoryName: 'Alpha'
            }, 'music');
            const audioState = window.EveAudioflixState.ensure();
            const distractor = {
                id: 'constellation-unrelated-track',
                type: 'music',
                title: 'Unrelated Audio Track',
                url: 'https://example.test/unrelated.mp3'
            };
            const unrelatedBindings = Array.from({ length: 300 }, (_, index) => ({
                id: `unrelated-audio-link-${index}`,
                audioId: distractor.id,
                audioType: 'music',
                scopeType: 'workspace',
                workspaceId: `unrelated-workspace-${index}`,
                createdAt: Date.now()
            }));
            window.EveAudioflixState.replaceState({
                ...audioState,
                music: [distractor, ...audioState.music],
                scopeBindings: [...unrelatedBindings, ...audioState.scopeBindings]
            }, 'constellation-scope-starvation-smoke');
            window.__constellationAudioPlayed = '';
            window.EveAudioflixAudio.playItem = async (audioItem) => {
                window.__constellationAudioPlayed = audioItem.id;
                return true;
            };
        });

        await clickAndWaitForMap(page, () => page.locator('.topbar-constellation-btn').click());
        const result = await page.evaluate(async () => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const node = state?.nodes?.find((entry) => (
                entry?.data?.audioId === 'constellation-audio-track'
            ));
            if (!node) return { found: false };

            const primary = map._coreActions?.getPrimaryAction?.(node);
            const secondary = map._renderInspectorCore?.getSecondaryActions?.(node);
            map._coreActions?.runNodeAction?.(node, 'primary');
            await new Promise((resolve) => setTimeout(resolve, 40));
            return {
                found: true,
                nodeKind: node.kind,
                sourceType: node.data?.sourceType,
                primary,
                secondaryIsArray: Array.isArray(secondary),
                playedId: window.__constellationAudioPlayed,
                edgeCount: (state.edges || []).filter((edge) => edge.type === 'audioflix').length
            };
        });

        if (!result.found) throw new Error('Expected a canonical Audioflix node in the scoped Constellation graph');
        if (result.sourceType !== 'audioflix') throw new Error(`Unexpected Audioflix node source: ${result.sourceType}`);
        if (result.primary?.action !== 'play-audio') {
            throw new Error(`Expected Audioflix primary action, got: ${JSON.stringify(result.primary)}`);
        }
        if (!result.secondaryIsArray) throw new Error('Constellation secondary actions must remain an array');
        if (result.playedId !== 'constellation-audio-track') {
            throw new Error(`Constellation playback used the wrong canonical item: ${result.playedId}`);
        }
        if (result.edgeCount < 1) throw new Error('Expected the Audioflix node to connect to its EveOS scope');

        console.log('AUDIOFLIX_CONSTELLATION_BROWSER_SMOKE_OK', JSON.stringify(result));
    } catch (error) {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
    }
})();
