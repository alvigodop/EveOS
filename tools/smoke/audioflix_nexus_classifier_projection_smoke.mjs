#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-nexus-classifier-projection.json');
const results = [], evidence = {};
let current = '';
const check = async (id, work) => { current = id; await work(); results.push(id); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

let entries = [], facet = '', selectableCalls = [];
const window = {
    EveAudioflixClassifiers: {
        selectableEntries() { selectableCalls.push(entries); return entries; }
    },
    EveAudioflixNexus: {
        items: () => [],
        facets: () => ({ artists: [], groups: [], folders: [], durations: [] }),
        filter: () => [],
        integrityReport: () => ({ protected: true, recoveryEntries: 0, staleBindings: 0, orphanPlaylistLinks: 0 }),
        recordSearch() {}
    },
    EveAudioflixDuplicates: { duplicateBadgeSummary: () => ({ hard: false, soft: false, any: false }) }
};
window.window = window;
const context = vm.createContext({ window, document: { activeElement: null }, console });
for (const file of ['audioflix.classifiers.ui.js', 'audioflix.nexus.ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', file), 'utf8'), context, { filename: file });
}
const classifiersUi = window.EveAudioflixClassifiersUi.create({
    esc, closeSvg: 'x', getManagerOpen: () => false, getManagerDetailId: () => '', getFrontendOpen: () => false
});
const forwarded = [];
const nexusUi = window.EveAudioflixNexusUi.create({
    esc,
    getNexusState: () => ({ open: true, type: 'music', query: '', facet, selectedIds: [] }),
    getPorted: () => [],
    renderClassifierChips(activeFacet, preparedEntries) {
        forwarded.push({ activeFacet, preparedEntries });
        return classifiersUi.renderNexusChips(activeFacet, preparedEntries);
    }
});
const setEntries = value => { entries = value; selectableCalls = []; forwarded.length = 0; };
const focusEntries = () => [
    ['class:auto:url', [{ id: 'one' }, { id: 'two' }], '🌐 URL Track'],
    ['class:manual:Focus', [{ id: 'two' }], '🏷 Focus']
];

try {
    await check('one-owner-scan-per-music-build-and-none-for-sound', () => {
        facet = 'classifier::class:manual:Focus'; setEntries(focusEntries());
        nexusUi.renderPanel('music');
        const musicCalls = selectableCalls.length, projected = selectableCalls[0], received = forwarded[0]?.preparedEntries;
        setEntries(focusEntries());
        const soundHtml = nexusUi.renderPanel('sound');
        const soundCalls = selectableCalls.length;
        evidence.ownerCalls = { musicCalls, soundCalls };
        assert.deepEqual({ musicCalls, soundCalls }, { musicCalls: 1, soundCalls: 0 },
            'A music panel owns one classifier projection; a sound panel owns none');
        assert.equal(received, projected, 'The exact prepared entries array reaches the chip renderer');
        assert.equal(forwarded.length, 0, 'Sound rendering never invokes the music classifier renderer');
        assert.doesNotMatch(soundHtml, /Classifiers \(/);
    });

    await check('panel-output-stays-fresh-with-counts-and-active-facet', () => {
        facet = 'classifier::class:manual:Focus'; setEntries(focusEntries());
        const first = nexusUi.renderPanel('music');
        assert.equal(selectableCalls.length, 1); assert.equal(forwarded[0].preparedEntries, selectableCalls[0]);
        assert.match(first, /Classifiers \(2\)/);
        assert.match(first, /🌐 URL Track \(2\)/);
        assert.match(first, /data-af-facet="classifier::class:manual:Focus"[^>]*background:rgba\(192,132,252,0\.3\)[^>]*>🏷 Focus \(1\)<\/button>/);

        facet = 'classifier::class:manual:Fresh';
        setEntries([['class:manual:Fresh', [{ id: 'a' }, { id: 'b' }, { id: 'c' }], '🏷 Fresh & New']]);
        const second = nexusUi.renderPanel('music');
        assert.equal(selectableCalls.length, 1); assert.equal(forwarded[0].preparedEntries, selectableCalls[0]);
        assert.match(second, /Classifiers \(1\)/);
        assert.match(second, /data-af-facet="classifier::class:manual:Fresh"[^>]*background:rgba\(192,132,252,0\.3\)[^>]*>🏷 Fresh &amp; New \(3\)<\/button>/);
        assert.doesNotMatch(second, /URL Track|manual:Focus/);
    });

    await check('standalone-computes-fresh-and-explicit-empty-stays-empty', () => {
        facet = 'classifier::class:manual:Solo';
        setEntries([['class:manual:Solo', [{ id: 'one' }], '🏷 Solo']]);
        const first = classifiersUi.renderNexusChips(facet);
        entries = [['class:manual:Later', [{ id: 'one' }, { id: 'two' }], '🏷 Later']];
        const second = classifiersUi.renderNexusChips('classifier::class:manual:Later');
        assert.equal(selectableCalls.length, 2, 'Standalone calls recompute rather than sharing a render cache');
        assert.match(first, /🏷 Solo \(1\)/); assert.doesNotMatch(first, /Later/);
        assert.match(second, /🏷 Later \(2\)/); assert.doesNotMatch(second, /Solo/);

        setEntries([['class:manual:Hidden', [{ id: 'hidden' }], 'Hidden']]);
        assert.equal(classifiersUi.renderNexusChips('', []), '', 'A supplied empty projection is not an absent projection');
        assert.equal(selectableCalls.length, 0, 'Explicit empty entries never trigger a fallback scan');
    });

    await check('audioflix-wrapper-forwards-the-prepared-array', () => {
        const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.ui.js'), 'utf8');
        const wiring = source.match(/renderClassifierChips:\s*\(\s*facet\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*uiClass\.renderNexusChips\(\s*facet\s*,\s*([A-Za-z_$][\w$]*)\s*\)/);
        assert.ok(wiring, 'The Audioflix wrapper must accept and forward prepared classifier entries');
        assert.equal(wiring[1], wiring[2], 'The wrapper forwards the same prepared argument without replacement');
    });

    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: true, results, evidence }, null, 2));
    console.log(`AUDIOFLIX_NEXUS_CLASSIFIER_PROJECTION_SMOKE_OK passed=${results.length}/${results.length}`);
} catch (error) {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: false, current, results, evidence, error: String(error.stack || error) }, null, 2));
    console.error(`AUDIOFLIX_NEXUS_CLASSIFIER_PROJECTION_SMOKE_FAIL ${current}\n${String(error.stack || error).split('\n').slice(0, 30).join('\n')}`);
    process.exitCode = 1;
}
