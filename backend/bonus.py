"""Supplementary operational signals and scenario forecasts."""
import math
from collections import Counter, defaultdict
from itertools import combinations
from datetime import timedelta
from statistics import mean, pstdev

from scheduler import schedule
from greenops import END, day, inside, key, natural, obj, project_id, resource


MIN_TREND_MONTHS = 9
TREND_Z = 1.645  # two-sided 90% interval on the fitted monthly log-slope


def fitted_growth(series):
    """Annual compound growth [low, mid, high] from a log-linear fit of observed monthly totals.

    `series` holds (month_index, value) pairs; missing months are simply absent. Returns None when there are
    too few positive observations to fit, so callers fall back to the configured planning assumption."""
    observed = [(x, y) for x, y in series if y is not None]
    if len(observed) < MIN_TREND_MONTHS or any(y <= 0 for _, y in observed):
        return None
    points = [(x, math.log(y)) for x, y in observed]
    n = len(points)
    mx, my = mean(x for x, _ in points), mean(y for _, y in points)
    sxx = sum((x - mx) ** 2 for x, _ in points)
    slope = sum((x - mx) * (y - my) for x, y in points) / sxx
    residual = sum((y - (my + slope * (x - mx))) ** 2 for x, y in points)
    total_ss = sum((y - my) ** 2 for _, y in points)
    se = math.sqrt(residual / (n - 2) / sxx)
    rate = lambda b: round(math.exp(12 * b) - 1, 4)
    return {"values": [rate(slope - TREND_Z * se), rate(slope), rate(slope + TREND_Z * se)],
            "r2": round(1 - residual / total_ss, 3) if total_ss else 0.0, "months": n}


def forecast(a, years=3, *, damp_growth=False):
    baseline = a.baseline
    assumed = a.factors["growth"]["values"]
    monthly = {r["name"]: r for r in a.grouped("month")}
    months = [f"{year}-{m:02d}" for year, seq in ((2025, range(9, 13)), (2026, range(1, 9))) for m in seq]
    mid = lambda v: v[1] if isinstance(v, list) else v
    growth = {}
    for k in ("chf", "kwh", "kg"):
        fit = fitted_growth([(i, mid(monthly[m][k]) if m in monthly else None) for i, m in enumerate(months)])
        growth[k] = ({"method": "trend", **fit} if fit else
                     {"method": "assumption", "values": assumed, "r2": None,
                      "months": sum(m in monthly for m in months)})
    multipliers = {k: [1.0] * 3 for k in growth}
    factors = []
    results = []
    for t in range(1, years + 1):
        weight = min((t - 1) / 2, 1) if damp_growth else 0
        multipliers = {k: [previous * (1 + rate * (1 - weight) + default * weight)
                           for previous, rate, default in zip(multipliers[k], g["values"], assumed)]
                       for k, g in growth.items()}
        factors.append(multipliers)
        factor = multipliers
        results.append({"period": f"Sep {2025+t}–Aug {2026+t}", "chf": [round(baseline["chf"] * v, 2) for v in factor["chf"]],
                        **{k: [round(v * x, 2) for v, x in zip(factor[k], baseline[k])] for k in ("kwh", "kg")},
                        "monthly_chf_mid": [round(monthly[m]["chf"] * factor["chf"][1], 2) if m in monthly else None for m in months]})
    # Monthly path: each future month is the same calendar month of the baseline year grown by the per-metric
    # rate, so observed seasonality and the fitted trend both carry forward. A month without observations uses
    # the baseline-year monthly average instead.
    projected = {k: [] for k in growth}
    for t, factor in enumerate(factors, 1):
        for m in months:
            year, month = int(m[:4]) + t, m[5:]
            for k in growth:
                observed = monthly[m][k] if m in monthly else None
                if observed is None:
                    observed = [v / 12 for v in baseline[k]] if isinstance(baseline[k], list) else baseline[k] / 12
                level = observed if isinstance(observed, list) else [observed] * 3
                projected[k].append({"month": f"{year}-{month}", "values": [
                    round(x * multiplier, 4) for x, multiplier in zip(level, factor[k])],
                    "observed_base": m in monthly})
    def describe(k):
        g = growth[k]
        low, rate, high = (f"{v * 100:+.1f}%" for v in g["values"])
        if g["method"] == "trend":
            return (f"{rate}/yr fitted to {g['months']} observed months (log-linear, 90% range {low} to {high}, "
                    f"R² {g['r2']:.2f})")
        return (f"{rate}/yr planning assumption (range {low} to {high}); fewer than {MIN_TREND_MONTHS} complete "
                "positive monthly observations to fit a trend")
    return {"results": results, "growth": growth, "monthly": projected, "baseline_months_observed": sum(m in monthly for m in months),
            "describe": {k: describe(k) for k in growth},
            "method": "No-action compound growth scenario, fixed CHF unit rates and grid factors. Growth is fitted per "
                      "metric from the observed baseline-year monthly totals when at least nine months are complete, "
                      "otherwise the configured planning assumption is used. One year cannot separate seasonality from "
                      "trend. Monthly projections repeat the observed seasonal pattern on the fitted trend. Ranges combine growth and factor scenarios "
                      "and carry forward baseline coverage gaps."}


def clusters(reports):
    features, early, late = {}, {}, {}
    def profile(readings):
        return tuple(mean(values) for values in zip(*readings)) + (
            mean(max(0, u - 120) / u if u else 0 for *_, u in readings),)
    for rid, rows in reports.metrics.items():
        readings = [(natural(r.get("cpu_avg_pct")), natural(r.get("cpu_max_pct")),
                     natural(r.get("ram_avg_pct")), natural(r.get("uptime_h")))
                    for r in sorted(rows, key=lambda r:r["week_start"])]
        readings = [r for r in readings if None not in r and max(r[:3]) <= 100 and r[3] <= 168]
        if len(readings) >= 4:
            features[rid] = profile(readings)
        if len(readings) >= 8:
            split = len(readings) // 2
            early[rid], late[rid] = profile(readings[:split]), profile(readings[split:])
    result = group_features(features, ["Mean CPU %", "Peak CPU %", "Mean RAM %", "Weekly uptime hours", "Minimum weekend uptime share"],
                            "At least four valid weeks. Weekend share is a lower bound from uptime exceeding 120 weekday hours.")
    for group in result["groups"]:
        cpu, peak, _, hours, _ = group["centroid"]
        group["label"] = ("Low-use always-on" if hours >= 144 and cpu <= 15 else
                          "Low duty cycle" if hours <= 60 else "Bursty compute" if peak >= 2 * max(cpu, 1) else "Sustained activity")
    def memberships(data):
        model = group_features(data, [], "")
        return {pair for group in model["groups"] for pair in combinations(sorted(group["members"]), 2)}
    first, second = memberships(early), memberships(late)
    result["stability"] = {"matched_servers": len(early), "co_membership_jaccard": round(len(first & second) / len(first | second), 4) if first | second else None,
                           "method": "Fit early and late periods independently; compare shared same-cluster pairs divided by the union of same-cluster pairs. Minimum eight valid weeks."}
    dr = "dr-failover"
    if dr in features:
        protected = [r for r in reports.a.policy.get("protection_register", []) if dr in r["resources"] and r.get("always_on")]
        reviews = {rid: m for m in reports.measures if not m["hard_blockers"] and m.get("requires_approval")
                   for rid in m.get("members", []) if rid in features}
        low_use = [rid for rid in reviews if features[rid][0] <= 15 and features[rid][3] >= 144 and rid != dr]
        if protected and low_use:
            peer = min(low_use, key=lambda rid: (abs(features[rid][0] - features[dr][0]), rid))
            result["protection_comparison"] = [
                {"server": dr, "mean_cpu": round(features[dr][0], 2), "weekly_uptime": round(features[dr][3], 2),
                 "decision": "Blocked", "sources": [r["source"] for r in protected]},
                {"server": peer, "mean_cpu": round(features[peer][0], 2), "weekly_uptime": round(features[peer][3], 2),
                 "decision": "Needs a human decision", "measure": reviews[peer]["id"],
                 "sources": [r["ref"] for r in reports.metrics[peer][:4]]},
            ]
    return result


def group_features(features, labels, eligibility):
    if len(features) < 3:
        return {"groups": [], "features": labels, "method": "At least three qualified subjects are required. " + eligibility}
    names = sorted(features)
    poles = [mean(v) for v in zip(*features.values())]
    scales = [pstdev(v) or 1 for v in zip(*features.values())]
    points = [tuple((x - m) / s for x, m, s in zip(features[rid], poles, scales)) for rid in names]
    distinct = sorted(set(points))
    k = min(3, len(distinct))
    centers = [distinct[round(i * (len(distinct) - 1) / max(k - 1, 1))] for i in range(k)]
    groups = []
    for _ in range(30):
        groups = [[] for _ in centers]
        for i, point in enumerate(points):
            closest = min(range(k), key=lambda c: math.dist(point, centers[c]))
            groups[closest].append(i)
        updated = [tuple(mean(v) for v in zip(*(points[i] for i in g))) if g else centers[c] for c, g in enumerate(groups)]
        if updated == centers:
            break
        centers = updated
    memberships = {i: g for g in groups for i in g}
    sample = range(0, len(points), max(1, math.ceil(len(points) / 150)))
    silhouettes = []
    for i in sample:
        local = memberships[i]
        others = [g for g in groups if g and g != local]
        if len(local) < 2 or not others:
            silhouettes.append(0)
            continue
        a = mean(math.dist(points[i], points[j]) for j in local if j != i)
        b = min(mean(math.dist(points[i], points[j]) for j in g) for g in others)
        silhouettes.append((b - a) / max(a, b) if max(a, b) else 0)
    return {"groups": [{"members": [names[i] for i in g],
                        "centroid": [round(mean(v), 3) for v in zip(*(features[names[i]] for i in g))]}
                       for g in groups if g], "features": labels,
            "sample_silhouette": round(mean(silhouettes), 3) if silhouettes else None,
            "method": "Deterministic standardized k-means. Silhouette near zero indicates overlapping profiles. " + eligibility}


def related_clusters(reports):
    d = reports.d
    ai = defaultdict(list)
    for r in d["ai_usage"]:
        if inside(r.get("date")):
            raw = [natural(r.get(f)) for f in ("requests", "tokens_in", "tokens_out")]
            if None not in raw and raw[0] > 0:
                ai[r.get("tool") or r["resource_id"]].append((raw[0], raw[1]/raw[0], raw[2]/raw[0]))
    seats = defaultdict(list)
    for r in d["saas_contracts"]:
        if inside(r.get("month")):
            bought, active, price = [natural(r.get(f)) for f in ("licences_purchased", "licences_active_30d", "price_per_licence")]
            if None not in (bought, active, price) and bought and active <= bought:
                seats[r["contract"]].append((bought, active / bought))
    jobs = defaultdict(list)
    for r in d["data_platform_jobs"]:
        if inside(r.get("date")):
            duration = natural(r.get("duration_h"))
            if duration is not None:
                jobs[r.get("job_name") or "Unknown"].append((duration, int(key(r.get("status")) == "ok")))
    specs = {"ai": (ai, ["requests per observed row", "input tokens per request", "output tokens per request"]),
             "saas": (seats, ["purchased seats per row", "utilization fraction"]),
             "jobs": (jobs, ["duration hours", "success fraction"])}
    return {name: group_features({k: tuple(mean(v) for v in zip(*rows)) for k, rows in dataset.items() if len(rows) >= 8},
                                 labels, "At least eight eligible observations per group.")
            for name, (dataset, labels) in specs.items()}


def diagnostics(reports):
    a, d = reports.a, reports.d
    ci = defaultdict(lambda: {"runs": 0, "no_change_nightly": 0, "reruns": 0, "flagged_cpu_h": 0, "flagged_minutes": 0, "evidence": []})
    for r in d["ci_pipeline_runs"]:
        if not inside(r.get("started_at")):
            continue
        label = (str(r.get("repo") or "Unknown"), str(r.get("runner") or "Unknown"))
        out = ci[label]
        out["runs"] += 1
        nightly = key(r.get("pipeline")) == "nightly-full" and natural(r.get("commits_since_last_nightly")) == 0
        rerun = key(r.get("trigger")) == "rerun"
        out["no_change_nightly"] += nightly
        out["reruns"] += rerun
        if nightly or rerun:
            m = obj(r.get("metrics"))
            seconds = natural(m.get("duration_s"))
            if seconds is None:
                seconds = natural(m.get("duration_sec"))
            out["flagged_minutes"] += (seconds or 0) / 60
            out["flagged_cpu_h"] += natural(m.get("cpu_h")) or 0
            out["evidence"].append(r["ref"])
    by_agent = defaultdict(lambda: {"runs": 0, "retries": 0, "seconds": 0, "tokens": 0, "unopened_reports": 0})
    for r in d["ai_agent_runs"]:
        if inside(r.get("start")):
            out = by_agent[str(r.get("agent") or "Unknown")]
            out["runs"] += 1
            out["retries"] += natural(r.get("retries")) or 0
            out["seconds"] += natural(r.get("duration_s")) or natural(r.get("duration_seconds")) or 0
            u = obj(r.get("usage"))
            out["tokens"] += sum(natural(u.get(x)) or 0 for x in ("tokens_in", "tokens_out"))
            out["unopened_reports"] += key(r.get("agent")) == "report-agent" and str(r.get("report_opened")) == "0"
    stale_tables = [{"table": r.get("table"), "size_gb": natural(r.get("size_gb")), "ref": r["ref"],
                     "status": "Review only", "retention": r.get("retention_required"), "data_class": r.get("data_class")}
                    for r in d["data_catalog_tables"] if (day(r.get("last_read")) or a.as_of) < a.as_of - timedelta(days=90)]
    reports_no_views = defaultdict(lambda: {"refresh_minutes": 0, "refs": [], "report_types": set(), "views": 0, "missing_views": 0})
    for r in d["powerbi_usage"]:
        if inside(r.get("date")):
            out = reports_no_views[resource(r.get("resource_id"))]
            out["refresh_minutes"] += natural(r.get("refresh_duration_min")) or 0
            out["refs"].append(r["ref"])
            out["report_types"].add(r.get("report_type") or "unknown")
            views = natural(r.get("view_count"))
            out["views"] += views or 0
            out["missing_views"] += views is None
    unused_reports = [{"resource": rid, **r, "report_types": sorted(r["report_types"]), "status": "Owner review required"}
                      for rid, r in reports_no_views.items() if r["refresh_minutes"] and r["views"] == r["missing_views"] == 0]
    web = Counter()
    for r in d["web_traffic"]:
        if inside(r.get("time_utc")):
            rate, count, share = (natural(r.get(f)) for f in ("sample_rate", "requests", "bot_share_pct"))
            if rate and count is not None and share is not None and share <= 100:
                web["estimated_requests"] += rate * count
                web["estimated_bot_requests"] += rate * count * share / 100
                web["usable_hours"] += 1
    logs = defaultdict(lambda: {"observed_new_gb": 0, "retention_days_observed": set(), "usable_days": 0})
    for r in d["log_volume"]:
        volume = natural(r.get("log_gb"))
        unit = key(r.get("unit"))
        if inside(r.get("date")) and volume is not None and unit in ("gb", "mb"):
            out = logs[str(r.get("service") or "Unknown")]
            out["observed_new_gb"] += volume / (1000 if unit == "mb" else 1)
            out["usable_days"] += 1
            if natural(r.get("retention_days")) is not None:
                out["retention_days_observed"].add(natural(r["retention_days"]))
    chains = defaultdict(list)
    for r in d["backup_chains"]:
        if r.get("source"):
            chains[r["source"]].append(r)
    allocations = defaultdict(float)
    for r in d["project_hours_monthly"]:
        h = natural(r.get("hours"))
        if inside(r.get("month")) and h is not None:
            allocations[project_id(r.get("project_id"))] += h
    fte = {key(r.get("department")).replace("people", "hr"): natural(r.get("fte"))
           for r in d["headcount"] if day(r.get("month")) == END.replace(month=8)}
    department = {key(r["name"]): r["chf"] for r in a.grouped("department")}
    return {
        "ci": [{"repo": repo, "runner": runner, **r} for (repo, runner), r in sorted(ci.items())],
        "ci_method": "No-change nightlies and reruns are review signals. Flagged CPU-hours and minutes count each run once. Preserve deployment, security and time-dependent checks.",
        "agents": dict(by_agent), "stale_tables": stale_tables, "unviewed_reports": unused_reports,
        "web_sampling": dict(web), "logs": {k: {**v, "retention_days_observed": sorted(v["retention_days_observed"])} for k, v in logs.items()},
        "parallel_backup_chains": [{"source": s, "tools": [r.get("backup_tool") for r in rows], "refs": [r["ref"] for r in rows],
                                    "status": "Protected: confirm retention, restore tests and off-site copies"} for s, rows in chains.items() if len(rows) > 1],
        "projects": [{"id": project_id(r.get("project_id")), "hours": allocations.get(project_id(r.get("project_id"))),
                      "status": r.get("status"), "rechargeable": r.get("rechargeable"), "ref": r["ref"]} for r in d["projects"]],
        "chf_per_august_fte": {k: round(department[k] / v, 2) for k, v in fte.items() if v and k in department},
        "clusters": clusters(reports), "workload_clusters": related_clusters(reports), "jobs": schedule(reports),
    }
