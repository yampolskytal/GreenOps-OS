"""Regression and challenge-package validation for the expanded product."""
import csv
import io
import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch
from datetime import date, datetime
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from accounting import allocate
from assistant_router import route_question
from app import BASE_NAME, MEASURE_NAME, Workspace, load_factors
from demo import generate
from frontend_api import FrontendApi, query as frontend_query
from greenops import Analysis, ROOT
from insights import query
from insights import projections
from records import Records
from scheduler import civil_time, window_bounds
from test_greenops import scratch

CHALLENGE = ROOT / "inputs" / "sprintd-basel-green-ai-data-main"


class ProductTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = cls.enterClassContext(scratch())
        cls.data = cls.root / "demo"
        generate(cls.data)
        cls.db = Records(cls.root / "history.db")
        cls.work = Workspace(cls.data, ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), store=cls.db)

    def test_snapshot_cache_and_allocation_balance(self):
        again = Workspace(self.data, ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), store=self.db)
        self.assertEqual(again.a.baseline, self.work.a.baseline)
        self.assertEqual(again.a.events, self.work.a.events)
        self.assertEqual(again.run_id, self.work.run_id)
        self.assertEqual(len(self.db.snapshots()), 1)
        alloc = allocate(again.a)
        self.assertEqual(round(sum(alloc["department_chf"].values()) + alloc["display_rounding_chf"], 2),
                         alloc["source_total_chf"])
        self.assertEqual(alloc["source_total_chf"], again.a.baseline["chf"])

    def test_official_row_ids_and_units(self):
        for name in (BASE_NAME, MEASURE_NAME):
            with (ROOT / "templates" / name).open(encoding="utf-8-sig", newline="") as handle:
                source = csv.DictReader(handle)
                filled = csv.DictReader(io.StringIO(self.work.outputs[name]))
                self.assertEqual(source.fieldnames, filled.fieldnames)
                if name == BASE_NAME:
                    left = [(r["parameter"], r["unit"], r["must_or_bonus"]) for r in source]
                    right = list(filled)
                    self.assertEqual(left, [(r["parameter"], r["unit"], r["must_or_bonus"]) for r in right])
                    self.assertTrue(all(r["value_mid"] for r in right if r["must_or_bonus"] == "Must"))

    def test_role_bound_owner_plan_and_stale_review(self):
        target = next(r for r in self.work.reports.measures if not r["blockers"])
        plan = self.work.reports.optimize(mode="approved", reviews={
            target["id"]: {"decision": "approved", "fingerprint": "stale"}})
        self.assertFalse(plan["selected"])
        accepted = self.work.reports.optimize(mode="approved", reviews={
            target["id"]: {"decision": "approved", "fingerprint": target["review_fingerprint"]}})
        self.assertEqual([m["id"] for m in accepted["selected"]], [target["id"]])
        with scratch() as tmp:
            subprocess.run([sys.executable, "app.py", "build"], cwd=ROOT, check=True, capture_output=True)
            env = dict(os.environ, PYTHONIOENCODING="utf-8")
            with subprocess.Popen([sys.executable, "app.py", "serve", "--data", str(self.data),
                                   "--state", str(tmp / "service.db"), "--port", "0"], cwd=ROOT,
                                  stdout=subprocess.PIPE, text=True, encoding="utf-8", env=env) as process:
                try:
                    start = process.stdout.readline()
                    self.assertIn("http://127.0.0.1:", start)
                    base = start.strip().split()[-1]
                    def api(path, body=None):
                        request = Request(base + path, data=json.dumps(body).encode() if body else None,
                                          headers={"Content-Type": "application/json"})
                        with urlopen(request, timeout=15) as response:
                            return json.load(response)
                    run = api("/api/settings")["run"]
                    self.assertEqual(api("/api/ledger?limit=3")["items"][0]["resource"], "dp-dev")
                    item = next(m for m in api("/api/package")["selected"] if not m["blockers"])
                    review = {"run": run, "measure": item["id"], "fingerprint": item["review_fingerprint"],
                              "decision": "approved", "evidence": "Test-only approval fixture",
                              "owner_attested": True, "protection_checked": True, "dependency_checked": True,
                              "rollback_tested": True}
                    self.assertIn("sequence", api("/api/review", review))
                    self.assertEqual(api("/api/package?mode=approved")["selected"][0]["id"], item["id"])
                    self.assertIn("sequence", api("/api/scenarios", {"run": run, "name": "Fixture", "mode": "approved"}))
                    self.assertEqual(api("/api/scenarios")[0]["payload"]["name"], "Fixture")
                    answer = api("/api/ask", {"question": "top 3 tools by carbon"})
                    self.assertEqual(len(answer["result"]), 3)
                    self.assertIn("figures", api("/api/questions/1")["results"]["ChatGPT Team"])
                    self.assertIn("formula", api("/api/overview?by=tool")[0]["figures"]["energy"])
                    self.assertIn("figures", api("/api/package/optimize", {"budget": 0, "days": 0}))
                    binding = api("/api/package?days=14.5")
                    self.assertEqual(binding["day_limit"], 14.5)
                    first = binding["selected"][0]["id"]
                    comparison = api("/api/package/compare", {"days": 14.5, "exclude": [first]})
                    self.assertIn(first, comparison["removed"])
                    self.assertNotIn(first, [m["id"] for m in comparison["alternative"]["selected"]])
                    self.assertIn(first, [m["id"] for m in api("/api/package?days=14.5")["selected"]])
                    waste = api("/api/waste?rank_by=kg")
                    self.assertTrue(all(m["included"] for m in waste))
                    self.assertEqual(api("/api/waste?mode=approved")[0]["id"], item["id"])
                    issue = api("/api/issue-queue")[0]
                    self.assertIn("sequence", api("/api/issue-review", {"run": run, "id": issue["id"],
                        "owner": "Finance owner", "evidence": "Reviewed source row", "status": "resolved"}))
                    self.assertEqual(api("/api/issue-queue")[0]["review"]["payload"]["status"], "resolved")
                    self.assertIn("market_coverage", api("/api/footprint-coverage")["total"])
                    with self.assertRaises(HTTPError) as error:
                        api("/downloads/" + MEASURE_NAME + "?mode=conditional")
                    self.assertEqual(error.exception.code, 400)
                    error.exception.close()
                finally:
                    process.terminate()
                    process.wait(timeout=8)

    def test_dst_and_overnight_windows(self):
        zone = ZoneInfo("Europe/Zurich")
        with self.assertRaises(ValueError):
            civil_time(datetime(2026, 3, 29, 2, 30), zone)
        with self.assertRaises(ValueError):
            civil_time(datetime(2026, 10, 25, 2, 30), zone)
        start, stop = window_bounds(date(2026, 2, 6), "flexible: 22:00-04:00", zone)
        self.assertEqual((stop - start).total_seconds() / 3600, 6)

    def test_chat_filter_follow_up_and_evidence(self):
        a = query(self.work, "cost in August 2026")
        self.assertEqual(a["context"]["filters"]["month"], ["2026-08"])
        b = query(self.work, "and energy?", a["context"])
        self.assertEqual(a["context"]["filters"], b["context"]["filters"])
        self.assertTrue(b["result"][0]["source_files"])
        self.assertEqual(b["context"]["metric"], "kwh")

    def test_dated_forecast_and_cash_cost(self):
        old = self.work.a
        case = SimpleNamespace(lines=old.lines, factors=old.factors, policy={"forecast": {"dated_changes": [
            {"effective_date": "2027-03-01", "annual_delta_chf": 12000, "source": "Test renewal"}
        ]}})
        first = projections(case, self.work.plan)["annual"][0]
        self.assertTrue(0 < first["known_changes"][0]["year_fraction"] < 1)
        self.assertAlmostEqual(first["chf_first_year_cash_including_implementation"][1] -
                               first["after_planned_measures"]["chf"][1], self.work.plan["spent_chf"], places=2)

    def test_daily_calendar_preserves_allocations_credits_and_missing_data(self):
        def line(day, ref, chf, kwh, kg):
            return {"day": day, "month": day[:7], "ref": ref, "chf": chf, "kwh": kwh, "kg": kg,
                    "resource": ref, "category": "Test", "department": "", "provider": "", "tool": ""}

        analysis = SimpleNamespace(data={}, lines=[
            line("2025-09-30", "server_metrics_weekly.csv:2", 0, [5, 6, 7], [1, 2, 3]),
            line("2025-09-30", "azure_costs.csv:2", -12, None, None),
            line("2025-09-28", "extra/m365_usage.csv:2", 0, [3, 7, 10], [1.4, 2.1, 2.8]),
            line("2026-08-31", "extra/m365_usage.csv:3", 0, [3, 7, 10], [1.4, 2.1, 2.8]),
        ])
        api = FrontendApi(SimpleNamespace(a=analysis, reports=SimpleNamespace(measures=[])))
        year = {row["date"]: row for row in api.daily(frontend_query({}))}
        self.assertEqual(year["2025-09-30"]["costChf"], -12)
        self.assertEqual(year["2025-09-30"]["energyKwh"], 7)
        self.assertEqual(year["2025-09-30"]["co2Kg"], 2.3)
        october = api.daily(frontend_query({"from": "2025-10", "to": "2025-10"}))
        self.assertEqual(october[0], year["2025-10-01"])
        self.assertEqual(october[0]["energyKwh"], 1)
        self.assertEqual(october[0]["coverage"], "allocated")
        self.assertIsNone(october[4]["energyKwh"])
        self.assertEqual(october[4]["coverage"], "unavailable")
        self.assertAlmostEqual(sum(row["energyKwh"] or 0 for row in year.values()), 20)

    def test_optional_llm_routes_only_and_logs_usage(self):
        reply = {"choices": [{"message": {"tool_calls": [{"function": {
            "name": "query_ledger", "arguments": json.dumps({"query": "cost by tool"})}}]}}],
                 "usage": {"prompt_tokens": 42, "completion_tokens": 9}}
        def transport(req, timeout):
            sent = json.loads(req.data)
            self.assertEqual(sent["messages"][1]["content"], "How heavy is our footprint?")
            self.assertNotIn("ledger", sent)
            return io.StringIO(json.dumps(reply))
        with patch.dict(os.environ, {"GREENOPS_OPENAI_MODEL": "test-model", "OPENAI_API_KEY": "fixture"}):
            result = route_question(self.work, "How heavy is our footprint?", transport=transport)
        self.assertEqual(result["context"]["grouping"], "tool")
        self.assertTrue(result["result"][0]["source_files"])
        self.assertEqual(self.db.history(self.work.run_id, "assistant_usage")[0]["payload"]["output_tokens"], 9)

    def test_apertus_hosted_json_paraphrase_followup_and_unsupported(self):
        calls = []
        def transport(req, timeout):
            self.assertEqual(req.full_url, "https://example.invalid/v1/chat/completions")
            sent = json.loads(req.data)
            self.assertNotIn("tools", sent)
            calls.append(sent["messages"][-1]["content"])
            text = {"Wie viel geben wir pro Tool aus?": "cost by tool"}.get(calls[-1])
            return io.StringIO(json.dumps({"choices": [{"message": {"content": json.dumps({"query": text})}}]}))
        env = {"GREENOPS_LLM_BASE_URL": "https://example.invalid/v1", "GREENOPS_LLM_MODEL": "Apertus-fixture",
               "GREENOPS_LLM_API_KEY": "fixture", "GREENOPS_LLM_TOOLS": "0"}
        with patch.dict(os.environ, env, clear=True):
            answer = route_question(self.work, "Wie viel geben wir pro Tool aus?", transport=transport)
            followup = route_question(self.work, "and carbon?", answer["context"], transport=transport)
            rejected = route_question(self.work, "Restart our workloads", transport=transport)
        self.assertEqual(answer["context"]["grouping"], "tool")
        self.assertEqual(followup["context"]["metric"], "kg")
        self.assertIsNone(rejected["result"])
        self.assertEqual(len(calls), 2)

    def test_provider_identity_collision(self):
        with scratch() as directory:
            (directory / "azure_costs.csv").write_text(
                "Date,ResourceId,ResourceLocation,Quantity,UnitOfMeasure,CostInBillingCurrency,BillingCurrency\n"
                "2026-08-01,/sub/one/shared,Zurich,24,vCPU-hour,1,CHF\n")
            (directory / "aws_costs.csv").write_text(
                "line_item_usage_start_date,line_item_resource_id,product_region,line_item_usage_amount,pricing_unit,line_item_unblended_cost,line_item_currency_code\n"
                "2026-08-01,arn:aws:ec2:one:instance/shared,Dublin,24,vCPU-hour,1,CHF\n")
            a = Analysis(directory, load_factors(ROOT / "factors.json"))
            self.assertEqual(a.collisions, {"shared"})
            self.assertEqual(len({r["resource"] for r in a.lines}), 2)
            self.assertEqual(a.baseline["chf"], 2)

    @unittest.skipUnless(CHALLENGE.is_dir(), "Official challenge package not installed")
    def test_official_challenge_safety_and_shape(self):
        policy = json.loads((ROOT / "challenge-policy.json").read_text(encoding="utf-8"))
        work = Workspace(CHALLENGE, ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), policy=policy)
        self.assertEqual(len(work.a.sources), 28)
        self.assertTrue(all(r["accepted"] for r in work.a.sources.values()))
        self.assertGreater(len(work.a.lines), 40_000)
        self.assertTrue(any(e["code"] == "ai_output_imputed" for e in work.a.events))
        self.assertEqual(work.a.baseline["chf"], 463658.02)
        self.assertEqual(work.answers["gpu"]["results"][0]["resource"], "gpu-ml")
        self.assertGreater(work.answers["gpu"]["results"][0]["chf"], 0)
        conditional = work.package(mode="conditional")
        self.assertLessEqual(conditional["spent_chf"], 16500)
        self.assertLessEqual(conditional["days"], 15)
        self.assertFalse(any(r["hard_blockers"] for r in conditional["selected"]))
        self.assertTrue(any(r["resource"] == "dp-prod" and r["hard_blockers"] for r in conditional["excluded"]))
        self.assertFalse(work.package(mode="approved")["selected"])
        self.assertTrue(work.plan["pending_approvals"])
        self.assertTrue(all(m["status"] != "blocked" for m in work.plan["selected"]))
        bundle = next(m for m in work.reports.measures if m["resource"] == "licences")
        self.assertEqual(bundle["days"], 2)
        fleet = next(m for m in work.reports.measures if m["name"] == "Schedule 12 Dublin test servers")
        self.assertEqual(len(fleet["members"]), 12)
        self.assertNotIn("dr-failover", fleet["members"])
        self.assertTrue(work.reports.protection_day("vm-test", "2026-03-31"))
        self.assertFalse(work.reports.protection_day("vm-test", "2026-04-01"))
        self.assertTrue(any(m["resource"] == "dr-failover" and m["status"] == "blocked" for m in work.reports.measures))
        self.assertTrue({"T-1094", "T-1039", "T-1029", "T-1204", "T-1167"} <=
                        {r["ticket_id"] for r in work.views["protections"]["ticket_records"]})
        self.assertIn("Project ID alias", work.views["contradictions"]["counts"])
        quote = work.compare_package(16500, 15, "midpoint", [], 45000)
        candidate = [x for x in quote["alternative"]["selected"] if x["id"] == "Autoscale and reprice production compute:dp-prod"]
        if candidate:
            self.assertTrue(candidate[0]["requires_approval"])
            self.assertEqual(candidate[0]["calculation_inputs"]["comparable_full_volume_quote_chf"], 45000)
        self.assertNotIn("Autoscale and reprice production compute:dp-prod", [m["id"] for m in work.plan["selected"]])
