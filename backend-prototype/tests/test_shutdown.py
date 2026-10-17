import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]


class Shutdown(unittest.TestCase):
    def test_local_restoration(self):
        with tempfile.TemporaryDirectory(prefix='jange-shutdown-') as directory:
            site=Path(directory)/'jarvis-staging.glowwithimane.com'
            private=site/'.jange-http'
            private.mkdir(parents=True)
            (site/'public_html').mkdir()
            result=subprocess.run([shutil.which('php') or 'php',str(ROOT/'tests/shutdown_contract.php')],env=dict(os.environ,JANGE_SHUTDOWN_FIXTURE=str(private)),capture_output=True,check=True)
            report=json.loads(result.stdout)
            self.assertEqual(report['result'],'PASS')
            output=os.environ.get('JARVIS_TEST_OUTPUT')
            if output:
                Path(output).mkdir(parents=True,exist_ok=True)
                (Path(output)/'shutdown-local-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
