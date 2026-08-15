/**
 * audioflix_instagram_playlist_panel_smoke.js
 *
 * Two halves of the same complaint: the reel list showed "Instagram Reel 1..22" instead of song
 * names, and the URLs sat in one bulk textarea detached from the reels they belonged to.
 *
 * The names were not a display bug. entryPatch -- the patch a metadata refresh applies to each
 * existing track -- carried image, sourceProvider and playlistPosition, and no title at all. So the
 * backend resolved real titles and the reconcile threw every one of them away, which is why
 * "Refresh metadata" appeared to do nothing. Fixing the panel alone would have changed nothing.
 *
 * The placeholder guard matters as much as the patch: BOTH sides fall back to "Instagram Reel N"
 * when they have no real name -- the client numbers them on import, the backend does the same when
 * extraction fails. Patching that through would let a refresh overwrite a genuine name, or one the
 * user typed, with a placeholder.
 *
 * And the save path: each reel now owns a URL field, so the form carries many inputs named `link`.
 * FormData.get() returns only the first, so anything but getAll() silently saves row one and
 * discards the other twenty-one.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const read = (name) => fs.readFileSync(path.join(A, name), 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function main() {
    const playlists = read('audioflix.playlists.instagram.js');
    const ui = read('audioflix.playlists.instagram.ui.js');
    const forms = fs.readFileSync(path.join(A, 'audioflix.ui.forms.js'), 'utf8');
    const css = read('audioflix.instagram.css');

    // ---- a refresh must actually rename the tracks ----
    const patch = playlists.slice(playlists.indexOf('function entryPatch('));
    const patchBody = patch.slice(0, patch.indexOf('\n    }'));
    // Scoped to the returned object: `title` also appears as a local, so a loose match passes even
    // when the patch no longer carries it -- which is the exact regression this guards.
    assert(/\.\.\.\(title \? \{ title \} : \{\}\)/.test(patchBody),
        'entryPatch spreads the title into the patch; without it the backend resolves real names'
        + ' and the reconcile discards them, which is why Refresh metadata renamed nothing');
    assert(/realTitle\(/.test(patchBody),
        'the title goes through the placeholder filter rather than being trusted raw');

    // ---- ...but must never replace a real name with a placeholder ----
    assert(/PLACEHOLDER_TITLE\s*=\s*\/\^instagram/i.test(playlists),
        'the "Instagram Reel N" shape is recognised as a placeholder');
    const guard = playlists.slice(playlists.indexOf('function realTitle('));
    assert(guard.slice(0, guard.indexOf('\n    }')).includes('PLACEHOLDER_TITLE.test'),
        'realTitle rejects the placeholder, so a failed extraction cannot overwrite a good name');

    // ---- every per-row URL must survive the save ----
    assert(/data\.getAll\('link'\)/.test(forms),
        'the save collects every URL field; get() would keep row one and drop the rest');
    assert(!/setPlaylistLink\?\.\(groupName, data\.get\('link'\)\)/.test(forms),
        'the single-value read is gone');

    // ---- the URL belongs to its reel, not to a detached box ----
    const render = ui.slice(ui.indexOf('function renderLinkForm('));
    const renderBody = render.slice(0, render.indexOf('\n    function '));
    assert(/audioflix-instagram-source-row/.test(renderBody), 'each reel renders as its own row');
    assert(/name="link" value="\$\{esc\(item\.url/.test(renderBody),
        'the row carries an editable field holding THAT reel\'s URL');
    // The title attribute also reads item.title, so matching that alone passes even when the
    // visible label is regenerated from the index -- which is the thing being complained about.
    assert(/>\$\{esc\(item\.title \|\| 'Untitled Reel'\)\}</.test(renderBody),
        'the row DISPLAYS the track title rather than a generated label');
    assert(!/Instagram Reel \$\{index/.test(renderBody),
        'no row rebuilds a numbered placeholder for display');
    assert(!/Editable Reel URLs/.test(renderBody),
        'the detached bulk textarea of every URL is gone');
    assert(/rows="2"/.test(renderBody) && /Add more Reels/.test(renderBody),
        'appending new reels is still possible; rows can only edit what already exists');

    // ---- the rows have to be inside the form, or Save cannot see them ----
    const formAt = renderBody.indexOf('<form');
    const listAt = renderBody.indexOf('audioflix-instagram-source-list');
    const submitAt = renderBody.indexOf('data-af-action="submit-form"');
    assert(formAt !== -1 && formAt < listAt && listAt < submitAt,
        'the row list sits inside the form and before the submit, so FormData collects every field');

    // ---- and the layout exists, or the rows render as bare text ----
    assert(/\.audioflix-instagram-source-row\s*\{/.test(css), 'the row layout is styled');
    assert(/\.audioflix-instagram-source-list\s*\{[^}]*overflow-y/.test(css),
        'a long collection scrolls inside the list instead of stretching the panel');

    console.log('instagram playlist panel OK — titles reach the tracks, URLs live with their reel');
    console.log('AUDIOFLIX_INSTAGRAM_PLAYLIST_PANEL_SMOKE_OK');
}

main();
