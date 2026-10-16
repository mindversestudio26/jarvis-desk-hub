"""JANGE (Jarvis) read-only companion. No PC-control functionality is implemented."""
import argparse
import datetime
import hmac
import ipaddress
import json
import os
import re
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psutil

snapshot = {}
snapshot_lock = threading.Lock()
gpu_reading = {"gpu_percent": None, "temperature_c": None, "at": 0.0}
gpu_lock = threading.Lock()


def nvidia_smi_path():
    """The NVIDIA driver's own nvidia-smi, from fixed install locations only (never PATH or the working folder)."""
    candidates = [os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvidia-smi.exe"),
                  os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
                  "/usr/bin/nvidia-smi"]
    return next((p for p in candidates if os.path.isfile(p)), None)


def parse_nvidia(output):
    """First GPU's 'utilization, temperature' line. Each field is range-checked on its own; unreadable is None."""
    lines = output.strip().splitlines()
    values = lines[0].split(",") if lines else []

    def field(i, top):
        try:
            v = int(values[i].strip())
        except (ValueError, IndexError):
            return None
        return v if 0 <= v <= top else None
    return field(0, 100), field(1, 130)


def sample_gpu(path):
    """NVIDIA utilisation and GPU temperature every 5 s. Stale or failed reads become null."""
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    while True:
        util = temp = None
        try:
            out = subprocess.run([path, "--query-gpu=utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, errors="replace", timeout=4, creationflags=flags, check=True).stdout
            util, temp = parse_nvidia(out)
        except Exception:  # any failure is a missing reading; the sampler keeps running
            pass
        with gpu_lock:
            gpu_reading.update(gpu_percent=util, temperature_c=temp, at=time.monotonic())
        time.sleep(5)


def sample():
    boot = psutil.boot_time()
    while True:
        cpu = psutil.cpu_percent(interval=1)
        with gpu_lock:
            fresh = time.monotonic() - gpu_reading["at"] < 15
            gpu = gpu_reading["gpu_percent"] if fresh else None
            temp = gpu_reading["temperature_c"] if fresh else None
        # CPU temperature is not readable on Windows without admin rights or a
        # kernel driver, so temperature is the GPU's, labelled as such.
        # Null means unavailable; never estimate a reading.
        data = {"protocol": 1, "sampled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "cpu_percent": cpu, "ram_percent": psutil.virtual_memory().percent,
                "gpu_percent": gpu, "temperature_c": temp, "temperature_source": "gpu" if temp is not None else None,
                "uptime_seconds": max(0, int(time.time() - boot)), "control_enabled": False}
        with snapshot_lock:
            snapshot.clear()
            snapshot.update(data)


class Handler(BaseHTTPRequestHandler):
    server_version = "JarvisReadOnly/1"
    sys_version = ""  # no Python version in the Server header
    timeout = 10  # idle connections are closed instead of holding a thread

    def log_message(self, *_):
        pass  # Do not log bearer tokens, addresses or telemetry.

    def allowed(self):
        return (ipaddress.ip_address(self.client_address[0]).is_loopback
                and self.headers.get("Origin") == self.server.allowed_origin
                and self.headers.get("Host") in self.server.allowed_hosts)

    def respond(self, code, data=None, cors=False):
        body = json.dumps(data or {}).encode()
        self.send_response(code)
        if cors:
            self.send_header("Access-Control-Allow-Origin", self.server.allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed() or self.path != "/v1/status":
            return self.respond(403)
        if self.headers.get("Access-Control-Request-Method") != "GET":
            return self.respond(405, cors=True)
        requested = {v.strip().lower() for v in self.headers.get("Access-Control-Request-Headers", "").split(",") if v.strip()}
        if not requested.issubset({"authorization"}):
            return self.respond(403, cors=True)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.server.allowed_origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self.allowed():
            return self.respond(403)
        supplied = self.headers.get("Authorization", "")
        if not hmac.compare_digest(supplied.encode(), ("Bearer " + self.server.token).encode()):
            return self.respond(401, cors=True)
        if self.path != "/v1/status":
            return self.respond(404, cors=True)
        now = time.monotonic()
        with self.server.rate_lock:
            if now - self.server.last_request < 0.5:
                return self.respond(429, cors=True)
            self.server.last_request = now
        with snapshot_lock:
            data = dict(snapshot)
        self.respond(200 if data else 503, data, cors=True)

    def do_POST(self):
        self.respond(405)
    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST


class Server(ThreadingHTTPServer):
    # No other process may share the port: one that did would receive the bearer tokens.
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_server(port, token, origin, host):
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
        raise ValueError("Provide a 32–256 character URL-safe random pairing token")
    if not re.fullmatch(r"https://[a-zA-Z0-9.-]+(?::[0-9]+)?", origin):
        raise ValueError("Origin must be an exact HTTPS origin, without a path")
    if not re.fullmatch(r"[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+\.ts\.net", host):
        raise ValueError("Host must be the exact Tailscale DNS name")
    server = Server(("127.0.0.1", port), Handler)
    server.token = token
    server.allowed_origin = origin
    server.allowed_hosts = {host, "127.0.0.1:"+str(server.server_port)}
    server.last_request = 0
    server.rate_lock = threading.Lock()
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    # Take the token out of the environment so no child process (nvidia-smi) inherits it.
    server = make_server(args.port, os.environ.pop("JARVIS_READ_TOKEN", ""), args.origin, args.host)
    smi = nvidia_smi_path()
    if smi:
        threading.Thread(target=sample_gpu, args=(smi,), daemon=True).start()
    threading.Thread(target=sample, daemon=True).start()
    print("JANGE read-only companion on loopback" + (" (NVIDIA GPU readings on)" if smi else "") + ". Control features are absent.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
