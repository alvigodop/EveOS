/**
 * Guards the character-control fixes reconciled from MatricUpgradeBenchV3.
 * These are source contracts because the workshop runs as a classic-script tool.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKSHOP = path.join(ROOT, 'tools', 'workshop');
const page = fs.readFileSync(path.join(WORKSHOP, 'MatrixBackground-V2-Upgrading.html'), 'utf8');
const appearance = fs.readFileSync(
    path.join(WORKSHOP, 'matrix-workshop.runtime.appearance.js'),
    'utf8'
);

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

assert(/id="charSetSelect"[\s\S]*?<option value="custom">Custom<\/option>/.test(page),
    'the character set control exposes a custom mode');
assert(/id="customCharInput"[^>]*onchange="updateCustomCharSet\(this\.value\)"/.test(page),
    'custom characters feed the active character set');
assert(/selectAllCharacters\(\)/.test(page) && /deselectAllCharacters\(\)/.test(page),
    'the selector exposes bulk selection controls');
assert(/box\.onclick\s*=\s*\(e\)[\s\S]{0,500}e\.stopPropagation\(\)/.test(appearance),
    'selecting a character does not close the selector');
assert(/function updateLineChangeRange\(\)[\s\S]{0,900}slider\.min\s*=\s*minLineChange[\s\S]{0,200}slider\.max\s*=\s*maxLineChange/.test(appearance),
    'the interval slider tracks the configured minimum and maximum');
assert(/getElementById\('characterChangeIntervalControls'\)/.test(appearance),
    'the single-character state targets its dedicated control rather than an incidental style selector');
assert(/isSingleChar[\s\S]{0,500}lineChangeSlider'\)\.disabled\s*=\s*true/.test(appearance),
    'the change interval is disabled when only one character can be shown');
assert(/aria-disabled',\s*'true'/.test(appearance) && /aria-disabled',\s*'false'/.test(appearance),
    'the visual disabled state is also exposed to assistive technology');

console.log('matrix character controls OK - custom sets, stable selector, bounded interval');
console.log('MATRIX_CHARACTER_CONTROLS_SMOKE_OK');
