#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const profileArg = process.argv.find((item) => item.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'full');

const tests = {
    audio: [
        ['node', 'tools/smoke/audioflix_playback_diagnostics_smoke.cjs'],
        ['node', 'tools/smoke/audioflix_decode_cache_smoke.js'],
        ['node', 'tools/smoke/audioflix_layer_stop_smoke.js'],
        ['node', 'tools/smoke/audioflix_native_handoff_smoke.js'],
        ['node', 'tools/smoke/audioflix_queue_view_smoke.js'],
        ['node', 'tools/smoke/audioflix_music_native_capture_smoke.js']
    ],
    volume: [
        ['node', 'tools/smoke/audioflix_volume_managed_smoke.js'],
        ['node', 'tools/smoke/audioflix_volume_views_smoke.js'],
        ['node', 'tools/smoke/audioflix_output_port_smoke.js'],
        ['node', 'tools/smoke/audioflix_url_port_smoke.js']
    ],
    sounds: [
        ['node', 'tools/smoke/audioflix_soundboard_params_backup_smoke.js'],
        ['node', 'tools/smoke/audioflix_soundlab_playback_smoke.js'],
        ['node', 'tools/smoke/audioflix_soundlab_smoke.js'],
        ['node', 'tools/smoke/audioflix_soundlab_underrun_smoke.js']
    ],
    spotify: [
        ['node', 'tools/smoke/audioflix_spotify_media_playback_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_typed_transport_smoke.js'],
        ['python', 'tools/smoke/audioflix_spotify_typed_broker_smoke.py'],
        ['node', 'tools/smoke/audioflix_spotify_live_isolation_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_browser_contract_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_browser_runtime_smoke.js'],
        ['python', 'tools/smoke/audioflix_spotify_browser_python_smoke.py'],
        ['python', 'tools/smoke/audioflix_spotify_session_smoke.py'],
        ['node', 'tools/smoke/audioflix_spotify_browser_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_engine_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_playback_smoke.js'],
        ['node', 'tools/smoke/audioflix_spotify_scraper_smoke.js']
    ],
    state: [
        ['node', 'tools/smoke/audioflix_persistence_scheduler_smoke.js'],
        ['node', 'tools/smoke/audioflix_state_recovery_smoke.js'],
        ['node', 'tools/smoke/audioflix_backup_guard_smoke.js'],
        ['node', 'tools/smoke/audioflix_library_next_smoke.js']
    ],
    scale: [
        ['node', 'tools/smoke/audioflix_source_identity_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_library_index_scope_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_volume_mutation_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_volume_core_capture_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_capture_snapshot_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_classifier_projection_scale_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_nexus_classifier_projection_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_badge_preparation_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_library_soak_contract_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_nexus_search_identity_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_queue_snapshot_scale_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_library_diagnostics_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_duplicate_scale_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_duplicate_details_scale_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_sequential_add_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_large_library_lossless_smoke.mjs'],
        ['node', 'tools/benchmark/audioflix_scale_benchmark.mjs']
    ],
    'core-stability': [
        ['node', 'tools/smoke/audioflix_ui_projection_browser_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_group_terminal_state_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_provider_health_semantics_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_core_stability_browser_smoke.mjs']
    ],
    'media-identity': [
        ['node', 'tools/smoke/audioflix_mixed_playlist_contract_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_typed_natural_contract_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_spotify_media_identity_smoke.mjs'],
        ['node', 'tools/smoke/audioflix_media_mutation_identity_smoke.mjs'],
        ['node', 'tests/audioflix_spotify_scrape.test.js']
    ]
};

tests.full = [...tests.audio, ...tests.volume, ...tests.sounds, ...tests.spotify, ...tests.state, ...tests.scale, ...tests['core-stability'], ...tests['media-identity']];

if (process.argv.includes('--list')) {
    for (const [name, entries] of Object.entries(tests)) console.log(`${name}: ${entries.length} smoke(s)`);
    process.exit(0);
}
if (!tests[profile]) {
    console.error(`Unknown Audioflix smoke profile "${profile}". Choose: ${Object.keys(tests).join(', ')}`);
    process.exit(2);
}

const unique = [];
const seen = new Set();
for (const entry of tests[profile]) {
    const key = entry.join('\0');
    if (!seen.has(key)) { seen.add(key); unique.push(entry); }
}

let passed = 0;
const verbose = process.argv.includes('--verbose');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-audio-suite.json');
const report = { profile, ok: false, commands: [], warnings: 0 };
const save = () => { fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(report, null, 2)); };
for (const [runtime, relative] of unique) {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) {
        console.error(`MISSING :: ${relative}`);
        process.exit(2);
    }
    const command = runtime === 'python' ? (process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')) : process.execPath;
    const started = Date.now();
    const result = spawnSync(command, [absolute], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: process.env });
    const output = (result.stdout || '') + (result.stderr || '');
    report.commands.push({ script: relative, exit: result.status, elapsedMs: Date.now() - started, output });
    report.warnings += output.split(/\r?\n/).filter(line => /\bwarn(?:ing)?\b/i.test(line)).length;
    save();
    if (verbose && output) process.stdout.write(output);
    if (result.error) {
        console.error(`FAILED TO START :: ${relative} :: ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(`FAIL :: ${relative} :: exit ${result.status} artifact=${artifact}`);
        console.error(output.trim().split(/\r?\n/).slice(-40).join('\n'));
        process.exit(result.status || 1);
    }
    passed += 1;
}

report.ok = true; save();
console.log(`AUDIOFLIX_AUDIO_SUITE_OK profile=${profile} passed=${passed}/${unique.length} warnings=${report.warnings} artifact=${artifact}`);
