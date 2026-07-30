window.EveAudioflixSoundLabUiAdvanced = window.EveAudioflixSoundLabUiAdvanced || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabUiAdvanced;
    if (ns.ready) return;

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const checked = (value) => value === true ? ' checked' : '';
    const selected = (value, expected) => value === expected ? ' selected' : '';

    function effectRange(group, field, label, value, min, max, step, suffix = '') {
        return `<label class="sonic-forge-mini-control">
            <span>${esc(label)} <output>${esc(value)}${esc(suffix)}</output></span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${esc(value)}"
                data-sf-field="effect" data-sf-effect="${group}" data-sf-effect-key="${field}">
        </label>`;
    }

    function effectCard(name, key, enabled, body) {
        return `<article class="sonic-forge-effect-card ${enabled ? 'is-on' : ''}">
            <header><div><span>${esc(name)}</span><small>${enabled ? 'Active' : 'Neutral bypass'}</small></div>
                <label class="sonic-forge-compact-toggle">
                    <input type="checkbox" data-sf-field="effect" data-sf-effect="${key}"
                        data-sf-effect-key="enabled"${checked(enabled)}><i></i>
                </label>
            </header>
            <div class="sonic-forge-effect-controls">${body}</div>
        </article>`;
    }

    function renderEffects(soundLab) {
        const fx = soundLab.effects || {};
        return `<section class="sonic-forge-block sonic-forge-effects">
            <header><div><span class="sonic-forge-eyebrow">Persistent DSP</span><h3>Effects Rack</h3>
                <p>One reusable graph. Disabled stages are neutral; recordings and native routing follow the processed mix.</p>
            </div></header>
            <div class="sonic-forge-effects-grid">
                ${effectCard('Tone Filter', 'filter', fx.filter?.enabled, `
                    <label class="sonic-forge-mini-control"><span>Shape</span>
                        <select data-sf-field="effect" data-sf-effect="filter" data-sf-effect-key="type">
                            ${['lowpass', 'highpass', 'bandpass', 'notch'].map((type) =>
                                `<option value="${type}"${selected(fx.filter?.type, type)}>${type}</option>`).join('')}
                        </select>
                    </label>
                    ${effectRange('filter', 'frequency', 'Cutoff', fx.filter?.frequency, 40, 20000, 10, ' Hz')}
                    ${effectRange('filter', 'q', 'Resonance', fx.filter?.q, 0.1, 18, 0.1)}
                    ${effectRange('filter', 'mix', 'Mix', fx.filter?.mix, 0, 1, 0.01)}
                `)}
                ${effectCard('Echo Field', 'delay', fx.delay?.enabled, `
                    ${effectRange('delay', 'time', 'Time', fx.delay?.time, 0.01, 1.5, 0.01, 's')}
                    ${effectRange('delay', 'feedback', 'Feedback', fx.delay?.feedback, 0, 0.88, 0.01)}
                    ${effectRange('delay', 'mix', 'Mix', fx.delay?.mix, 0, 0.75, 0.01)}
                `)}
                ${effectCard('Space', 'reverb', fx.reverb?.enabled, `
                    ${effectRange('reverb', 'decay', 'Decay', fx.reverb?.decay, 0.2, 8, 0.1, 's')}
                    ${effectRange('reverb', 'mix', 'Mix', fx.reverb?.mix, 0, 0.75, 0.01)}
                `)}
                ${effectCard('Stereo Field', 'stereo', fx.stereo?.enabled, `
                    ${effectRange('stereo', 'width', 'Width', fx.stereo?.width, 0, 1.5, 0.01)}
                `)}
                ${effectCard('Safety Limiter', 'limiter', fx.limiter?.enabled !== false, `
                    ${effectRange('limiter', 'threshold', 'Ceiling', fx.limiter?.threshold, -24, 0, 0.5, ' dB')}
                    ${effectRange('limiter', 'ratio', 'Ratio', fx.limiter?.ratio, 1, 20, 0.5)}
                    ${effectRange('limiter', 'release', 'Release', fx.limiter?.release, 0.01, 1, 0.01, 's')}
                `)}
            </div>
        </section>`;
    }

    function modulationRow(key, label, detail, mapping) {
        return `<label class="sonic-forge-mod-row">
            <input type="checkbox" data-sf-field="modulation-map" data-sf-modulation="${key}"${checked(mapping?.enabled)}>
            <span><b>${esc(label)}</b><small>${esc(detail)}</small></span>
            <input type="range" min="0" max="1" step="0.01" value="${esc(mapping?.depth ?? 0)}"
                data-sf-field="modulation-depth" data-sf-modulation="${key}" aria-label="${esc(label)} depth">
        </label>`;
    }

    // Automatic drift. Distinct from the auto pills on tempo/density/brightness: those hand a
    // parameter to the model, this one keeps moving the parameters the model never chooses.
    function driftLane(lane, key, title, blurb) {
        const D = window.EveAudioflixSoundLabDrift;
        const ms = D?.intervalFor?.(lane.rate) || 0;
        return `<div class="sonic-forge-drift-lane">
            <div class="sonic-forge-drift-top">
                <div><b>${esc(title)}</b><small>${esc(blurb)}</small></div>
                <label class="sonic-forge-compact-toggle">
                    <input type="checkbox" data-sf-field="drift-enabled" data-sf-drift="${esc(key)}"${checked(lane.enabled)}><i></i>
                </label>
            </div>
            <div class="sonic-forge-drift-rows${lane.enabled ? '' : ' is-off'}">
                <label class="sonic-forge-mini-control">
                    <span>Rate <output>${ms}ms</output></span>
                    <input type="range" min="0" max="1" step="0.01" value="${esc(lane.rate)}"
                        data-sf-field="drift-rate" data-sf-drift="${esc(key)}"${lane.enabled ? '' : ' disabled'}>
                </label>
                <label class="sonic-forge-mini-control">
                    <span>Depth <output>${Math.round(Number(lane.depth) * 100)}%</output></span>
                    <input type="range" min="0" max="1" step="0.01" value="${esc(lane.depth)}"
                        data-sf-field="drift-depth" data-sf-drift="${esc(key)}"${lane.enabled ? '' : ' disabled'}>
                </label>
            </div>
        </div>`;
    }

    function renderDrift(soundLab) {
        const drift = soundLab.drift || {};
        const params = drift.params || {};
        const prompts = drift.prompts || {};
        return `<section class="sonic-forge-block sonic-forge-drift">
            <header><div><span class="sonic-forge-eyebrow">Automatic Variation</span><h3>Drift</h3>
                <p>A slow bounded walk around your settings, so a long take keeps evolving. Tempo and
                scale are excluded: changing either restarts the generation context.</p>
            </div></header>
            ${driftLane(params, 'params', 'Sampler controls', 'Nudges guidance, temperature and top K.')}
            ${driftLane(prompts, 'prompts', 'Prompt blend', 'Nudges the weight of one active direction at a time.')}
        </section>`;
    }

    function renderModulation(soundLab) {
        const mod = soundLab.modulation || {};
        return `<section class="sonic-forge-block sonic-forge-modulation">
            <header><div><span class="sonic-forge-eyebrow">Bounded Motion</span><h3>Signal Modulation</h3>
                <p>Audio energy can move local DSP only. It never rewrites prompts or floods the Lyria steering API.</p>
            </div><label class="sonic-forge-compact-toggle">
                <input type="checkbox" data-sf-field="modulation-enabled"${checked(mod.enabled)}><i></i>
            </label></header>
            <div class="sonic-forge-mod-list">
                ${modulationRow('lowToFilter', 'Low band -> filter', 'Bass energy opens or closes the cutoff.', mod.lowToFilter)}
                ${modulationRow('rmsToReverb', 'Level -> space', 'Overall energy adds a bounded reverb lift.', mod.rmsToReverb)}
                ${modulationRow('highToWidth', 'High band -> width', 'Upper detail gently expands the stereo field.', mod.highToWidth)}
                <label class="sonic-forge-mini-control"><span>Smoothing <output>${esc(mod.smoothing)}</output></span>
                    <input type="range" min="0" max="0.98" step="0.01" value="${esc(mod.smoothing)}"
                        data-sf-field="modulation-smoothing">
                </label>
            </div>
        </section>`;
    }

    function renderSceneSlots(soundLab) {
        const slots = soundLab.sceneSlots || {};
        return `<section class="sonic-forge-block sonic-forge-scene-slots">
            <header><div><span class="sonic-forge-eyebrow">Performance Memory</span><h3>A/B Scene Morph</h3>
                <p>Capture two complete scenes, then move between them without rebuilding the graph.</p></div></header>
            <div class="sonic-forge-scene-pair">
                ${['a', 'b'].map((slot) => `<article class="${slots[slot] ? 'is-ready' : ''}">
                    <b>Scene ${slot.toUpperCase()}</b><span>${slots[slot] ? 'Captured' : 'Empty'}</span>
                    <button type="button" data-af-action="soundlab-capture-scene" data-sf-slot="${slot}">Capture</button>
                    <button type="button" data-af-action="soundlab-apply-scene" data-sf-slot="${slot}"
                        ${slots[slot] ? '' : 'disabled'}>Apply</button>
                </article>`).join('')}
            </div>
            <label class="sonic-forge-mini-control"><span>Morph time <output>${esc(soundLab.sceneMorphSeconds)}s</output></span>
                <input type="range" min="0.5" max="20" step="0.5" value="${esc(soundLab.sceneMorphSeconds)}"
                    data-sf-field="scene-morph-seconds">
            </label>
            <div class="sonic-forge-button-row">
                <button type="button" data-af-action="soundlab-morph-scene" data-sf-from="a" data-sf-to="b"
                    ${slots.a && slots.b ? '' : 'disabled'}>A -> B</button>
                <button type="button" data-af-action="soundlab-morph-scene" data-sf-from="b" data-sf-to="a"
                    ${slots.a && slots.b ? '' : 'disabled'}>B -> A</button>
                <button type="button" data-af-action="soundlab-cancel-morph">Hold</button>
            </div>
        </section>`;
    }

    function renderDiagnostics(soundLab) {
        const continuity = soundLab.continuity || {};
        const view = soundLab.diagnostics || {};
        const metrics = window.EveAudioflixSoundLabEngine?.getDiagnostics?.() || {};
        const playback = metrics.playback || {};
        const native = metrics.native || {};
        return `<section class="sonic-forge-block sonic-forge-diagnostics">
            <header><div><span class="sonic-forge-eyebrow">Continuity</span><h3>Stream Health</h3>
                <p>Recovery is bounded and retains play intent; it never creates a second graph or session.</p></div></header>
            <div class="sonic-forge-metric-grid" data-sf-diagnostics>
                <span><b data-sf-metric="jitter">${Number(playback.jitterMs || 0).toFixed(0)} ms</b><small>arrival jitter</small></span>
                <span><b data-sf-metric="underruns">${Number(playback.underruns || 0)}</b><small>underruns</small></span>
                <span><b data-sf-metric="native">${Number(native.queuedMs || 0).toFixed(0)} ms</b><small>native queue</small></span>
                <span><b data-sf-metric="drops">${Number(native.dropped || 0)}</b><small>route drops</small></span>
            </div>
            <div class="sonic-forge-switches">
                <label><input type="checkbox" data-sf-field="continuity-auto"${checked(continuity.autoReconnect)}> Auto reconnect</label>
                <label>Attempts <input type="number" min="0" max="8" value="${esc(continuity.maxAttempts)}"
                    data-sf-field="continuity-attempts"></label>
                <label><input type="checkbox" data-sf-field="diagnostic" data-sf-diagnostic="frequencyLabels"${checked(view.frequencyLabels)}> Hz labels</label>
                <label><input type="checkbox" data-sf-field="diagnostic" data-sf-diagnostic="beatGrid"${checked(view.beatGrid)}> beat grid</label>
                <label><input type="checkbox" data-sf-field="diagnostic" data-sf-diagnostic="showTelemetry"${checked(view.showTelemetry)}> visual telemetry</label>
            </div>
        </section>`;
    }

    function renderRendered(soundLab) {
        const render = soundLab.render || {};
        const status = window.EveAudioflixSoundLabRendered?.getStatus?.() || {};
        const hidden = soundLab.showPaidApiFeatures === true ? '' : ' hidden';
        return `<section class="sonic-forge-block sonic-forge-rendered"${hidden}>
            <header><div><span class="sonic-forge-eyebrow">Bounded Render Lane</span><h3>Lyria 3 Render</h3>
                <p>Create a finished clip separately from the continuous realtime session.</p></div></header>
            <label><span>Render prompt</span>
                <textarea maxlength="1200" rows="3" data-sf-field="render-prompt"
                    placeholder="Blank uses the current weighted scene">${esc(render.prompt)}</textarea>
            </label>
            <div class="sonic-forge-inline-form">
                <select data-sf-field="render-model">
                    <option value="lyria-3-clip-preview"${selected(render.model, 'lyria-3-clip-preview')}>Clip (30 sec)</option>
                    <option value="lyria-3-pro-preview"${selected(render.model, 'lyria-3-pro-preview')}>Pro (long form)</option>
                </select>
                <input type="text" maxlength="120" value="${esc(render.name)}" data-sf-field="render-name">
            </div>
            <div class="sonic-forge-button-row">
                <button type="button" class="is-primary" data-af-action="soundlab-render"
                    ${status.generating ? 'disabled' : ''}>${status.generating ? 'Rendering...' : 'Render Scene'}</button>
                <button type="button" data-af-action="soundlab-render-download" ${status.available ? '' : 'disabled'}>Download</button>
                <button type="button" data-af-action="soundlab-render-library" ${status.available ? '' : 'disabled'}>Add to Library</button>
            </div>
            ${status.url ? `<audio controls preload="metadata" src="${esc(status.url)}"></audio>` : ''}
            <p class="sonic-forge-note" data-sf-render-status>${esc(status.message || '')}</p>
        </section>`;
    }

    Object.assign(ns, {
        ready: true,
        renderEffects,
        renderModulation,
        renderDrift,
        renderSceneSlots,
        renderDiagnostics,
        renderRendered
    });
})();
