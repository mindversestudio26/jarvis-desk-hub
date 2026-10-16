"""Isolated API tests. All credentials and content are disposable fixtures."""
import base64
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


class API(unittest.TestCase):
    def setUp(self):
        # Reset only this disposable database, never hosting or production data.
        db = sqlite3.connect(self.database)
        db.execute('DELETE FROM limits')
        db.execute('DELETE FROM sessions')
        db.commit()
        db.close()

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='jarvis-backend-test-')
        cls.database = Path(cls.temp.name) / 'private.sqlite'
        cls.password = secrets.token_urlsafe(24)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.origin = f'http://127.0.0.1:{cls.port}'
        cls.env = dict(os.environ, JARVIS_LOCAL_DEV='1', JARVIS_ORIGIN=cls.origin,
                       JARVIS_DSN='sqlite:' + str(cls.database),
                       JARVIS_INITIAL_PASSWORD=cls.password,
                       JARVIS_DATA_KEY=base64.b64encode(secrets.token_bytes(32)).decode())
        cls.php = [shutil.which('php') or 'php']
        ext = os.environ.get('JARVIS_PHP_EXT_DIR')
        if ext:
            cls.php += ['-d', 'extension_dir=' + ext, '-d', 'extension=pdo_sqlite', '-d', 'extension=sodium']
        subprocess.run(cls.php + [str(ROOT / 'bin/init.php')], env=cls.env, cwd=ROOT, check=True, capture_output=True)
        cls.logs = tempfile.TemporaryFile()
        cls.process = subprocess.Popen(cls.php + ['-S', f'127.0.0.1:{cls.port}', '-t', str(ROOT / 'public'), str(ROOT / 'router.php')], env=cls.env, cwd=ROOT, stdout=cls.logs, stderr=cls.logs)
        for _ in range(100):
            try:
                conn = http.client.HTTPConnection('127.0.0.1', cls.port, timeout=1)
                conn.request('GET', '/')
                if conn.getresponse().status == 200:
                    conn.close()
                    break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Local PHP server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.logs.close()
        cls.temp.cleanup()

    def call(self, method, path, body=None, cookie=None, csrf=None, **headers):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        defaults = {'Origin': self.origin}
        if body is not None:
            defaults['Content-Type'] = 'application/json'
        if cookie:
            defaults['Cookie'] = cookie
        if csrf:
            defaults['X-CSRF-Token'] = csrf
        defaults.update(headers)
        raw = json.dumps(body) if body is not None else None
        conn.request(method, path, body=raw, headers=defaults)
        response = conn.getresponse()
        status, result_headers, data = response.status, dict(response.getheaders()), response.read()
        conn.close()
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            data = data.decode()
        return status, result_headers, data

    def login(self, device='Test browser'):
        status, headers, value = self.call('POST', '/api/v1/auth/login', {'username': 'owner', 'password': self.password, 'device_name': device})
        self.assertEqual(status, 200, value)
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        return headers['Set-Cookie'].split(';')[0], value['csrf'], value['session_id']

    def op(self, kind='task', text='Disposable test task', base=0, item=None):
        return {'operation_id': str(uuid.uuid4()), 'kind': kind, 'id': item or str(uuid.uuid4()), 'base_revision': base, 'deleted': False, 'data': {'text': text, 'done': False}}

    def test_01_authentication_required(self):
        self.assertEqual(self.call('GET', '/api/v1/sync')[0], 401)

    def test_02_wrong_password(self):
        self.assertEqual(self.call('POST', '/api/v1/auth/login', {'username': 'owner', 'password': 'invalid', 'device_name': 'invalid'})[0], 401)

    def test_03_csrf_and_origin(self):
        cookie, csrf, _ = self.login()
        self.assertEqual(self.call('POST', '/api/v1/sync', self.op(), cookie)[0], 403)
        self.assertEqual(self.call('POST', '/api/v1/sync', self.op(), cookie, csrf, Origin='https://evil.example')[0], 403)
        self.assertEqual(self.call('POST', '/api/v1/sync', self.op(), cookie, csrf, Host='evil.example')[0], 403)

    def test_04_cookie_and_no_store(self):
        cookie, csrf, _ = self.login()
        status, headers, value = self.call('GET', '/api/v1/session', cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(value['csrf'], csrf)
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_05_cross_device_sync_and_conflict(self):
        a, ca, _ = self.login('PC fixture')
        b, cb, _ = self.login('iPad fixture')
        op = self.op()
        status, _, first = self.call('POST', '/api/v1/sync', op, a, ca)
        self.assertEqual(status, 200, first)
        second = self.call('GET', '/api/v1/sync', cookie=b)[2]
        self.assertTrue(any(r['id'] == op['id'] for r in second['records']))
        stale = dict(op, operation_id=str(uuid.uuid4()), data={'text': 'Stale version', 'done': True})
        status, _, conflict = self.call('POST', '/api/v1/sync', stale, b, cb)
        self.assertEqual(status, 409)
        self.assertEqual(conflict['current']['revision'], first['record']['revision'])

    def test_06_idempotency(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        first = self.call('POST', '/api/v1/sync', op, cookie, csrf)
        second = self.call('POST', '/api/v1/sync', op, cookie, csrf)
        self.assertEqual(first[0], 200)
        self.assertEqual(first[2], second[2])
        changed = dict(op, data={'text': 'Changed retry', 'done': False})
        self.assertEqual(self.call('POST', '/api/v1/sync', changed, cookie, csrf)[0], 409)

    def test_07_delete_tombstone(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        record = self.call('POST', '/api/v1/sync', op, cookie, csrf)[2]['record']
        deletion = dict(op, operation_id=str(uuid.uuid4()), base_revision=record['revision'], deleted=True, data=None)
        self.assertEqual(self.call('POST', '/api/v1/sync', deletion, cookie, csrf)[0], 200)
        rows = self.call('GET', '/api/v1/sync', cookie=cookie)[2]['records']
        self.assertTrue(next(r for r in rows if r['id'] == op['id'])['deleted'])

    def test_08_nepali_and_memory_encryption(self):
        cookie, csrf, _ = self.login()
        note = 'यो निजी परीक्षण स्मृति हो'
        op = self.op(kind='memory')
        op['data'] = {'text': note}
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 200)
        rows = self.call('GET', '/api/v1/sync', cookie=cookie)[2]['records']
        self.assertFalse(any(r['kind'] == 'memory' for r in rows))
        memories = self.call('GET', '/api/v1/memory', cookie=cookie)[2]['records']
        self.assertEqual(next(r for r in memories if r['id'] == op['id'])['data']['text'], note)
        db = sqlite3.connect(self.database)
        boxes = db.execute('SELECT box FROM records').fetchall()
        db.close()
        self.assertFalse(any(note in row[0] for row in boxes))
        self.assertNotIn(note.encode(), self.database.read_bytes())

    def test_09_invalid_payload_and_date(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        op['data']['text'] = 'x' * 721
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 422)
        op = self.op(kind='event')
        op['data'] = {'text': 'Invalid day', 'date': '2026-02-31', 'time': '09:00'}
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 422)
        self.assertEqual(self.call('POST', '/api/v1/sync', {'oversize': 'a' * 17000}, cookie, csrf)[0], 413)

    def test_10_no_control_or_ai(self):
        cookie, csrf, _ = self.login()
        self.assertEqual(self.call('POST', '/api/v1/control/shutdown', {}, cookie, csrf)[0], 403)
        self.assertEqual(self.call('POST', '/api/v1/ai', {'message': 'do not transmit'}, cookie, csrf)[0], 501)

    def test_11_revoke_device_session(self):
        cookie, csrf, own = self.login()
        target, _, target_id = self.login()
        self.assertNotEqual(own, target_id)
        self.assertEqual(self.call('POST', '/api/v1/sessions/revoke', {'id': target_id}, cookie, csrf)[0], 200)
        self.assertEqual(self.call('GET', '/api/v1/session', cookie=target)[0], 401)

    def test_12_logout(self):
        cookie, csrf, _ = self.login()
        self.assertEqual(self.call('POST', '/api/v1/auth/logout', {}, cookie, csrf)[0], 200)
        self.assertEqual(self.call('GET', '/api/v1/session', cookie=cookie)[0], 401)

    def test_13_unknown_metrics_are_null(self):
        cookie, _, _ = self.login()
        status, _, value = self.call('GET', '/api/v1/devices', cookie=cookie)
        self.assertEqual(status, 200)
        for device in value['devices']:
            self.assertIsNone(device['cpu_percent'])
            self.assertIsNone(device['temperature_c'])

    def test_14_login_limit(self):
        for _ in range(12):
            status = self.call('POST', '/api/v1/auth/login', {'username': 'owner', 'password': 'invalid', 'device_name': 'fixture'})[0]
        self.assertEqual(status, 429)

    def test_15_restart_preserves_encrypted_state_and_session(self):
        cookie, csrf, _ = self.login()
        op = self.op(text='Restart persistence fixture')
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 200)
        cls = type(self)
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.process = subprocess.Popen(cls.php + ['-S', f'127.0.0.1:{cls.port}', '-t', str(ROOT / 'public'), str(ROOT / 'router.php')], env=cls.env, cwd=ROOT, stdout=cls.logs, stderr=cls.logs)
        for _ in range(50):
            try:
                status, _, data = self.call('GET', '/api/v1/sync', cookie=cookie)
                if status == 200:
                    self.assertTrue(any(r['id'] == op['id'] for r in data['records']))
                    return
            except OSError:
                time.sleep(.1)
        self.fail('Restart did not preserve state')

    def test_16_plain_http_production_configuration_rejected(self):
        env = dict(self.env, JARVIS_LOCAL_DEV='0')
        result = subprocess.run(self.php + ['-r', "require 'src/core.php'; config();"], env=env, cwd=ROOT, capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    def test_17_database_under_webroot_rejected(self):
        env = dict(self.env, JARVIS_DSN='sqlite:' + str(ROOT / 'public/unsafe.sqlite'))
        result = subprocess.run(self.php + ['-r', "require 'src/core.php'; config();"], env=env, cwd=ROOT, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((ROOT / 'public/unsafe.sqlite').exists())

    def test_18_calendar_and_preferences(self):
        cookie, csrf, _ = self.login()
        event = self.op(kind='event')
        event['data'] = {'text': 'परीक्षण भेट', 'date': '2026-10-18', 'time': '09:30'}
        status, _, value = self.call('POST', '/api/v1/sync', event, cookie, csrf)
        self.assertEqual(status, 200)
        self.assertEqual(value['record']['data']['timezone'], 'Asia/Dubai')
        pref = self.op(kind='preference')
        pref['data'] = {'language': 'ne-NP'}
        self.assertEqual(self.call('POST', '/api/v1/sync', pref, cookie, csrf)[0], 200)


if __name__ == '__main__':
    unittest.main()
