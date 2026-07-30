window.EveAudioflixSoundLabUiRender = window.EveAudioflixSoundLabUiRender || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabUiRender;
    if (ns.ready) return;

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    function selected(value, expected) {
        return value === expected ? ' selected' : '';
    }

    function checked(value) {
        return value === true ? ' checked' : '';
    }

    // `auto` is only passed for the parameters Lyria can infer from the text direction — bpm,
    // density and brightness. When on, the slider is disabled and its value is not sent at all, so
    // the readout shows "auto" rather than a number that is no longer in effect.
    function rangeField(label, key, value, min, max, step, detail, controlView, auto) {
        const knob = controlView === 'knobs';
        const autoable = auto !== undefined;
        const isAuto = auto === true;
        const progress = Math.max(0, Math.min(1, (Number(value) - min) / (max - min || 1)));
        const input = `<input type="range" min="${min}" max="${max}" step="${step}" value="${esc(value)}"
            data-sf-field="config" data-sf-config="${esc(key)}" aria-label="${esc(label)}"${isAuto ? ' disabled' : ''}>`;
        const autoToggle = autoable ? `<button type="button" class="sonic-forge-auto${isAuto ? ' is-active' : ''}"
            data-af-action="soundlab-toggle-auto" data-sf-auto="${esc(key)}"
            title="Let the model choose ${esc(label.toLowerCase())} from your prompt"
            aria-pressed="${isAuto ? 'true' : 'false'}">auto</button>` : '';
        return `<label class="sonic-forge-control${knob ? ' is-knob' : ''}${isAuto ? ' is-auto' : ''}">
            <span><b>${esc(label)}</b>${autoToggle}<output data-sf-output="${esc(key)}">${isAuto ? 'auto' : esc(value)}</output></span>
            ${knob ? `<span class="sonic-forge-knob-shell" style="--sf-knob:${progress}">${input}</span>` : input}
            ${detail ? `<small>${esc(detail)}</small>` : ''}
        </label>`;
    }

    function renderPrompt(prompt, index, canRemove, controlView) {
        const knob = controlView === 'knobs';
        const progress = Math.max(0, Math.min(1, Number(prompt.weight) / 2));
        const weightInput = `<input type="range" min="0" max="2" step="0.01" value="${esc(prompt.weight)}"
            data-sf-field="prompt-weight" data-sf-prompt="${esc(prompt.id)}"
            aria-label="Direction ${index + 1} weight">`;
        return `<article class="sonic-forge-prompt" style="--prompt-color:${esc(prompt.color)}">
            <div class="sonic-forge-prompt-top">
                <span class="sonic-forge-prompt-number">${String(index + 1).padStart(2, '0')}</span>
                <input type="color" value="${esc(prompt.color)}" data-sf-field="prompt-color"
                    data-sf-prompt="${esc(prompt.id)}" aria-label="Prompt color">
                <input class="sonic-forge-prompt-text" type="text" maxlength="280" value="${esc(prompt.text)}"
                    data-sf-field="prompt-text" data-sf-prompt="${esc(prompt.id)}"
                    aria-label="Musical direction ${index + 1}">
                <button type="button" data-af-action="soundlab-remove-prompt" data-sf-prompt="${esc(prompt.id)}"
                    ${canRemove ? '' : 'disabled'} aria-label="Remove musical direction">x</button>
            </div>
            <div class="sonic-forge-prompt-mix">
                <label class="sonic-forge-prompt-weight${knob ? ' is-knob' : ''}">
                    <span>Weight <output data-sf-prompt-weight="${esc(prompt.id)}">${Number(prompt.weight).toFixed(2)}</output></span>
                    ${knob
                        ? `<span class="sonic-forge-knob-shell is-prompt" style="--sf-knob:${progress};--sf-mint:${esc(prompt.color)}">${weightInput}</span>`
                        : weightInput}
                </label>
                <label class="sonic-forge-cc">
                    <span>MIDI CC</span>
                    <input type="number" min="0" max="127" step="1" value="${esc(prompt.cc)}"
                        data-sf-field="prompt-cc" data-sf-prompt="${esc(prompt.id)}">
                </label>
            </div>
        </article>`;
    }

    function renderPrompts(soundLab) {
        const prompts = soundLab.prompts || [];
        return `<section class="sonic-forge-block sonic-forge-prompts">
            <header>
                <div><span class="sonic-forge-eyebrow">Direction Matrix</span>
                    <h3>Prompt Mixer</h3>
                    <p>Blend musical ideas live. Text commits on blur or Enter; knobs drag vertically, with Shift for fine control.</p>
                </div>
                <div class="sonic-forge-header-actions">
                    <div class="sonic-forge-view-toggle" role="group" aria-label="Prompt mixer control view">
                        ${['sliders', 'knobs'].map((view) => `<button type="button"
                            class="${soundLab.promptControlView === view ? 'is-active' : ''}"
                            data-af-action="soundlab-prompt-view" data-sf-view="${view}">${view}</button>`).join('')}
                    </div>
                    <button type="button" data-af-action="soundlab-add-prompt" ${prompts.length >= 16 ? 'disabled' : ''}>
                        + Direction
                    </button>
                </div>
            </header>
            <div class="sonic-forge-prompt-grid is-${esc(soundLab.promptControlView)}">
                ${prompts.map((prompt, index) => renderPrompt(
                    prompt, index, prompts.length > 1, soundLab.promptControlView
                )).join('')}
            </div>
        </section>`;
    }

    function renderConfig(soundLab) {
        const config = soundLab.config || {};
        const auto = config.autoParams || {};
        const scales = window.EveAudioflixSoundLabState?.scales || [];
        return `<section class="sonic-forge-block sonic-forge-generation">
            <header><div><span class="sonic-forge-eyebrow">Steering</span><h3>Generation Controls</h3>
                <p>Changes are applied without rebuilding the audio engine.</p></div>
                <div class="sonic-forge-view-toggle" role="group" aria-label="Generation control view">
                    ${['sliders', 'knobs'].map((view) => `<button type="button"
                        class="${soundLab.controlView === view ? 'is-active' : ''}"
                        data-af-action="soundlab-control-view" data-sf-view="${view}">${view}</button>`).join('')}
                </div>
            </header>
            <div class="sonic-forge-controls-grid is-${esc(soundLab.controlView)}">
                ${rangeField('Tempo', 'bpm', config.bpm, 60, 200, 1, 'BPM', soundLab.controlView, auto.bpm)}
                ${rangeField('Density', 'density', config.density, 0, 1, 0.01, '', soundLab.controlView, auto.density)}
                ${rangeField('Brightness', 'brightness', config.brightness, 0, 1, 0.01, '', soundLab.controlView, auto.brightness)}
                ${rangeField('Guidance', 'guidance', config.guidance, 0, 6, 0.1, '', soundLab.controlView)}
                ${rangeField('Temperature', 'temperature', config.temperature, 0, 3, 0.05, '', soundLab.controlView)}
                ${rangeField('Top K', 'topK', config.topK, 1, 1000, 1, '', soundLab.controlView)}
                <label class="sonic-forge-control sonic-forge-select">
                    <span><b>Scale</b></span>
                    <select data-sf-field="config" data-sf-config="scale">
                        ${scales.map((scale) => `<option value="${esc(scale)}"${selected(config.scale, scale)}>${esc(scale.replaceAll('_', ' '))}</option>`).join('')}
                    </select>
                </label>
                <label class="sonic-forge-control sonic-forge-select">
                    <span><b>Generation Mode</b></span>
                    <select data-sf-field="config" data-sf-config="musicGenerationMode">
                        ${['QUALITY', 'DIVERSITY', 'VOCALIZATION'].map((mode) => `<option value="${mode}"${selected(config.musicGenerationMode, mode)}>${mode}</option>`).join('')}
                    </select>
                </label>
                <label class="sonic-forge-control">
                    <span><b>Seed</b></span>
                    <input type="number" min="0" max="2147483647" step="1" value="${esc(config.seed)}"
                        data-sf-field="config" data-sf-config="seed">
                    <small>0 lets the model choose.</small>
                </label>
            </div>
            <div class="sonic-forge-switches">
                <label><input type="checkbox" data-sf-field="config" data-sf-config="muteBass"${checked(config.muteBass)}> Mute bass</label>
                <label><input type="checkbox" data-sf-field="config" data-sf-config="muteDrums"${checked(config.muteDrums)}> Mute drums</label>
                <label><input type="checkbox" data-sf-field="config" data-sf-config="onlyBassAndDrums"${checked(config.onlyBassAndDrums)}> Bass + drums only</label>
            </div>
        </section>`;
    }

    function renderPresets(soundLab) {
        const presets = soundLab.presets || [];
        return `<section class="sonic-forge-block sonic-forge-presets">
            <header><div><span class="sonic-forge-eyebrow">Datapack Memory</span><h3>Scene Presets</h3>
                <p>Prompts, generation controls, effects, and modulation travel with normal EveOS backups.</p></div></header>
            <div class="sonic-forge-inline-form">
                <input type="text" maxlength="80" placeholder="Preset name" data-sf-preset-name>
                <button type="button" data-af-action="soundlab-save-preset">Save Scene</button>
            </div>
            <div class="sonic-forge-inline-form">
                <select data-sf-preset-select aria-label="Saved Sonic Forge scene">
                    <option value="">${presets.length ? 'Choose a saved scene' : 'No saved scenes yet'}</option>
                    ${presets.map((preset) => `<option value="${esc(preset.id)}"${selected(soundLab.activePresetId, preset.id)}>${esc(preset.name)}</option>`).join('')}
                </select>
                <button type="button" data-af-action="soundlab-load-preset" ${presets.length ? '' : 'disabled'}>Load</button>
                <button type="button" data-af-action="soundlab-remove-preset" class="is-danger" ${presets.length ? '' : 'disabled'}>Delete</button>
            </div>
            <div class="sonic-forge-button-row sonic-forge-preset-portability">
                <button type="button" data-af-action="soundlab-export-presets">Export Scenes</button>
                <button type="button" data-af-action="soundlab-import-presets">Import Scenes</button>
                <input type="file" accept="application/json,.json" data-sf-field="preset-file" hidden>
            </div>
            <p class="sonic-forge-note">${esc(window.EveAudioflixSoundLabPresets?.getMessage?.() || '')}</p>
        </section>`;
    }

    function renderMidi(soundLab, midi) {
        const inputs = midi.inputs || [];
        return `<section class="sonic-forge-block sonic-forge-midi">
            <header><div><span class="sonic-forge-eyebrow">Optional Hardware</span><h3>MIDI Control</h3>
                <p>Map controller knobs to prompt weights with each direction's CC number.</p></div></header>
            <label class="sonic-forge-toggle">
                <input type="checkbox" data-sf-field="midi-enabled"${checked(soundLab.midiEnabled)}>
                <span>Enable MIDI steering</span>
            </label>
            <select data-sf-field="midi-input" ${soundLab.midiEnabled ? '' : 'disabled'}>
                <option value="">All MIDI inputs</option>
                ${inputs.map((input) => `<option value="${esc(input.id)}"${selected(soundLab.midiInputId, input.id)}>${esc(input.name)}</option>`).join('')}
            </select>
            <p class="sonic-forge-note" data-sf-midi-status>${esc(midi.message || 'MIDI is off.')}</p>
        </section>`;
    }

    function renderRecording(soundLab, recording) {
        return `<section class="sonic-forge-block sonic-forge-recording">
            <header><div><span class="sonic-forge-eyebrow">Capture</span><h3>Record a Session</h3>
                <p>Download directly, or save through localhost and add the result to Music Library.</p></div></header>
            <label><span>Recording name</span>
                <input type="text" maxlength="120" value="${esc(soundLab.recordingName)}" data-sf-field="recording-name">
            </label>
            <label><span>Local recording folder</span>
                <input type="text" maxlength="500" value="${esc(soundLab.recordingDir)}"
                    placeholder="C:\\Music\\Sonic Forge" data-sf-field="recording-dir">
            </label>
            <div class="sonic-forge-button-row">
                <button type="button" data-af-action="soundlab-toggle-record" class="${recording.recording ? 'is-recording' : ''}">
                    ${recording.recording ? 'Stop Recording' : 'Record'}
                </button>
                <button type="button" data-af-action="soundlab-download-recording" ${recording.available ? '' : 'disabled'}>Download</button>
                <button type="button" data-af-action="soundlab-save-recording" ${recording.available ? '' : 'disabled'}>Add to Music Library</button>
            </div>
            <p class="sonic-forge-note" data-sf-recording-status>${esc(recording.message)}</p>
        </section>`;
    }

    function renderHero(soundLab, engineStatus) {
        const route = window.EveAudioflixState?.ensure?.();
        const hasCredential = !!window.EveAudioflixSoundLabEngine?.getApiKey?.();
        const routeLabel = route?.nativeBridgeEnabled
            ? `Native: ${route.nativeOutputLabel || 'selected output'}`
            : (route?.preferredSinkLabel || 'Browser default output');
        return `<section class="sonic-forge-hero">
            <div class="sonic-forge-copy">
                <span class="sonic-forge-eyebrow">Generative Audio Workbench</span>
                <h2>Sonic Forge</h2>
                <p>Shape a continuous composition with weighted prompts, live steering, MIDI, presets, and Audioflix routing.</p>
                <div class="sonic-forge-status ${engineStatus.phase === 'error' ? 'is-error' : ''}">
                    <i></i><span data-sf-status-message>${esc(engineStatus.message)}</span>
                </div>
            </div>
            <div class="sonic-forge-transport">
                <div class="sonic-forge-credential-note ${hasCredential ? 'is-ready' : 'is-missing'}">
                    <span>Gemini Link credential</span>
                    <b>${hasCredential ? 'Available from Session Controls' : 'Set it in Search Monitor Session Controls'}</b>
                </div>
                <div class="sonic-forge-button-row">
                    <button type="button" data-af-action="${engineStatus.connected ? 'soundlab-disconnect' : 'soundlab-connect'}"
                        data-sf-connect>${engineStatus.connected ? 'Disconnect' : 'Connect'}</button>
                    <button type="button" class="is-primary" data-af-action="${engineStatus.playing ? 'soundlab-pause' : 'soundlab-play'}"
                        data-sf-play>${engineStatus.playing ? 'Pause' : 'Generate'}</button>
                    <button type="button" data-af-action="soundlab-stop">Stop</button>
                    <button type="button" data-af-action="soundlab-reset">Reset Context</button>
                </div>
                <small>Sonic Forge reuses the credential managed by Gemini Link. Credentials and generated audio never enter datapack backups.</small>
            </div>
            <div class="sonic-forge-route"><span>Output route</span><b>${esc(routeLabel)}</b></div>
            <div class="sonic-forge-visual">
                <canvas data-sf-visualizer aria-label="Live Sonic Forge audio visualization"></canvas>
                <div class="sonic-forge-visual-controls">
                    <select data-sf-field="visualizer-mode" aria-label="Visualizer mode">
                        ${window.EveAudioflixSoundLabState.modes.map((mode) => `<option value="${mode}"${selected(soundLab.visualizerMode, mode)}>${esc(window.EveAudioflixSoundLabState.modeLabel(mode))}</option>`).join('')}
                    </select>
                    <label>Volume <input type="range" min="0" max="1" step="0.01" value="${esc(soundLab.masterVolume)}" data-sf-field="master-volume"></label>
                    <span data-sf-session-time title="Current session elapsed time and generated audio received. Lyria does not expose a fixed session countdown.">00:00 live / 00:00 generated</span>
                    <span data-sf-buffer>${Number(engineStatus.bufferedSeconds || 0).toFixed(1)}s buffered</span>
                </div>
            </div>
        </section>`;
    }

    function render() {
        const soundLab = window.EveAudioflixSoundLabState?.ensure?.() || {};
        const engineStatus = window.EveAudioflixSoundLabEngine?.getStatus?.() || { phase: 'idle', message: 'Engine loading.' };
        const recording = window.EveAudioflixSoundLabRecording?.getStatus?.() || { recording: false, available: false, message: '' };
        const midi = window.EveAudioflixSoundLabMidi?.getStatus?.() || { inputs: [], message: 'MIDI is off.' };
        const advanced = window.EveAudioflixSoundLabUiAdvanced;
        return `<div class="sonic-forge" data-audioflix-soundlab>
            ${renderHero(soundLab, engineStatus)}
            <div class="sonic-forge-workspace">
                ${renderPrompts(soundLab)}
                <div class="sonic-forge-main-grid">
                    ${renderConfig(soundLab)}
                    ${advanced?.renderEffects?.(soundLab) || ''}
                    ${advanced?.renderModulation?.(soundLab) || ''}
                    ${advanced?.renderDrift?.(soundLab) || ''}
                </div>
                <div class="sonic-forge-side-grid">
                    ${advanced?.renderSceneSlots?.(soundLab) || ''}
                    ${renderPresets(soundLab)}
                    ${advanced?.renderRendered?.(soundLab) || ''}
                    ${advanced?.renderDiagnostics?.(soundLab, engineStatus) || ''}
                    ${renderMidi(soundLab, midi)}
                    ${renderRecording(soundLab, recording)}
                </div>
            </div>
        </div>`;
    }

    Object.assign(ns, { ready: true, render, esc });
})();
