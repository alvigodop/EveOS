"""Select fresh structural checks for the exact range admitted by pre-push."""

import argparse
from collections import deque
from datetime import datetime, timezone
import json
import os
import subprocess
import sys

from eveos_qualification_manifest import ROOT
from eveos_timed_qualification import affected_plan


def publication_scripts(gates, *, full=False):
    if full or gates[0]['label'] != 'guardrails':
        return ['test:guardrails']
    selected = {gate.get('script') for gate in gates}
    feature_checks = ('smoke:spotify-mode-handoff-regression', 'smoke:audioflix-mode-requirements')
    return ['test:guardrails:shared', *(name for name in feature_checks if name in selected)]


def run_publication(scripts):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    evidence = ROOT/'data/runtime/smoke-results/publication'/stamp
    evidence.mkdir(parents=True)
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    warnings = 0
    for script in scripts:
        log = evidence/(script.replace(':', '-') + '.log')
        with log.open('wb') as stream:
            result = subprocess.run([npm, 'run', '--silent', script], cwd=ROOT, check=False,
                                    stdout=stream, stderr=subprocess.STDOUT)
        with log.open(encoding='utf-8', errors='replace') as stream:
            if result.returncode:
                print('EVEOS_PUBLICATION_CHECKS FAIL', script, log.relative_to(ROOT), file=sys.stderr)
                for line in deque(stream, maxlen=24):
                    print(line.rstrip()[:700], file=sys.stderr)
                return result.returncode
            warnings += sum('_WARNING' in line for line in stream)
    print('EVEOS_PUBLICATION_CHECKS PASS', ', '.join(scripts), 'warnings', warnings, 'logs', evidence.relative_to(ROOT))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--full', action='store_true')
    args = parser.parse_args()
    try:
        gates, metadata = affected_plan(args.base)
        scripts = publication_scripts(gates, full=args.full or os.environ.get('EVEOS_PUSH_FULL_GUARDRAILS') == '1')
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    if args.plan:
        print(json.dumps({'base': args.base, 'scripts': scripts, 'changedFiles': metadata['changedFiles']}, indent=2))
        return 0
    return run_publication(scripts)


if __name__ == '__main__':
    sys.exit(main())
