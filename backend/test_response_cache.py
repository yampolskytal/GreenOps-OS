"""Response caching must return byte-identical results, coalesce work and invalidate on review changes."""
import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from datetime import date
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app import ROOT, Workspace
from records import Records
from response_cache import ResponseCache, encode
import frontend_api


class ResponseCacheUnit(unittest.TestCase):
    def test_concurrent_identical_requests_compute_once(self):
        cache, calls, gate = ResponseCache(), [], threading.Event()
        def compute():
            calls.append(1)
            gate.wait(5)
            return {"value": 1}
        results = []
        threads = [threading.Thread(target=lambda: results.append(cache.get_or_compute("k", compute)))
                   for _ in range(8)]
        for thread in threads:
            thread.start()
        while cache.stats()["joined"] < 7:
            time.sleep(0.005)
        gate.set()
        for thread in threads:
            thread.join(5)
        self.assertEqual(len(calls), 1)
        self.assertEqual({body for body, _ in results}, {encode({"value": 1})})
        self.assertEqual(sorted(outcome for _, outcome in results), ["joined"] * 7 + ["miss"])
        self.assertEqual(cache.get_or_compute("k", compute)[1], "hit")

    def test_errors_are_not_cached(self):
        cache, calls = ResponseCache(), []
        def failing():
            calls.append(1)
            raise ValueError("bad input")
        for _ in range(2):
            with self.assertRaises(ValueError):
                cache.get_or_compute("k", failing)
        self.assertEqual(len(calls), 2)
        self.assertEqual(cache.stats()["entries"], 0)

    def test_byte_budget_evicts_least_recent(self):
        cache = ResponseCache(max_bytes=200, max_entry_bytes=150)
        for name in ("a", "b", "c"):
            cache.get_or_compute(name, lambda: "x" * 80)
        self.assertLessEqual(cache.stats()["bytes"], 200)
        self.assertEqual(cache.get_or_compute("c", lambda: "changed")[1], "hit")
        self.assertEqual(cache.get_or_compute("a", lambda: "x" * 80)[1], "miss")
        cache.get_or_compute("huge", lambda: "x" * 500)
        self.assertEqual(cache.get_or_compute("huge", lambda: "x" * 500)[1], "miss")


class CachedApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(cls.enterClassContext(tempfile.TemporaryDirectory()))
        cls.store = Records(cls.tmp / "state.db")
        cls.work = Workspace(ROOT / "demo-data", ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), {}, cls.store)
        frontend_api.warm(cls.work).join(60)

    def test_default_strategies_are_precomputed_and_identical_to_fresh_results(self):
        api = frontend_api.adapter(self.work)
        for priority in frontend_api.DEFAULT_PRIORITIES:
            body = {"budgetChf": 16500, "priority": priority, "chfPerPersonDay": 1100}
            cached, outcome = frontend_api.respond_post(self.work, "optimize", {}, body)
            self.assertEqual(outcome, "hit")
            self.assertEqual(cached, encode(frontend_api.handle_post(self.work, "optimize", {}, body)))
        # Equivalent inputs share one entry.
        self.assertEqual(frontend_api.respond_post(self.work, "optimize", {}, {"budgetChf": 16500.0, "priority": "co2"})[1], "hit")
        for route in ("overview", "measures"):
            cached, outcome = frontend_api.respond_get(self.work, route, {})
            self.assertEqual(outcome, "hit")
            self.assertEqual(cached, encode(frontend_api.handle_get(self.work, route, {})))
        self.assertGreaterEqual(api.responses.stats()["entries"], 5)

    def test_review_decisions_invalidate_optimization(self):
        body = {"budgetChf": 16000, "priority": "balanced"}
        before = json.loads(frontend_api.respond_post(self.work, "optimize", {}, body)[0])
        self.assertTrue(before["measureIds"])
        rejected = next(m for m in self.work.reports.measures if m["id"] == before["measureIds"][0])
        self.store.append("tester", self.work.run_id, "review", {
            "measure": rejected["id"], "fingerprint": rejected["review_fingerprint"], "decision": "rejected",
            "evidence": "Test-only rejection"})
        after, outcome = frontend_api.respond_post(self.work, "optimize", {}, body)
        self.assertEqual(outcome, "miss")
        self.assertNotIn(rejected["id"], json.loads(after)["measureIds"])
        self.assertEqual(after, encode(frontend_api.handle_post(self.work, "optimize", {}, body)))

    def test_new_workspace_starts_with_an_empty_cache(self):
        frontend_api.respond_get(self.work, "bonus", {})
        rebuilt = Workspace(ROOT / "demo-data", ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), {}, self.store)
        self.assertEqual(frontend_api.respond_get(rebuilt, "bonus", {})[1], "miss")

    def test_unknown_routes_and_chat_are_not_cached(self):
        with self.assertRaises(frontend_api.UnknownRoute):
            frontend_api.respond_get(self.work, "missing", {})
        calls = []
        with mock.patch.object(frontend_api, "handle_post", lambda *args: calls.append(args) or {"role": "assistant"}):
            for _ in range(2):
                self.assertEqual(frontend_api.respond_post(self.work, "chat", {}, {"messages": []})[1], "bypass")
        self.assertEqual(len(calls), 2)


class ServiceAuthAndCache(unittest.TestCase):
    def test_verified_credentials_and_cache_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            salt = b"s" * 24
            digest = hashlib.pbkdf2_hmac("sha256", b"correct-password-123", salt, 600000)
            accounts = tmp / "accounts.json"
            accounts.write_text(json.dumps({"viewer": {"role": "viewer", "salt": salt.hex(), "digest": digest.hex()}}))
            subprocess.run([sys.executable, "app.py", "build"], cwd=ROOT, check=True, capture_output=True)
            with subprocess.Popen([sys.executable, "app.py", "serve", "--data", str(ROOT / "demo-data"),
                                   "--state", str(tmp / "state.db"), "--accounts", str(accounts), "--port", "0"],
                                  cwd=ROOT, stdout=subprocess.PIPE, text=True, encoding="utf-8") as process:
                try:
                    base = process.stdout.readline().strip().split()[-1]
                    def call(password, path="/api/v2/optimize", body=None):
                        body = body or {"budgetChf": 16500, "priority": "cost", "chfPerPersonDay": 1100}
                        token = base64.b64encode(f"viewer:{password}".encode()).decode()
                        request = Request(base + path, data=json.dumps(body).encode(), headers={
                            "Content-Type": "application/json", "Authorization": "Basic " + token})
                        with urlopen(request, timeout=30) as response:
                            return response.headers.get("X-GreenOps-Cache"), json.load(response)
                    outcome, first = call("correct-password-123")
                    self.assertIn(outcome, ("hit", "joined", "miss"))
                    with self.assertRaises(HTTPError) as denied:
                        call("wrong-password-123")
                    self.assertEqual(denied.exception.code, 401)
                    outcome, again = call("correct-password-123")
                    self.assertEqual(outcome, "hit")
                    self.assertEqual(first, again)
                finally:
                    process.terminate()


if __name__ == "__main__":
    unittest.main()
