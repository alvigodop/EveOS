const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function requireTrue(condition, message) {
    if (!condition) throw new Error(message);
}

const packageSource = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const pkg = JSON.parse(packageSource);
const scripts = pkg.scripts || {};
const profileSource = fs.readFileSync(path.join(__dirname, 'eveos_profile_runner.mjs'), 'utf8');
const handoffSource = fs.readFileSync(path.join(__dirname, 'eveos_chat_handoff.mjs'), 'utf8');
const registrySource = fs.readFileSync(
    path.join(ROOT, 'tools', 'audit', 'smoke-registry-audit.js'),
    'utf8'
);
const baseline = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'tools', 'audit', 'smoke-registry-baseline.json'),
    'utf8'
));

const guardrailScript = String(scripts['test:guardrails'] || '');
for (const required of [
    'smoke:qualification-guardrails-contract',
    'audit:asset-versions',
    'audit:smoke-registry',
    'smoke:coverage-map',
    'smoke:file-growth',
    'smoke:file-size'
]) {
    requireTrue(
        guardrailScript.includes(required),
        `test:guardrails lost required structural check: ${required}`
    );
}

const verify = String(scripts.verify || '');
requireTrue(
    verify.startsWith('npm run test:guardrails && '),
    'verify must run structural guardrails before build/write steps'
);
requireTrue(
    verify.indexOf('npm run test:guardrails') < verify.indexOf('npm run build:asset-versions'),
    'verify can mutate asset versions before proving they are already synchronized'
);

for (const marker of [
    "fast: ['test:guardrails',",
    "'test:guardrails', 'smoke:regressions'",
    "security: ['test:guardrails',",
    "'ai-control': [\n    'test:guardrails',"
]) {
    requireTrue(profileSource.includes(marker), `smoke profile guardrail wiring missing: ${marker}`);
}

requireTrue(
    handoffSource.includes("if (profile === 'none' && explicit.length) plan.push('test:guardrails');"),
    'focused handoff runs no longer force structural guardrails'
);
requireTrue(
    Array.isArray(baseline.unregistered) && baseline.unregistered.length === 0,
    'smoke registry baseline must remain permanently empty'
);
requireTrue(
    registrySource.includes('backlog baseline must remain empty'),
    'smoke registry audit no longer enforces the zero-backlog invariant'
);

console.log('QUALIFICATION_GUARDRAILS_CONTRACT_SMOKE_OK');
