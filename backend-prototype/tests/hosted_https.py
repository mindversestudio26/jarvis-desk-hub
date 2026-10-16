"""Explicit synthetic HTTPS probe. Inert until gate approval and --execute.

Never follows redirects, disables TLS checks, prints credentials or logs bodies.
Expiry needs a separate private administrative fixture; browser offline semantics
are tested by the existing browser suite, not inferred from this HTTP client.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import http.client
from http.cookies import SimpleCookie
import json
import os
import ssl
import uuid
from urllib.parse import urlsplit

ORIGIN = 'https://jarvis-staging.glowwithimane.com'


class Probe:
    def __init__(self, token, origin=ORIGIN, context=None, local_fixture=False):
        url = urlsplit(origin)
        if origin != ORIGIN and not (local_fixture and url.scheme == 'https' and url.hostname == '127.0.0.1' and url.port and not url.path):
            raise ValueError('Pinned staging origin required')
        self.url, self.origin, self.token = url, origin, token
        self.context = context or ssl.create_default_context()
        if not self.context.check_hostname or self.context.verify_mode != ssl.CERT_REQUIRED:
            raise ValueError('Verified HTTPS required')
        self.checks = []

    def request(self, method, path, body=None, session=None, gate=True, **extra):
        if not path.startswith('/api/v1/') or '?' in path:
            raise ValueError('Fixed API paths only')
        headers = {'Cache-Control': 'no-cache', 'Origin': self.origin}
        if gate:
            headers['X-Jange-Staging-Token'] = self.token
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if session:
            headers.update(Cookie=session['cookie'], **{'X-CSRF-Token': session['csrf']})
        headers.update(extra)
        conn = http.client.HTTPSConnection(self.url.hostname, self.url.port or 443, context=self.context, timeout=20)
        try:
            conn.request(method, path, json.dumps(body) if body is not None else None, headers)
            response = conn.getresponse()
            raw = response.read(65537)
            if len(raw) > 65536:
                raise RuntimeError('Response bound')
            values = {key.lower(): value for key, value in response.getheaders()}
            if response.status in [301, 302, 303, 307, 308]:
                raise RuntimeError('Redirect refused')
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeError):
                data = {}
            return response.status, values, data
        finally:
            conn.close()

    def check(self, condition, name):
        if not condition:
            raise RuntimeError(name)
        self.checks.append(name)

    def run(self, username, password):
        self.check(self.request('GET', '/api/v1/session')[0] == 401, 'gate-authorized request still requires application authentication')
        sessions = []
        for label in ['synthetic-a', 'synthetic-b']:
            status, headers, data = self.request('POST', '/api/v1/auth/login', dict(username=username, password=password, device_name=label))
            self.check(status == 200, 'HTTPS login ' + label)
            cookie = SimpleCookie(headers.get('set-cookie', ''))
            item = cookie.get('__Host-JarvisSession')
            self.check(bool(item and item['secure'] and item['httponly'] and item['samesite'].lower() == 'strict' and item['path'] == '/' and not item['domain']), 'host-only Secure HttpOnly SameSite Strict cookie ' + label)
            self.check('no-store' in headers.get('cache-control', '').lower() and int(headers.get('age', '0')) == 0 and 'hit' not in headers.get('x-cache', '').lower(), 'uncached authentication ' + label)
            sessions.append(dict(cookie=item.OutputString().split(';')[0], csrf=data['csrf'], id=data['session_id'], binding=data['binding']))
        a, b = sessions
        self.check(a['id'] != b['id'] and a['binding'] == b['binding'], 'independent sessions share immutable workspace')
        try:
            self.check(self.request('POST', '/api/v1/auth/logout', {}, a, **{'X-CSRF-Token': 'invalid'})[0] == 403, 'CSRF rejected')
            self.check(self.request('GET', '/api/v1/session', session=a, Origin='https://evil.invalid')[0] == 403, 'Origin rejected')
            self.check(self.request('GET', '/api/v1/session', session=a, Host='evil.invalid')[0] == 403, 'Host rejected')
            record_id = 'https-fixture-' + uuid.uuid4().hex
            op = dict(binding=a['binding'], operation_id=str(uuid.uuid4()), kind='task', id=record_id, base_revision=0, deleted=False, data=dict(text='जङ्गे HTTPS synthetic fixture', done=False))
            other = dict(op, operation_id=str(uuid.uuid4()))
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(lambda pair: self.request('POST', '/api/v1/sync', pair[0], pair[1]), [(op, a), (other, b)]))
            self.check(sorted(item[0] for item in outcomes) == [200, 409], 'concurrent HTTPS writes preserve conflict')
            winner = op if outcomes[0][0] == 200 else other
            status, _, replay = self.request('POST', '/api/v1/sync', winner, a)
            self.check(status == 200, 'lost-ack retry uses same operation ID')
            self.check(any(r['id'] == record_id for r in self.request('GET', '/api/v1/sync', session=b)[2]['records']), 'database-backed cross-session visibility')
            mismatch = dict(winner, binding=dict(a['binding'], generation='0' * 32))
            self.check(self.request('POST', '/api/v1/sync', mismatch, a)[0] == 412, 'generation checked before retry')
            deletion = dict(winner, operation_id=str(uuid.uuid4()), base_revision=replay['record']['revision'], deleted=True)
            self.check(self.request('POST', '/api/v1/sync', deletion, a)[0] == 200, 'synthetic fixture tombstoned')
            self.check(self.request('POST', '/api/v1/sync', winner, a)[2]['record']['deleted'] is True, 'retry cannot resurrect tombstone')
            self.check(self.request('POST', '/api/v1/sessions/revoke', {'id': b['id']}, a)[0] == 200, 'session B revoked by A')
            self.check(self.request('GET', '/api/v1/session', session=b)[0] == 401, 'revoked session denied')
            self.check(self.request('POST', '/api/v1/auth/logout', {}, a)[0] == 200, 'HTTPS logout')
            self.check(self.request('GET', '/api/v1/session', session=a)[0] == 401, 'logged-out session denied')
        finally:
            for session in sessions:
                self.request('POST', '/api/v1/auth/logout', {}, session)
        return {'result': 'PASS', 'checks': self.checks, 'browser_offline': 'NOT RUN', 'expiry': 'NOT RUN'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true', help='Requires prior approval for private gate and synthetic writes')
    options = parser.parse_args()
    if not options.execute:
        parser.exit(message='Prepared only; no request sent. Gate approval is required before --execute.\n')
    try:
        probe = Probe(os.environ['JANGE_STAGING_TOKEN'])
        result = probe.run(os.environ['JANGE_TEST_USERNAME'], os.environ['JANGE_TEST_PASSWORD'])
    except Exception:
        result = {'result': 'FAIL', 'checks': getattr(locals().get('probe'), 'checks', []), 'details': 'No credentials, bodies or raw exceptions printed'}
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['result'] == 'PASS' else 1)
