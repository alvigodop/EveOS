"""Proportional affected-test selection for EveOS qualification."""

import json
import os
import subprocess

from eveos_qualification_manifest import ROOT, load_package, transitive_inventory


WORLD_BOOK_CLIENT = 'tools/smoke/world_book_client_smoke.js'
WORLD_BOOK_CLIENT_INPUTS = (
    WORLD_BOOK_CLIENT, 'js/modules/core/eveos-local-control.js',
    'js/modules/features/world-book/world-book.client.js',
    'js/modules/features/world-book/world-book.notes.client.js',
)
PROFILE_RUNNER = 'tools/smoke/eveos_profile_runner.mjs'
WATCHFUSION_SYNC = 'tools/qualification/scoped_watchfusion_sync.mjs'
WATCHFUSION_SYNC_LAB = 'tools/WatchFusion/tests/smoke/node/sync-lab/'
WATCHFUSION_SYNC_PATHS = frozenset('tools/watchfusion/' + path for path in (
    'public/playback-sync.js', 'public/client/precision-policy.js', 'public/client/presentation-sync.js',
    'public/client/room-playout.js', 'public/client/viewer-sync-arbiter.js', 'src/server/playout-coordinator.js',
    'src/server/presentation-routes.js', 'src/server/presentation-report-schema.js',
))
DOMAIN_RULES = (
    ('watchfusion', 'smoke:watchfusion', 'integration', ('services', 'ports', 'playwright'),
     ('tools/watchfusion/', 'js/modules/features/watchfusion/', 'css/modules/watchfusion',
      'server_modules/watchfusion_', 'tools/smoke/watchfusion_', 'tests/watchfusion_', 'extension/modules/watchfusion/',
      WATCHFUSION_SYNC)),
    ('world-book', 'smoke:world-book', 'browser-owned', ('playwright', 'services', 'ports'),
     ('tools/world-book/', 'js/modules/features/world-book/', 'js/modules/features/notes/',
      'server_modules/world_book_', 'server_modules/notes_workspace', 'tools/smoke/world_book_',
      'tools/smoke/world_portal_', 'tools/smoke/notes_', 'tests/world_book_')),
    ('bookmark-intel', 'smoke:bookmark-intel', 'browser-owned', ('playwright', 'services', 'ports'),
     ('tools/bookmark-intel/', 'js/modules/features/bookmark-intel/', 'tools/smoke/bookmark_intel_',
      'server_modules/bookmark_intel_')),
    ('datapack', 'smoke:datapack-nebula-integrity', 'browser-owned', ('playwright', 'ports'),
     ('js/modules/features/datapack', 'js/modules/features/nebula', 'tools/smoke/datapack_',
      'tools/smoke/large_datapack_', 'tools/smoke/nebula_')),
)


def _git(root, *argv):
    return subprocess.run(['git', *argv], cwd=root, capture_output=True, check=True).stdout


def changed_files(base, root=ROOT):
    try:
        commit = _git(root, 'rev-parse', '--verify', '--end-of-options', base+'^{commit}').strip().decode('ascii')
        fork = _git(root, 'merge-base', commit, 'HEAD').strip().decode('ascii')
        diff = ('diff', '--name-only', '--no-renames', '-z')
        names = set()
        for argv in ((*diff, fork, 'HEAD', '--'), (*diff, '--'),
                     (*diff, '--cached', '--'), ('ls-files', '--others', '--exclude-standard', '-z')):
            names.update(os.fsdecode(name) for name in _git(root, *argv).split(b'\0') if name)
    except subprocess.CalledProcessError as error:
        raise ValueError(f'Cannot determine affected paths for Git base {base!r}') from error
    return sorted(names)


def _local_only(path):
    return (_documentation(path)
            or path.startswith(('tools/qualification/eveos_affected_', 'tools/qualification/eveos_timed_qualification',
                                'tools/qualification/eveos_qualification_manifest',
                                'tools/qualification/eveos_engineering_safeguards',
                                'tests/publication_', 'tools/audit/', 'tools/hooks/'))
            or path == 'tools/qualification/test_eveos_timed_qualification.py'
            or path in ('tools/smoke/qualification_guardrails_contract_smoke.js', PROFILE_RUNNER))


def _documentation(path):
    return path.endswith('.md') and (path.startswith('docs/') or '/' not in path)


def _profile_scripts(argv):
    output = subprocess.run([*argv, '--list-scripts'],
                            cwd=ROOT, capture_output=True, check=True, encoding='utf-8').stdout
    return json.loads(output)


def _without_nested_gates(specs, covered_by_profile=()):
    scripts = load_package()['scripts']
    def inventory(roots):
        records, _ = transitive_inventory(roots, scripts)
        return {record['id'] for record in records if record['kind'] == 'script'}

    covered = inventory(covered_by_profile) if covered_by_profile else set()
    for spec in specs:
        if 'script' in spec:
            covered.update(inventory([spec['script']]) - {spec['script']})
    return [spec for spec in specs if spec.get('script') not in covered
            and not (spec['label'] == 'world-book-client' and 'smoke:world-book' in covered)
            and not (spec['label'] == 'watchfusion-sync' and 'smoke:watchfusion' in covered)]


def build_affected_plan(files, base, gate, npm):
    selected, classes, owned = [], set(), set()
    lowered = [path.lower() for path in files if not _documentation(path.lower())]

    def add(label, script, resources=(), category='integration'):
        selected.append({**gate(label, npm('run', '--silent', script), resources, ('guardrails',), category),
                         'script': script})
        classes.add(label)

    client_inputs = {path.lower() for path in WORLD_BOOK_CLIENT_INPUTS if '/core/' not in path}
    for label, script, category, resources, prefixes in DOMAIN_RULES:
        matches = {path for path in lowered if path.startswith(prefixes)}
        if not matches:
            continue
        owned.update(matches)
        if label == 'world-book' and matches <= client_inputs:
            classes.add('world-book-client')
            selected.append(gate('world-book-client', ['node', WORLD_BOOK_CLIENT], depends=('guardrails',), category='pure'))
        elif label == 'watchfusion' and all(path in WATCHFUSION_SYNC_PATHS or path == WATCHFUSION_SYNC
                                           or path.startswith(WATCHFUSION_SYNC_LAB.lower())
                                           for path in matches):
            classes.add('watchfusion-sync')
            selected.append(gate('watchfusion-sync', ['node', WATCHFUSION_SYNC], depends=('guardrails',), category='pure'))
        else:
            add(label, script, resources, category)

    audioflix = [path for path in lowered if 'audioflix' in path or 'piano-auto-player/' in path
                 or path.startswith('tools/smoke/spotify_')]
    owned.update(audioflix)
    piano = [path for path in audioflix if any(token in path for token in (
        'audioflix.piano', 'audioflix_piano', 'piano-auto-player/'))]
    provider_capture = [path for path in audioflix if any(token in path for token in (
        'audioflix.provider.capture', 'audioflix_provider_capture'))]
    spotify_edge = [path for path in audioflix if any(token in path for token in (
        'spotify.edge', 'spotify_edge', 'spotify-embed-edge', 'spotify_mode_handoff'))]
    spotify_other = [path for path in audioflix if 'spotify' in path and path not in spotify_edge]
    shared_playback = [path for path in audioflix if any(token in path for token in (
        'audioflix.audio.', 'audioflix.audio.js', 'audioflix.queue.', 'audioflix.transport',
        'audioflix.internal-player', 'audioflix.ui.actions'))]
    classified = set(piano + provider_capture + spotify_edge + spotify_other + shared_playback)
    unknown_audio = [path for path in audioflix if path not in classified]
    if piano:
        add('audioflix-piano', 'smoke:audioflix-piano', ('audioflix-runtime', 'ports'))
    if provider_capture:
        add('audioflix-provider-capture', 'smoke:audioflix-provider-capture', ('audioflix-runtime', 'playwright'), 'browser-owned')
    if spotify_edge or spotify_other:
        add('audioflix-playback-policy', 'smoke:audioflix-playback-policy', ('audioflix-runtime', 'playwright'), 'browser-owned')
    if spotify_other:
        add('audioflix-spotify-managed', 'smoke:audioflix-spotify-managed', ('audioflix-runtime', 'playwright'), 'browser-owned')
    if shared_playback or unknown_audio:
        add('audioflix-playback', 'smoke:audioflix-playback', ('audioflix-runtime', 'playwright'), 'browser-owned')
    if audioflix:
        add('audioflix-mode-requirements', 'smoke:audioflix-mode-requirements', ('audioflix-runtime',), 'pure')
    if spotify_edge or spotify_other or shared_playback or unknown_audio:
        add('spotify-mode-handoff', 'smoke:spotify-mode-handoff-regression', ('audioflix-runtime',), 'pure')

    nexus = {path for path in lowered if path.startswith('tools/nexus-browser/') or '/nexus/' in path
             or 'machine_spaces' in path}
    owned.update(nexus)
    unclassified = {path for path in lowered if path not in owned and not _local_only(path)}
    shared_runtime = any(path.startswith(('server/', 'server_modules/', 'js/modules/core/', 'js/config/'))
                         or 'state-sync' in path for path in unclassified)
    profile = 'deep' if shared_runtime else 'fast' if unclassified else 'ai-control' if nexus else None
    if profile:
        classes.add('shared-runtime' if shared_runtime else profile + '-fallback')
        if nexus and profile != 'ai-control':
            classes.add('ai-control')
        argv = ['node', PROFILE_RUNNER, '--profile', profile, '--scoped']
        if nexus and profile != 'ai-control':
            argv.extend(['--also-profile', 'ai-control'])
        base_gate = gate(profile, argv, ('services', 'ports', 'playwright', 'build-output'))
        selected = _without_nested_gates(selected, _profile_scripts(argv))
        for item in selected:
            item['dependsOn'] = [profile]
    else:
        base_gate = gate('guardrails', npm('run', '--silent', 'test:guardrails:shared'),
                         ('build-output',), category='build-dependent')
        selected = _without_nested_gates(selected)
    return [base_gate, *selected], {'base': base, 'changedFiles': files, 'affectedClasses': sorted(classes),
                                    'unclassifiedFiles': [path for path in files if path.lower() in unclassified]}


def validate_affected_selection(gate, npm):
    cases = [
        (['tools/Piano-Auto-Player/web/piano_pcm_capture.js',
          'js/modules/features/audioflix/audioflix.piano.pcm.js'],
         ['guardrails', 'audioflix-piano', 'audioflix-mode-requirements']),
        (['js/modules/features/audioflix/audioflix.spotify.edge.js',
          'server_modules/audioflix_spotify_edge_session.py'],
         ['guardrails', 'audioflix-playback-policy', 'audioflix-mode-requirements', 'spotify-mode-handoff']),
        (['js/modules/features/audioflix/audioflix.queue.completion.js', 'server_modules/audioflix_spotify_edge_session.py'],
         ['guardrails', 'audioflix-playback', 'audioflix-mode-requirements', 'spotify-mode-handoff']),
        (['server_modules/watchfusion_control.py'], ['guardrails', 'watchfusion']),
        (['tools/WatchFusion/public/playback-sync.js'], ['guardrails', 'watchfusion-sync']),
        (['tools/WatchFusion/public/playback-sync.js', 'tools/WatchFusion/src/server/room-routes.js'],
         ['guardrails', 'watchfusion']),
        (['tools/World-Book/app/server.py'], ['guardrails', 'world-book']),
        (['js/modules/features/world-book/world-book.client.js'], ['guardrails', 'world-book-client']),
        (['tools/Bookmark-Intel/server.py', 'tools/smoke/datapack_link_resolver_smoke.js'],
         ['guardrails', 'bookmark-intel', 'datapack']),
        (['docs/AUDIOFLIX-SPOTIFY-QUEUE-STABILITY.md'], ['guardrails']),
        (['unknown.js', 'tools/WatchFusion/public/playback-sync.js'], ['fast']),
        (['server/modules.py', 'tools/World-Book/app/server.py', 'tools/Nexus-Browser/server.js'], ['deep']),
    ]
    for files, labels in cases:
        plan, _ = build_affected_plan(files, 'test', gate, npm)
        assert [item['label'] for item in plan] == labels
        if plan[0]['label'] == 'guardrails':
            assert plan[0]['argv'][-1] == 'test:guardrails:shared'
        else:
            roots = _profile_scripts(plan[0]['argv'])
            assert roots.count('test:guardrails') == 1
            assert 'smoke:capability-surfaces' not in roots
