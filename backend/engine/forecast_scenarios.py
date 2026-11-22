"""Timed forecast scenarios for the dashboard's fixed baseline."""
import calendar
from collections import defaultdict
from datetime import date, timedelta

from engine.bonus import fitted_growth
from engine.greenops import END, START, day
from engine.insights import forecast_changes

MAX_FORECAST_YEARS = 3
FORECAST_HORIZONS = list(range(1, MAX_FORECAST_YEARS + 1))


def fiscal_year_start(d):
    return date(d.year if d.month >= 9 else d.year - 1, 9, 1)


def day_share(start, end, effective):
    fiscal = fiscal_year_start(start)
    days = (fiscal.replace(year=fiscal.year + 1) - fiscal).days
    return max(0, (end - max(start, effective)).days) / days


def active_from(a):
    return max(END, getattr(a, "as_of", END))


def range_of(value):
    return [value] * 3 if isinstance(value, (int, float)) else [min(value), value[1], max(value)]


def operational_growth(a, measures):
    """Estimate growth of the workload that each recurring change actually modifies."""
    scopes = {m["id"]: set(m.get("scopes") or [m["resource"]]) for m in measures
              if any(m.get("kwh", ())) or any(m.get("kg", ()))}
    if not scopes:
        return {}
    monthly = defaultdict(lambda: defaultdict(float))
    resources = set().union(*scopes.values())
    first_month, next_month = START.strftime("%Y-%m"), END.strftime("%Y-%m")
    for row in a.lines:
        if row["resource"] in resources and row["kwh"] is not None and first_month <= row["month"] < next_month:
            monthly[row["resource"]][row["month"]] += row["kwh"][1]
    assumed = a.factors["growth"]["values"]
    results = {}
    for mid, scope in scopes.items():
        totals = defaultdict(float)
        for resource in scope:
            for month, value in monthly[resource].items():
                totals[month] += value
        fit = fitted_growth([(int(m[:4]) * 12 + int(m[5:]), value) for m, value in sorted(totals.items())])
        if fit:
            rates = [min(assumed[2], max(assumed[0], rate)) for rate in fit["values"]]
            source = f"{fit['months']} baseline months of modeled kWh in the affected scope, bounded by the configured growth range"
        else:
            rates, source = assumed, "configured workload growth because the affected scope lacks a sufficient monthly series"
        results[mid] = (rates, source)
    return results


def scale_effect(values, rates, elapsed_years):
    """Scale only the continuing effect, preserving scenario bounds for signed savings."""
    if rates is None or elapsed_years <= 0:
        return values
    low, mid, high = [(1 + r) ** elapsed_years for r in rates]
    bounds = [values[i] * factor for i in (0, 2) for factor in (low, high)]
    return [min(bounds), values[1] * mid, max(bounds)]


def renewals(measure):
    components = measure.get("components") or []
    if components and all(day(part.get("effective_date")) for part in components):
        total = sum(part["chf"] for part in components)
        if total:
            return [(day(part["effective_date"]), measure["chf"] * part["chf"] / total) for part in components]
    effective = day(measure.get("effective_date"))
    return [(effective, measure["chf"])] if effective else []


def planned_effects(a, measures, key):
    start = active_from(a)
    recurring = []
    contract_changes = defaultdict(float)
    growth = operational_growth(a, measures)
    assumptions = []
    for m in measures:
        if key == "chf":
            dated = renewals(m)
            if dated:
                for d, value in dated:
                    contract_changes[max(start, d)] += value
                continue
            # Preserve an explicit first-year model timing factor for undated cost measures.
            fraction = m.get("first_year_chf", m["chf"]) / m["chf"] if m["chf"] else 1
            d = start + timedelta(days=round(365 * (1 - min(1, max(0, fraction)))))
        else:
            d = max(start, day(m.get("effective_date")) or start)
        values = range_of(m[key])
        if not any(values):
            continue
        rates, source = growth.get(m.get("id"), (None, None))
        recurring.append((d, values, rates))
        if rates is not None:
            assumptions.append(f"{m['name']}: continuing effect changes {rates[1]:+.1%}/year after year one, using {source}.")
    for d, value in contract_changes.items():
        recurring.append((d, [value] * 3, None))
    return recurring, contract_changes, assumptions


def dashboard_forecast(a, baseline_model, key, years, measures):
    """Reuse the baseline model and apply capacity and savings at their own dates."""
    start = active_from(a)
    before_events = defaultdict(float)
    drivers = []
    horizon_end = END.replace(year=END.year + years)

    def event(d, label, source, amount, basis="annual"):
        if END <= d < horizon_end:
            drivers.append({"date": d.isoformat(), "label": label, "source": source,
                            "amount": round(amount, 2), "basis": basis})

    for change in forecast_changes(a):
        d = day(change.get("effective_date"))
        if not d or not change.get("source"):
            raise ValueError("Forecast changes require a date and source.")
        value = change.get(f"annual_delta_{key}", 0)
        if value:
            before_events[d] += value
            event(d, change.get("label") or "Documented baseline change", change["source"], value)
    for change in a.policy.get("forecast", {}).get("known_changes", []):
        value = change.get(f"delta_{key}", 0)
        year = change.get("year")
        if value and isinstance(year, int) and 1 <= year <= years:
            d = END.replace(year=END.year + year - 1)
            before_events[d] += value
            event(d, change.get("note") or "Documented baseline change", change.get("source", "Forecast policy"), value)

    effects, contract_changes, assumptions = planned_effects(a, measures, key)
    implementation = sum(m["implementation_chf"] for m in measures) if key == "chf" else 0
    for d, value in sorted(contract_changes.items()):
        if value:
            event(d, "Contract savings begin", "Recorded renewal dates for selected measures", -value)
    rollout = defaultdict(float)
    for d, values, _ in effects:
        rollout[d] += values[1]
    for d, value in rollout.items():
        if abs(operational := value - contract_changes.get(d, 0)) >= .01:
            event(d, "Selected measures begin", "Modeled rollout timing for selected measures", -operational)
    if implementation:
        event(start, "One-time implementation cost", "Selected measures’ effort and implementation estimates",
              implementation, "one-time")

    points, sums = [], {}
    for row in baseline_model["monthly"][key][:12 * years]:
        month = date.fromisoformat(row["month"] + "-01")
        end = month + timedelta(days=calendar.monthrange(month.year, month.month)[1])
        baseline_step = sum(value * day_share(month, end, d) for d, value in before_events.items())
        offset = (month.year - END.year) * 12 + month.month - END.month
        # Anchor the first fiscal year to the plan estimate, then compound continuing effects monthly.
        elapsed_years = max(0, offset + 1 - 12) / 12
        adjustment = [0.0] * 3
        for d, values, rates in effects:
            share = day_share(month, end, d)
            for i, value in enumerate(scale_effect(values, rates, elapsed_years)):
                adjustment[i] += value * share
        baseline = [max(0, x + baseline_step) for x in range_of(row["values"])]
        cost = implementation if month <= start < end else 0
        optimized = [max(0, v - adjustment[2-i]) + cost for i, v in enumerate(baseline)]
        year = fiscal_year_start(month).year + 1
        totals = sums.setdefault(year, [[0.0] * 3, [0.0] * 3])
        for target, values in zip(totals, (baseline, optimized)):
            for i, value in enumerate(values):
                target[i] += value
        points.append({"year": month.year, "date": month.isoformat(),
                       "baseline": baseline, "optimized": optimized,
                       **({} if row["observed_base"] else {"coverage": "Corresponding historical month unavailable · modeled from annual trend"})})
    annual = [{"year": y, "date": f"{y}-08-01", "periodLabel": f"Sep {y - 1}–Aug {y}",
               "baseline": b, "optimized": o} for y, (b, o) in sums.items()]
    return points, annual, sorted(drivers, key=lambda d: (d["date"], d["label"])), assumptions
