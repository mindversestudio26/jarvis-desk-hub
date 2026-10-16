"""Loopback TLS fixture only. Isolated trust context; no OS trust-store changes."""
import base64
import http.client
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from hosted_https import Probe

ROOT = Path(__file__).resolve().parents[1]


def run_local_https():
    openssl = os.environ.get('JARVIS_OPENSSL_BIN') or shutil.which('openssl') or r'C:\Program Files\Git\usr\bin\openssl.exe'
    php = [shutil.which('php') or 'php']
    ext = os.environ.get('JARVIS_PHP_EXT_DIR')
    if ext:
        php += ['-d', 'extension_dir=' + ext, '-d', 'extension=pdo_sqlite', '-d', 'extension=sodium']
    with tempfile.TemporaryDirectory(prefix='jange-tls-') as directory:
        private = Path(directory)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            php_port = sock.getsockname()[1]
        bridge_token = secrets.token_hex(32)

        class Bridge(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                self.forward()

            def do_POST(self):
                self.forward()

            def forward(self):
                size = int(self.headers.get('Content-Length', 0))
                if size > 16384:
                    self.send_error(413)
                    return
                connection = http.client.HTTPConnection('127.0.0.1', php_port, timeout=10)
                try:
                    headers = dict(self.headers)
                    headers['X-Jange-Local-TLS'] = bridge_token
                    connection.request(self.command, self.path, self.rfile.read(size) if size else None, headers)
                    response = connection.getresponse()
                    body = response.read()
                    self.send_response(response.status)
                    for key, value in response.getheaders():
                        if key.lower() not in ['server', 'date', 'connection', 'content-length', 'transfer-encoding']:
                            self.send_header(key, value)
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                finally:
                    connection.close()

        server = ThreadingHTTPServer(('127.0.0.1', 0), Bridge)
        origin = 'https://127.0.0.1:' + str(server.server_port)
        password = secrets.token_urlsafe(24)
        (private / 'audit').mkdir()
        env = dict(os.environ, JARVIS_LOCAL_DEV='0', JARVIS_ORIGIN=origin, JARVIS_DSN='sqlite:' + str(private / 'fixture.sqlite'), JARVIS_DATA_KEY=base64.b64encode(secrets.token_bytes(32)).decode(), JARVIS_INITIAL_PASSWORD=password, JARVIS_SECURITY_LOG_DIR=str(private / 'audit'))
        subprocess.run(php + [str(ROOT / 'bin/init.php')], env=env, cwd=ROOT, capture_output=True, check=True)
        # Only this authenticated loopback bridge can assert TLS to this router.
        router = private / 'router.php'
        router.write_text("<?php if(($_SERVER['REMOTE_ADDR']??'')!=='127.0.0.1'||!hash_equals('" + bridge_token + "',$_SERVER['HTTP_X_JANGE_LOCAL_TLS']??'')){http_response_code(403);exit;}$_SERVER['HTTPS']='on';require " + repr(str(ROOT / 'public/api.php').replace('\\', '/')) + ';', encoding='utf-8')
        process = subprocess.Popen(php + ['-S', '127.0.0.1:' + str(php_port), '-t', str(ROOT / 'public'), str(router)], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        thread = None
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', php_port), timeout=.1):
                        break
                except OSError:
                    time.sleep(.05)
            subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', str(private / 'tls.key'), '-out', str(private / 'tls.crt')], capture_output=True, check=True)
            tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            tls.load_cert_chain(private / 'tls.crt', private / 'tls.key')
            server.socket = tls.wrap_socket(server.socket, server_side=True)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            trusted = ssl.create_default_context(cafile=str(private / 'tls.crt'))
            probe = Probe(secrets.token_hex(32), origin, trusted, local_fixture=True)
            result = probe.run('owner', password)
            result['scope'] = 'Loopback TLS bridge + PHP 8.3/SQLite; not Hostinger, browser or Apache gate'
            archive = private / 'synthetic.backup'
            subprocess.run(php + [str(ROOT / 'bin/backup.php'), 'export', str(archive)], env=env, cwd=ROOT, capture_output=True, check=True)
            original = archive.read_bytes()
            prepared = subprocess.run(php + [str(ROOT / 'bin/restore-plan.php'), str(archive), 'u123_jarvis_restore'], env=env, cwd=ROOT, capture_output=True, check=True)
            plan = json.loads(prepared.stdout)
            assert plan['integrity'] == 'PASS' and plan['writes'] is False and plan['target_empty'] == 'NOT VERIFIED'
            refused = subprocess.run(php + [str(ROOT / 'bin/restore-plan.php'), str(archive), 'u123_jarvis_stg'], env=env, cwd=ROOT, capture_output=True)
            assert refused.returncode != 0
            raw = bytearray(base64.b64decode(original))
            raw[30] ^= 1
            tampered = private / 'tampered.backup'
            tampered.write_bytes(base64.b64encode(raw))
            rejected = subprocess.run(php + [str(ROOT / 'bin/restore-plan.php'), str(tampered), 'u123_jarvis_restore'], env=env, cwd=ROOT, capture_output=True)
            assert rejected.returncode != 0 and archive.read_bytes() == original
            result['restore_preparation'] = ['authenticated format 2', 'no writes', 'staging target rejected', 'tamper rejected', 'archive unchanged']
            # Fail closed if audit directory disappears; no account-wide fallback.
            shutil.rmtree(private / 'audit')
            probe.check(probe.request('GET', '/api/v1/session')[0] == 503, 'hosted configuration refuses missing private audit directory')
            return result
        finally:
            if thread:
                server.shutdown()
                thread.join(timeout=5)
            server.server_close()
            process.terminate()
            process.wait(timeout=5)
