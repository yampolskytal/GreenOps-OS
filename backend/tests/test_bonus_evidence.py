import csv
import json
import unittest
from datetime import date
from types import SimpleNamespace

from engine.bonus_evidence import ci_attribution
from engine.greenops import ROOT
from scripts.grid_replay import convert


class BonusEvidenceTest(unittest.TestCase):
    def test_public_hourly_proxy_matches_archived_generation(self):
        folder = ROOT / "bonus-evidence"
        raw = json.loads((folder / "de-generation.json").read_text(encoding="utf-8"))
        with (folder / "de-hourly-replay.csv").open(encoding="utf-8", newline="") as handle:
            saved = list(csv.reader(handle))[1:]
        replayed = [list(map(str, row)) for row in convert(raw)]
        self.assertEqual(replayed, saved)
        self.assertTrue(any(row[0].startswith("2026-08-31") for row in saved))
        self.assertTrue(all(0 <= float(row[2]) <= .76 for row in saved))

    def test_ci_savings_require_meter_and_optional_check_evidence(self):
        runner = "aws-region (Dublin)"
        pipeline = "nightly-full"
        base = {"from": "2026-08-01", "through": "2026-10-01", "owner": "CI owner", "source": "Recorded review"}
        run = {"started_at": "2026-08-01T09:00:00", "repo": "portal", "runner": runner,
               "pipeline": pipeline, "trigger": "schedule", "commits_since_last_nightly": 0,
               "metrics": {"duration_s": 600}, "ref": "ci.jsonl:2"}
        a = SimpleNamespace(as_of=date(2026, 9, 6), region=lambda _: "ie",
                            data={"ci_pipeline_runs": [run]},
                            lines=[{"unit": "runner-minute", "resource": "meter", "region": "ie", "month": "2026-08",
                                    "chf": 10, "quantity": 20, "kwh": [2, 4, 6], "kg": [1, 2, 3], "ref": "aws.csv:3"}],
                            policy={"measured_evidence": {}})
        r = SimpleNamespace(a=a)
        self.assertEqual(ci_attribution(r)["rows"][0]["recoverable_chf"], 0)
        a.policy["measured_evidence"] = {"ci_runner_meters": {runner: base | {"meter": "meter", "region": "ie"}},
                                         "ci_required_checks": {"portal|nightly-full": base | {"required": False, "allow_no_change_skip": True}}}
        claim = ci_attribution(r)["rows"][0]
        self.assertEqual(claim["optional_minutes"], 10)
        self.assertEqual(claim["recoverable_chf"], 5)
        self.assertEqual(claim["recoverable_kg"][1], 1)
        a.policy["measured_evidence"]["ci_required_checks"]["portal|nightly-full"]["required"] = True
        result = ci_attribution(r)["rows"][0]
        self.assertEqual(result["recoverable_chf"], 0)
        self.assertEqual(result["required_or_unknown_minutes"], 10)
