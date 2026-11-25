#!/usr/bin/env python3
"""EveOS Qualification Engine v3: manifest-driven, resource-aware, fail closed."""
from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import datetime
from functools import partial
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

from eveos_qualification_manifest import gate_specs, source_fingerprint, validate_manifest
from eveos_affected_selection import build_affected_plan, changed_files, validate_affected_selection
from eveos_affected_passes import AffectedPasses

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'data/runtime/smoke-results/timed-qualification'
PRINT_LOCK = threading.Lock()
RETRY = re.compile(r'\bretr(?:y|ies|ying)\b', re.I)
TIMEOUT = re.compile(r'\btime(?:d?\s*out|out)\b', re.I)


def clock(seconds):
    seconds = max(0, round(seconds))
    return f'{seconds // 3600:02d}:{(seconds // 60) % 60:02d}:{seconds % 60:02d}'


def say(*values):
    with PRINT_LOCK: print(*values, flush=True)


def npm(*arguments):
    return [('npm.cmd' if os.name == 'nt' else 'npm'), *arguments]


def gate(label, argv, resources=(), depends=(), category='integration'):
    return {'label': label, 'argv': argv, 'resources': sorted(set(resources)),
            'dependsOn': list(depends), 'category': category}


def affected_plan_for_files(files, base):
    return build_affected_plan(files, base, gate, npm)


def affected_plan(base):
    return affected_plan_for_files(changed_files(base), base)


def gate_plan(profile, base='HEAD', validated=None):
    validated = validated or validate_manifest()
    if profile in {'verify', 'release'}: return gate_specs(validated), {'coverage': validated}
    if profile == 'fast': return [gate('fast', npm('run', '--silent', 'test:smoke'), ('build-output',))], {}
    if profile == 'integration':
        return [gate('deep', npm('run', '--silent', 'test:deep'), ('services', 'ports', 'playwright'))], {}
    if profile == 'affected': return affected_plan(base)
    if profile != 'nexus': raise ValueError('Supported profiles: fast, affected, integration, verify/release, nexus')
    nb = 'tools/Nexus-Browser'
    plan = [gate('guardrails', npm('run', '--silent', 'test:guardrails'), ('build-output',), category='build-dependent')]
    for label, argv in [
        ('tui-chat-unit', ['node', '--test', f'{nb}/tests/dex-room-tui-chat.test.js']),
        ('tui-launch-unit', ['node', '--test', f'{nb}/tests/dex-room-tui-launch.test.js']),
        ('dex-any-room-unit', ['node', '--test', f'{nb}/tests/dex-room-general-send.test.js']),
        ('terminal-regression', ['node', '--test', f'{nb}/tests/dex-terminal-operator.test.js',
          f'{nb}/tests/dex-room-terminal-client.test.js', f'{nb}/tests/dex-terminal-routing-safety.test.js']),
        ('server-syntax', ['node', '--check', f'{nb}/server.js'])]:
        plan.append(gate(label, argv, depends=('guardrails',), category='pure'))
    plan.extend([
        gate('playwright-open-button', ['node', f'{nb}/scripts/dex-tui-ui-playwright-qualify.js'],
             ('playwright',), ('guardrails',), 'browser-owned'),
        gate('nexus', npm('--prefix', nb, 'test'), ('nexus-runtime', 'ports'), ('guardrails',), 'integration'),
        gate('machine-spaces', ['node', '--test', f'{nb}/tests/machine-spaces-supervised-controller-safety.test.js',
             f'{nb}/tests/machine-spaces-supervised-ui.test.js', f'{nb}/tests/machine-spaces-terminal-qualify.test.js'],
             ('machine-spaces',), ('guardrails',), 'integration'),
        gate('ai-control', npm('run', 'test:ai-control'), ('nexus-runtime', 'playwright', 'ports'),
             ('guardrails',), 'integration'),
        gate('security', npm('run', 'test:security'), ('ports',), ('guardrails',), 'integration')])
    return plan, {}


class ResourceCoordinator:
    def __init__(self): self.active = {}
    def acquire(self, label, resources):
        if any(name in self.active for name in resources): return False
        for name in resources: self.active[name] = label
        return True
    def release(self, label, resources):
        for name in resources:
            if self.active.get(name) == label: self.active.pop(name, None)


class ProcessRegistry:
    def __init__(self): self.guard, self.processes = threading.Lock(), {}
    def add(self, process):
        with self.guard: self.processes[process.pid] = process
    def discard(self, process):
        with self.guard: self.processes.pop(process.pid, None)
    def terminate_all(self):
        with self.guard: processes = list(self.processes.values())
        for process in processes:
            if process.poll() is not None: continue
            try:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, check=False)
                else: process.terminate()
            except OSError: pass


def nested_reports(started_epoch):
    reports, root = [], ROOT / 'data/runtime/smoke-results'
    for path in root.glob('**/latest.json') if root.exists() else []:
        try:
            if path.stat().st_mtime + .01 < started_epoch: continue
            data = json.loads(path.read_text(encoding='utf-8'))
            if data.get('schema') == 'eveos.quiet-child-suite.v1':
                reports.append({'path': str(path.relative_to(ROOT)), 'name': data.get('name'),
                                'totalSeconds': data.get('totalSeconds'), 'results': data.get('results', [])})
        except (OSError, ValueError): pass
    return reports


def run_gate(spec, evidence, *, registry, heartbeat=15, slow_warning=3600, quiet=False, fresh_nested=False):
    label, argv = spec['label'], spec['argv']
    started, started_epoch, cpu_before = time.monotonic(), time.time(), os.times()
    dest = evidence / f'{label}.log'; last_notice, warned = started, False
    if not quiet: say('RUNNING', label, 'resources', ','.join(spec.get('resources', ())) or 'none')
    with dest.open('wb') as log:
        try:
            process = subprocess.Popen(argv, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                       shell=False, stdin=subprocess.DEVNULL,
                                       env={**os.environ, 'EVEOS_REQUIRE_FRESH_SMOKES': '1'} if fresh_nested else None)
        except OSError as error:
            log.write((str(error)+'\n').encode('utf-8', 'replace'))
            return {'gate': label, 'status': 'FAIL', 'seconds': 0, 'exitCode': None,
                    'reason': str(error), 'log': str(dest.relative_to(ROOT)), 'execution': 'executed'}
        registry.add(process)
        try:
            while process.poll() is None:
                time.sleep(.4); now = time.monotonic()
                if not quiet and now-last_notice >= heartbeat:
                    estimate = float(spec.get('estimateSeconds') or 0)
                    say('IN_PROGRESS', label, 'elapsed', clock(now-started), 'remaining_estimate',
                        clock(max(0, estimate-(now-started))) if estimate else 'UNKNOWN')
                    last_notice = now
                if now-started > slow_warning and not warned:
                    say('LONG_RUNNING_GATE', label, clock(now-started)); warned = True
            exit_code = process.wait()
        finally: registry.discard(process)
    ended, cpu_after = time.monotonic(), os.times()
    text = dest.read_text(encoding='utf-8', errors='replace')
    status = 'PASS' if exit_code == 0 else 'FAIL'
    result = {'gate': label, 'status': status, 'seconds': round(ended-started, 2),
              'resources': spec.get('resources', []), 'category': spec.get('category'),
              'dependencies': spec.get('dependsOn', []), 'exitCode': exit_code, 'execution': 'executed',
              'log': str(dest.relative_to(ROOT)), 'cpuSeconds': round(
                  (cpu_after.children_user+cpu_after.children_system)-
                  (cpu_before.children_user+cpu_before.children_system), 3),
              'retryMentions': len(RETRY.findall(text)), 'timeoutMentions': len(TIMEOUT.findall(text)),
              'nestedReports': nested_reports(started_epoch)}
    if not quiet or status == 'FAIL': say(status, label, 'time', clock(ended-started), 'log', result['log'])
    if status == 'FAIL': say('FAILURE_TAIL', label, '\n'.join(text.splitlines()[-24:]))
    return result


def validate_gate_graph(gates):
    by_id = {item['label']: item for item in gates}
    if len(by_id) != len(gates): raise ValueError('duplicate gate label')
    for item in gates:
        missing = set(item.get('dependsOn', ())) - set(by_id)
        if missing: raise ValueError(f"{item['label']} missing dependencies: {sorted(missing)}")
    indegree = {name: len(item.get('dependsOn', ())) for name, item in by_id.items()}
    ready = [name for name, count in indegree.items() if count == 0]; visited = 0
    while ready:
        current = ready.pop(); visited += 1
        for name, item in by_id.items():
            if current in item.get('dependsOn', ()):
                indegree[name] -= 1
                if indegree[name] == 0: ready.append(name)
    if visited != len(gates): raise ValueError('qualification dependency cycle detected')


def run_dag(gates, evidence, *, jobs, heartbeat, slow_warning, previous=None, runner=run_gate, quiet=False):
    validate_gate_graph(gates)
    previous_times = {item.get('gate'): item.get('seconds') for item in (previous or {}).get('gates', [])}
    for item in gates:
        if previous_times.get(item['label']): item['estimateSeconds'] = previous_times[item['label']]
    pending = {item['label']: item for item in gates}; completed, results, skipped = {}, [], []
    ready_since, resource_blocked_since, dependency_wait, begun = {}, {}, {}, time.monotonic()
    resources, registry, interrupted = ResourceCoordinator(), ProcessRegistry(), False
    futures = {}
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
            while pending or futures:
                now = time.monotonic()
                for label, item in list(pending.items()):
                    deps = item.get('dependsOn', ())
                    if any(completed.get(dep, {}).get('status') == 'FAIL' for dep in deps):
                        skipped.append({'gate': label, 'reason': 'dependency failed'}); pending.pop(label); continue
                    if all(completed.get(dep, {}).get('status') == 'PASS' for dep in deps): ready_since.setdefault(label, now)
                capacity = jobs-len(futures)
                if capacity > 0:
                    for label, item in list(pending.items()):
                        if capacity <= 0: break
                        if label not in ready_since: continue
                        if not resources.acquire(label, item.get('resources', ())):
                            resource_blocked_since.setdefault(label, now)
                            continue
                        dependency_wait[label] = round(ready_since[label]-begun, 3)
                        item['queueWaitSeconds'] = round(now-ready_since[label], 3)
                        item['resourceWaitSeconds'] = round(
                            now-resource_blocked_since.get(label, now), 3)
                        item['workerWaitSeconds'] = round(max(
                            0, item['queueWaitSeconds']-item['resourceWaitSeconds']), 3)
                        future = pool.submit(runner, item, evidence, registry=registry,
                                             heartbeat=heartbeat, slow_warning=slow_warning, quiet=quiet)
                        futures[future] = item; pending.pop(label); capacity -= 1
                if not futures:
                    if pending: raise RuntimeError('scheduler stalled without runnable gates')
                    break
                done, _ = concurrent.futures.wait(futures, timeout=.5,
                                                  return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    item = futures.pop(future); resources.release(item['label'], item.get('resources', ()))
                    result = future.result(); result['queueWaitSeconds'] = item.get('queueWaitSeconds', 0)
                    result['resourceWaitSeconds'] = item.get('resourceWaitSeconds', 0)
                    result['workerWaitSeconds'] = item.get('workerWaitSeconds', 0)
                    result['dependencyWaitSeconds'] = dependency_wait.get(item['label'], 0)
                    results.append(result); completed[item['label']] = result
                    if not quiet: say('PROGRESS', len(results), '/', len(gates), 'active', len(futures), '/', jobs)
                    if result['status'] == 'FAIL':
                        for label in list(pending):
                            reason = ('dependency failed' if item['label'] in pending[label].get('dependsOn', ())
                                      else f"release stopped after {item['label']} failed")
                            skipped.append({'gate': label, 'reason': reason})
                            pending.pop(label)
    except KeyboardInterrupt:
        interrupted = True; registry.terminate_all(); say('INTERRUPTED', 'owned child processes terminated')
    return results, skipped, interrupted


def prior_report(profile, current):
    candidates = []
    for path in EVIDENCE.glob(f'{profile}-*/report.json') if EVIDENCE.exists() else []:
        if current in path.parents: continue
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            if data.get('profile') == profile and data.get('status') == 'PASS': candidates.append(data)
        except (OSError, ValueError): pass
    return max(candidates, key=lambda item: item.get('startedAt', ''), default=None)


def _dependency_critical_path(gates, results):
    elapsed = {item['gate']: item.get('seconds', 0) for item in results}; paths = {}
    for item in gates:
        if item['label'] not in elapsed: continue
        paths[item['label']] = elapsed[item['label']] + max(
            (paths.get(dep, 0) for dep in item.get('dependsOn', ())), default=0)
    return round(max(paths.values(), default=0), 2)


def make_report(profile, evidence, gates, results, skipped, begun, started_at, jobs, metadata,
                fingerprint, fingerprint_material, interrupted=False):
    complete = len(results) == len(gates) and all(item['status'] == 'PASS' for item in results) and not interrupted
    prior, elapsed, slow = prior_report(profile, evidence), round(time.monotonic()-begun, 2), []
    for item in results:
        slow.append({'id': item['gate'], 'seconds': item['seconds']})
        for nested in item.get('nestedReports', []):
            slow.extend({'id': f"{nested['name']}::{child['id']}", 'seconds': child['seconds']}
                        for child in nested.get('results', []))
    full = profile in {'verify', 'release'}
    reused = sum(item.get('execution') == 'reused' for item in results)
    complete = complete and not (full and reused)
    manifest_gates = [item['label'] for item in gate_specs(validate_manifest())]
    selected = {item['label'] for item in gates}
    profile_skips = [] if full else [{'gate': name, 'reason': f'not selected by {profile} profile'}
                                      for name in manifest_gates if name not in selected]
    return {'schema': 'eveos.timed-qualification.v3', 'profile': profile, 'startedAt': started_at,
            'status': 'PASS' if complete else ('INTERRUPTED' if interrupted else 'FAIL'),
            'qualificationScope': 'full-release' if full else 'partial',
            'releaseEligible': bool(full and complete), 'elapsedSeconds': elapsed,
            'expectedGates': len(gates), 'observedGates': len(results), 'workerLimit': jobs,
            'executedChecks': len(results)-reused, 'reusedChecks': reused, 'skippedChecks': [*skipped, *profile_skips],
            'reusedSeconds': round(sum(item.get('previousSeconds', 0) for item in results), 2),
            'dependencyClosureComplete': complete, 'workerUtilization': round(
                sum(item.get('seconds', 0) for item in results)/max(.001, elapsed*max(1, jobs)), 3),
            'criticalPathSeconds': elapsed, 'dependencyCriticalPathSeconds': _dependency_critical_path(gates, results),
            'queueWaitSeconds': round(sum(item.get('queueWaitSeconds', 0) for item in results), 3),
            'workerWaitSeconds': round(sum(item.get('workerWaitSeconds', 0) for item in results), 3),
            'resourceContentionSeconds': round(sum(item.get('resourceWaitSeconds', 0) for item in results), 3),
            'dependencyWaitSeconds': round(sum(item.get('dependencyWaitSeconds', 0) for item in results), 3),
            'aggregateChildCpuSeconds': round(sum(item.get('cpuSeconds', 0) for item in results), 3),
            'childCpuToWallRatio': round(sum(item.get('cpuSeconds', 0) for item in results)/max(.001, elapsed), 3),
            'slowest': sorted(slow, key=lambda item: item['seconds'], reverse=True)[:16],
            'previousPassSeconds': prior.get('elapsedSeconds') if prior else None,
            'estimatedSeconds': prior.get('elapsedSeconds') if prior else None,
            'estimateBasis': 'last successful same-profile run' if prior else 'unavailable',
            'coverageManifestIdentity': metadata.get('coverage', {}).get('manifestIdentity'),
            'coverageGraphIdentity': metadata.get('coverage', {}).get('coverageGraphIdentity'),
            'inputSourceFingerprint': fingerprint, 'inputSourceMaterial': fingerprint_material,
            'duplicateExecutions': metadata.get('coverage', {}).get('optimizedDuplicates', []),
            'deduplications': metadata.get('coverage', {}).get('deduplications', []),
            'metadata': {key: value for key, value in metadata.items() if key != 'coverage'},
            'gates': results, 'dynamicResultsCached': False, 'publicationPerformed': False}


def run(profile, evidence, *, jobs=3, heartbeat=15, timeout=3600, base='HEAD', fresh=False, verbose=False):
    validated = validate_manifest(); fingerprint, fingerprint_material = source_fingerprint(validated)
    gates, metadata = gate_plan(profile, base, validated); validate_gate_graph(gates)
    evidence.mkdir(parents=True, exist_ok=False)
    previous, begun = prior_report(profile, evidence), time.monotonic()
    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    estimate = previous.get('elapsedSeconds') if previous else None
    quiet = profile == 'affected' and not verbose
    if not quiet:
        say('QUALIFICATION_V3_STARTED', 'profile', profile, 'gates', len(gates), 'workers', jobs,
            'estimate', clock(estimate) if estimate else 'UNKNOWN', 'evidence', evidence)
    runner = partial(run_gate, fresh_nested=profile in {'affected', 'verify', 'release'})
    if profile == 'affected':
        cache = AffectedPasses(ROOT, evidence.parent/'affected-passes', reuse=not fresh)
        runner = partial(cache.run, runner)
    results, skipped, interrupted = run_dag(gates, evidence, jobs=jobs, heartbeat=heartbeat,
                                            slow_warning=timeout, previous=previous, runner=runner, quiet=quiet)
    report = make_report(profile, evidence, gates, results, skipped, begun, started_at, jobs, metadata,
                         fingerprint, fingerprint_material, interrupted)
    (evidence/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    say('QUALIFICATION_'+report['status'], 'elapsed', clock(report['elapsedSeconds']), 'gates',
        len(results), '/', len(gates), 'executed', report['executedChecks'], 'reused', report['reusedChecks'],
        'releaseEligible', report['releaseEligible'], 'report', evidence/'report.json')
    return report


def self_test():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    evidence = EVIDENCE/f'self-test-{stamp}'; evidence.mkdir(parents=True)
    sleeper = lambda label, resource=(), code=0, depends=(): gate(label,
        [sys.executable, '-c', f'import time; time.sleep(.12); raise SystemExit({code})'],
        resource, depends, 'pure')
    # A 120ms child-process speed ratio is unreliable on busy Windows hosts:
    # process startup and the runner's polling interval dominate the signal.
    # Instead, prove that two independent gates ENTER their runners together.
    overlapping = threading.Event()
    overlap_guard = threading.Lock()
    overlap_count = 0

    def synchronized_gate(spec, _evidence, **_options):
        nonlocal overlap_count
        with overlap_guard:
            overlap_count += 1
            if overlap_count == 2: overlapping.set()
        met = overlapping.wait(timeout=5)
        return {'gate': spec['label'], 'status': 'PASS' if met else 'FAIL',
                'seconds': 0, 'execution': 'executed'}

    with contextlib.redirect_stdout(io.StringIO()):
        parallel, _, _ = run_dag([sleeper('parallel-a'), sleeper('parallel-b')], evidence,
                                 jobs=2, heartbeat=120, slow_warning=60, runner=synchronized_gate)
        begun = time.monotonic()
        serial, _, _ = run_dag([sleeper('lock-a', ('shared',)), sleeper('lock-b', ('shared',))], evidence,
                               jobs=2, heartbeat=120, slow_warning=60)
        serial_elapsed = time.monotonic()-begun
        failed, skipped, _ = run_dag([sleeper('bad', code=7), sleeper('blocked', depends=('bad',))], evidence,
                                     jobs=2, heartbeat=120, slow_warning=60)
    assert len(parallel) == 2 and overlapping.is_set() and all(
        item['status'] == 'PASS' for item in parallel)
    assert len(serial) == 2 and serial_elapsed >= .22 and sum(x['queueWaitSeconds'] for x in serial) >= .08
    assert failed[0]['status'] == 'FAIL' and skipped == [{'gate': 'blocked', 'reason': 'dependency failed'}]
    for invalid in ([gate('a', [], depends=('missing',))],
                    [gate('a', [], depends=('b',)), gate('b', [], depends=('a',))]):
        try: validate_gate_graph(invalid)
        except ValueError: pass
        else: raise AssertionError('invalid dependency graph was accepted')
    validated = validate_manifest()
    assert validated['legacyObligations'] == validated['optimizedObligations'] == 41
    assert validated['optimizedDuplicates'] == [] and validated['deduplications']
    validate_affected_selection(gate, npm)
    partial = make_report('verify', evidence, [sleeper('bad', code=7), sleeper('blocked', depends=('bad',))],
                          failed, skipped, time.monotonic(),
                          datetime.datetime.now(datetime.timezone.utc).isoformat(), 2,
                          {'coverage': validated}, 'test', {}, False)
    interrupted = make_report('verify', evidence, [sleeper('unfinished')], [], [], time.monotonic(),
                              datetime.datetime.now(datetime.timezone.utc).isoformat(), 1,
                              {'coverage': validated}, 'test', {}, True)
    assert partial['status'] == 'FAIL' and not partial['releaseEligible']
    assert interrupted['status'] == 'INTERRUPTED' and not interrupted['releaseEligible']
    print('EVEOS_TIMED_QUALIFICATION_CONTRACT_OK manifestParity=true dag=true concurrency=true '
          'resourceLocks=true failClosed=true partialRejected=true affectedSelection=true')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', choices=['fast','affected','integration','verify','release','nexus'], default='verify')
    parser.add_argument('--base', default='HEAD', help='Git base for affected selection. Defaults to local changes.')
    parser.add_argument('--plan', action='store_true', help='Print the selected commands as JSON without executing them.')
    parser.add_argument('--fresh', action='store_true', help='Run affected checks without reusing local passes.')
    parser.add_argument('--verbose', action='store_true', help='Show per-gate progress in the affected profile.')
    parser.add_argument('--jobs', type=int, choices=[1,2,3,4], default=3)
    parser.add_argument('--heartbeat', type=int, default=15)
    parser.add_argument('--slow-warning', type=int, default=3600, dest='timeout')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test: return self_test()
    if not (5 <= args.heartbeat <= 120) or not (60 <= args.timeout <= 14400):
        parser.error('Heartbeat must be 5..120 seconds; slow-warning must be 60..14400 seconds.')
    if args.plan:
        try:
            gates, metadata = gate_plan(args.profile, args.base)
            validate_gate_graph(gates)
        except (ValueError, OSError, subprocess.CalledProcessError) as error:
            parser.error(str(error))
        print(json.dumps({'profile': args.profile, 'gates': gates, 'metadata': metadata}, indent=2))
        return 0
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    evidence = EVIDENCE/f'{args.profile}-{stamp}'
    try:
        report = run(args.profile, evidence, jobs=args.jobs, heartbeat=args.heartbeat,
                     timeout=args.timeout, base=args.base, fresh=args.fresh, verbose=args.verbose)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__': sys.exit(main())
