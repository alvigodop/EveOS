"""Local pass reuse for allowlisted, in-process affected checks."""

import hashlib
import json
import os
import platform
import shutil
import tempfile

from eveos_affected_selection import WATCHFUSION_SYNC, WATCHFUSION_SYNC_LAB, WORLD_BOOK_CLIENT, WORLD_BOOK_CLIENT_INPUTS


PURE_COMMANDS = {'world-book-client': WORLD_BOOK_CLIENT, 'watchfusion-sync': WATCHFUSION_SYNC}
WATCHFUSION = 'tools/WatchFusion/'


def _sha_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


class AffectedPasses:
    def __init__(self, root, directory, *, reuse=True):
        self.root = root
        self.directory = directory
        self.reuse = reuse

    def run(self, runner, spec, evidence, **options):
        key = self.fingerprint(spec)
        prior = self.lookup(spec, key)
        if prior:
            return prior
        result = runner(spec, evidence, **options)
        if key:
            result['inputFingerprint'] = key
            self.record(spec, key, result)
        return result

    def fingerprint(self, spec):
        # Live, browser and security checks never get a key, even if another profile labels one pure.
        command = PURE_COMMANDS.get(spec['label'])
        argv = ['node', command]
        if (not command or os.environ.get('NODE_OPTIONS')
                or (spec['argv'], spec['category'], spec['resources']) != (argv, 'pure', [])):
            return None
        node = shutil.which('node')
        if not node:
            return None
        try:
            names = ['package.json', 'tools/qualification/eveos_affected_passes.py', command]
            if command == WORLD_BOOK_CLIENT:
                names.extend(WORLD_BOOK_CLIENT_INPUTS)
            else:
                names.extend([WATCHFUSION+'package.json', WATCHFUSION+'package-lock.json'])
                for folder in (WATCHFUSION+'public', WATCHFUSION+'src/server', WATCHFUSION_SYNC_LAB):
                    names.extend(path.relative_to(self.root).as_posix() for path in (self.root/folder).rglob('*')
                                 if path.suffix in ('.js', '.mjs', '.cjs', '.json') and path.is_file())
            inputs = {name: _sha_file(self.root / name) for name in set(names)}
            # Only the digest is persisted. The executable, argv and inherited environment affect execution.
            material = [str(self.root), platform.platform(), node, _sha_file(node), argv, inputs, dict(os.environ)]
            return hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()
        except OSError:
            return None

    def _path(self, spec):
        return self.directory / (spec['label'] + '.json')

    def lookup(self, spec, fingerprint):
        if not self.reuse or not fingerprint:
            return None
        try:
            receipt = json.loads(self._path(spec).read_text(encoding='utf-8'))
            if (receipt['fingerprint'] != fingerprint or receipt['status'] != 'PASS'
                    or not (self.root / receipt['log']).is_file()):
                return None
            return {'gate': spec['label'], 'status': 'PASS', 'exitCode': 0, 'seconds': 0,
                    'category': spec['category'], 'resources': spec['resources'], 'dependencies': spec['dependsOn'],
                    'execution': 'reused', 'inputFingerprint': fingerprint,
                    'log': receipt['log'], 'previousSeconds': receipt['seconds']}
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def record(self, spec, fingerprint, result):
        if not fingerprint:
            return
        status = result['status']
        if status == 'PASS' and self.fingerprint(spec) != fingerprint:
            status = 'INPUT_CHANGED'
        receipt = {'fingerprint': fingerprint, 'status': status, 'log': result['log'], 'seconds': result['seconds']}
        temp = None
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.directory, delete=False) as stream:
                temp = stream.name
                json.dump(receipt, stream)
            os.replace(temp, self._path(spec))
        except OSError:
            # An unavailable cache never prevents the real check from running.
            if temp:
                try:
                    os.unlink(temp)
                except OSError:
                    pass
