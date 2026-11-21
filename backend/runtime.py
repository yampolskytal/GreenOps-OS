"""Recent runtime, recorded workload hours and independent utilization readings."""
from collections import defaultdict
from datetime import timedelta

from greenops import day, natural


def bounded(value, maximum):
    value = natural(value)
    return value if value is not None and value <= maximum else None


def recent_runtime(a):
    end = a.as_of + timedelta(days=1)
    start = end - timedelta(days=30)
    readings = {}
    platform, weekly = defaultdict(dict), defaultdict(dict)
    for row in a.data["data_platform_usage"]:
        when = day(row["date"])
        if when and start <= when < end:
            platform[a.rid(row["resource_id"])][when] = row
    for row in a.data["server_metrics_weekly"]:
        when = day(row["week_start"])
        if when and when < end and when + timedelta(days=7) > start:
            weekly[a.rid(row["server_id"])][when] = row

    window = {"from": start.isoformat(), "through": a.as_of.isoformat()}
    for rid in sorted(set(a.inventory) | set(platform) | set(weekly)):
        inv = a.inventory.get(rid, {})
        dates = {}
        for week, row in sorted(weekly[rid].items()):
            uptime = bounded(row.get("uptime_h"), 168)
            if uptime is None:
                continue
            for offset in range(7):
                d = week + timedelta(days=offset)
                if start <= d < end:
                    dates.setdefault(d, (uptime / 7, bounded(row.get("cpu_avg_pct"), 100),
                                         bounded(row.get("gpu_avg_pct"), 100)))

        def utilization(index):
            samples = [(r[0], r[index]) for r in dates.values() if r[index] is not None and r[0] > 0]
            return round(sum(h * v for h, v in samples) / sum(h for h, _ in samples), 1) if samples else None

        source = "server_inventory.csv" if bounded(inv.get("runtime_h_30d"), 720) is not None else None
        runtime = bounded(inv.get("runtime_h_30d"), 720)
        active = unknown = observed_days = None
        cpu = bounded(inv.get("cpu_utilisation_30d_pct"), 100)
        cpu_source = "server_inventory.csv" if cpu is not None else None
        if cpu is None and (cpu := utilization(1)) is not None:
            cpu_source = "server_metrics_weekly.csv"
        gpu = utilization(2)
        method = "Inventory reports a 30-day runtime snapshot. Active hours are unavailable for this resource."
        if source is None and dates:
            runtime = sum(r[0] for r in dates.values())
            source, observed_days = "server_metrics_weekly.csv", len(dates)
            method = "Weekly uptime is allocated evenly across recorded days in the window."
        if platform[rid]:
            daily = [(bounded(r.get("runtime_h"), 24), bounded(r.get("active_use_h"), 24))
                     for r in platform[rid].values()]
            daily = [(run, use if use is not None and use <= run else None)
                     for run, use in daily if run is not None]
            if daily:
                runtime = sum(run for run, _ in daily)
                measured = [use for _, use in daily if use is not None]
                active = sum(measured) if measured else None
                unknown = sum(run for run, use in daily if use is None)
                source, observed_days = "data_platform_usage.csv", len(daily)
                method = "Runtime and active workload are summed from daily cluster telemetry. Missing activity stays unknown."
        if source is None:
            method = "No valid runtime observation is available for this window."
        readings[rid] = {
            "runtimeH30d": round(runtime, 2) if runtime is not None else None,
            "activeH30d": round(active, 2) if active is not None else None,
            "unclassifiedRuntimeH30d": round(unknown, 2) if unknown is not None else None,
            "runtimeEvidence": window | {"source": source, "method": method, "observedDays": observed_days,
                                         "cpuSource": cpu_source, "gpuSource": "server_metrics_weekly.csv" if gpu is not None else None},
            **({"cpuAvgPct": round(cpu, 1)} if cpu is not None else {}),
            **({"gpuAvgPct": gpu} if gpu is not None else {}),
        }
    return readings
