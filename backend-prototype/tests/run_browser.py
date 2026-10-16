import os
import subprocess
from pathlib import Path
from test_api import API

API.setUpClass()
try:
    env = dict(os.environ, JARVIS_TEST_URL=API.origin, JARVIS_TEST_PASSWORD=API.password)
    subprocess.run(['node', str(Path(__file__).with_name('browser.cjs'))], env=env, check=True)
finally:
    API.tearDownClass()
