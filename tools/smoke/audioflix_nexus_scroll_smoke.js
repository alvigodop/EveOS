/**
 * audioflix_nexus_scroll_smoke.js
 *
 * Pressing Play in Nexus Audio Link threw you back to the top of the list.
 *
 * The results list scrolls inside ITSELF -- it carries max-height plus overflow-y, so it is a
 * separate scroll container from the panel around it. rerender() restored the panel's scroll and
 * the info body's scroll, but nothing restored this one, and rerender rebuilds the overlay wholesale
 * via innerHTML. Playing a track rerenders. So every Play on anything below the fold rebuilt the
 * list at scrollTop 0 and you had to scroll back down to reach the next track.
 *
 * Keyed by type on purpose: music and sounds each render their own results container, and a single
 * remembered offset would put one list at the other's position.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

/** Minimal stand-in for the two results containers inside the overlay. */
function makeOverlay(entries) {
    const nodes = entries.map(([type, scrollTop]) => ({ dataset: { afNexusResults: type }, scrollTop }));
    return {
        nodes,
        querySelectorAll: (selector) => (selector === '[data-af-nexus-results]' ? nodes : [])
    };
}

function loadNexusUi() {
    const sandbox = { console: { log() {}, warn() {}, error() {} }, document: { createElement: () => ({}) } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(A, 'audioflix.nexus.ui.js'), 'utf8'), sandbox);
    return sandbox.window.EveAudioflixNexusUi;
}

function main() {
    const ui = loadNexusUi();
    assert(typeof ui.captureScroll === 'function' && typeof ui.restoreScroll === 'function',
        'the Nexus module owns capturing and restoring its own list scroll');

    // ---- a rerender must not move the list ----
    const before = makeOverlay([['music', 640], ['sound', 120]]);
    const seen = ui.captureScroll(before);
    const after = makeOverlay([['music', 0], ['sound', 0]]);   // freshly rebuilt by innerHTML
    ui.restoreScroll(after, seen);
    assert(after.nodes[0].scrollTop === 640,
        'the music list returns to where it was, so Play does not throw you back to the top');
    assert(after.nodes[1].scrollTop === 120, 'and the sounds list keeps its own separate position');

    // ---- the two lists must not swap positions ----
    const swapped = makeOverlay([['sound', 0], ['music', 0]]);
    ui.restoreScroll(swapped, seen);
    assert(swapped.nodes[0].scrollTop === 120 && swapped.nodes[1].scrollTop === 640,
        'positions follow the type, not the order the containers happen to render in');

    // ---- a list that was at the top stays there ----
    const fresh = makeOverlay([['music', 0]]);
    ui.restoreScroll(fresh, ui.captureScroll(makeOverlay([['music', 0]])));
    assert(fresh.nodes[0].scrollTop === 0, 'an untouched list is left alone');

    // ---- absent containers must not throw ----
    ui.restoreScroll(makeOverlay([]), seen);
    ui.restoreScroll(null, seen);
    ui.restoreScroll(makeOverlay([['music', 0]]), null);

    // ---- and rerender actually calls them, or none of the above matters ----
    const rerender = fs.readFileSync(path.join(A, 'audioflix.ui.js'), 'utf8');
    const body = rerender.slice(rerender.indexOf('function rerender()'));
    const scoped = body.slice(0, body.indexOf('\n    }'));
    const captureAt = scoped.indexOf('captureScroll');
    const renderAt = scoped.indexOf('overlay.innerHTML = renderPanel()');
    const restoreAt = scoped.indexOf('restoreScroll');
    assert(captureAt !== -1 && renderAt !== -1 && restoreAt !== -1,
        'rerender captures and restores the list scroll around the rebuild');
    assert(captureAt < renderAt && renderAt < restoreAt,
        'capture happens BEFORE the innerHTML rebuild and restore after it; either side of that'
        + ' ordering and the offset read is the one already reset to zero');

    console.log('nexus scroll OK — the list holds its position across a rerender');
    console.log('AUDIOFLIX_NEXUS_SCROLL_SMOKE_OK');
}

main();
