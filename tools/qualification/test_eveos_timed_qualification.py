"""Hermetic Qualification Engine v3 invariants; never starts EveOS services."""
import importlib.util
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


DIRECTORY = pathlib.Path(__file__).parent
sys.path.insert(0, str(DIRECTORY))
spec = importlib.util.spec_from_file_location('timed_qualification', DIRECTORY / 'eveos_timed_qualification.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
from eveos_affected_passes import AffectedPasses
from eveos_affected_selection import WORLD_BOOK_CLIENT, WORLD_BOOK_CLIENT_INPUTS


class TimedQualificationTests(unittest.TestCase):
    def test_time_display(self):
        self.assertEqual(runner.clock(0), '00:00:00')
        self.assertEqual(runner.clock(3661), '01:01:01')

    def test_full_release_is_manifest_driven(self):
        gates, metadata = runner.gate_plan('verify')
        self.assertEqual(len(gates), 41)
        self.assertEqual(gates[0]['label'], 'guardrails')
        self.assertEqual(metadata['coverage']['optimizedDuplicates'], [])
        self.assertEqual(metadata['coverage']['legacyObligations'], 41)

    def test_nexus_is_partial_and_does_not_reinvoke_full_release(self):
        gates, _ = runner.gate_plan('nexus')
        self.assertEqual(gates[0]['label'], 'guardrails')
        self.assertFalse(any(item['argv'][1:] == ['run', 'verify'] for item in gates))
        self.assertTrue(any('playwright' in item['resources'] for item in gates))

    def test_invalid_graphs_fail_closed(self):
        cases = ([runner.gate('a', [], depends=('missing',))],
                 [runner.gate('a', [], depends=('b',)), runner.gate('b', [], depends=('a',))])
        for case in cases:
            with self.assertRaises(ValueError): runner.validate_gate_graph(case)

    def test_resource_coordinator_is_atomic(self):
        coordinator = runner.ResourceCoordinator()
        self.assertTrue(coordinator.acquire('first', ('a', 'b')))
        self.assertFalse(coordinator.acquire('second', ('b', 'c')))
        coordinator.release('first', ('a', 'b'))
        self.assertTrue(coordinator.acquire('second', ('b', 'c')))


    def test_changed_paths_include_moves_deletions_and_untracked_files(self):
        with tempfile.TemporaryDirectory(prefix='eveos-affected-') as folder:
            root = pathlib.Path(folder)

            def git(*args):
                subprocess.run(['git', *args], cwd=root, capture_output=True, check=True)

            git('init')
            original = 'World Book before.js'
            (root/original).write_text('before')
            git('add', '--', original)
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                '-c', 'core.hooksPath=.fixture-hooks', 'commit', '-m', 'fixture')
            git('mv', original, 'WatchFusion after.js')
            (root/'untracked file.js').write_text('new')
            self.assertEqual(runner.changed_files('HEAD', root), [
                'WatchFusion after.js', original, 'untracked file.js'])
            with self.assertRaisesRegex(ValueError, 'Cannot determine affected paths'):
                runner.changed_files('invalid-git-base', root)

    def test_scoped_pass_reuse_observes_inputs_environment_and_failure(self):
        with tempfile.TemporaryDirectory(prefix='eveos-pass-reuse-') as folder, \
             patch.dict(os.environ, {'NODE_OPTIONS': ''}):
            root = pathlib.Path(folder)
            for name in (*WORLD_BOOK_CLIENT_INPUTS, 'package.json', 'tools/qualification/eveos_affected_passes.py'):
                path = root/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('first')
            (root/'executed.log').write_text('test evidence')
            cache = AffectedPasses(root, root/'passes')
            check = runner.gate('world-book-client', ['node', WORLD_BOOK_CLIENT], category='pure')

            def execute(*_args, status='PASS'):
                return {'status': status, 'execution': 'executed', 'log': 'executed.log', 'seconds': 0.5}

            self.assertEqual(cache.run(execute, check, root)['execution'], 'executed')
            self.assertEqual(cache.run(execute, check, root)['execution'], 'reused')
            (root/'unrelated-spotify.js').write_text('unrelated')
            self.assertEqual(cache.run(execute, check, root)['execution'], 'reused')
            (root/WORLD_BOOK_CLIENT).write_text('input changed')
            self.assertEqual(cache.run(execute, check, root)['execution'], 'executed')
            with patch.dict(os.environ, {'EVEOS_QUALIFICATION_FIXTURE': 'environment changed'}):
                self.assertIsNone(cache.lookup(check, cache.fingerprint(check)))
            with patch.dict(os.environ, {'NODE_OPTIONS': '--require some-preload.cjs'}):
                self.assertIsNone(cache.fingerprint(check))
            self.assertIsNone(cache.fingerprint({**check, 'resources': ['playwright']}))
            fresh = AffectedPasses(root, root/'passes', reuse=False)
            self.assertEqual(fresh.run(execute, check, root, status='FAIL')['status'], 'FAIL')
            self.assertEqual(cache.run(execute, check, root)['execution'], 'executed')

    def test_release_rejects_any_reused_checks(self):
        gates = [runner.gate('sample', ['node'], category='pure')]
        report = runner.make_report('verify', runner.EVIDENCE, gates,
                                    [{'gate': 'sample', 'status': 'PASS', 'seconds': 0, 'execution': 'reused'}],
                                    [], 0, 'fixture', 1, {}, 'fixture', {})
        self.assertEqual(report['reusedChecks'], 1)
        self.assertFalse(report['releaseEligible'])
        self.assertEqual(report['status'], 'FAIL')


if __name__ == '__main__': unittest.main()
