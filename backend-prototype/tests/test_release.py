"""Local-only security preparation tests; no Hostinger credentials or requests."""
import json
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from local_https import run_local_https

ROOT = Path(__file__).resolve().parents[1]


class Release(unittest.TestCase):
    def test_permission_renderer_scope(self):
        spec = importlib.util.spec_from_file_location('staging_grants', ROOT / 'bin/staging-grants.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sql = module.render('u123_jarvis_verify', 'u123_jvrun', 'u123_jvmig')
        self.assertNotIn('IDENTIFIED', sql)
        self.assertNotIn('ON *.*', sql)
        self.assertIn('REVOKE DELETE HISTORY, SHOW CREATE ROUTINE', sql)
        for target in ['production', 'u123_jarvis_restore', 'x`; DROP DATABASE x;--']:
            with self.assertRaises(ValueError):
                module.render(target, 'u123_jvrun', 'u123_jvmig')
        with self.assertRaises(ValueError):
            module.render('u123_jarvis_verify', 'u123_jvrun', 'u123_jvrun')

    def test_verified_local_tls_probe(self):
        result = run_local_https()
        self.assertEqual(result['result'], 'PASS')
        output = os.environ.get('JARVIS_TEST_OUTPUT')
        if output:
            Path(output).mkdir(parents=True, exist_ok=True)
            (Path(output) / 'local-https-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')

    def test_gate_and_private_rotation(self):
        php = [shutil.which('php') or 'php']
        with tempfile.TemporaryDirectory(prefix='jange-release-') as directory:
            env = dict(os.environ, JARVIS_RELEASE_TEST_DIR=directory)
            value = subprocess.run(php + [str(ROOT / 'tests/release_contract.php')], env=env, capture_output=True, check=True)
            result = json.loads(value.stdout)
            self.assertEqual(result['result'], 'PASS')
            # Each invocation writes one fixed-schema event, under the same lock.
            code = "require 'src/core.php';require 'src/private-log.php';$_SERVER['DOCUMENT_ROOT']=__DIR__.'/public';for($i=0;$i<200;$i++)if(!private_audit(getenv('JARVIS_RELEASE_TEST_DIR'),'request_started',200))exit(2);"
            processes = [subprocess.Popen(php + ['-r', code], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(3)]
            for process in processes:
                process.communicate(timeout=20)
                self.assertEqual(process.returncode, 0)
            for file in Path(directory).glob('audit.jsonl*'):
                self.assertLessEqual(file.stat().st_size, 65536)
                for line in file.read_text().splitlines():
                    self.assertEqual(set(json.loads(line)), {'component', 'event', 'status', 'time'})
