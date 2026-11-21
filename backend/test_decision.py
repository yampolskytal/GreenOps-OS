import unittest
from datetime import date
from types import SimpleNamespace

from app import Workspace
from decision import combine_production, gap_priorities, investment_options
from demo import generate
from greenops import ROOT
from submission import validate
from service import package_args
from test_greenops import scratch
from verification import recover_costs


class DecisionTest(unittest.TestCase):
    def test_combined_production_applies_discount_only_to_remaining_bill(self):
        meter = {"baseline": {"chf": 1000}, "days": 2, "implementation_chf": 2200,
                 "blockers": [], "evidence": ["bill"], "chf": 200, "kg": [10, 20, 30]}
        combined = combine_production(meter, meter, 800, hypothetical=True)
        self.assertEqual(combined["chf"], 360)
        self.assertEqual(combined["kg"], [10, 20, 30])
        self.assertEqual(combined["quote_status"], "hypothetical")
        self.assertEqual(combined["implementation_chf"], 4400)

    def test_caps_accept_half_days_and_reject_truncated_values(self):
        self.assertEqual(package_args({"days": "14.5"})[:2], (16500, 14.5))
        for query in ({"days": 14.9}, {"budget": 1000.9}, {"budget": True}):
            with self.assertRaises(ValueError):
                package_args(query)

    def test_receipt_checks_inputs_and_tampering(self):
        with scratch() as path:
            data, out = path / "data", path / "out"
            generate(data)
            w = Workspace(data, ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6))
            w.export(out)
            checked = validate(out, data)
            self.assertTrue(checked["live_inputs_verified"])
            self.assertEqual(checked["run_id"], w.run_id)
            with (data / "azure_costs.csv").open("ab") as handle:
                handle.write(b"\n")
            with self.assertRaisesRegex(ValueError, "modified run input"):
                validate(out, data)
            with (out / "package.json").open("ab") as handle:
                handle.write(b"\n")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                validate(out)

    def test_cost_recovery_checks_source_and_does_not_overwrite_billing(self):
        recovered = {"source_sha256": "expected", "amount_chf": 123, "source": "Matched vendor invoice", "owner": "Finance"}
        line = {"ref": "azure_costs.csv:2", "chf": None}
        changes = []
        a = SimpleNamespace(policy={"recovered_costs": {line["ref"]: recovered}}, lines=[line],
                            sources={"azure": {"file": "azure_costs.csv", "sha256": "expected"}},
                            audit=lambda *event: changes.append(event))
        recover_costs(a)
        self.assertEqual(line["chf"], 123)
        self.assertEqual(changes[0][0], "cost_recovered")
        with self.assertRaises(ValueError):
            recover_costs(a)

    def test_scope_break_even_and_gap_priority(self):
        existing = {"id": "old", "resource": "dp-dev", "days": 5, "implementation_chf": 5500,
                    "chf": 10, "kg": [0, 20, 0], "kwh": [0,0,0]}
        other = existing | {"id": "other", "resource": "other", "chf": 50, "kg": [0, 50, 0]}
        candidate = existing | {"id": "quote", "quote_status": "quote required", "baseline": {"chf": 300},
                                "approval": "Finance", "blockers": [], "protection": [], "evidence": ["row"],
                                "kg": [0,0,0]}
        report = SimpleNamespace(a=SimpleNamespace(baseline={"chf": 400, "kg": [0,100,0]}), measures=[candidate])
        plan = {"selected": [existing, other], "day_limit": 15, "budget_chf": 16500}
        result = investment_options(report, plan)[0]
        self.assertIsNone(result["annual_savings_chf"])
        self.assertEqual(result["replacement_test"]["replaces"], ["old"])
        self.assertEqual(result["replacement_test"]["maximum_annual_quote_chf"], 250)
        gaps = [{"resource": rid, "ref": rid, "unit": "node-hour", "region": "ch", "chf": val, "kwh": None}
                for rid, val in [("outside", 100), ("dp-dev", 10)]]
        self.assertEqual(gap_priorities(gaps, plan)[0]["scope"], "dp-dev")
