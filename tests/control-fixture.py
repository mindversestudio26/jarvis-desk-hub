"""Test-only companion with an injected executor: NEVER imports/calls WindowsActions.execute."""
import os
import sys
import threading
import datetime
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','companion'))
import agent
from control import Controller
class Recorder:
    def execute(self,action,app_id):
        if app_id=='fail':raise OSError('fixture rejection')
server=agent.make_server(0,os.environ.pop('TEST_READ_TOKEN'),'https://mindversestudio26.github.io','control-fixture.example.ts.net')
server.control=Controller(os.environ.pop('TEST_CONTROL_TOKEN'),server.token,[{'id':'notepad','label':'Notepad','path':r'C:\Windows\System32\notepad.exe'}],Recorder())
with agent.snapshot_lock:
    agent.snapshot.update(protocol=1,sampled_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),cpu_percent=20,ram_percent=40,gpu_percent=None,temperature_c=None,control_enabled=True)
print(server.server_port,flush=True)
server.serve_forever()
