"""Disposable loopback-only MariaDB drill; never accepts an existing DB DSN.

JARVIS_MARIADB_BIN and JARVIS_PHP_BIN point at owner-verified official runtimes.
No Windows service is installed. Nothing is sent to Hostinger.
"""
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
binary = Path(os.environ['JARVIS_MARIADB_BIN']).resolve()
php_bin = Path(os.environ['JARVIS_PHP_BIN']).resolve()
php = [str(php_bin), '-n', '-d', 'extension_dir=' + str(php_bin.parent / 'ext'), '-d', 'extension=pdo_mysql', '-d', 'extension=sodium']
with tempfile.TemporaryDirectory(prefix='jange-mariadb-') as directory:
    private = Path(directory)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    root_password, runtime_password = secrets.token_hex(24), secrets.token_hex(24)
    name, restored_name, user = 'jarvis_test_' + secrets.token_hex(6), 'jarvis_test_' + secrets.token_hex(6), 'jv_' + secrets.token_hex(6)
    initialized = subprocess.run([str(binary / 'mariadb-install-db.exe'), '--datadir=' + str(private / 'data'), '--password=' + root_password, '--port=' + str(port)], capture_output=True)
    if initialized.returncode:
        raise RuntimeError('Disposable MariaDB initialization failed; no credentials printed')
    log = (private / 'server-output.log').open('wb')
    server = subprocess.Popen([str(binary / 'mariadbd.exe'), '--no-defaults', '--basedir=' + str(binary.parent), '--datadir=' + str(private / 'data'), '--bind-address=127.0.0.1', '--port=' + str(port), '--skip-name-resolve', '--max-connections=12', '--innodb-buffer-pool-size=32M', '--log-error=' + str(private / 'server-error.log')], stdout=log, stderr=log)
    try:
        for _ in range(150):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('Disposable MariaDB exited before readiness')
                time.sleep(.1)
        else:
            raise RuntimeError('Disposable MariaDB readiness timeout')
        prefix = f'mysql:host=127.0.0.1;port={port};'
        env = dict(os.environ, JARVIS_LOCAL_DEV='1', JARVIS_ORIGIN='http://127.0.0.1:19999', JARVIS_DSN=prefix + 'charset=utf8mb4', JARVIS_DB_USER='root', JARVIS_DB_PASSWORD=root_password, JARVIS_DATA_KEY=base64.b64encode(secrets.token_bytes(32)).decode(), JARVIS_TEST_DB=name, JARVIS_TEST_RESTORE_DB=restored_name, JARVIS_TEST_USER=user, JARVIS_TEST_PASSWORD=runtime_password, JARVIS_INITIAL_PASSWORD=secrets.token_urlsafe(24))
        def run(script, args=(), settings=None):
            value = subprocess.run(php + [str(ROOT / script)] + list(args), env=settings or env, cwd=ROOT, capture_output=True)
            if value.returncode:
                raise RuntimeError('Isolated MySQL fixture failed: ' + script + ' ' + ' '.join(args[:1]))
            return value.stdout.decode('utf-8')
        run('tests/mysql_contract.php', ['bootstrap'])
        env['JARVIS_DSN'] = prefix + 'dbname=' + name + ';charset=utf8mb4'
        run('bin/init.php')
        runtime = dict(env, JARVIS_DB_USER=user, JARVIS_DB_PASSWORD=runtime_password)
        contract = json.loads(run('tests/mysql_contract.php', ['contract'], runtime))
        original = json.loads(run('tests/mysql_contract.php', ['inspect'], runtime))
        binding = {key: original['owner'][0][key] for key in ['subject_id', 'workspace_id', 'generation']}
        operation = dict(binding=binding, operation_id='44444444-4444-4444-8444-444444444444', kind='task', id='concurrent', base_revision=0, deleted=False, data=dict(text='concurrent fixture', done=False))
        other = dict(operation, operation_id='55555555-5555-4555-8555-555555555555')
        writers = [subprocess.Popen(php + [str(ROOT / 'tests/mysql_contract.php'), 'write'], env=dict(runtime, JARVIS_TEST_OPERATION=json.dumps(op)), cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for op in [operation, other]]
        outcomes = []
        for writer in writers:
            stdout, _ = writer.communicate(timeout=15)
            assert writer.returncode == 0
            outcomes.append(stdout.decode())
        assert sorted(outcomes) == ['200', '409'], outcomes
        original = json.loads(run('tests/mysql_contract.php', ['inspect'], runtime))
        archive = private / 'fixture.backup'
        run('bin/backup.php', ['export', str(archive)], runtime)
        target = dict(env, JARVIS_DSN=prefix + 'dbname=' + restored_name + ';charset=utf8mb4', JARVIS_BACKUP_DATA_KEY=env['JARVIS_DATA_KEY'], JARVIS_DATA_KEY=base64.b64encode(secrets.token_bytes(32)).decode())
        run('bin/backup.php', ['restore-local', str(archive)], target)
        restored = json.loads(run('tests/mysql_contract.php', ['inspect'], target))
        assert len(restored['records']) == len(original['records'])
        assert len(restored['operations']) == len(original['operations'])
        assert restored['owner'][0]['subject_id'] == binding['subject_id']
        assert restored['owner'][0]['workspace_id'] == binding['workspace_id']
        assert restored['owner'][0]['generation'] != binding['generation']
        for before, after in zip(original['records'], restored['records']):
            assert {k: v for k, v in before.items() if k != 'box'} == {k: v for k, v in after.items() if k != 'box'}
            assert before['box'] != after['box']
        assert json.loads(run('tests/mysql_contract.php', ['inspect'], runtime)) == original
        # Verify all restored ciphertext with the new key, and reject old binding.
        checked = subprocess.run(php + ['-r', "require 'src/core.php';$c=config();$db=database($c);foreach(query($db,'SELECT * FROM records')->fetchAll() as $r)decrypt_value($r['box'],record_context($r),$c);foreach(query($db,'SELECT * FROM operations')->fetchAll() as $r)decrypt_value($r['box'],'operation:'.$r['id'],$c);try{assert_binding($db,json_decode(getenv('JARVIS_TEST_BINDING'),true));exit(4);}catch(ApiError $e){if($e->status!==412)exit(5);}echo query($db,'SELECT COUNT(*) FROM sessions')->fetchColumn();"], env=dict(target, JARVIS_TEST_BINDING=json.dumps(binding)), cwd=ROOT, capture_output=True)
        assert checked.returncode == 0 and checked.stdout == b'0'
        refused = subprocess.run(php + [str(ROOT / 'bin/backup.php'), 'restore-local', str(archive)], env=target, cwd=ROOT, capture_output=True)
        assert refused.returncode != 0
        contract['checks'] += ['two independent PDO writers: 200/409', 'encrypted new-key MySQL restore into empty target', 'restored records/retry ciphertext authenticated', 'source invariance', 'new generation rejects old binding', 'sessions excluded', 'restore overwrite denied']
        version = subprocess.run(php + ['-r', 'echo PHP_VERSION;'], capture_output=True, check=True).stdout.decode()
        contract.update(result='PASS', scope='Disposable Windows loopback MariaDB; not Hostinger', php=version)
        output = Path(os.environ.get('JARVIS_TEST_OUTPUT', ROOT / 'test-results'))
        output.mkdir(parents=True, exist_ok=True)
        (output / 'mysql-results.json').write_text(json.dumps(contract, indent=2), encoding='utf-8')
        print(json.dumps(contract, indent=2))
    finally:
        subprocess.run([str(binary / 'mariadb-admin.exe'), '--no-defaults', '--host=127.0.0.1', '--port=' + str(port), '--user=root', 'shutdown'], env=dict(os.environ, MYSQL_PWD=root_password), capture_output=True, timeout=15)
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.terminate()
            server.wait(timeout=10)
        log.close()
