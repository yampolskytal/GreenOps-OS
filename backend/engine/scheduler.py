"""Time-zone aware, collision-aware scheduling on attributed grid signals."""
import csv
import re
from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from engine.greenops import day, inside, key, natural


def civil_time(naive, zone):
    possibilities = {naive.replace(tzinfo=zone, fold=f).astimezone(UTC) for f in (0, 1)}
    if len(possibilities) != 1:
        raise ValueError("Ambiguous or nonexistent local clock time")
    return possibilities.pop()


def window_bounds(day_, text, zone):
    exp = r"flexible\s*:?\s*(\d\d:\d\d)\s*[-–]\s*(\d\d:\d\d)"
    text = re.sub(r"(?i)working day\s+(\d\d:\d\d)\s+to\s+(\d\d:\d\d)", r"\1-\2", text.strip())
    match = re.fullmatch(exp, text, re.I)
    if match:
        start, stop = (datetime.combine(day_, time.fromisoformat(x)) for x in match.groups())
        if start == stop:
            raise ValueError("Zero-length window")
        if stop < start:
            stop += timedelta(days=1)
    elif key(text) in ("flexible: within 24 h", "flexible: within 24h"):
        start = datetime.combine(day_, time())
        stop = start + timedelta(days=1)
    else:
        raise ValueError("Only explicit clock ranges and within-24-hour windows are supported")
    return civil_time(start, zone), civil_time(stop, zone)


def date_signals(path):
    readings = {}
    if not path.is_file():
        return readings
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            when = datetime.fromisoformat(row["timestamp"])
            kg = natural(row["kg_per_kwh"])
            if (when.utcoffset() is None or when.minute or when.second or when.microsecond
                    or kg is None or not row["source"].strip() or row.get("kind") not in ("observed", "forecast")):
                raise ValueError("Hourly grid rows require whole offset-aware hours, kind, intensity and provenance")
            ident = (key(row["region"]), when.astimezone(UTC), row["kind"])
            if ident in readings:
                raise ValueError("Duplicate hourly grid observation")
            readings[ident] = (kg, row["source"])
    return readings


def schedule(reports, replay=None):
    a = reports.a
    jobs = a.data["data_platform_jobs"]
    readings = date_signals(replay or a.path / "hourly_grid.csv")
    deps = a.policy.get("job_dependencies", {})
    signals = a.factors.get("hourly_grid", {})
    try:
        zone = ZoneInfo(a.policy.get("job_timezone", "Europe/Zurich"))
    except ZoneInfoNotFoundError:
        return [{"blockers": ["Install timezone data or configure a supported IANA timezone."]}]
    replay_days = {at.astimezone(zone).date() for _, at, _ in readings} if replay else set()
    occupied = defaultdict(list)
    originals = {}
    for job in jobs:
        rid = a.rid(job.get("resource_id"))
        d, duration = day(job.get("date")), natural(job.get("duration_h"))
        if not d or not duration or duration > 24:
            continue
        try:
            clock = time.fromisoformat(job.get("start_time", ""))
            start = civil_time(datetime.combine(d, clock), zone)
            length = timedelta(hours=duration)
        except (ValueError, TypeError):
            continue
        occupied[rid].append((start, start + length, job["ref"]))
        originals[job["ref"]] = (start, length)
    by_day = {(a.rid(r["resource_id"]), day(r["date"])): r for rows in reports.usage.values() for r in rows}
    output = []
    for job in jobs:
        if not inside(job.get("date")) and key(job.get("status")) != "planned":
            continue
        rid = a.rid(job.get("resource_id"))
        d = day(job.get("date"))
        if replay and (d not in replay_days or rid not in ("dp-dev", "dp-prod") or key(job.get("status")) != "ok"):
            continue
        telemetry = by_day.get((rid, d), {})
        if key(job.get("status")) == "planned" and not telemetry and reports.usage[rid]:
            telemetry = max(reports.usage[rid], key=lambda r: r["date"])
        region = a.region(telemetry.get("region"))
        mapped = a.mapping.get(rid, {})
        blocked = reports.blockers(rid, mapped.get("environment"), mapped.get("criticality"))
        rules = deps.get(job.get("job_name"), {})
        if replay and rid == "dp-dev":
            warning = "Resource or applicable global tickets require protection-window review"
            if warning in blocked:
                blocked.remove(warning)
        elif not a.demo:
            lower, upper = day(rules.get("from")), day(rules.get("through"))
            clearance = (d and lower and upper and lower <= d <= upper and rules.get("source")
                         and rules.get("owner") and rules.get("resource") == rid and
                         all(rules.get(k) is True for k in ("independent", "capacity_tested", "rollback_tested")))
            if not clearance:
                blocked.append("Dated owner, dependency, capacity and rollback clearance is missing")
            else:
                from engine.planning import platform_tickets
                reviewed = rules.get("reviewed_ticket_ids", [])
                if all(r["ticket_id"] in reviewed for r in platform_tickets(reports, rid)):
                    warning = "Resource or applicable global tickets require protection-window review"
                    if warning in blocked:
                        blocked.remove(warning)
        if reports.protection_day(rid, d) or any(p.get("always_on") and rid in p.get("resources", [])
                                                 for p in a.policy.get("protection_register", [])):
            blocked.append("Protected operating window or continuous availability requirement")
        result = {"job": job.get("job_name"), "ref": job["ref"], "resource": rid, "date": job.get("date"),
                  "window": job.get("time_window"), "current_start": job.get("start_time"), "blockers": blocked,
                  "region": region, "telemetry_ref": telemetry.get("ref"),
                  "operational_approval": False if replay else None}
        output.append(result)
        if blocked:
            continue
        if key(job.get("status")) not in ("ok", "planned") or key(job.get("triggered_by")) != "schedule":
            blocked.append("Requires a successful or planned scheduled run")
            continue
        nodes = natural(telemetry.get("node_count"))
        if not nodes or job["ref"] not in originals:
            blocked.append("Invalid duration, clock time or matched cluster size")
            continue
        try:
            start, end = window_bounds(d, job["time_window"], zone)
            current, length = originals[job["ref"]]
            if current < start and end.astimezone(zone).date() > d:
                current = civil_time(datetime.combine(d + timedelta(days=1), time.fromisoformat(job["start_time"])), zone)
            if not start <= current <= end - length:
                raise ValueError("Original run falls outside its window")
            if reports.protection_day(rid, (end - timedelta(microseconds=1)).astimezone(zone).date()):
                raise ValueError("Window crosses into a protected date")
            cube = signals.get(region, {}) if a.demo and not replay else {}
            signal_kind = "forecast" if key(job.get("status")) == "planned" else "observed"
            local_calendar = reports.calendar.get(d)
            if (rules.get("workday_only") or "working day" in key(job.get("time_window"))) and (not local_calendar or local_calendar.get("workday") != "1"):
                raise ValueError("Workday restriction or missing calendar entry")
            def emissions(at):
                t, finish = at, at + length
                weighted, provenance = 0, set()
                while t < finish:
                    hour = t.replace(minute=0, second=0, microsecond=0)
                    stop = min(hour + timedelta(hours=1), finish)
                    reading = readings.get((region, hour, signal_kind))
                    if reading is None and cube:
                        reading = (cube["values"][t.astimezone(zone).hour], cube["source"])
                    if reading is None:
                        return None
                    value, src = reading
                    weighted += value * (stop - t).total_seconds()
                    provenance.add(src)
                    t = stop
                return weighted / length.total_seconds(), provenance
            original = emissions(current)
            if original is None:
                raise ValueError("Time-matched grid data is missing for the original run")
            slots = [current] + [start + timedelta(minutes=15 * i)
                                 for i in range(int((end - start - length).total_seconds() // 900) + 1)]
            slots = [s for s in slots if all(ref == job["ref"] or s + length <= t0 or t1 <= s
                                             for t0, t1, ref in occupied[rid])]
            scored = [(v, s) for s in slots if (v := emissions(s)) is not None]
            if not scored:
                raise ValueError("No unoccupied window with complete grid coverage")
            (chosen_intensity, sources), chosen = min(scored, key=lambda v: (v[0][0], v[1] != current, v[1]))
            kwh = [length.total_seconds() / 3600 * nodes * x * p for x, p in zip(
                a.factors["energy"]["node-hour"]["values"], a.factors["pue"]["values"])]
            result.update({"suggested_start": chosen.astimezone(zone).strftime("%H:%M"),
                           "suggested_start_iso": chosen.astimezone(zone).isoformat(), "signal_kind": signal_kind,
                           "current_average_kg_per_kwh": round(original[0], 6),
                           "candidate_average_kg_per_kwh": round(chosen_intensity, 6),
                           "estimated_run_kwh": [round(x, 6) for x in kwh],
                           "profile_source": sorted(sources | original[1]),
                           "kg_avoided": [round(e * max(0, original[0] - chosen_intensity), 5) for e in kwh],
                           "method": ("Historical replay using a German generation proxy; no operational clearance or booked savings. " if replay else "")
                           + "Integrate the complete run against time-matched grid data and preserve capacity and non-overlap."})
            if chosen != current:
                occupied[rid].append((chosen, chosen + length, job["ref"]))
        except (ValueError, KeyError, TypeError) as error:
            blocked.append(str(error))
    return output
