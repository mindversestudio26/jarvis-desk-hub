"""Opt-in, single-use Windows control intents. No HTTP input becomes a command line."""
import ctypes
from ctypes import wintypes
import hmac
import json
import ntpath
import os
import re
import secrets
import subprocess
import threading
import time
from collections import deque

ACTIONS = ('lock', 'sleep', 'restart', 'shutdown', 'launch')
ID = re.compile(r'[A-Za-z0-9_-]{16,80}\Z')
APP_ID = re.compile(r'[a-z][a-z0-9_-]{0,39}\Z')
TOKEN = re.compile(r'[A-Za-z0-9_-]{32,256}\Z')
# An allowlist is for ordinary desktop applications, not command interpreters.
DENIED = {'cmd.exe','powershell.exe','pwsh.exe','wscript.exe','cscript.exe','rundll32.exe',
          'regsvr32.exe','mshta.exe','msiexec.exe','wmic.exe','wsl.exe','bash.exe','sh.exe',
          'python.exe','pythonw.exe','node.exe','shutdown.exe','schtasks.exe','reg.exe'}

class ControlError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


def validate_apps(apps):
    if not isinstance(apps, list) or len(apps) > 20:
        raise ValueError('Allowlist must contain at most 20 applications')
    result = {}
    for app in apps:
        if not isinstance(app, dict) or set(app) != {'id','label','path'}:
            raise ValueError('Applications require only id, label and path (no arguments)')
        key, label, path = app['id'], app['label'], app['path']
        if not isinstance(key, str) or not APP_ID.fullmatch(key) or key in result:
            raise ValueError('Invalid or duplicate application ID')
        if not isinstance(label, str) or not 1 <= len(label) <= 60 or any(ord(c)<32 for c in label):
            raise ValueError('Invalid application label')
        if not isinstance(path, str) or not re.fullmatch(r'[A-Za-z]:\\[^\x00-\x1f"<>|:*?]+', path):
            raise ValueError('Application must be an absolute local Windows path')
        if '..' in path.split('\\') or ntpath.splitext(path)[1].lower() != '.exe' or ntpath.basename(path).lower() in DENIED:
            raise ValueError('Only allowlisted desktop executables are permitted')
        result[key] = {'id':key, 'label':label, 'path':ntpath.normpath(path)}
    return result


class WindowsActions:
    """Native calls run only after a one-use authenticated intent is consumed."""
    def __init__(self, apps):
        self.apps = apps

    def execute(self, action, app_id):
        if os.name != 'nt':
            raise OSError('Windows required')
        if action == 'launch':
            path = self.apps[app_id]['path']
            if not os.path.isfile(path) or os.path.normcase(os.path.realpath(path)) != os.path.normcase(path):
                raise OSError('Configured application unavailable')
            # Fixed executable, no args, URLs, shell, PATH lookup or inherited bearer tokens.
            env = {k:v for k,v in os.environ.items() if k not in ('JARVIS_READ_TOKEN','JANGE_CONTROL_TOKEN')}
            subprocess.Popen([path], executable=path, cwd=ntpath.dirname(path), env=env, shell=False, close_fds=True)
        elif action in ('shutdown','restart'):
            path = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', 'shutdown.exe')
            # /t > 0 implicitly forces applications closed. Use zero, NEVER /f.
            subprocess.run([path, '/r' if action == 'restart' else '/s', '/t', '0'], shell=False,
                           check=True, timeout=10, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        elif action == 'lock':
            api = ctypes.WinDLL('user32', use_last_error=True)
            api.LockWorkStation.argtypes = []
            api.LockWorkStation.restype = wintypes.BOOL
            if not api.LockWorkStation():
                raise ctypes.WinError(ctypes.get_last_error())
        elif action == 'sleep':
            self.sleep()
        else:
            raise ValueError('Unsupported action')

    @staticmethod
    def sleep():
        # Enable only a privilege already assigned to this current-user token;
        # never request elevation or change account/system privilege policy.
        class LUID(ctypes.Structure):
            _fields_ = [('LowPart',wintypes.DWORD),('HighPart',wintypes.LONG)]
        class PRIVILEGES(ctypes.Structure):
            _fields_ = [('Count',wintypes.DWORD),('Luid',LUID),('Attributes',wintypes.DWORD)]
        adv = ctypes.WinDLL('advapi32', use_last_error=True)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        power = ctypes.WinDLL('powrprof', use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        adv.OpenProcessToken.argtypes = [wintypes.HANDLE,wintypes.DWORD,ctypes.POINTER(wintypes.HANDLE)]
        adv.OpenProcessToken.restype = wintypes.BOOL
        adv.LookupPrivilegeValueW.argtypes = [wintypes.LPCWSTR,wintypes.LPCWSTR,ctypes.POINTER(LUID)]
        adv.LookupPrivilegeValueW.restype = wintypes.BOOL
        adv.AdjustTokenPrivileges.argtypes = [wintypes.HANDLE,wintypes.BOOL,ctypes.POINTER(PRIVILEGES),wintypes.DWORD,ctypes.POINTER(PRIVILEGES),ctypes.POINTER(wintypes.DWORD)]
        adv.AdjustTokenPrivileges.restype = wintypes.BOOL
        power.SetSuspendState.argtypes = [ctypes.c_ubyte,ctypes.c_ubyte,ctypes.c_ubyte]
        power.SetSuspendState.restype = ctypes.c_ubyte
        token, wanted, previous, size = wintypes.HANDLE(), PRIVILEGES(), PRIVILEGES(), wintypes.DWORD()
        if not adv.OpenProcessToken(kernel.GetCurrentProcess(),0x20|0x8,ctypes.byref(token)):
            raise ctypes.WinError(ctypes.get_last_error())
        changed = False
        try:
            wanted.Count, wanted.Attributes = 1, 2
            if not adv.LookupPrivilegeValueW(None,'SeShutdownPrivilege',ctypes.byref(wanted.Luid)):
                raise ctypes.WinError(ctypes.get_last_error())
            ctypes.set_last_error(0)
            if not adv.AdjustTokenPrivileges(token,False,ctypes.byref(wanted),ctypes.sizeof(previous),ctypes.byref(previous),ctypes.byref(size)) or ctypes.get_last_error():
                raise ctypes.WinError(ctypes.get_last_error())
            changed = True
            if not power.SetSuspendState(False,False,False):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            if changed:
                adv.AdjustTokenPrivileges(token,False,ctypes.byref(previous),0,None,None)
            kernel.CloseHandle(token)


class Controller:
    TTL = 15
    def __init__(self, token, read_token, apps, executor=None, clock=time.monotonic):
        if not TOKEN.fullmatch(token) or hmac.compare_digest(token,read_token):
            raise ValueError('Controls require a distinct strong credential')
        self.token, self.apps, self.clock = token, validate_apps(apps), clock
        self.executor = executor or WindowsActions(self.apps)
        self.lock = threading.Lock()
        self.intents, self.requests, self.results = {}, {}, {}
        self.traffic = deque()
        self.issued = deque()
        self.executions = deque()
        self.last_action = -100.0

    def authorize(self, supplied):
        with self.lock:
            now = self.clock()
            while self.traffic and self.traffic[0] <= now-60:
                self.traffic.popleft()
            if len(self.traffic) >= 120:
                raise ControlError(429,'rate_limited')
            self.traffic.append(now)
        if not hmac.compare_digest(supplied.encode(),('Bearer '+self.token).encode()):
            raise ControlError(401,'control_auth_required')

    def capabilities(self):
        return {'protocol':1,'enabled':True,'actions':list(ACTIONS),
                'apps':[{'id':a['id'],'label':a['label']} for a in self.apps.values()], 'challenge_ttl':self.TTL}

    def challenge(self, body):
        if not isinstance(body,dict) or set(body) != {'action','app_id','request_id'}:
            raise ControlError(400,'invalid_request')
        action, app_id, rid = body['action'],body['app_id'],body['request_id']
        if action not in ACTIONS or not isinstance(rid,str) or not ID.fullmatch(rid):
            raise ControlError(400,'invalid_request')
        if not isinstance(app_id,str) or (action == 'launch' and app_id not in self.apps) or (action != 'launch' and app_id != ''):
            raise ControlError(400,'application_not_allowed')
        with self.lock:
            now = self.clock()
            self.intents = {k:v for k,v in self.intents.items() if v['expires']>now}
            self.requests = {k:v for k,v in self.requests.items() if v>now-600}
            self.results = {k:v for k,v in self.results.items() if v['at']>now-600 or v['state'] in ('queued','executing')}
            if rid in self.requests:
                raise ControlError(409,'duplicate_request')
            if len(self.intents)>=8 or len(self.results)>=64 or any(v['state'] in ('queued','executing') for v in self.results.values()):
                raise ControlError(409,'control_busy')
            if now-self.last_action < 2:
                raise ControlError(429,'rate_limited')
            while self.issued and self.issued[0] <= now-60:
                self.issued.popleft()
            if len(self.issued)>=5:
                raise ControlError(429,'rate_limited')
            self.issued.append(now)
            nonce = secrets.token_urlsafe(32)
            self.requests[rid] = now
            self.intents[nonce] = dict(body,expires=now+self.TTL)
            return {'challenge':nonce,'request_id':rid,'expires_in':self.TTL}

    def execute(self, body):
        if not isinstance(body,dict) or set(body) != {'challenge','request_id'} or not all(isinstance(v,str) for v in body.values()):
            raise ControlError(400,'invalid_request')
        with self.lock:
            now = self.clock()
            intent = self.intents.get(body['challenge'])
            if not intent or intent['expires']<=now or intent['request_id']!=body['request_id']:
                raise ControlError(409,'expired_or_used_challenge')
            if now-self.last_action < 2 or any(v['state'] in ('queued','executing') for v in self.results.values()):
                raise ControlError(409,'control_busy')
            while self.executions and self.executions[0] <= now-60:
                self.executions.popleft()
            if len(self.executions)>=3:
                raise ControlError(429,'rate_limited')
            self.executions.append(now)
            # Atomic consume before any OS call; all other outstanding intents are revoked.
            self.intents.clear()
            self.last_action = now
            rid = intent['request_id']
            self.results[rid] = {'request_id':rid,'action':intent['action'],'state':'queued','at':now}
            result = self.public_result(rid)
            threading.Thread(target=self._run,args=(rid,intent),daemon=True).start()
            return result

    def _run(self, rid, intent):
        with self.lock:
            self.results[rid]['state'] = 'executing'
        try:
            self.executor.execute(intent['action'],intent['app_id'])
            state, error = 'accepted_by_windows', None
        except Exception:
            state, error = 'failed', 'windows_rejected_or_unavailable'
        with self.lock:
            self.results[rid].update(state=state,error=error,at=self.clock())

    def public_result(self, rid):
        return {k:v for k,v in self.results[rid].items() if k!='at'}

    def result(self, rid):
        with self.lock:
            if rid not in self.results:
                raise ControlError(404,'result_unknown')
            return self.public_result(rid)


def process_is_elevated():
    """Query the current process token; inability to establish safety fails closed."""
    adv = ctypes.WinDLL('advapi32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    adv.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    adv.OpenProcessToken.restype = wintypes.BOOL
    adv.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    adv.GetTokenInformation.restype = wintypes.BOOL
    token, elevated, size = wintypes.HANDLE(), wintypes.DWORD(), wintypes.DWORD()
    if not adv.OpenProcessToken(kernel.GetCurrentProcess(), 0x8, ctypes.byref(token)):
        raise OSError('Cannot query process token')
    try:
        if not adv.GetTokenInformation(token, 20, ctypes.byref(elevated), ctypes.sizeof(elevated), ctypes.byref(size)):
            raise OSError('Cannot query process elevation')
        if size.value != ctypes.sizeof(elevated):
            raise OSError('Invalid process elevation result')
        return bool(elevated.value)
    finally:
        kernel.CloseHandle(token)


def load_controller(path, token, read_token):
    if not path:
        return None
    if os.path.getsize(path)>32768:
        raise ValueError('Control configuration too large')
    with open(path,encoding='utf-8-sig') as f:
        config=json.load(f)
    if not isinstance(config,dict) or set(config)!={'enabled','apps'} or type(config['enabled']) is not bool:
        raise ValueError('Invalid control configuration')
    if not config['enabled']:
        return None
    if os.name!='nt':
        raise ValueError('Control activation requires Windows')
    try:
        if process_is_elevated():
            return None  # Keep monitoring available, but never expose elevated controls.
    except OSError:
        return None  # Unknown privilege state must also remain monitoring-only.
    return Controller(token,read_token,config['apps'])
