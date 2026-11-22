"""Daily operating scenarios for metered platform clusters."""
from collections import defaultdict
from datetime import timedelta
from statistics import mean, median

from greenops import END, START, day, natural


class PlatformRuntime:
    def __init__(self, a):
        self.changes = a.policy.get("forecast", {}).get("node_capacity_changes", [])
        self.protections = a.policy.get("protection_register", [])
        self.readings = defaultdict(dict)
        self.active = defaultdict(list)
        self.reserves = defaultdict(list)
        self.trends = {}
        self.capacity = {}
        job_months = defaultdict(set)
        data = getattr(a, "data", {})
        self.workdays = {d: row["workday"] == "1" for row in data.get("business_calendar", ())
                         if (d := day(row.get("date"))) is not None and row.get("workday") in ("0", "1")}
        for row in data.get("data_platform_usage", ()):
            d = day(row.get("date"))
            rid = a.rid(row.get("resource_id"))
            runtime, active, nodes = (natural(row.get(k)) for k in ("runtime_h", "active_use_h", "node_count"))
            if d and d < END and runtime is not None and active is not None and nodes and 0 <= active <= runtime <= 24:
                self.readings[rid][d] = (active * nodes, nodes, runtime)

        fallback = a.factors["growth"]["values"]
        for rid, rows in self.readings.items():
            monthly = defaultdict(list)
            for d, (load, _, _) in rows.items():
                if not self.protected(rid, d):
                    monthly[d.year, d.month].append(load)
                    if START <= d:
                        self.active[rid, d.month, d.weekday()].append(load)
            recent = [d for d in rows if START <= d]
            if (len(recent) < 270 or max(recent) < END - timedelta(days=14) or
                    sum(rows[d][2] >= 23.5 for d in recent) < .9 * len(recent)):
                continue
            self.capacity[rid] = rows[max(recent)][1]
            monthly = {k: mean(v) for k, v in monthly.items() if len(v) >= 21}
            comparisons = [value / monthly[y - 1, m] - 1 for (y, m), value in monthly.items()
                           if (y, m) >= (START.year, START.month) and monthly.get((y - 1, m), 0) > 0]
            if len(comparisons) >= 6:
                low, high = quantile_bounds(comparisons)
                rates = tuple(min(fallback[2], max(fallback[0], x)) for x in (low, median(comparisons), high))
                self.trends[rid] = (rates, f"{len(comparisons)} same-month comparisons of observed active node-hours, bounded by configured growth")
            else:
                self.trends[rid] = (tuple(fallback), "configured growth because active-hour history has fewer than six comparable months")

        jobs = defaultdict(float)
        for row in data.get("data_platform_jobs", ()):
            d = day(row.get("date"))
            rid = a.rid(row.get("resource_id"))
            if rid not in self.capacity or not d or not START <= d < END:
                continue
            job_months[rid].add((d.year, d.month))
            if rid == "dp-dev" and row.get("time_window", "").lower().startswith("flexible"):
                continue
            duration = natural(row.get("duration_h"))
            jobs[rid, d] += 24 if duration is None else duration
        for (rid, d), duration in jobs.items():
            self.reserves[rid, d.month, d.weekday()].append(min(duration, 24))
        self.job_coverage = {rid for rid, months in job_months.items() if len(months) >= 9}

    def protected(self, rid, d):
        return any(rid in rule.get("resources", ()) and
                   ((d.month in rule.get("months", ()) and d.day in rule.get("days", ())) or
                    ((start := day(rule.get("from"))) and (end := day(rule.get("through"))) and start <= d <= end))
                   for rule in self.protections)

    def nodes(self, rid, d):
        nodes = self.capacity[rid]
        for change in sorted(self.changes, key=lambda x: x["effective_date"]):
            if change["resource"] == rid and (effective := day(change["effective_date"])) and d >= effective:
                nodes = change["to_nodes"]
        return nodes

    def month(self, rid, month, end, effective, mode, capture, year):
        """Compute no-action hours, local retained hours, and eligible retained hours."""
        days = [month + timedelta(days=i) for i in range((end - month).days)]
        workdays = [d for d in days if self.workdays.get(d, d.weekday() < 5)]
        # Keep an extra full working week when future holiday data is incomplete.
        closing = set(workdays[-(3 if all(d in self.workdays for d in days) else 5):])
        growth = self.trends[rid][0]
        baseline, local = 0.0, 0.0
        operating = [0.0] * 3
        for d in days:
            nodes = self.nodes(rid, d)
            full = nodes * 24
            baseline += full
            bucket = (rid, d.month, d.weekday())
            active = self.active.get(bucket)
            reservations = self.reserves.get(bucket, ())
            if (not mode or rid not in self.job_coverage or d < effective or self.protected(rid, d) or not active or
                    (mode == "autoscale" and (d.weekday() == 6 or d in closing or not reservations))):
                local += full
                continue
            reserve = max(reservations, default=0) * nodes
            typical = mean(active)
            for i, rate in enumerate(growth):
                busy = min(full, typical * (1 + rate) ** year + reserve)
                operating[i] += busy + (full - busy) * (1 - capture)
        return baseline, local, operating


def quantile_bounds(values):
    ordered = sorted(values)
    n = len(ordered) - 1
    return ordered[int(.2 * n)], ordered[round(.8 * n)]
