/**
 * matrix_rain_canvas_scaling_smoke.js
 *
 * Two long-standing items from the Matrix upgrade bench notes (MatricUpgradeBenchV2).
 *
 * 1. The canvases were sized straight from innerWidth/innerHeight, giving a 1:1 backing store. On
 *    any high-DPI display the browser then upscaled the result and every glyph came out soft. They
 *    are now sized in device pixels with the context scaled to match, so draw calls keep speaking
 *    CSS pixels. The subtle part: resizing a canvas RESETS its context state, so the transform must
 *    be re-applied on every resize or it silently reverts to blurry after the first one.
 *
 * 2. The render loop was setInterval, which fires out of step with the display and keeps running at
 *    full rate in a hidden tab. It is requestAnimationFrame now, throttled to the speed slider so
 *    that control keeps meaning what it did.
 *
 * The delta clamp is the consequence of (2) worth guarding: rAF is suspended while the tab is
 * hidden, so without a cap the first frame back carries the whole time away and every column
 * teleports off-screen.
 *
 * Checked as source contracts. Running this for real needs a live page with a fake devicePixelRatio
 * and a controllable frame clock, which is why these regressed unnoticed in the first place.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const W = path.join(ROOT, 'tools', 'workshop');
const read = (name) => fs.readFileSync(path.join(W, `matrix-workshop.runtime.${name}.js`), 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function main() {
    const core = read('core');
    const rain = read('rain');
    const appearance = read('appearance');
    const bouncy = read('bouncy');
    const all = [core, rain, appearance, bouncy, read('controls'), read('movement'), read('settings')];

    // ---- device pixel ratio actually consulted ----
    assert(/devicePixelRatio/.test(core), 'the canvas sizing consults devicePixelRatio');
    assert(/setTransform\(\s*ratio\s*,\s*0\s*,\s*0\s*,\s*ratio\s*,\s*0\s*,\s*0\s*\)/.test(core),
        'the context is scaled with setTransform, not scale(), so repeated resizes cannot compound');
    assert(/element\.style\.width\s*=/.test(core) && /element\.style\.height\s*=/.test(core),
        'the CSS box is pinned to the layout size while the buffer grows');

    // ---- resize must re-apply it, or it reverts to blurry after the first resize ----
    const resizeBody = appearance.slice(appearance.indexOf('function resizeCanvases()'));
    assert(resizeBody.slice(0, resizeBody.indexOf('\n        }')).includes('sizeAllCanvases()'),
        'resizing routes through sizeAllCanvases so the DPR transform is reinstated');
    assert(!/canvas\.height\s*=\s*window\.innerHeight/.test(appearance),
        'resize no longer sizes the canvas 1:1 behind the helper\'s back');

    // ---- nothing may read a canvas buffer size as if it were a drawing coordinate ----
    const strays = [];
    all.forEach((source, index) => {
        const lines = source.split('\n');
        lines.forEach((line, n) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;                 // prose, not code
            if (/\b\w*[Cc]anvas\.(width|height)\b/.test(line)
                && !/element\.(width|height)\s*=/.test(line)) {
                strays.push(`file#${index} line ${n + 1}: ${line.trim().slice(0, 70)}`);
            }
        });
    });
    assert(strays.length === 0,
        `no code reads a canvas buffer dimension as a CSS-pixel coordinate; found:\n  ${strays.join('\n  ')}`);

    // ---- the loop is rAF, throttled by the existing speed slider ----
    assert(/requestAnimationFrame\(frame\)/.test(rain), 'the render loop is driven by requestAnimationFrame');
    assert(!/interval\s*=\s*setInterval\(\s*draw\b/.test(rain),
        'the setInterval render loop is gone, so frames cannot land out of step with the display');
    assert(/now - lastDrawTime < speed/.test(rain),
        'the speed slider still throttles frames, so the control keeps its original meaning');
    assert(/cancelAnimationFrame/.test(rain), 'the loop can be cancelled rather than leaking frames');
    assert(/function startAnimation\(\)[\s\S]{0,300}stopAnimation\(\)/.test(rain),
        'restarting cancels the previous loop instead of stacking a second one');

    // ---- the delta clamp that makes returning from a background tab survivable ----
    assert(/Math\.min\(\s*0\.1\s*,\s*\(currentTime - lastFrameTime\)\s*\/\s*1000\s*\)/.test(rain),
        'the frame delta is clamped, so a hidden tab does not fling every column off-screen on return');

    // ---- every local asset the page references must actually exist ----
    // rain.mp3 was referenced by an <audio> tag carried over from the original merge source, with
    // no sound controls and no file to back it, so every single page load 404'd for years without
    // anyone noticing. A missing asset is silent by nature; this makes it loud.
    const page = fs.readFileSync(path.join(W, 'MatrixBackground-V2-Upgrading.html'), 'utf8');
    const missing = [...page.matchAll(/(?:src|href)\s*=\s*"([^"#?]+)/g)]
        .map((match) => match[1])
        .filter((ref) => !/^(https?:)?\/\//.test(ref) && !ref.startsWith('data:'))
        .map((ref) => ref.split('?')[0])
        .filter((ref) => !fs.existsSync(path.join(W, ref)));
    assert(missing.length === 0,
        `every local asset the page references exists; missing: ${missing.join(', ')}`);

    console.log('matrix rain canvas scaling OK — DPR-aware sizing, rAF loop, clamped delta');
    console.log('MATRIX_RAIN_CANVAS_SCALING_SMOKE_OK');
}

main();
