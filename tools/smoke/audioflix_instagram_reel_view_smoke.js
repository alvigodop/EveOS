/**
 * audioflix_instagram_reel_view_smoke.js
 *
 * Two things about the Reel internal player.
 *
 * 1. The three view modes have to actually differ. Focus and Full Embed both rendered the same
 *    Instagram iframe and were told apart only by a CSS width, so "Focus" still showed the avatar,
 *    the username, the like count and the comment box -- everything except the focus it promised.
 *    Instagram's embed has no "player only" parameter, so the chrome is cropped instead: the iframe
 *    is offset up past the header and run taller than its box, and the box clips both ends. Direct
 *    Video keeps the resolved <video> and its native play bar. Full Embed is left alone.
 *
 * 2. The reel inspector is no longer what the internal player opens into. A linked reel is a track
 *    first, so the plain player comes up and plays it, with the reel view a deliberate second step
 *    behind a button -- and a close control to get back out of it.
 *
 * Pinned as source contracts. Driving this for real needs a live localhost resolver, an Instagram
 * embed and a rendered overlay, which is exactly why the modes could sit identical without anyone
 * noticing from the code alone.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function main() {
    const js = fs.readFileSync(path.join(A, 'audioflix.audio.url.instagram.js'), 'utf8');
    const css = fs.readFileSync(path.join(A, 'audioflix.instagram.css'), 'utf8');

    // ---- the internal player must NOT open straight into the reel inspector ----
    // Sliced to the next declaration, not to a brace: a brace heuristic shifts whenever lines move,
    // which silently changes what this covers and makes unrelated edits fail the wrong assertion.
    const playBody = js.slice(js.indexOf('async function playInstagram('),
        js.indexOf('function wireOpenButton('));
    assert(playBody.includes('data-reel-open'),
        'the plain player offers a button to open the reel view');
    assert(playBody.includes('showDirectVideo('),
        'the plain player still plays the track rather than waiting on the reel view');
    assert(!/host\.innerHTML[^;]*instagram-inspector/.test(playBody),
        'opening the internal player does not render the reel inspector up front');

    // ---- and the reel view must be closable ----
    // Scoped to the builder on purpose: matching data-reel-close anywhere in the file passes even
    // when the button never receives the attribute, because the querySelector still mentions it.
    const inspector = js.slice(js.indexOf('function buildInspector('));
    const inspectorBody = inspector.slice(0, inspector.indexOf('\n        }'));
    assert(/setAttribute\('data-reel-close'/.test(inspectorBody),
        'the reel view actually builds a close control');
    assert(/aria-label/.test(inspectorBody), 'the close control is labelled for screen readers');
    assert(/\[data-reel-close\]'\)\.addEventListener/.test(js),
        'the close control is wired, not just drawn');

    // ---- three modes, three different renderings ----
    assert(/function showFocus\(/.test(js), 'Focus has its own renderer');
    assert(/function showFullEmbed\(/.test(js), 'Full Embed has its own renderer');
    const focus = js.slice(js.indexOf('function showFocus('));
    const focusBody = focus.slice(0, focus.indexOf('\n        }'));
    assert(focusBody.includes('audioflix-instagram-crop'),
        'Focus wraps the embed in a crop element, so the chrome can be clipped away');
    const full = js.slice(js.indexOf('function showFullEmbed('));
    assert(!full.slice(0, full.indexOf('\n        }')).includes('audioflix-instagram-crop'),
        'Full Embed is NOT cropped -- it is the mode that deliberately shows everything');
    assert(/if \(mode === 'direct'\) return showDirectVideo\(/.test(js),
        'Direct Video routes to the resolved video, which carries the native play bar');
    assert(/video\.controls = true/.test(js),
        'the direct video exposes its controls, which is what makes it the "video plus play bar" mode');

    // ---- the crop has to actually clip, or Focus is just a narrower full embed again ----
    const stage = css.slice(css.indexOf('.audioflix-instagram-focus-stage {'));
    const stageRule = stage.slice(0, stage.indexOf('}'));
    assert(/aspect-ratio:\s*9\s*\/\s*16/.test(stageRule),
        'the focus stage is sized by aspect ratio, so the window ends where the video does;'
        + ' a fixed pixel height cannot track the reel and left the bottom chrome showing');
    const crop = css.slice(css.indexOf('.audioflix-instagram-crop {'));
    const cropRule = crop.slice(0, crop.indexOf('}'));
    assert(/overflow:\s*hidden/.test(cropRule), 'the crop clips its overflow');

    // The cover is not decoration. The embed is cross-origin, so its internal height cannot be
    // measured and no offset reliably lands on the end of the video -- without an opaque strip the
    // "View more / likes / comment" band stays on screen no matter how the crop is tuned.
    const cover = css.slice(css.indexOf('.audioflix-instagram-cover {'));
    const coverRule = cover.slice(0, cover.indexOf('}'));
    assert(/position:\s*absolute/.test(coverRule) && /bottom:\s*0/.test(coverRule),
        'the cover is pinned to the bottom of the stage');
    assert(/background:\s*#[0-9a-f]{3,8}/i.test(coverRule),
        'the cover is opaque, or the chrome shows straight through it');
    assert(/audioflix-instagram-cover/.test(js), 'focus mode actually renders the cover');
    const inner = css.slice(css.indexOf('.audioflix-instagram-crop .audioflix-instagram-embed {'));
    const innerRule = inner.slice(0, inner.indexOf('}'));
    assert(/top:\s*-\d+px/.test(innerRule),
        'the embed is offset upward, which is what hides the profile header');
    assert(/height:\s*calc\(100% \+ var\(--audioflix-embed-extra, \d+px\)\)/.test(innerRule),
        'the embed runs taller than the crop, via a tunable custom property, which is what pushes'
        + ' the like bar down out of the cropped window');

    // ---- a reel must play with no server at all ----
    // Focus and Full Embed are Instagram's own iframe and need nothing; only Direct Video needs the
    // resolver. Playback used to refuse outright without it, which made every reel dead on file://.
    assert(!/Start EveOS localhost to resolve hidden Reel audio/.test(js),
        'playback no longer refuses outright when there is no localhost');
    assert(!/if \(!isInternalView\(\)\)/.test(js),
        'the internal-view gate is gone; the embed renders on any surface, exactly as Spotify does');
    const resolve = js.slice(js.indexOf('async function resolveDirect('));
    const resolveBody = resolve.slice(0, resolve.indexOf('\n        }'));
    assert(/return null/.test(resolveBody) && /catch \(error\)/.test(resolveBody),
        'a missing resolver yields null rather than throwing, so callers can fall back');
    assert(/const direct = await resolveDirect\(item\);/.test(playBody),
        'the plain player still tries the resolver, so a running server gives a real play bar');
    assert(/showFocus\(/.test(js), 'the embed fallback exists for the reel view to use');
    assert(/is-available/.test(js) && /is-available/.test(css),
        'Direct Video advertises whether it is reachable, so an offline resolver reads as one'
        + ' unavailable mode rather than a broken player');

    // ---- async work must not write into a view the user already left ----
    // resolveDirect takes seconds on file://. Clicking through during that wait used to let the
    // stale continuation render an embed into a DETACHED canvas: an invisible iframe that kept
    // playing and could not be closed, because nothing pointed at it any more.
    assert(/let generation = 0;/.test(js), 'view changes are tracked by a generation token');
    assert(/if \(mine !== generation\) return;/.test(js),
        'async continuations check the view has not moved on before touching the DOM');
    assert(/function stopActive\(\)/.test(js) && /destroy\?\.\(\)/.test(js),
        'closing tears the player down explicitly rather than just dropping the reference');
    const closeHandler = js.slice(js.indexOf("[data-reel-close]')"));
    assert(closeHandler.slice(0, 320).includes('stopActive()'),
        'the close control stops the reel rather than leaving it playing behind the plain player');

    // ---- opening a reel must not stack panels ----
    // The chain is about the INSPECTOR, not playback. Without a resolver the Instagram embed is the
    // only player there is, so the plain view renders it and the track plays from file://; what
    // waits behind the button is the mode switcher.
    assert(!/buildInspector\(/.test(playBody),
        'the plain player does not build the reel inspector; that is the deliberate second step');
    assert(/showFocus\(canvas, item, url\)/.test(playBody),
        'the plain player still renders a player, so a reel is playable without a server');

    // ---- the crop is sized from Instagram's own measurement, not a guessed ratio ----
    assert(/function trackEmbedHeight\(/.test(js) && /'MEASURE'/.test(js),
        'the embed height comes from the MEASURE message Instagram posts; a guessed ratio is wrong'
        + ' for every reel that is not that shape, which is how the like bar kept showing');
    assert(/EMBED_HEADER/.test(js) && /EMBED_FOOTER/.test(js),
        'the reported total is reduced by the header and the action band to leave just the media');
    assert(/removeEventListener\('message'/.test(js),
        'the measurement listener is detached, so reels do not each leave one behind');
    const focusFn = js.slice(js.indexOf('function showFocus('), js.indexOf('function showFullEmbed('));
    assert(focusFn.includes('untrack()'), 'destroying the focus player detaches its listener');

    // ---- the way into the reel view must survive a media failure ----
    // The button used to be wired AFTER the media load. A resolver that answered but could not
    // produce a stream threw right past that line, leaving the button painted and dead: clicking it
    // did nothing, which looked like the reel view simply had no controls.
    const wireIndex = playBody.indexOf('wireOpenButton(');
    const mediaIndex = playBody.indexOf('await resolveDirect(');
    assert(wireIndex !== -1 && mediaIndex !== -1 && wireIndex < mediaIndex,
        'the Open Reel view button is wired before any media work, so a failed load cannot orphan it');

    // ---- an empty canvas must not reserve a second black panel ----
    assert(/\.audioflix-instagram-canvas:empty\s*\{[^}]*min-height:\s*0/.test(css),
        'an empty canvas collapses instead of showing a permanently black second panel');

    // ---- the retired selector must not linger and quietly re-style Focus ----
    assert(!/is-focus iframe/.test(css),
        'the old is-focus iframe rule is gone, so it cannot fight the crop');

    // ---- the frame must size to its content, or it draws on top of the player ----
    // .audioflix-provider-frame is normally locked to aspect-ratio 16/9, so its height comes from
    // its width. Instagram content is far taller -- a toolbar above a portrait video, or the whole
    // inspector -- and the excess overflowed the box and painted over everything below it.
    assert(/\.audioflix-provider-frame\.audioflix-instagram-stage/.test(css),
        'the override is scoped to the provider frame the class actually lands on');
    const frameRule = css.slice(css.indexOf('.audioflix-provider-frame.audioflix-instagram-stage'));
    const frameBody = frameRule.slice(0, frameRule.indexOf('}'));
    assert(/aspect-ratio:\s*auto/.test(frameBody) && /height:\s*auto/.test(frameBody),
        'the frame follows its content instead of a fixed ratio, so nothing overflows onto siblings');
    assert(/min-height:\s*0/.test(frameBody),
        'the inherited minimum is cleared too, or a short view still reserves a 200px box');

    // ---- transport must tell the truth about a player we do not control ----
    // A cross-origin iframe cannot be clicked into, so Play cannot force Instagram to start. Stop
    // CAN silence it by blanking the frame. Reporting "playing" regardless would be a lie.
    const playerBody = js.slice(js.indexOf('function makeFramePlayer('), js.indexOf('function setActive('));
    assert(/about:blank/.test(playerBody), 'Stop blanks the frame, which genuinely silences it');
    assert(/mark\(true\)/.test(playerBody) && /mark\(false\)/.test(playerBody),
        'both transitions report playback state rather than leaving the transport stale');
    // The COMPARISON is the part that matters: frame.src resolves to an absolute URL and never
    // equals 'about:blank', so comparing it means play() can never tell it was stopped.
    assert(/getAttribute\('src'\) === 'about:blank'/.test(playerBody),
        'the blanked state is compared via the attribute; frame.src resolves and never matches');

    // ---- a shape override exists, because measurement is not always available ----
    // Scoped to the assignment: the querySelector mentions the attribute too, so a loose match
    // passes even when no button is ever given it.
    assert(/dataset\.reelRatio = shape/.test(js) && /audioflix-instagram-ratios/.test(css),
        'the reel view offers a manual shape override for reels that never report a usable height');
    assert(/\[data-reel-ratio\]'\)\.forEach/.test(js), 'and the override buttons are wired');
    // Scoped to the write: the Map declaration and the read both mention the name, so matching it
    // alone passes even when nothing is ever stored.
    assert(/learnedHeights\.set\(/.test(js) && /learnedHeights\.get\(/.test(js),
        'a measured height is stored AND reused, so reopening a reel is the right shape at once');

    console.log('instagram reel view OK — plain player first, three distinct modes, crop clips chrome');
    console.log('AUDIOFLIX_INSTAGRAM_REEL_VIEW_SMOKE_OK');
}

main();
