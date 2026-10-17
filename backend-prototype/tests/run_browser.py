import os
import subprocess
import sys
from pathlib import Path
from test_api import API

API.setUpClass()
try:
    env = dict(os.environ, JARVIS_TEST_URL=API.origin, JARVIS_TEST_PASSWORD=API.password)
    subprocess.run(['node', str(Path(__file__).with_name(sys.argv[1] if len(sys.argv)>1 else 'browser.cjs'))], env=env, check=True)
finally:
    API.tearDownClass()
