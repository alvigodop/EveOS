const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const GEMINI_SOCKET = path.join(
    ROOT, 'js', 'modules', 'gemini', 'client', 'connection_management', 'socket_core'
);

const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function staticContracts() {
    const html = fs.readFileSync(path.join(ROOT, 'EveOS.html'), 'utf8');
    const ui = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.ui.js'), 'utf8');
    const engine = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.engine.js'), 'utf8');
    const steering = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.steering.js'), 'utf8');
    const connection = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.connection.js'), 'utf8');
    const proxy = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.proxy.js'), 'utf8');
    const effects = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.effects.js'), 'utf8');
    const nativeCapture = fs.readFileSync(
        path.join(AUDIOFLIX, 'audioflix.soundlab.native-capture.js'),
        'utf8'
    );
    const processor = fs.readFileSync(
        path.join(AUDIOFLIX, 'audioflix.capture.processor.src.js'),
        'utf8'
    );
    const genConfig = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.config.js'), 'utf8');
    const rendered = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.rendered.js'), 'utf8');
    const playback = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.playback.js'), 'utf8');
    const failureApi = fs.readFileSync(path.join(GEMINI_SOCKET, 'geminiApiFailure.js'), 'utf8');
    const credentials = fs.readFileSync(
        path.join(ROOT, 'js', 'modules', 'gemini', 'server_control', 'geminiCredentialWorkflow.js'),
        'utf8'
    );
    const bridge = fs.readFileSync(path.join(ROOT, 'server_modules', 'audioflix_bridge.py'), 'utf8');
    const order = ['soundboard', 'music', 'soundlab', 'router']
        .map((tab) => ui.indexOf(`tabButton('${tab}'`));
    assert(order.every((index) => index >= 0), 'all Audioflix tabs are wired');
    assert(
        order.every((index, position) => !position || index > order[position - 1]),
        'Sonic Forge tab order is stable'
    );
    [
        'audioflix.soundlab.state.js',
        'audioflix.capture.processor.src.js',
        'audioflix.soundlab.sdk.js',
        'audioflix.soundlab.proxy.js',
        'audioflix.soundlab.playback.js',
        'audioflix.soundlab.effects.js',
        'audioflix.soundlab.native-capture.js',
        'audioflix.soundlab.modulation.js',
        'audioflix.soundlab.connection.js',
        'audioflix.soundlab.continuity.js',
        'audioflix.soundlab.steering.js',
        'audioflix.soundlab.config.js',
        'audioflix.soundlab.engine.js',
        'audioflix.soundlab.scenes.js',
        'audioflix.soundlab.visualizer.overlay.js',
        'audioflix.soundlab.rendered.js',
        'audioflix.soundlab.ui.advanced.js',
        'audioflix.soundlab.ui.advanced.events.js',
        'audioflix.soundlab.presets.js',
        'audioflix.soundlab.ui.js',
        'geminiApiFailure.js'
    ].forEach((name) => assert(html.includes(name), `${name} is loaded by EveOS`));
    // "Auto" must mean the key is ABSENT from the payload, not a number the model then obeys.
    // Asserted at the source level because a wrong default here is silent: the generation would
    // simply keep following a pinned value the UI claims is automatic.
    assert(
        genConfig.includes('delete wire[key]')
            && genConfig.includes("delete wire.autoParams")
            && /AUTO_PARAM_KEYS\s*=\s*\['bpm', 'density', 'brightness'\]/.test(genConfig),
        'auto parameters are deleted from the Lyria payload rather than sent with a value'
    );
    // guidance/temperature/topK are sampler controls with no model-inferred value, so offering
    // "auto" on them would be a lie about what omission does.
    assert(
        !/AUTO_PARAM_KEYS[^\]]*(guidance|temperature|topK)/.test(genConfig),
        'sampler controls are not offered as model-inferred auto parameters'
    );
    // bpm/scale changes force resetContext(), so nothing may modulate them continuously.
    assert(
        /RESET_ON_CHANGE_KEYS\s*=\s*\['bpm', 'scale'\]/.test(genConfig)
            && genConfig.includes('isSafeToModulate'),
        'parameters that force a context reset are guarded against continuous modulation'
    );
    assert(
        engine.includes("if (auto.bpm !== true) result.bpm")
            && engine.includes("if (auto.density !== true) result.density")
            && engine.includes("if (auto.brightness !== true) result.brightness"),
        'the engine payload builder omits auto parameters instead of sending a value'
    );
    // With a parameter on auto its key is missing, and "missing" must read as unchanged or every
    // pass would fire a context reset.
    assert(
        steering.includes('changedHard') && steering.includes('!hasNext || !hasPrev'),
        'an absent (auto) parameter never counts as a hard transition'
    );
    assert(
        steering.indexOf('setMusicGenerationConfig') < steering.indexOf('liveSession.resetContext'),
        'Lyria applies BPM/scale configuration before resetting generation context'
    );
    assert(
        engine.includes('EveAudioflixSoundLabSteering.create')
            && steering.includes('nextSignature === appliedSignature')
            && steering.includes('hardTransition(config)'),
        'Lyria steering is coalesced, deduplicated, and resets only for hard transitions'
    );
    assert(
        connection.includes('Promise.race([connection, transportFailure, deadline])')
            && connection.includes('expired')
            && connection.includes('EveGeminiApiFailure?.connectWithNormalizedWebSocket')
            && failureApi.includes('connectWithNormalizedWebSocket'),
        'Lyria connection has a deadline, closes late sessions, and normalizes its SDK WebSocket'
    );
    assert(!connection.includes('setupReject'), 'transport failure cannot leave a rejected setup promise');
    assert(
        connection.includes('connectProxy')
            && proxy.includes("sessionRole: 'sonic_forge'")
            && !proxy.includes("apiKey: options"),
        'fresh tabs can use the secure Sonic Forge backend without receiving its API key'
    );
    assert(!engine.includes('fade.gain.linearRampToValueAtTime'), 'PCM chunks are not faded independently');
    assert(playback.includes('source.connect(output)'), 'Lyria chunks share one continuous playback bus');
    const browserDecode = engine.match(/pcm16ToAudioBuffer\(context, chunk\.data,[\s\S]*?\n\s*}\);/)?.[0] || '';
    assert(
        browserDecode && !browserDecode.includes('stereoBalance: true'),
        'browser playback preserves Lyria stereo instead of changing channel gain per PCM fragment'
    );
    assert(
        engine.includes("latencyHint: 'playback'")
            && playback.includes('INITIAL_BUFFER_SECONDS = 3')
            && playback.includes('REBUFFER_SECONDS = 4')
            && !playback.includes('pending.shift();\n                dropped += 1'),
        'Lyria uses playback latency, a deep adaptive reserve, and preserves generated phrase order'
    );
    assert(
        engine.includes('gain: liveMasterVolume') && engine.includes('liveMasterVolume = safe'),
        'native Lyria chunks follow live volume changes before settings persistence'
    );
    assert(
        engine.includes('mixBus.connect(effectsRack.input)')
            && engine.includes('masterGain.connect(outputGain)')
            && engine.includes('masterGain.connect(recordDestination)')
            && effects.includes('limiter.output.connect(output)'),
        'one processed master feeds browser playback, recording, and native routing'
    );
    assert(
        nativeCapture.includes('const CHANNELS = 2')
            && nativeCapture.includes('processorOptions: { blockSize: 4096, channels: CHANNELS }')
            && processor.includes('requestedChannels === 2 ? 2 : 1'),
        'processed native routing preserves stereo while legacy capture remains mono by default'
    );
    assert(
        rendered.includes('ai.interactions?.create')
            && rendered.includes('/v1beta/interactions'),
        'rendered music uses the current Lyria Interactions API with a REST fallback'
    );
    assert(
        !engine.includes('audioFormat:') && !engine.includes('sampleRateHz:'),
        'Live Music steering contains only deployed generation fields'
    );
    assert(bridge.includes('/api/audioflix/save-soundlab-recording'), 'recording save route is registered');
    assert(
        credentials.includes("sessionStorage.setItem('eveAudioflixSoundLabApiKey', normalizedKey)"),
        'Gemini Link securely hands its saved credential to Sonic Forge for this tab'
    );
}

function assertResult(result) {
    assert(result.sameIdentity, 'state reads preserve object identity');
    assert(result.migratedSchemaVersion === 3, 'legacy Sonic Forge state migrates to schema v3');
    assert(result.migratedControlView === 'sliders', 'schema-v1 scenes migrate the control view default');
    assert(result.migratedPromptControlView === 'knobs', 'legacy scenes gain Prompt Mixer knobs');
    assert(result.bufferSeconds === 3, 'legacy shallow buffering migrates to the smooth playback reserve');
    assert(
        result.neutralEffects.filter === false
            && result.neutralEffects.delay === false
            && result.neutralEffects.reverb === false
            && result.neutralEffects.stereo === false
            && result.neutralEffects.limiter === true,
        'legacy state gains neutral creative effects with limiter protection'
    );
    assert(result.promptCount >= 1 && result.promptCount <= 16, 'prompt collection is bounded');
    assert(result.presetNames.includes('Smoke Scene'), 'saved scene persists in Audioflix state');
    assert(result.savedSceneHasEffects, 'saved scenes include their full effects configuration');
    assert(
        result.capturedSlots.aBpm === 90
            && result.capturedSlots.bBpm === 101
            && result.capturedSlots.aVolume === 0.31
            && result.capturedSlots.bVolume === 0.41,
        'A/B slots capture independent complete scenes'
    );
    assert(result.presetNames.includes('Imported Scene'), 'scene JSON imports into Audioflix state');
    assert(
        result.legacyPromptText === 'legacy glass bells'
            && result.legacyConfig.bpm === 123
            && result.legacyConfig.scale === 'G_MAJOR_E_MINOR'
            && /legacy/i.test(result.presetMessage),
        'original AI Sound prompt and config preset arrays import as native scenes'
    );
    assert(result.initialVolume === result.volumeAfterPreview, 'volume preview avoids config write amplification');
    assert(result.volumeAfterCommit === 0.31, 'volume change commits after interaction');
    assert(result.sessionKeyBeforeClear === 'soundlab-session-test', 'credential is retained for this session');
    assert(result.sessionKeyAfterClear === null, 'test credential is cleared after use');
    assert(
        result.normalizedSocketUrl === 'wss://generativelanguage.googleapis.com/ws/test',
        'Lyria SDK double-slash WebSocket paths are normalized before connection'
    );
    assert(result.singleFlightConnect, 'concurrent Lyria connect requests share one transport attempt');
    assert(
        result.playFailure.includes('play transport rejected')
            && result.playFailureStatus.phase === 'error'
            && result.playFailureStatus.playing === false
            && result.playFailureStatus.buffering === false,
        'a rejected play request unwinds the active generation state'
    );
    assert(
        result.intentionalDisconnectStatus.phase === 'idle'
            && result.intentionalDisconnectStatus.message === 'Disconnected.',
        'an intentional disconnect cannot be overwritten by its stale close callback'
    );
    assert(
        !Object.hasOwn(result.musicConfig, 'audioFormat')
            && !Object.hasOwn(result.musicConfig, 'sampleRateHz')
            && !Object.hasOwn(result.musicConfig, 'scale'),
        'default steering omits unsupported transport fields and the unspecified scale'
    );
    assert(result.apiVersion === 'v1alpha', 'Lyria uses the documented Live Music WebSocket endpoint');
    assert(
        /ip allowlist/i.test(result.restrictedMessage),
        'Lyria exposes actionable IP restriction diagnostics instead of a generic disconnect'
    );
    assert(result.leakedCredential === false, 'session credential never enters datapack state');
    assert(
        !result.hasCredentialEditor && !result.hasClearKey
            && /Gemini Link credential/i.test(result.credentialNotice)
            && /(secure Gemini credential vault|Session Controls|Available)/i.test(result.credentialNotice),
        'Sonic Forge exposes Gemini Link credential status without a second key editor'
    );
    assert(result.hasTitle && result.hasRecording && result.hasImport, 'workbench renders all core tools');
    assert(
        Object.values(result.advancedPanels).every(Boolean),
        'effects, modulation, A/B scenes, diagnostics, and rendered music controls all render'
    );
    assert(
        result.decayAfterInput === result.decayBeforeInput
            && result.decayAfterCommit === 3.4
            && result.effectApplyCalls === 1,
        'reverb impulse settings preview visually and rebuild only once on commit'
    );
    assert(
        result.visualModes.join(',') === 'spectrum,waveform,radial,spectrogram,frequency-linear',
        'log spectrum is primary and the original linear frequency view remains available last'
    );
    assert(
        result.controlView === 'knobs' && result.generationKnobCount === 6,
        'generation knob view is functional and persisted'
    );
    assert(
        result.promptControlView === 'knobs' && result.promptKnobCount === result.promptCount,
        'each prompt weight has a persisted knob control'
    );
    assert(result.knobBoundCount >= result.promptKnobCount, 'knobs use the low-sensitivity input adapter');
    assert(
        result.promptAfterInput === result.promptBeforeInput
            && result.promptAfterCommit === 'committed only after blur'
            && result.promptSteeringCalls === 1,
        'prompt text is committed once after editing instead of steering on every keystroke'
    );
    assert(
        result.hasSessionTimer
            && Object.hasOwn(result.timeline, 'elapsedSeconds')
            && Object.hasOwn(result.timeline, 'generatedSeconds'),
        'Sonic Forge exposes a live/generated session timeline'
    );
    assert(
        Math.max(...result.transformedLevels) < 1300000
            && Math.max(...result.transformedLevels) / Math.min(...result.transformedLevels) <= 1.21,
        'native PCM volume and extreme stereo imbalance are corrected before routing'
    );
    assert(
        result.urlSafeBytes.join(',') === '255,255',
        'Sonic Forge decodes the Python relay Base64URL PCM form without atob failures'
    );
    assert(
        result.renderedGenerated === true
            && result.renderedStatus.available === true
            && result.renderedStatus.bytes > 100
            && result.renderedRequest?.model === 'lyria-3-clip-preview'
            && result.renderedRequest?.input === 'bounded render smoke'
            && result.renderedApiVersion === 'v1beta',
        'rendered lane decodes the current Interactions API response into a bounded preview'
    );
    assert(
        result.steeringCalls[0]?.resetContext === true
            && result.steeringCalls[1]?.resetContext === false,
        'BPM resets Lyria context while density remains a live steering update'
    );
    assert(result.errors.length === 0, `browser emitted errors: ${result.errors.join('; ')}`);
}

module.exports = { staticContracts, assertResult };
