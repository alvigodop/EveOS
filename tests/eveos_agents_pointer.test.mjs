import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pointerPath = path.join(root, 'AGENTS.md');
const canonicalPath = path.join(root, 'docs', 'agents', 'AGENTS.md');
const pointer = fs.readFileSync(pointerPath, 'utf8');
const canonical = fs.readFileSync(canonicalPath, 'utf8');

assert.match(pointer, /docs\/agents\/AGENTS\.md/, 'root AGENTS pointer must name the canonical rules file');
assert.match(pointer, /must read and follow/i, 'root pointer must preserve repository-wide instruction intent');
assert.ok(canonical.length > pointer.length * 10, 'canonical rules must contain the full rule set, not another pointer');
assert.match(canonical, /# EveOS Agent Rules/, 'canonical rules retain the EveOS rules heading');
assert.match(canonical, /## Architecture/, 'canonical rules retain architecture guidance');
assert.match(canonical, /## Branch hygiene and exact-state qualification/, 'canonical rules retain branch hygiene guidance');
assert.match(canonical, /## Browser Qualification & Verification/, 'canonical rules retain browser qualification guidance');

console.log('EVEOS_AGENTS_POINTER_CONTRACT_OK canonical=docs/agents/AGENTS.md rootPointer=true');
