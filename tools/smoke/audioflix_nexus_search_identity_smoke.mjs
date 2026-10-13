#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.nexus.ui.js'), 'utf8');

const document = { activeElement: null };
const window = { EveAudioflixNexusUi: {} };
const context = vm.createContext({ window, document, Map, Number, String, Object });
vm.runInContext(source, context, { filename: 'audioflix.nexus.ui.js' });

const oldResults = { dataset: { afNexusResults: 'music' }, scrollTop: 73 };
const newResults = { dataset: { afNexusResults: 'music' }, scrollTop: 0 };
const oldInput = {
    dataset: { afType: 'music' },
    value: 'old query',
    selectionStart: 2,
    selectionEnd: 6,
    selectionDirection: 'forward',
    matches(selector) { return selector === '[data-af-nexus-search]'; },
    focus() { document.activeElement = this; },
    setSelectionRange(start, end, direction) {
        this.selectionStart = start;
        this.selectionEnd = end;
        this.selectionDirection = direction;
    }
};
const replacement = {
    dataset: { afType: 'music' },
    value: 'canonical query',
    replacedWith: null,
    replaceWith(node) { this.replacedWith = node; }
};
let phase = 'before';
const root = {
    contains(node) { return node === oldInput; },
    querySelectorAll(selector) {
        if (selector !== '[data-af-nexus-results]') return [];
        return [phase === 'before' ? oldResults : newResults];
    },
    querySelector(selector) {
        return selector.includes('[data-af-nexus-search]') && selector.includes('music') ? replacement : null;
    }
};

document.activeElement = oldInput;
const seen = window.EveAudioflixNexusUi.captureScroll(root);
phase = 'after';
document.activeElement = { tagName: 'BODY' };
window.EveAudioflixNexusUi.restoreScroll(root, seen);

assert.equal(newResults.scrollTop, 73, 'Nexus result scroll survives a structural rerender');
assert.equal(replacement.replacedWith, oldInput, 'The active Nexus search control is reattached instead of replaced');
assert.equal(document.activeElement, oldInput, 'The original search control regains focus');
assert.equal(oldInput.value, 'canonical query', 'The preserved node adopts the canonical rerendered query');
assert.equal(oldInput.selectionStart, 2);
assert.equal(oldInput.selectionEnd, 6);
assert.equal(oldInput.selectionDirection, 'forward');

// A late async rerender (ported sounds / disk audit finishing after open) can land while Nexus is
// open but before the user clicks into search. The control still keeps its identity, adopts the
// canonical attributes/value, and is not focused on the user's behalf.
const idleInput = { dataset: { afType: 'music' }, value: 'stale', attributes: [{ name: 'placeholder', value: 'old' }, { name: 'data-stale', value: '1' }],
    removed: [], set: {}, focused: false,
    hasAttribute(name) { return name in this.set; }, removeAttribute(name) { this.removed.push(name); }, setAttribute(name, value) { this.set[name] = value; },
    matches(selector) { return selector === '[data-af-nexus-search]'; }, focus() { this.focused = true; } };
const idleReplacement = { dataset: { afType: 'music' }, value: '', attributes: [{ name: 'placeholder', value: 'Search 4200 tracks' }],
    hasAttribute(name) { return name === 'placeholder'; }, replacedWith: null, replaceWith(node) { this.replacedWith = node; } };
let idlePhase = 'before';
const idleRoot = { contains() { return false; }, querySelectorAll() { return []; },
    querySelector(selector) { return selector.includes('[data-af-nexus-search]') ? (idlePhase === 'before' ? idleInput : idleReplacement) : null; } };
document.activeElement = { tagName: 'BUTTON' };
const idleSeen = window.EveAudioflixNexusUi.captureScroll(idleRoot);
idlePhase = 'after';
window.EveAudioflixNexusUi.restoreScroll(idleRoot, idleSeen);
assert.equal(idleReplacement.replacedWith, idleInput, 'An open but unfocused Nexus search control keeps its DOM identity');
assert.equal(idleInput.value, '', 'The preserved idle node adopts the canonical rerendered query');
assert.equal(idleInput.set.placeholder, 'Search 4200 tracks', 'The preserved node adopts canonical attributes');
assert.deepEqual(idleInput.removed, ['data-stale'], 'Attributes the rerender dropped are removed');
assert.equal(idleInput.focused, false, 'An unfocused control is never focused on the user\'s behalf');

console.log('AUDIOFLIX_NEXUS_SEARCH_IDENTITY_SMOKE_OK');
