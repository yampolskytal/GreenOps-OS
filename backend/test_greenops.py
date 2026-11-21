import csv
import json
import subprocess
import sys
import os
import shutil
import unittest
from contextlib import contextmanager
from datetime import date
from urllib.error import HTTPError
from urllib.request import urlopen
from uuid import uuid4

from app import BASE_NAME, MEASURE_NAME, Workspace, load_factors
from demo import generate
from greenops import BONUS, CORE, ROOT, Analysis, csv_text


@contextmanager
def scratch():
    path = ROOT / (".test-" + uuid4().hex)
    path.mkdir()
    try:
        yield path
    finally:
        if path.resolve().parent == ROOT:
            shutil.rmtree(path)


class GreenOpsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = cls.enterClassContext(scratch()) / "data"
        generate(cls.data)
        cls.ws = Workspace(cls.data, ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6))

    def test_connect_all_and_dedup(self):
        a = self.ws.a
        self.assertEqual(set(a.sources), set(CORE + BONUS))
        self.assertTrue(all(r["present"] and r["accepted"] and r["sha256"] for r in a.sources.values()))
        self.assertEqual(len(a.data["azure_costs"]), 365 * 3 + 1)
        self.assertEqual(len(a.data["ai_subscriptions"]), 24)
        self.assertEqual(sum(r["chf"] == -15 for r in a.lines), 1)
        self.assertEqual(sum(r["chf"] is None for r in a.lines), 1)
        self.assertFalse(any(r["category"] == "Servers" for r in a.lines))
        line = next(r for r in a.lines if r["resource"] == "dp-dev")
        self.assertAlmostEqual(line["chf"], 210 * .94)
        self.assertAlmostEqual(line["kwh"][1], 96 * .076 * 1.25)
        self.assertAlmostEqual(line["kg"][1], line["kwh"][1] * .374)

    def test_answers_and_protection(self):
        answers = self.ws.answers
        product = answers["unused-seats"]["results"]["ChatGPT Team"]
        self.assertEqual((product["purchased"], product["active"], product["unused"]), (70, 28, 42))
        self.assertGreater(product["unused_chf_per_month"], 900)
        self.assertEqual(answers["gpu"]["results"][0]["mean_weekly_gpu_pct"], 9)
        prod = answers["production"]["results"][0]
        self.assertGreater(len(prod["active_nonworkday_refs"]), 100)
        self.assertIn("01:00", prod["ticket_evidence"][0]["description"])
        blocked = {r["resource"] for r in self.ws.plan["excluded"] if r["blockers"]}
        self.assertTrue({"dp-prod", "gpu-lab"} <= blocked)

    def test_plan_limits_and_evidence(self):
        plan = self.ws.plan
        self.assertTrue(plan["optimum_proven"])
        self.assertTrue(plan["selected"])
        self.assertLessEqual(plan["days"], 15)
        self.assertLessEqual(plan["spent_chf"], 16500)
        self.assertTrue(all(r["evidence"] and not r["blockers"] for r in plan["selected"]))
        self.assertEqual(len({r["resource"] for r in plan["selected"]}), len(plan["selected"]))
        self.assertEqual(plan["target_met"], plan["cost_fraction"] >= .25 and plan["carbon_fraction"] >= .40)
        self.assertFalse(self.ws.reports.optimize(budget=700, days=15)["selected"])

    def test_bonus_reconcile_forecast_and_schedule(self):
        x = self.ws.views
        self.assertTrue(any(r["type"] == "AI invoice vs gateway" and r["delta_chf"] for r in x["reconciliation"]))
        self.assertTrue(any(r["missing_cost_lines"] == 1 and r["delta_chf"] is None for r in x["reconciliation"] if "missing_cost_lines" in r))
        self.assertEqual(x["forecast"]["baseline_months_observed"], 12)
        self.assertEqual(len(x["forecast"]["results"]), 3)
        d = x["diagnostics"]
        self.assertGreater(d["ci"][0]["no_change_nightly"], 0)
        self.assertEqual(len(d["clusters"]["groups"]), 3)
        flexible = next(j for j in d["jobs"] if j["resource"] == "dp-dev")
        self.assertEqual(flexible["suggested_start"], "12:45")
        self.assertGreater(flexible["kg_avoided"][1], 0)
        self.assertTrue(all("suggested_start" not in j for j in d["jobs"] if j["resource"] == "dp-prod"))

    def test_conflicting_final_and_fx_are_not_imputed(self):
        with scratch() as tmp:
            path = tmp
            (path / "exchange_rates.csv").write_text("month,usd_chf\n2026-08-01,.8\n2026-08-01,.9\n")
            (path / "ai_subscriptions.csv").write_text(
                "month,product,provider,cost_center,contract_status,licences_purchased,price_per_seat,currency,amount\n"
                "2026-08-01,Plan A,Provider,4500,Final,5,20,USD,100\n"
                "2026-08-01,Plan B,Provider,4500,Final,5,20,USD,100\n"
                "2026-08-01,Plan B,Provider,4500,Final,5,20,USD,110\n")
            a = Analysis(path, load_factors(ROOT / "factors.json"))
            self.assertEqual(len(a.lines), 1)
            self.assertIsNone(a.lines[0]["chf"])
            self.assertEqual(a.baseline["missing_cost"], 1)
            self.assertEqual(a.lines[0]["department"], "IT")
            self.assertTrue({"conflicting_key", "contract_version", "missing_fx"} <= {r["code"] for r in a.events})

    def test_csv_and_json_exports(self):
        with scratch() as tmp:
            out = tmp
            self.ws.export(out)
            with (out / BASE_NAME).open(encoding="utf-8-sig") as source:
                rows = list(csv.DictReader(source))
                self.assertIn("REPRESENTATIVE DEMO", rows[0]["source"])
            with (out / MEASURE_NAME).open(encoding="utf-8-sig") as source:
                self.assertEqual(len(list(csv.DictReader(source))), len(self.ws.plan["selected"]))
            self.assertEqual(json.loads((out / "summary.json").read_text(encoding="utf-8"))["baseline"], self.ws.a.baseline)
        self.assertIn("'=1+1", csv_text(["value"], [["=1+1"]]))

    def test_http_smoke(self):
        subprocess.run([sys.executable, "app.py", "build"], cwd=ROOT, check=True, capture_output=True)
        with subprocess.Popen([sys.executable, "app.py", "serve", "--data", str(self.data), "--port", "0"],
                              cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
                              env={**os.environ, "PYTHONIOENCODING": "utf-8"}) as proc:
            try:
                startup = proc.stdout.readline()
                self.assertIn("http://127.0.0.1:", startup)
                base = startup.strip().split()[-1]
                for route in ("", "/app.js", "/style.css", "/api/summary", "/api/package", "/api/forecast",
                              "/api/diagnostics", "/api/reconciliation", "/api/questions/gpu", "/downloads/" + BASE_NAME):
                    with urlopen(base + route, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                        self.assertTrue(response.read())
                with urlopen(base + "/api/package?budget=800&days=3", timeout=5) as response:
                    self.assertEqual(json.load(response)["selected"], [])
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(base + "/api/package?days=16", timeout=5)
                self.assertEqual(invalid.exception.code, 400)
                invalid.exception.close()
                with self.assertRaises(HTTPError) as error:
                    urlopen(base + "/api/unknown", timeout=5)
                self.assertEqual(error.exception.code, 404)
                error.exception.close()
            finally:
                proc.terminate()
                proc.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
