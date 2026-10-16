import datetime
import http.client
import threading
import unittest
import agent


class AgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "a" * 40
        cls.origin = "https://example.github.io"
        cls.server = agent.make_server(0, cls.token, cls.origin, "pc.tail123.ts.net")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        with agent.snapshot_lock:
            agent.snapshot.update(protocol=1, sampled_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), cpu_percent=10, ram_percent=20, gpu_percent=None, temperature_c=None, control_enabled=False)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method="GET", path="/v1/status", **headers):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request(method, path, headers=headers)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_auth_required(self):
        self.assertEqual(self.request(Origin=self.origin)[0], 401)

    def test_wrong_token(self):
        self.assertEqual(self.request(Origin=self.origin, Authorization="Bearer invalid")[0], 401)

    def test_origin_required(self):
        self.assertEqual(self.request(Authorization="Bearer " + self.token)[0], 403)

    def test_untrusted_origin(self):
        self.assertEqual(self.request(Origin="https://evil.example", Authorization="Bearer " + self.token)[0], 403)

    def test_untrusted_host(self):
        self.assertEqual(self.request(Origin=self.origin, Host="evil.example", Authorization="Bearer " + self.token)[0], 403)

    def test_valid_read(self):
        self.server.last_request = 0
        status, headers, body = self.request(Origin=self.origin, Authorization="Bearer " + self.token)
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], self.origin)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn(b'"gpu_percent": null', body)
        self.assertIn(b'"control_enabled": false', body)

    def test_rate_limit(self):
        self.server.last_request = 0
        self.request(Origin=self.origin, Authorization="Bearer " + self.token)
        self.assertEqual(self.request(Origin=self.origin, Authorization="Bearer " + self.token)[0], 429)

    def test_control_rejected(self):
        self.assertEqual(self.request("POST", "/v1/shutdown", Origin=self.origin, Authorization="Bearer " + self.token)[0], 405)

    def test_preflight(self):
        self.assertEqual(self.request("OPTIONS", Origin=self.origin, **{"Access-Control-Request-Method":"GET", "Access-Control-Request-Headers":"authorization"})[0], 204)

    def test_bad_preflight(self):
        self.assertEqual(self.request("OPTIONS", Origin=self.origin, **{"Access-Control-Request-Method":"POST"})[0], 405)

    def test_weak_token_rejected(self):
        with self.assertRaises(ValueError):
            agent.make_server(0, "short", self.origin, "pc.tail123.ts.net")


if __name__ == "__main__":
    unittest.main()
