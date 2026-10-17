"""Isolated API tests. All credentials and content are disposable fixtures."""
import base64
from contextlib import closing
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
        with closing(sqlite3.connect(self.database)) as db, db:
            row = db.execute('SELECT subject_id,workspace_id,generation FROM owner').fetchone()
        return {'binding': dict(zip(['subject_id','workspace_id','generation'],row)), 'operation_id': str(uuid.uuid4()), 'kind': kind, 'id': item or str(uuid.uuid4()), 'base_revision': base, 'deleted': False, 'data': {'text': text, 'done': False}}

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


    def test_19_retry_returns_latest_record(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        first = self.call('POST', '/api/v1/sync', op, cookie, csrf)[2]['record']
        edit = dict(op, operation_id=str(uuid.uuid4()), base_revision=first['revision'], data={'text': 'Newer edit', 'done': True})
        latest = self.call('POST', '/api/v1/sync', edit, cookie, csrf)[2]['record']
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[2]['record'], latest)

    def test_20_absolute_expiry(self):
        cookie, _, sid = self.login()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('UPDATE sessions SET expires=? WHERE id=?', (int(time.time())-1, sid))
        db.close()
        self.assertEqual(self.call('GET', '/api/v1/session', cookie=cookie)[0], 401)

    def test_21_idle_expiry(self):
        cookie, _, sid = self.login()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('UPDATE sessions SET last_seen=? WHERE id=?', (int(time.time())-1802, sid))
        db.close()
        self.assertEqual(self.call('GET', '/api/v1/session', cookie=cookie)[0], 401)

    def test_22_malformed_uuid(self):
        cookie, csrf, _ = self.login()
        op = dict(self.op(), operation_id='-' * 36)
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 422)

    def test_23_revoked_write_denied(self):
        a, ca, _ = self.login()
        b, cb, bid = self.login()
        self.call('POST', '/api/v1/sessions/revoke', {'id': bid}, a, ca)
        self.assertEqual(self.call('POST', '/api/v1/sync', self.op(), b, cb)[0], 401)

    def test_24_encrypted_backup_restore_and_refuse_overwrite(self):
        cookie, csrf, _ = self.login()
        op = self.op(text='Backup restoration fixture')
        current = self.call('POST', '/api/v1/sync', op, cookie, csrf)[2]['record']
        removed = self.op(text='Deleted backup fixture')
        created = self.call('POST', '/api/v1/sync', removed, cookie, csrf)[2]['record']
        self.call('POST', '/api/v1/sync', dict(removed, operation_id=str(uuid.uuid4()), base_revision=created['revision'], deleted=True, data=None), cookie, csrf)
        def durable_rows(filename):
            connection = sqlite3.connect(filename)
            try:
                return {table: connection.execute('SELECT * FROM ' + table + ' ORDER BY 1,2').fetchall() for table in ['owner', 'records', 'operations']}
            finally:
                connection.close()
        original_rows = durable_rows(self.database)
        archive = Path(self.temp.name) / 'fixture.backup'
        command = self.php + [str(ROOT / 'bin/backup.php')]
        result = subprocess.run(command + ['export', str(archive)], env=self.env, cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(b'Backup restoration fixture', archive.read_bytes())
        target = Path(self.temp.name) / 'restored.sqlite'
        env = dict(self.env, JARVIS_DSN='sqlite:' + str(target))
        result = subprocess.run(command + ['restore-local', str(archive)], env=env, cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        db = sqlite3.connect(target)
        self.assertEqual(db.execute('SELECT revision FROM records WHERE id=?', (op['id'],)).fetchone()[0], current['revision'])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 0)
        self.assertEqual(db.execute('SELECT deleted FROM records WHERE id=?', (removed['id'],)).fetchone()[0], 1)
        db.close()
        restored = durable_rows(target)
        self.assertEqual(restored['records'], original_rows['records'])
        self.assertEqual(restored['operations'], original_rows['operations'])
        self.assertEqual(restored['owner'][0][:-1], original_rows['owner'][0][:-1])
        self.assertNotEqual(restored['owner'][0][-1], original_rows['owner'][0][-1])
        self.assertEqual(durable_rows(self.database), original_rows)
        self.assertNotEqual(subprocess.run(command + ['restore-local', str(archive)], env=env, cwd=ROOT, capture_output=True).returncode, 0)
        corrupt = Path(self.temp.name) / 'corrupt.backup'
        raw = bytearray(archive.read_bytes())
        raw[40] = ord('A') if raw[40] != ord('A') else ord('B')
        corrupt.write_bytes(raw)
        bad_env = dict(self.env, JARVIS_DSN='sqlite:' + str(Path(self.temp.name) / 'bad.sqlite'))
        self.assertNotEqual(subprocess.run(command + ['restore-local', str(corrupt)], env=bad_env, cwd=ROOT, capture_output=True).returncode, 0)

    def test_25_concurrent_database_writers_preserve_conflict(self):
        op = self.op()
        other = dict(op, operation_id=str(uuid.uuid4()), data={'text': 'Concurrent edit', 'done': False})
        script = "require 'src/core.php'; $c=config();$db=database($c);try {mutate($db,$c,json_decode(getenv('JARVIS_TEST_OPERATION'),true));echo '200';}catch(ApiError $e){echo $e->status;}"
        processes = [subprocess.Popen(self.php + ['-r', script], env=dict(self.env, JARVIS_TEST_OPERATION=json.dumps(value)), cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for value in [op, other]]
        statuses = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, stderr)
            statuses.append(stdout.decode())
        self.assertEqual(sorted(statuses), ['200', '409'])

    def test_26_private_config_and_webroot_guard(self):
        private = Path(self.temp.name) / 'config-fixture'
        (private / 'src').mkdir(parents=True)
        (private / 'public').mkdir()
        shutil.copyfile(ROOT / 'src/core.php', private / 'src/core.php')
        (private / 'config.local.php').write_text("<?php return ['JARVIS_ORIGIN'=>'https://fixture.example'];", encoding='utf-8')
        env = dict(self.env)
        env.pop('JARVIS_ORIGIN', None)
        code = "require 'src/core.php';echo setting('JARVIS_ORIGIN');"
        result = subprocess.run(self.php + ['-r', code], env=env, cwd=private, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, b'https://fixture.example')
        override = subprocess.run(self.php + ['-r', code], env=self.env, cwd=private, capture_output=True)
        self.assertEqual(override.stdout.decode(), self.origin)
        guarded = "$_SERVER['DOCUMENT_ROOT']=getcwd();" + code
        self.assertNotEqual(subprocess.run(self.php + ['-r', guarded], env=env, cwd=private, capture_output=True).returncode, 0)

    def test_27_mysql_missing_charset_rejected_before_connection(self):
        code = "require 'src/core.php';try {database(['dsn'=>'mysql:host=127.0.0.1;dbname=fixture']);}catch(RuntimeException $e){echo $e->getMessage();exit(7);}"
        result = subprocess.run(self.php + ['-r', code], env=self.env, cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, b'MySQL requires explicit utf8mb4')

    def test_28_duplicate_mysql_charsets_rejected(self):
        code = "require 'src/core.php';try {database(['dsn'=>'mysql:host=127.0.0.1;dbname=fixture;charset=utf8mb4;charset=latin1']);}catch(RuntimeException $e){echo $e->getMessage();exit(7);}"
        result = subprocess.run(self.php + ['-r', code], env=self.env, cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, b'MySQL requires explicit utf8mb4')

    def test_29_retry_cannot_resurrect_deleted_record(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        initial = self.call('POST', '/api/v1/sync', op, cookie, csrf)[2]['record']
        deletion = dict(op, operation_id=str(uuid.uuid4()), base_revision=initial['revision'], deleted=True, data=None)
        tombstone = self.call('POST', '/api/v1/sync', deletion, cookie, csrf)[2]['record']
        replay = self.call('POST', '/api/v1/sync', op, cookie, csrf)
        self.assertEqual(replay[0], 200)
        self.assertEqual(replay[2]['record'], tombstone)
        self.assertTrue(tombstone['deleted'])

    def test_30_cached_session_rechecked_inside_mutation(self):
        _, _, sid = self.login()
        code = "require 'src/core.php';$c=config();$db=database($c);$s=query($db,'SELECT * FROM sessions WHERE id=?',[getenv('JARVIS_TEST_SESSION')])->fetch();query($db,'DELETE FROM sessions WHERE id=?',[$s['id']]);try{mutate($db,$c,json_decode(getenv('JARVIS_TEST_OPERATION'),true),$s);echo 'unexpected';}catch(ApiError $e){echo $e->status;}"
        result = subprocess.run(self.php + ['-r', code], env=dict(self.env, JARVIS_TEST_SESSION=sid, JARVIS_TEST_OPERATION=json.dumps(self.op())), cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, b'401')

    def test_31_ciphertext_context_swap_fails_closed(self):
        cookie, csrf, _ = self.login()
        a, b = self.op(), self.op()
        self.call('POST', '/api/v1/sync', a, cookie, csrf)
        self.call('POST', '/api/v1/sync', b, cookie, csrf)
        db = sqlite3.connect(self.database)
        box_a = db.execute('SELECT box FROM records WHERE id=?', (a['id'],)).fetchone()[0]
        box_b = db.execute('SELECT box FROM records WHERE id=?', (b['id'],)).fetchone()[0]
        try:
            db.execute('UPDATE records SET box=? WHERE id=?', (box_b, a['id']))
            db.commit()
            status, _, data = self.call('GET', '/api/v1/sync', cookie=cookie)
            self.assertEqual(status, 503)
            self.assertEqual(data, {'error': 'Service unavailable; check server configuration'})
        finally:
            db.execute('UPDATE records SET box=? WHERE id=?', (box_a, a['id']))
            db.commit()
            db.close()

    def test_32_hostinger_public_html_path_guard_and_private_backup(self):
        release = Path(self.temp.name) / 'hostinger-layout'
        (release / 'src').mkdir(parents=True)
        (release / 'bin').mkdir()
        (release / 'public_html').mkdir()
        shutil.copyfile(ROOT / 'src/core.php', release / 'src/core.php')
        shutil.copyfile(ROOT / 'bin/backup.php', release / 'bin/backup.php')
        unsafe = dict(self.env, JARVIS_DSN='sqlite:' + str(release / 'public_html/private.sqlite'))
        result = subprocess.run(self.php + ['-r', "require 'src/core.php';config();"], env=unsafe, cwd=release, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((release / 'public_html/private.sqlite').exists())
        public_archive = release / 'public_html/unsafe.backup'
        command = self.php + [str(release / 'bin/backup.php'), 'export']
        rejected = subprocess.run(command + [str(public_archive)], env=self.env, cwd=release, capture_output=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertFalse(public_archive.exists())
        private_archive = release / 'private.backup'
        accepted = subprocess.run(command + [str(private_archive)], env=self.env, cwd=release, capture_output=True)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertTrue(private_archive.is_file())

    def test_33_binding_required_and_mismatch_rejected_without_writes(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        unbound = dict(op)
        del unbound['binding']
        self.assertEqual(self.call('POST', '/api/v1/sync', unbound, cookie, csrf)[0], 428)
        for field in ['subject_id', 'workspace_id', 'generation']:
            wrong = dict(op, binding=dict(op['binding'], **{field: '0' * 32}))
            self.assertEqual(self.call('POST', '/api/v1/sync', wrong, cookie, csrf)[0], 412)
        with closing(sqlite3.connect(self.database)) as db, db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM operations WHERE id=?', (op['operation_id'],)).fetchone()[0], 0)

    def test_34_generation_checked_even_for_idempotent_retry(self):
        cookie, csrf, _ = self.login()
        op = self.op()
        self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 200)
        old = op['binding']['generation']
        try:
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE owner SET generation=?', (secrets.token_hex(16),))
            self.assertEqual(self.call('POST', '/api/v1/sync', op, cookie, csrf)[0], 412)
        finally:
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE owner SET generation=?', (old,))

    def test_35_password_rotation_recovery_and_all_session_revocation(self):
        cookie, _, _ = self.login()
        with closing(sqlite3.connect(self.database)) as db, db:
            original_hash, workspace = db.execute('SELECT pw_hash,workspace_id FROM owner').fetchone()
        env = dict(self.env, JARVIS_ADMIN_WORKSPACE=workspace, JARVIS_NEW_PASSWORD=secrets.token_urlsafe(24))
        command = self.php + [str(ROOT / 'bin/admin.php')]
        try:
            wrong = subprocess.run(command + ['rotate-password'], env=dict(env, JARVIS_CURRENT_PASSWORD='wrong'), cwd=ROOT, capture_output=True)
            self.assertNotEqual(wrong.returncode, 0)
            self.assertEqual(self.call('GET', '/api/v1/session', cookie=cookie)[0], 200)
            changed = subprocess.run(command + ['rotate-password'], env=dict(env, JARVIS_CURRENT_PASSWORD=self.password), cwd=ROOT, capture_output=True)
            self.assertEqual(changed.returncode, 0, changed.stderr)
            self.assertEqual(self.call('GET', '/api/v1/session', cookie=cookie)[0], 401)
            body = {'username': 'owner', 'password': self.password, 'device_name': 'rotation fixture'}
            self.assertEqual(self.call('POST', '/api/v1/auth/login', body)[0], 401)
            self.assertEqual(self.call('POST', '/api/v1/auth/login', dict(body, password=env['JARVIS_NEW_PASSWORD']))[0], 200)
            rejected = subprocess.run(command + ['recover-password'], env=dict(env, JARVIS_NEW_PASSWORD=self.password), cwd=ROOT, capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            recovered = subprocess.run(command + ['recover-password'], env=dict(env, JARVIS_NEW_PASSWORD=self.password, JARVIS_ADMIN_CONFIRM='LOCAL-RECOVERY-REVOKE-ALL'), cwd=ROOT, capture_output=True)
            self.assertEqual(recovered.returncode, 0, recovered.stderr)
            self.login()
        finally:
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE owner SET pw_hash=?', (original_hash,))

    def test_36_restore_new_key_and_generation_source_unchanged(self):
        archive = Path(self.temp.name) / 'rotation.backup'
        target = Path(self.temp.name) / 'new-key.sqlite'
        command = self.php + [str(ROOT / 'bin/backup.php')]
        self.assertEqual(subprocess.run(command + ['export', str(archive)], env=self.env, cwd=ROOT, capture_output=True).returncode, 0)
        before = self.database.read_bytes()
        env = dict(self.env, JARVIS_DSN='sqlite:' + str(target), JARVIS_BACKUP_DATA_KEY=self.env['JARVIS_DATA_KEY'], JARVIS_DATA_KEY=base64.b64encode(secrets.token_bytes(32)).decode())
        restored = subprocess.run(command + ['restore-local', str(archive)], env=env, cwd=ROOT, capture_output=True)
        self.assertEqual(restored.returncode, 0, restored.stderr)
        code = "require 'src/core.php';$c=config();$db=database($c);foreach(query($db,'SELECT * FROM records')->fetchAll() as $r)decrypt_value($r['box'],record_context($r),$c);echo workspace_binding($db)['generation'];"
        checked = subprocess.run(self.php + ['-r', code], env=env, cwd=ROOT, capture_output=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        wrong = subprocess.run(self.php + ['-r', code], env=dict(env, JARVIS_DATA_KEY=self.env['JARVIS_DATA_KEY']), cwd=ROOT, capture_output=True)
        self.assertNotEqual(wrong.returncode, 0)
        with closing(sqlite3.connect(self.database)) as db, db:
            self.assertNotEqual(checked.stdout.decode(), db.execute('SELECT generation FROM owner').fetchone()[0])
        self.assertEqual(self.database.read_bytes(), before)

    def test_37_legacy_archive_migration_and_old_queue_rejection(self):
        archive = Path(self.temp.name) / 'legacy.backup'
        code = "require 'src/core.php';$c=config();$db=database($c);$data=['format'=>1,'tables'=>[]];foreach(['owner','records','operations'] as $table)$data['tables'][$table]=query($db,'SELECT * FROM '.$table)->fetchAll();foreach(['subject_id','workspace_id','generation'] as $field)unset($data['tables']['owner'][0][$field]);file_put_contents(getenv('JARVIS_TEST_ARCHIVE'),encrypt_value($data,'jarvis-backup-v1',$c));"
        result = subprocess.run(self.php + ['-r', code], env=dict(self.env, JARVIS_TEST_ARCHIVE=str(archive)), cwd=ROOT, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        target = Path(self.temp.name) / 'legacy-restored.sqlite'
        env = dict(self.env, JARVIS_DSN='sqlite:' + str(target))
        restored = subprocess.run(self.php + [str(ROOT / 'bin/backup.php'), 'restore-local', str(archive)], env=env, cwd=ROOT, capture_output=True)
        self.assertEqual(restored.returncode, 0, restored.stderr)
        old_op = self.op()
        replay = "require 'src/core.php';$c=config();$db=database($c);try{mutate($db,$c,json_decode(getenv('JARVIS_TEST_OPERATION'),true));exit(5);}catch(ApiError $e){echo $e->status;}"
        rejected = subprocess.run(self.php + ['-r', replay], env=dict(env, JARVIS_TEST_OPERATION=json.dumps(old_op)), cwd=ROOT, capture_output=True)
        self.assertEqual(rejected.returncode, 0, rejected.stderr)
        self.assertEqual(rejected.stdout, b'412')
        with closing(sqlite3.connect(target)) as db, db:
            row = db.execute('SELECT subject_id,workspace_id,generation FROM owner').fetchone()
            for field, value in zip(['subject_id', 'workspace_id', 'generation'], row):
                self.assertNotEqual(value, old_op['binding'][field])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 0)

    def test_38_preflight_rejects_legacy_and_uninitialized_schema(self):
        command = self.php + [str(ROOT / 'bin/preflight.php')]
        current = subprocess.run(command, env=self.env, cwd=ROOT, capture_output=True)
        self.assertEqual(current.returncode, 0, current.stderr)
        self.assertTrue(json.loads(current.stdout)['ready'])
        legacy = Path(self.temp.name) / 'preflight-legacy.sqlite'
        with closing(sqlite3.connect(legacy)) as db, db:
            db.execute('CREATE TABLE owner (id TEXT,revision INTEGER)')
        rejected = subprocess.run(command, env=dict(self.env, JARVIS_DSN='sqlite:' + str(legacy)), cwd=ROOT, capture_output=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertFalse(json.loads(rejected.stdout)['ready'])
        empty = Path(self.temp.name) / 'preflight-empty.sqlite'
        with closing(sqlite3.connect(empty)) as db, db:
            db.executescript((ROOT / 'schema.sql').read_text())
        rejected = subprocess.run(command, env=dict(self.env, JARVIS_DSN='sqlite:' + str(empty)), cwd=ROOT, capture_output=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertFalse(json.loads(rejected.stdout)['owner_initialized'])

if __name__ == '__main__':
    unittest.main()
