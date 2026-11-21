"""Regression coverage for evidence eligibility, dependencies and implementation costs."""
from types import SimpleNamespace
import unittest

from analytics import Reports
from frontend_api import FrontendApi, query
from planning import measure_decisions


def measure(ident, *, cost=0, carbon=0, energy=0, days=1, setup=0, **fields):
    return {"id": ident, "resource": ident, "chf": cost, "kg": [carbon] * 3,
            "kwh": [energy] * 3, "kg_market": None, "days": days, "implementation_chf": days * 1100 + setup,
            "first_year_chf": cost, "review_fingerprint": ident, "blockers": [],
            "hard_blockers": [], "requires": [], "exclusive": None} | fields


def api_for(rows):
    analysis = SimpleNamespace(lines=[], policy={}, baseline={"chf": 1000, "kg": [100] * 3})
    reports = Reports.__new__(Reports)
    reports.a, reports.measures = analysis, rows
    return FrontendApi(SimpleNamespace(a=analysis, reports=reports, views={},
                                       package=lambda budget, days, mode, objective, daily_rate:
                                       reports.optimize(budget, days, mode, objective, daily_rate=daily_rate)))


class PlanningDecisionsTest(unittest.TestCase):
    def test_single_metric_benefits_and_protections_are_retained(self):
        measures = [measure("licences", cost=100), measure("orphan", carbon=50),
                    measure("dr", carbon=90, hard_blockers=["T-1094"]),
                    measure("quote", quote_status="quote required", baseline={"chf": 200}),
                    measure("flat")]
        decisions = measure_decisions(measures)
        self.assertEqual(decisions["licences"]["benefits"], ["cost"])
        self.assertEqual(decisions["orphan"]["benefits"], ["co2Location"])
        self.assertEqual(decisions["dr"]["status"], "protected")
        self.assertEqual(decisions["quote"]["status"], "evidence-needed")
        self.assertEqual(decisions["quote"]["scopedAnnualCostChf"], 200)
        self.assertEqual(decisions["flat"]["status"], "no-benefit")
        api = api_for(measures)
        sim = api.simulate(query({}), {"measureIds": ["licences", "orphan", "quote", "flat", "dr"]})
        self.assertEqual(sim["includedMeasureIds"], ["licences", "orphan"])
        self.assertEqual({r["id"] for r in sim["excluded"]}, {"quote", "flat", "dr"})
        self.assertEqual(sim["savingsChf"], 100)
        self.assertEqual(sim["savingsCo2Kg"], 50)

    def test_dependencies_are_transitive_and_prerequisites_require_a_use(self):
        rows = [measure("work", cost=400, carbon=50, requires=["setup"]),
                measure("setup", requires=["verify"]), measure("verify")]
        api = api_for(rows)
        self.assertEqual(api.decisions["setup"]["status"], "prerequisite")
        for ids in (["work", "setup"], ["verify"], ["work"]):
            self.assertEqual(api.simulate(query({}), {"measureIds": ids})["includedMeasureIds"], [])
        result = api.optimize(query({}), {})
        self.assertEqual(set(result["measureIds"]), {"work", "setup", "verify"})
        self.assertTrue(result["searchComplete"])
        self.assertEqual(result["result"]["effortDays"], 3)

    def test_excluded_dependency_releases_a_conflicting_scope(self):
        api = api_for([measure("b", cost=300, resource="meter-b"),
                       measure("a", carbon=50, resource="meter-a", requires=["required"]),
                       measure("required", carbon=1, resource="meter-b"),
                       measure("alternative", carbon=20, resource="meter-a")])
        result = api.simulate(query({}), {"measureIds": ["b", "a", "required", "alternative"]})
        self.assertEqual(result["includedMeasureIds"], ["b", "alternative"])
        self.assertEqual({e["id"] for e in result["excluded"]}, {"a", "required"})

    def test_optimizer_respects_custom_rate_and_one_time_charges(self):
        api = api_for([measure("expensive", days=2, setup=1200, cost=800, carbon=80),
                       measure("fits", cost=250, carbon=65)])
        result = api.optimize(query({}), {"budgetChf": 3000, "chfPerPersonDay": 1000})
        self.assertEqual(result["measureIds"], ["fits"])
        self.assertEqual(result["result"]["effortChf"], 1000)
        self.assertEqual(result["result"]["firstYearNetChf"], -750)

    def test_cost_objective_counts_first_year_net_and_balanced_keeps_run_rate(self):
        api = api_for([measure("strong", cost=1500, carbon=60),
                       measure("tiny", cost=13, carbon=.01)])
        self.assertEqual(set(api.optimize(query({}), {"priority": "balanced"})["measureIds"]), {"strong", "tiny"})
        self.assertEqual(api.optimize(query({}), {"priority": "cost"})["measureIds"], ["strong"])


if __name__ == "__main__":
    unittest.main()
