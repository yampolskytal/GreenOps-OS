from datetime import date
from types import SimpleNamespace
import unittest

from engine.forecast_scenarios import dashboard_forecast
from engine.bonus import forecast
from engine.runtime import recent_runtime


class DashboardForecastRuntimeTest(unittest.TestCase):
    def test_one_off_spike_is_not_replayed_and_months_reconcile(self):
        observed = []
        for m in (*range(9, 13), *range(1, 9)):
            value = 300 if m == 3 else 100
            observed.append({"name": f"{2025 + int(m <= 8)}-{m:02}", "chf": value,
                             "kg": [value] * 3, "kwh": [value] * 3})
        a = SimpleNamespace(grouped=lambda _: observed, factors={"growth": {"values": [0, .05, .1]}},
                            baseline={"chf": 1400, "kwh": [1400] * 3, "kg": [1400] * 3})
        model = forecast(a, damp_growth=True)
        for i, year in enumerate(model["results"]):
            rows = model["monthly"]["chf"][12 * i:12 * (i + 1)]
            for j in range(3):
                self.assertAlmostEqual(sum(r["values"][j] for r in rows), year["chf"][j])
            feb, mar, apr = (r["values"][1] for r in rows[5:8])
            self.assertTrue(min(feb, apr) <= mar <= max(feb, apr))

    def test_dated_capacity_and_renewals_change_the_shape_and_reconcile(self):
        a = SimpleNamespace(as_of=date(2026, 9, 6), lines=[], policy={"forecast": {"dated_changes": [{
            "effective_date": "2026-10-01", "source": "Case ticket", "annual_delta_chf": 3650,
        }]}})
        model = {"monthly": {"chf": [{"month": f"{year+int(m<=8)}-{m:02}", "values": [1000] * 3,
                                     "observed_base": True}
                                    for year in range(2026, 2029) for m in (*range(9, 13), *range(1, 9))]}}
        measure = {"chf": 3650, "first_year_chf": 3000, "implementation_chf": 500,
                   "components": [{"effective_date": "2027-01-01", "chf": 3650}]}
        months, years, drivers, assumptions = dashboard_forecast(a, model, "chf", 3, [measure])
        self.assertEqual(months[0]["baseline"][1], 1000)
        self.assertEqual(months[0]["optimized"][1], 1500)
        self.assertGreater(months[1]["baseline"][1], months[0]["baseline"][1])
        self.assertEqual(months[3]["baseline"][1], months[3]["optimized"][1])
        self.assertLess(months[4]["optimized"][1], months[4]["baseline"][1])
        self.assertEqual(years[-1]["year"], 2029)
        self.assertAlmostEqual(years[0]["optimized"][1], sum(m["optimized"][1] for m in months[:12]))
        self.assertAlmostEqual(years[-1]["baseline"][1] - years[-1]["optimized"][1], 3650)
        self.assertIn("Case ticket", {d["source"] for d in drivers})
        self.assertFalse(assumptions)

    def test_recurring_effects_follow_the_affected_workload_beyond_the_first_year(self):
        fiscal_months = (*range(9, 13), *range(1, 9))
        a = SimpleNamespace(as_of=date(2026, 9, 1), policy={}, factors={"growth": {"values": [-.02, .08, .20]}},
                            lines=[{"resource": rid, "month": f"{2025 + int(m <= 8)}-{m:02}",
                                    "kwh": [100 * (1 + rate) ** (i / 12)] * 3}
                                   for i, m in enumerate(fiscal_months)
                                   for rid, rate in (("cluster", .15), ("unrelated", -.20))])
        model = {"monthly": {"kwh": [{"month": f"{y + int(m <= 8)}-{m:02}", "values": [1000 * 1.05 ** (y - 2026)] * 3,
                                     "observed_base": True} for y in range(2026, 2029) for m in fiscal_months]}}
        measure = {"id": "cluster-change", "resource": "cluster", "name": "Run fewer workers", "kwh": [900, 1200, 1500]}
        months, years, _, assumptions = dashboard_forecast(a, model, "kwh", 3, [measure])
        gap = lambda row: row["baseline"][1] - row["optimized"][1]
        self.assertEqual(len(months), 36)
        self.assertAlmostEqual(gap(years[0]), 1200)
        self.assertGreater(gap(years[1]), gap(years[0]))
        self.assertGreater(gap(years[2]) / years[2]["baseline"][1], gap(years[1]) / years[1]["baseline"][1])
        self.assertGreater(sum(map(gap, months[-3:])), sum(map(gap, months[21:24])))
        self.assertIn("+15.0%/year", assumptions[0])

    def test_runtime_reports_workload_separately_from_cpu_and_unknown_hours(self):
        a = SimpleNamespace(as_of=date(2026, 9, 6), rid=lambda value: value, inventory={
            "vm": {"runtime_h_30d": "720", "cpu_utilisation_30d_pct": "27"},
            "missing": {"runtime_h_30d": ""},
        }, data={"data_platform_usage": [
            {"date": "2026-09-06", "resource_id": "cluster", "runtime_h": "24", "active_use_h": "4"},
            {"date": "2026-09-05", "resource_id": "cluster", "runtime_h": "22", "active_use_h": ""},
            {"date": "2026-08-01", "resource_id": "cluster", "runtime_h": "24", "active_use_h": "3"},
        ], "server_metrics_weekly": [
            {"week_start": "2026-08-31", "server_id": "vm", "uptime_h": "168", "gpu_avg_pct": "5"},
        ]})
        rows = recent_runtime(a)
        self.assertEqual(rows["cluster"]["runtimeH30d"], 46)
        self.assertEqual(rows["cluster"]["activeH30d"], 4)
        self.assertEqual(rows["cluster"]["unclassifiedRuntimeH30d"], 22)
        self.assertEqual(rows["cluster"]["runtimeEvidence"]["observedDays"], 2)
        self.assertEqual(rows["vm"]["cpuAvgPct"], 27)
        self.assertEqual(rows["vm"]["gpuAvgPct"], 5)
        self.assertIsNone(rows["vm"]["activeH30d"])
        self.assertIsNone(rows["missing"]["runtimeH30d"])


if __name__ == "__main__":
    unittest.main()
