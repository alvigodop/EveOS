/**
 * audioflix_instagram_offline_playback_smoke.js
 *
 * On file:// with no server, pressing Play did not start the Reel.
 *
 * It could not. The embed is a cross-origin iframe: it cannot be clicked into, it ignores the
 * autoplay attribute, and Instagram exposes no message API for play or pause. Anything built on the
 * embed can only ever blank and reload it, so Play was a button that reloaded a poster and waited
 * for a tap. That is a browser security boundary, not a bug to code around.
 *
 * The resolved video is a different object entirely -- a plain progressive URL, which a media
 * element loads cross-origin WITHOUT CORS. So a <video> can play it from file:// with real play,
 * pause, seek and volume. The one thing missing offline is the URL, and that is already fetched on
 * every play while localhost is up. Remembering it is what makes Play real with no server.
 *
 * Two things have to hold or this silently regresses to the old behaviour: the offline path must
 * NOT route through the localhost proxy (there is no server to proxy through), and it must verify
 * the media actually opens before taking the transport -- these links are signed and expire, and a
 * dead one would leave Play wired to a video that can never start.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

/** An in-memory stand-in for localStorage, kept addressable so the stored shape can be inspected. */
function memoryStore() {
    const data = {};
    return {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
}

/** Load the cache module over a store we control. Returns both, so tests can read the raw blob. */
function loadCache(storage) {
    const store = storage || memoryStore();
    const sandbox = { console: { log() {}, warn() {}, error() {} } };
    sandbox.window = sandbox;
    sandbox.window.localStorage = store;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(A, 'audioflix.instagram.cache.js'), 'utf8'), sandbox);
    return { cache: sandbox.window.EveAudioflixInstagramCache, store };
}

function main() {
    const { cache, store } = loadCache();
    const reel = 'https://www.instagram.com/reel/Alpha_1/';

    // ---- a resolved video survives to the next session ----
    assert(cache.recall(reel) === null, 'nothing is remembered before anything is played');
    cache.remember(reel, { videoUrl: 'https://cdn.example/a.mp4', duration: 31 });
    const back = cache.recall(reel);
    assert(back && back.videoUrl === 'https://cdn.example/a.mp4',
        'the resolved video URL comes back, which is the whole reason Play can work offline');
    assert(back.duration === 31, 'the duration comes back with it, so the seek bar has a length');
    assert(back.ok === true, 'it is shaped like a resolver reply, so the player path is shared');

    // ---- the reel's real shape is what stops the box being guessed ----
    // Reels are not all portrait. A 9/16 default drops a landscape reel into a box built for a
    // phone screen, which is the black surround that kept coming back.
    cache.remember(reel, { videoUrl: 'https://cdn.example/a.mp4', width: 1080, height: 608 });
    const wide = cache.shape(reel);
    assert(wide && wide.width === 1080 && wide.height === 608, 'the resolved dimensions are kept');
    cache.rememberShape(reel, 1920, 1080);
    assert(cache.shape(reel).width === 1920,
        'a shape learned from a playing element overrides the resolver, being the better source');
    cache.rememberShape(reel, 0, 500);
    cache.rememberShape(reel, 'wide', 500);
    const afterJunk = cache.shape(reel);
    assert(afterJunk && afterJunk.width === 1920 && afterJunk.height === 1080,
        'a nonsense dimension never replaces a good one');

    // ---- an expired link must be droppable, or a dead URL is retried forever ----
    cache.forget(reel);
    assert(cache.recall(reel) === null, 'a link proven dead is gone');
    // The link expires; the shape does not. Falling back to the embed is exactly when the shape
    // matters most, so dropping it here would send the box back to guessing at the worst moment.
    const survived = cache.shape(reel);
    assert(survived && survived.width === 1920,
        'the shape outlives the dead link, so the embed fallback is still the right shape');

    // ---- junk must never be stored, or recall hands the player an unplayable src ----
    // On a URL of its own: `reel` deliberately keeps a shape-only entry after forget(), so reusing
    // it here could not tell "nothing was written" apart from "the shape is still there".
    const junkReel = 'https://www.instagram.com/reel/Junk_1/';
    cache.remember(junkReel, { videoUrl: '' });
    cache.remember(junkReel, {});
    cache.remember(junkReel, null);
    cache.remember('', { videoUrl: 'https://cdn.example/b.mp4' });
    assert(cache.recall(junkReel) === null, 'an empty or missing video URL is not remembered');
    // Checked against the STORED blob, not just recall. recall() filters empties as well, so a bad
    // write here reads back as null anyway and the guard above passes while junk quietly
    // accumulates against the same quota the music library depends on.
    const stored = JSON.parse(store.getItem(cache.KEY) || '{}');
    assert(!(junkReel in stored), 'nothing was written at all for an unusable resolve');
    assert(!('' in stored),
        'and a reel with no URL is not filed under the empty key, where it would be handed to the'
        + ' next caller that happens to resolve to nothing');

    // ---- the cache must stay bounded ----
    // Unbounded growth here could cost the origin its storage quota and take the music library down
    // with it, which has already happened once.
    for (let i = 0; i < cache.LIMIT + 40; i += 1) {
        cache.remember(`https://www.instagram.com/reel/R${i}/`, { videoUrl: `https://cdn.example/${i}.mp4` });
    }
    const raw = JSON.parse(store.getItem(cache.KEY) || '{}');
    assert(Object.keys(raw).length <= cache.LIMIT,
        `the cache is trimmed to its limit (found ${Object.keys(raw).length})`);
    assert(raw['https://www.instagram.com/reel/R339/'], 'the newest entries are the ones kept');
    assert(!raw['https://www.instagram.com/reel/R0/'], 'the oldest entries are the ones dropped');

    // ---- unreadable storage is a cost, never a crash ----
    const { cache: hostile } = loadCache({
        getItem: () => '{ this is not json',
        setItem: () => { throw new Error('quota exceeded'); },
        removeItem: () => {}
    });
    assert(hostile.recall(reel) === null, 'corrupt cache data reads as empty rather than throwing');
    hostile.remember(reel, { videoUrl: 'https://cdn.example/c.mp4' });   // must not throw on quota

    // ---- and the player has to actually use it ----
    const js = fs.readFileSync(path.join(A, 'audioflix.audio.url.instagram.js'), 'utf8');

    const resolveBody = sliceFn(js, 'async function resolveDirect(');
    assert(/EveAudioflixInstagramCache\?\.remember\?\.\(/.test(resolveBody),
        'a successful resolve is remembered; that is the only moment the real URL is ever visible,'
        + ' so missing it means there is nothing to play offline later');

    const playBody = sliceFn(js, 'async function playInstagram(');
    const recallAt = playBody.indexOf('EveAudioflixInstagramCache?.recall?.(');
    const focusAt = playBody.indexOf('showFocus(canvas, item, url)');
    assert(recallAt !== -1, 'playback reaches for the remembered video');
    assert(recallAt < focusAt && focusAt !== -1,
        'it is tried BEFORE falling back to the embed; after it, the embed would always win and the'
        + ' remembered video would never play');
    assert(/\{ offline: true \}/.test(playBody), 'the offline attempt is marked as such');
    assert(/if \(playing\) return;/.test(playBody),
        'a remembered video that plays ends it here; falling through would render the embed on top');

    // ---- offline must not route through a server that is not running ----
    const directBody = sliceFn(js, 'async function showDirectVideo(');

    // Direct Video must behave the same on both surfaces. Opened from the reel view there is no
    // preResolved reply, so without this the mode still hard-fails offline while the plain player
    // beside it plays perfectly -- the same mode giving two different answers.
    assert(/const result = live \|\| window\.EveAudioflixInstagramCache\?\.recall\?\.\(/.test(directBody),
        'a live resolve falling through reaches for the remembered link, so Direct Video works'
        + ' offline in the reel view too');
    assert(/const offline = options\.offline === true \|\| !live;/.test(directBody),
        'anything not resolved live counts as offline, which is what routes it around the proxy'
        + ' and forces it to prove itself');
    assert(/EveAudioflixInstagramCache\?\.forget\?\.\(/.test(directBody),
        'a link that fails to open is forgotten HERE, the only place that knows verification failed;'
        + ' every caller then gets that for free instead of each remembering to do it');

    assert(/offline \? '' : window\.EveAudioflixNative\?\.getProxyUrl/.test(directBody),
        'the offline path skips the localhost proxy -- proxying through a server that is not there'
        + ' is exactly the failure this is meant to avoid, and no proxy is needed: a media element'
        + ' loads a cross-origin URL without CORS');

    // ---- and must not take the transport until the media is proven to open ----
    const verifyAt = directBody.indexOf('offline && !(await firstPlayable(video))');
    const activeAt = directBody.indexOf('setActive(player, item, false)');
    assert(verifyAt !== -1 && activeAt !== -1 && verifyAt < activeAt,
        'verification happens BEFORE the player goes live; after it, an expired link would leave'
        + ' Play and Stop bound to a video that can never start');
    assert(/return false;/.test(directBody.slice(verifyAt, activeAt)),
        'a failed verification reports back, so the caller can fall through to the embed');

    // ---- the box must follow the reel's real shape, not a guess ----
    const shapeBody = sliceFn(js, 'function applyKnownShape(');
    assert(/EveAudioflixInstagramCache\?\.shape\?\.\(/.test(shapeBody),
        'the stage reaches for the reel\'s real dimensions');
    assert(/stage\.style\.aspectRatio = `\$\{known\.width\} \/ \$\{known\.height\}`/.test(shapeBody),
        'the real dimensions set the ratio directly, with no header/footer arithmetic in between');
    assert(/known\.height > known\.width \? 'min\(100%, 430px\)' : '100%'/.test(shapeBody),
        'portrait is held to phone width and landscape is given the room; a single width leaves a'
        + ' landscape reel as a small strip in the middle of the panel');

    const focusBody = sliceFn(js, 'function showFocus(');
    assert(/applyKnownShape\(stage, url\) \? function \(\) \{\} : trackEmbedHeight\(/.test(focusBody),
        'real dimensions win over MEASURE, and the listener is only attached when there is nothing'
        + ' better -- MEASURE reports the embed TOTAL, so using it means guessing the chrome back off');

    assert(/rememberShape\?\.\(\s*canonical\(item\?\.url\), video\.videoWidth, video\.videoHeight\)/.test(js),
        'a playing element teaches the cache its true shape, the most accurate source available');

    // ---- and no fixed height may be imposed on something whose shape varies ----
    const css = fs.readFileSync(path.join(A, 'audioflix.instagram.css'), 'utf8');
    const canvasRule = css.slice(css.indexOf('.audioflix-instagram-canvas {'));
    assert(!/min-height/.test(canvasRule.slice(0, canvasRule.indexOf('}'))),
        'the canvas sets no min-height; a floor there pads every short reel out to a tall box,'
        + ' which is the black surround around the video');
    const videoRule = css.slice(css.indexOf('.audioflix-instagram-video {'));
    const videoScoped = videoRule.slice(0, videoRule.indexOf('}'));
    // BOTH axes auto under a ceiling on each. Measured across four shapes at 760px wide, this is
    // what keeps the element's box equal to the reel's own: 758x427 landscape, 292x518 portrait,
    // 518x518 square, 758x316 ultrawide. Pinning width to 100% keeps the box wide whatever the
    // reel, so a portrait one measures 758x518 and paints itself letterboxed inside that.
    assert(/width:\s*auto/.test(videoScoped) && /height:\s*auto/.test(videoScoped),
        'neither axis is pinned, so the browser fits the element to the reel\'s real ratio');
    assert(/max-width:\s*100%/.test(videoScoped) && /max-height:/.test(videoScoped),
        'both axes are bounded, or a tall reel runs off the panel instead of fitting inside it');

    const playable = sliceFn(js, 'function firstPlayable(');
    assert(/'loadedmetadata'/.test(playable) && /'error'/.test(playable),
        'the check settles on real media events rather than a fixed delay');
    assert(/setTimeout\(\(\) => resolve\(false\), \d+\)/.test(playable),
        'the wait is bounded; an expired link can hang instead of erroring, and waiting forever'
        + ' would leave the panel stuck with no embed and no video');

    console.log('instagram offline playback OK — a remembered video makes Play real without a server');
    console.log('AUDIOFLIX_INSTAGRAM_OFFLINE_PLAYBACK_SMOKE_OK');
}

/** Body of a named function, sliced to the next same-indent declaration rather than a brace guess. */
function sliceFn(source, signature) {
    const from = source.indexOf(signature);
    if (from === -1) throw new Error('ASSERT FAILED: missing ' + signature);
    const rest = source.slice(from + signature.length);
    const next = rest.search(/\n {8}(?:async )?function /);
    return rest.slice(0, next === -1 ? rest.length : next);
}

main();
