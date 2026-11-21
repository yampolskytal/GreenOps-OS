"""Verify that the v2 market footprint and scenarios stay on supported activity."""
import unittest
from types import SimpleNamespace

from accounting import MarketSummary, check_market, market_reduction, market_relocation, merge_market_effects
from evidence import totals_explained
from frontend_api import FrontendApi, query
from greenops import total


def line(day, region, energy, source="azure_costs.csv", provider="Azure", department="IT"):
    return {"ref": f"{source}:{day}:{region}", "day": day, "month": day[:7], "region": region,
            "provider": provider, "department": department, "category": "Cloud", "resource": region,
            "tool": region, "chf": 30, "kwh": [energy] * 3 if energy is not None else None,
            "kg": [energy * .25] * 3 if energy is not None else None}


def workspace(rows, policy=None):
    a = SimpleNamespace(lines=rows, data={}, policy=policy or {}, factors={
        "market_grid": {"de": {"values": [.5, .7, .9], "source": "German disclosure", "note": "Residual proxy"}},
        "growth": {"values": [0, .1, .2], "source": "Scenario assumptions"},
    })
    check_market(a)
    a.baseline = total(rows)
    figures = totals_explained(a.baseline, [])
    w = SimpleNamespace(a=a, reports=SimpleNamespace(measures=[]), plan={"selected": [], "pending_approvals": []},
                        views={"summary": {"figures": figures}})
    return FrontendApi(w)


def measure(ident, effect):
    return {"id": ident, "resource": ident, "hard_blockers": [], "exclusive": None, "chf": 100,
            "kg": [4, 5, 6], "kwh": [10] * 3, "days": 1, "implementation_chf": 1100, "market_effect": effect}


class MarketV2Test(unittest.TestCase):
    def setUp(self):
        self.rows = [line("2026-01-01", "de", 10),
                     line("2026-01-01", "ch", 10, provider="Swiss Hoster", department="Finance"),
                     line("2026-01-30", "de", 14, source="extra/m365_usage.csv")]
        self.api = workspace(self.rows)
        self.q = query({})

    def test_months_days_and_entities_reconcile_on_covered_activity(self):
        overview = self.api.overview(self.q)
        self.assertEqual(overview["co2Market"]["value"]["mid"], 16.8)
        self.assertEqual(overview["marketCoverage"]["uncoveredKwh"], 10)
        self.assertEqual(overview["marketCoverage"]["status"], "partial")
        months = {m["month"]: m for m in overview["monthly"]}
        self.assertEqual(months["2026-01"]["co2KgMarket"], 9.8)
        self.assertEqual(months["2026-02"]["co2KgMarket"], 7)
        self.assertIn("German disclosure", months["2026-02"]["evidence"]["co2KgMarket"]["sources"])
        feb = query({"from": "2026-02", "to": "2026-02"})
        days = self.api.daily(feb)
        self.assertEqual(days[0]["co2KgMarket"], 1.4)
        self.assertEqual(days[0]["marketCoverage"]["allocatedCoveredKwh"], 2)
        self.assertIsNone(days[5]["co2KgMarket"])
        queried = self.api.breakdowns(feb)
        self.assertEqual(queried["byProvider"][0]["co2KgMarket"], 7)
        groups = self.api.breakdowns(self.q)
        for grouping, label in (("byProvider", "Swiss Hoster"), ("byDepartment", "Finance")):
            datum = next(r for r in groups[grouping] if r["label"] == label)
            self.assertIsNone(datum["co2KgMarket"])
            self.assertEqual(datum["marketCoverage"]["coveragePct"], 0)
            self.assertEqual(datum["marketCoverage"]["uncoveredRegions"], ["ch"])

    def test_partial_supplier_instrument_with_no_residual_factor(self):
        invoice = line("2026-01-01", "ch", 10)
        instrument = {"provider": "Azure", "region": "ch", "from": "2026-01-01", "through": "2026-08-31",
                      "coverage": .4, "kg_per_kwh": 0, "source": "Attestation", "instrument_id": "case-1",
                      "exclusive_attestation": True}
        api = workspace([invoice], {"supplier_instruments": [instrument]})
        total_market = api.overview(self.q)
        self.assertEqual(total_market["co2Market"]["value"]["mid"], 0)
        self.assertEqual(total_market["marketCoverage"]["coveredKwh"], 4)
        self.assertEqual(total_market["marketCoverage"]["status"], "partial")
        self.assertEqual(api.forecast(self.q, "co2Market", 1, [])["points"], [])
        self.assertNotIn("co2Market", [x["metric"] for x in total_market["forecastSupport"]])

    def test_partial_and_unsupported_savings_and_forecasts(self):
        shutdown = market_reduction([self.rows[0]], .5)
        move = market_relocation(self.api.a, [self.rows[0]], "ch", .5)
        scope = merge_market_effects([shutdown, move])
        unsupported = market_reduction([self.rows[1]], 1)
        self.api.measures = {key: measure(key, effect) for key, effect in
                             (("move", scope), ("uncovered", unsupported), ("price", market_reduction([], 0)))}
        savings = self.api.simulate(self.q, {"measureIds": ["move", "uncovered", "price"]})
        self.assertEqual(savings["savingsCo2KgMarket"], 3.5)
        self.assertEqual(savings["marketSavings"]["partialMeasureIds"], ["move"])
        self.assertEqual(savings["marketSavings"]["unavailableMeasureIds"], ["uncovered"])
        absent = self.api.simulate(self.q, {"measureIds": ["uncovered", "price"]})
        self.assertIsNone(absent["savingsCo2KgMarket"])
        no_effect = self.api.forecast(self.q, "co2Market", 1, ["uncovered"])
        self.assertIsNone(no_effect["points"][1]["optimized"])
        limited_effect = self.api.forecast(self.q, "co2Market", 1, ["move", "uncovered"])
        self.assertEqual(limited_effect["points"][1]["baseline"]["mid"], 18.48)
        self.assertEqual(limited_effect["points"][1]["optimized"]["mid"], 14.98)
        long_term = self.api.forecast(self.q, "co2Market", 3, ["move", "uncovered"])
        self.assertEqual(long_term["annualTotals"][-1]["year"], 2029)
        final = long_term["annualTotals"][-1]
        self.assertAlmostEqual(final["baseline"]["mid"] - final["optimized"]["mid"], 3.5 * 1.1**2, places=3)
        self.assertIn("move", limited_effect["marketSavings"]["forecastLimitedMeasureIds"])
        self.assertTrue(any("Selected" in x or "selected" in x for x in limited_effect["methodology"]["limitations"]))

    def test_missing_energy_is_separate_from_uncovered_modeled_energy(self):
        unknown = line("2026-01-01", "de", None)
        api = workspace([self.rows[0], unknown])
        market = api.overview(self.q)["marketCoverage"]
        self.assertEqual(market["coveragePct"], 100)
        self.assertEqual(market["missingEnergyRows"], 1)
        self.assertEqual(market["status"], "partial")
        self.assertIsNone(MarketSummary([unknown]).result())
