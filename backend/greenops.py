"""Local GreenOps ingestion, accounting and reporting."""
import csv
import hashlib
import io
import json
import math
import re
from collections import defaultdict
from functools import lru_cache
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import quantiles

from records import fingerprint

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / "schema-v13.json").read_text(encoding="utf-8"))
START, END = date(2025, 9, 1), date(2026, 9, 1)
CORE = """azure_costs aws_costs hoster_invoice data_platform_usage ai_usage ai_subscriptions
saas_contracts server_inventory server_metrics_weekly exchange_rates it_tickets
business_calendar mapping_departments_tools""".split()
BONUS = """data_platform_jobs data_catalog_tables powerbi_usage ai_agent_runs ai_invoice_monthly
m365_usage web_traffic ci_pipeline_runs log_volume backup_chains data_center_locations
provider_monthly_report headcount projects project_hours_monthly""".split()
KEYS = {
    "data_platform_usage": "date resource_id", "server_inventory": "server_id",
    "server_metrics_weekly": "week_start server_id", "ai_agent_runs": "run_id",
    "ai_usage": "date resource_id department task_type provider model",
    "exchange_rates": "month", "business_calendar": "date", "it_tickets": "ticket_id",
    "mapping_departments_tools": "resource_id", "powerbi_usage": "date resource_id",
    "data_catalog_tables": "schema table", "m365_usage": "week_start department",
    "web_traffic": "time_utc", "log_volume": "date service",
    "backup_chains": "source backup_tool", "headcount": "month department",
    "projects": "project_id", "project_hours_monthly": "month project_id department",
    "data_center_locations": "provider region", "ai_invoice_monthly": "month provider model_class currency",
    "provider_monthly_report": "month label",
}
CENTERS = dict(zip("4000 4100 4200 4300 4400 4500 4900 9000".split(),
                   "Consulting Sales Finance Marketing HR IT Management Overhead".split()))
BILL = {
    "azure_costs": ("Date", "ResourceId", "ResourceLocation", "Quantity", "UnitOfMeasure", "CostInBillingCurrency", "BillingCurrency", "Cloud"),
    "aws_costs": ("line_item_usage_start_date", "line_item_resource_id", "product_region", "line_item_usage_amount", "pricing_unit", "line_item_unblended_cost", "line_item_currency_code", "Cloud"),
    "hoster_invoice": ("Date", "Item", "", "Quantity", "Unit", "Amount_CHF", "", "Cloud"),
}
CONTRACTS = {"ai_subscriptions": ("product", "price_per_seat"), "saas_contracts": ("contract", "price_per_licence")}


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def natural(value):
    n = number(value)
    return n if n is not None and n >= 0 else None


def day(value):
    # Dates repeat heavily across sources; parse each distinct string once.
    return _parse_day(value) if isinstance(value, str) else _parse_day(str(value or ""))


@lru_cache(maxsize=65536)
def _parse_day(s):
    try:
        return date.fromisoformat(s[:10] + ("-01" if len(s) == 7 else ""))
    except ValueError:
        try:
            return datetime.strptime(s, "%d.%m.%Y").date()
        except ValueError:
            return None


def key(value):
    return str(value or "").strip().casefold()


def resource(value):
    return re.split(r"[/:]", key(value))[-1]


def project_id(value):
    match = re.fullmatch(r"(?:p(?:roject)?)[ _-]*0*(\d+)", key(value))
    return f"P-{int(match[1]):03}" if match else str(value or "").strip()


def month(value):
    d = day(value)
    return d.isoformat()[:7] if d else ""


def inside(value):
    d = day(value)
    return d is not None and START <= d < END


def obj(value):
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def triplet_sum(rows, field):
    values = [r[field] for r in rows if r[field] is not None]
    return [round(sum(v[i] for v in values), 6) for i in range(3)]


def total(rows):
    return {
        "chf": round(sum(r["chf"] for r in rows if r["chf"] is not None), 2),
        "kwh": triplet_sum(rows, "kwh"), "kg": triplet_sum(rows, "kg"),
        "lines": len(rows), "missing_cost": sum(r["chf"] is None for r in rows),
        "missing_energy": sum(r["kwh"] is None for r in rows),
        "missing_carbon": sum(r["kg"] is None for r in rows),
    }


def csv_text(fields, rows):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(fields)
    for row in rows:
        writer.writerow(["'" + x if isinstance(x, str) and x.startswith(("=", "+", "-", "@", "\t", "\r")) else x for x in row])
    return out.getvalue()


class Analysis:
    def __init__(self, path, factors, demo=False, as_of=date(2026, 9, 6), policy=None, store=None):
        self.path, self.factors, self.demo, self.as_of = Path(path), factors, demo, as_of
        self.policy, self.store = policy or {}, store
        self.events, self.data, self.sources, self.lines = [], {}, {}, []
        self._regions = {}
        self.mode = "REPRESENTATIVE DEMO — synthetic inputs" if demo else "USER-SUPPLIED DATA"
        for name in CORE + BONUS:
            self.load(name)
        self.resolve_contracts()
        self.collisions = set()
        identities = defaultdict(set)
        self.aliases = {key(k): key(v) for k, v in self.policy.get("resource_aliases", {}).items()}
        for source, fields in BILL.items():
            if source == "hoster_invoice":
                continue
            for row in self.data[source]:
                full = key(row.get(fields[1]))
                if full:
                    rid = self.aliases.get(source + ":" + full, self.aliases.get(resource(full), resource(full)))
                    identities[rid].add((source, full))
        self.collisions = {name for name, items in identities.items() if len(items) > 1}
        for name in sorted(self.collisions):
            self.audit("resource_identity_collision", name, "Qualified billing IDs retained. Unqualified telemetry joins blocked.")
        self.mapping = {self.rid(r["resource_id"]): r for r in self.data["mapping_departments_tools"]}
        self.inventory = {self.rid(r["server_id"]): r for r in self.data["server_inventory"]}
        self.locations = self.data["data_center_locations"]
        self.fx = {month(r["month"]): r for r in self.data["exchange_rates"] if month(r["month"])}
        self.account()
        from verification import recover_costs
        recover_costs(self)
        from accounting import check_market
        check_market(self)
        self.baseline = total(self.lines)
        self.baseline["kg_market"] = triplet_sum(self.lines, "kg_market")
        self.baseline["missing_market"] = sum(r["kwh"] is not None and r["kg_market"] is None for r in self.lines)

    def rid(self, value, source=""):
        full = key(value)
        short = self.aliases.get(source + ":" + full, self.aliases.get(resource(full), resource(full)))
        return source + ":" + full if source and short in self.collisions else short

    def audit(self, code, ref, detail):
        self.events.append({"code": code, "ref": ref, "detail": detail})

    def load(self, name):
        sub = "" if name in CORE else "extra/"
        ext = ".jsonl" if name in ("ci_pipeline_runs", "ai_agent_runs") else ".csv"
        filename = sub + name + ext
        path = self.path / filename
        rows, exact, keyed, conflicts = [], set(), {}, set()
        meta = self.sources[name] = {"file": filename, "core": name in CORE, "present": path.is_file(), "accepted": 0}
        self.data[name] = rows
        if not path.is_file():
            self.audit("missing_source", filename, "Core" if name in CORE else "Optional")
            return
        raw = path.read_bytes()
        meta["sha256"] = hashlib.sha256(raw).hexdigest()
        decisions = self.policy.get("source_decisions", {}).get(filename, {})
        decisions = decisions if decisions.get("sha256") == meta["sha256"] and decisions.get("actor") and decisions.get("reason") else {}
        cache_id = fingerprint([3, filename, meta["sha256"], SCHEMA[name], decisions])
        cached = self.store.cached(cache_id) if self.store else None
        if cached:
            rows.extend(cached["rows"])
            meta.update(cached["meta"])
            self.events.extend(cached["events"])
            return
        event_start = len(self.events)
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeError:
            self.audit("bad_encoding", filename, "Expected UTF-8")
            return
        drop, keep = set(decisions.get("drop_lines", [])), set(decisions.get("keep_duplicate_lines", []))
        fields = KEYS.get(name, "").split()
        required = {"ai_usage": ("date", "resource_id", "provider", "model"),
                    "data_catalog_tables": ("table",)}.get(name, fields)
        required_at = [fields.index(k) for k in required]
        if ext == ".jsonl":
            records = enumerate(io.StringIO(content), 1)
        else:
            reader = csv.DictReader(io.StringIO(content, newline=""))
            header = reader.fieldnames or []
            expected = SCHEMA[name]["columns"]
            missing, extra = sorted(set(expected) - set(header)), sorted(set(header) - set(expected))
            meta["schema"] = {"version": "v13", "missing_columns": missing, "extra_columns": extra}
            if missing or extra:
                self.audit("schema_drift", filename, f"Missing={missing}, additional={extra}")
            if len(set(header)) != len(header):
                self.audit("bad_header", filename, "Repeated column name. Source quarantined.")
                return
            records = enumerate(reader, 2)
        for line, record in records:
            ref = f"{filename}:{line}"
            if line in drop:
                self.audit("reviewed_row_excluded", ref, f'{decisions["actor"]}: {decisions["reason"]}')
                continue
            if ext == ".jsonl":
                try:
                    record = json.loads(record)
                except ValueError:
                    self.audit("bad_json", ref, "Record skipped")
                    continue
            if not isinstance(record, dict) or None in record:
                self.audit("bad_row", ref, "Record skipped")
                continue
            row = {k: v.strip() if isinstance(v, str) else v for k, v in record.items()}
            if ext == ".jsonl":
                try:
                    signature = json.dumps(row, sort_keys=True, allow_nan=False)
                except ValueError:
                    self.audit("bad_row", ref, "Nonfinite JSON number")
                    continue
            else:
                # CSV rows share one header order and hold only strings (or None for short rows).
                signature = tuple(row.values())
            if signature in exact and line not in keep:
                self.audit("exact_duplicate", ref, "Identical record counted once; confirm multiplicity for invoice lines without IDs")
                continue
            exact.add(signature)
            if line in keep:
                self.audit("reviewed_duplicate_retained", ref, f'{decisions["actor"]}: {decisions["reason"]}')
            if fields:
                identity = tuple(key(row.get(k)) for k in fields)
                if not all(identity[i] for i in required_at):
                    self.audit("missing_key", ref, "Record quarantined")
                    continue
                if identity in keyed:
                    conflicts.add(identity)
                    self.audit("conflicting_key", ref, f"Quarantined with {keyed[identity]['ref']}")
                    continue
                keyed[identity] = row
            row["ref"] = ref
            rows.append(row)
        if conflicts:
            rows[:] = [r for r in rows if tuple(key(r.get(k)) for k in fields) not in conflicts]
        meta["accepted"] = len(rows)
        if self.store:
            self.store.cache(cache_id, {"rows": rows, "meta": meta, "events": self.events[event_start:]})

    def resolve_contracts(self):
        for source, (label, _) in CONTRACTS.items():
            groups = defaultdict(list)
            for row in self.data[source]:
                identity = (month(row.get("month")), key(row.get(label)), key(row.get("provider")), key(row.get("cost_center")))
                if not all(identity[:3]):
                    self.audit("missing_contract_key", row["ref"], "Record quarantined")
                    continue
                groups[identity].append(row)
            resolved = []
            for rows in groups.values():
                finals = [r for r in rows if key(r.get("contract_status")) == "final"]
                if len(finals) == 1:
                    resolved.extend(finals)
                for row in rows:
                    if len(finals) != 1 or row not in finals:
                        self.audit("contract_version", row["ref"], "Only a unique final version enters the baseline")
            self.data[source] = resolved
            self.sources[source]["accepted"] = len(resolved)

    def chf(self, value, currency, period, ref):
        currency = key(currency)
        n = number(value)
        if n is None:
            self.audit("missing_cost", ref, "Blank or invalid amount")
            return None
        rate = 1 if currency == "chf" else natural(self.fx.get(period, {}).get(currency + "_chf"))
        if not rate or currency not in ("chf", "usd", "eur"):
            self.audit("missing_fx", ref, f"{currency or 'unknown currency'} {period}")
            return None
        return n * rate

    def region(self, value):
        s = re.sub(r"[^a-z0-9]", "", key(value))
        if s not in self._regions:
            self._regions[s] = self._resolve_region(s)
        return self._regions[s]

    def _resolve_region(self, s):
        for name, aliases in self.factors["regions"].items():
            if s in aliases:
                return name
        for row in self.locations:
            if s and s == re.sub(r"[^a-z0-9]", "", key(row.get("region"))):
                location = re.sub(r"[^a-z0-9]", "", key(row.get("location")))
                for name, aliases in self.factors["regions"].items():
                    if location in aliases:
                        return name
        return "unknown"

    def add(self, row, raw_day, rid, region, unit, quantity, amount, currency, category, tags=None, provider=""):
        if day(raw_day) is None:
            self.audit("bad_date", row["ref"], str(raw_day))
        if not inside(raw_day):
            return
        period = month(raw_day)
        tags = tags or {}
        mapped = self.mapping.get(rid, {})
        active = [r for r in self.policy.get("allocation_mappings", []) if r.get("resource") == rid
                  and day(r.get("from")) and day(r.get("through"))
                  and day(r["from"]) <= day(raw_day) <= day(r["through"])]
        if len(active) == 1 and active[0].get("source"):
            mapped = mapped | active[0]
        elif len(active) > 1:
            self.audit("allocation_conflict", row["ref"], "Multiple effective-dated overrides")
        center = str(tags.get("cost_center") or row.get("cost_center") or mapped.get("cost_center") or "").removesuffix(".0")
        tagged = str(tags.get("department") or row.get("department") or "").strip()
        master_department = mapped.get("department")
        if tagged and master_department and key(tagged) != key(master_department):
            self.audit("allocation_conflict", row["ref"], "Source tag takes precedence over resource mapping")
        dep = tagged or master_department or CENTERS.get(center) or "Unallocated"
        dep = "HR" if key(dep) == "people" else dep
        tool = str(tags.get("tool") or row.get("tool") or mapped.get("tool") or rid or "Unallocated")
        chf = self.chf(amount, currency, period, row["ref"])
        location = self.region(region)
        coefficient = self.factors.get("resource_energy", {}).get(rid, {}).get(key(unit), self.factors["energy"].get(key(unit)))
        q = natural(quantity)
        kwh = kg = None
        if q is not None and coefficient is not None:
            pue = [1, 1, 1] if coefficient.get("facility") else self.factors.get("site_pue", {}).get(location, self.factors["pue"])["values"]
            kwh = [q * a * b for a, b in zip(coefficient["values"], pue)]
            kg = [a * b for a, b in zip(kwh, self.factors["grid"][location]["values"])]
            if location == "unknown" and q:
                self.audit("unknown_location", row["ref"], "Broad proxy grid factor used")
        else:
            self.audit("energy_unestimated", row["ref"], f"Missing quantity or factor for {unit or 'unspecified unit'}")
        fx_row = self.fx.get(period, {})
        fx_rate = 1 if key(currency) == "chf" else natural(fx_row.get(key(currency) + "_chf"))
        self.lines.append({"ref": row["ref"], "month": period, "day": day(raw_day).isoformat(),
                           "category": category, "resource": rid, "tool": tool, "provider": provider or row.get("provider") or "",
                           "department": dep, "project": project_id(tags.get("project") or row.get("project_id") or mapped.get("default_project")),
                           "region": location, "chf": chf, "kwh": kwh, "kg": kg,
                           "quantity": q, "unit": key(unit), "currency": key(currency), "amount": number(amount),
                           "fx_rate": fx_rate, "fx_ref": fx_row.get("ref") if key(currency) in ("eur", "usd") else None,
                           "environment": key(tags.get("environment") or mapped.get("environment"))})

    def account(self):
        mapping_by_tool = defaultdict(list)
        for m in self.mapping.values():
            mapping_by_tool[key(m.get("tool"))].append(m)
        for source, fields in BILL.items():
            d, rid_field, loc, qty, unit, amount, currency, category = fields
            for r in self.data[source]:
                rid = self.rid(r.get(rid_field), source)
                tags = obj(r.get("Tags"))
                if source == "aws_costs":
                    tags = {k: r.get("resource_tags_user_" + k) for k in ("department", "tool", "environment", "project")}
                if source == "hoster_invoice":
                    tags = {"tool": r.get("Item"), "cost_center": r.get("CostCenter"), "project": r.get("ProjectNumber")}
                    matches = [m for m in mapping_by_tool[key(r.get("Item"))] if
                               not r.get("CostCenter") or key(m.get("cost_center")) == key(r.get("CostCenter"))]
                    if len(matches) == 1:
                        rid = resource(matches[0]["resource_id"])
                credit = key(r.get("ChargeType") or r.get("line_item_line_item_type")) in ("credit", "refund")
                if source == "azure_costs" and r.get("Tags") and not tags and r["Tags"] != "{}":
                    self.audit("unreadable_tags", r["ref"], "Using mapping or unallocated dimensions")
                energy_unit = r.get(unit)
                service = key(r.get("ServiceName") or r.get("product_servicecode") or r.get("Service"))
                if key(energy_unit) == "gb" and not any(name in service for name in ("network", "cdn", "egress")):
                    energy_unit = "gb (ambiguous)"
                self.add(r, r.get(d), rid, r.get(loc) if loc else "Zurich", energy_unit,
                         0 if credit else r.get(qty), r.get(amount), r.get(currency) if currency else "CHF", category, tags,
                         {"azure_costs": "Azure", "aws_costs": "AWS", "hoster_invoice": "Swiss Hoster"}[source])
        rates = defaultdict(list)
        for r in self.data["ai_usage"]:
            requests, output = natural(r.get("requests")), natural(r.get("tokens_out"))
            if inside(r.get("date")) and requests and output is not None:
                rates[tuple(key(r.get(k)) for k in ("provider", "model", "task_type"))].append(output / requests)
        inferred = {k: [cut[i] for i in (0, 4, 8)] for k, v in rates.items() if len(v) >= 20
                    for cut in (quantiles(v, n=10, method="inclusive"),)}
        weight = self.factors["ai_input_weight"]
        provider_region = {}
        for r in self.data["ai_usage"]:
            inp, out, cached = (natural(r.get(k)) for k in ("tokens_in", "tokens_out", "tokens_in_cache"))
            if cached is not None and inp is not None and cached > inp:
                self.audit("token_conflict", r["ref"], "Cached input exceeds total input")
            request_count = natural(r.get("requests"))
            profile = inferred.get(tuple(key(r.get(k)) for k in ("provider", "model", "task_type")))
            quantity_range = None
            if out is None and inp is not None and request_count and profile and inside(r.get("date")):
                quantity_range = [inp * weight + x * request_count for x in profile]
                out = profile[1] * request_count
                self.audit("ai_output_imputed", r["ref"], "Energy only: matched provider, model and task output tokens per request (10th/50th/90th percentile, min 20 rows).")
            quantity = inp * weight + out if inp is not None and out is not None else None
            energy_unit = "token-small" if key(r.get("model_class")) == "small" else "token-large"
            provider = key(r.get("provider"))
            if provider not in provider_region:
                regions = {self.region(x.get("region") or x.get("location")) for x in self.locations
                           if key(x.get("provider")) == provider and key(x.get("used_by_sme")) == "yes"}
                provider_region[provider] = next(iter(regions)) if len(regions) == 1 else "EU mix"
            region = provider_region[provider]
            self.add(r, r.get("date"), resource(r.get("resource_id")), region, energy_unit, quantity,
                     r.get("cost_chf"), "CHF", "AI gateway")
            if quantity_range and quantity:
                line = self.lines[-1]
                if line["kwh"] is not None:
                    line["quantity_range"] = quantity_range
                    for field in ("kwh", "kg"):
                        line[field] = [v * q / quantity for v, q in zip(line[field], quantity_range)]
        for source, (label, price) in CONTRACTS.items():
            for r in self.data[source]:
                seats, rate = natural(r.get("licences_purchased")), natural(r.get(price))
                amount = number(r.get("amount"))
                expected = seats * rate if seats is not None and rate is not None else None
                if amount is not None and expected is not None and abs(amount - expected) > 0.02:
                    self.audit("contract_amount_mismatch", r["ref"], "Final stated amount preferred over seats times price")
                elif amount is None and expected is not None:
                    amount = expected
                    self.audit("contract_amount_derived", r["ref"], "Purchased seats times unit price")
                rid = "|".join(key(r.get(k)) for k in (label, "provider", "cost_center"))
                activity, unit = r.get("messages_30d"), "message"
                if source == "saas_contracts":
                    unit = "seat-month"
                    activity = seats
                self.add(r, r.get("month"), rid, "EU mix", unit, activity, amount, r.get("currency"),
                         "AI subscriptions" if source == "ai_subscriptions" else "SaaS", {"tool": r.get(label)})
        self.add_m365()
        self.add_platform_energy()
        self.add_server_energy()
        for adjustment in self.policy.get("finance_adjustments", []):
            if (not adjustment.get("evidence") or not adjustment.get("actor") or not adjustment.get("id")
                    or number(adjustment.get("amount_chf")) is None or not inside(adjustment.get("date"))):
                self.audit("invalid_finance_adjustment", "policy", "Adjustment requires dated CHF and reviewer evidence")
                continue
            ref = "policy.json:finance_adjustments/" + str(adjustment["id"])
            self.add({"ref": ref, "provider": adjustment.get("provider")}, adjustment["date"],
                     adjustment.get("resource", ""), adjustment.get("region"), "", None,
                     adjustment["amount_chf"], "CHF", "Finance adjustments",
                     {"department": adjustment.get("department"), "project": adjustment.get("project")})
            self.audit("finance_adjustment", ref, adjustment["actor"] + ": " + adjustment["evidence"])

    def add_platform_energy(self):
        covered = {(r["resource"], r["day"]) for r in self.lines
                   if r["unit"] == "node-hour" and r["kwh"] is not None and r["quantity"] > 0}
        for r in self.data["data_platform_usage"]:
            rid, d = self.rid(r.get("resource_id")), day(r.get("date"))
            runtime, nodes = natural(r.get("runtime_h")), natural(r.get("node_count"))
            if rid in self.collisions or not d or not inside(d) or (rid, d.isoformat()) in covered or runtime is None or runtime > 24 or nodes is None:
                continue
            self.add(r, d, rid, r.get("region"), "node-hour", runtime * nodes, 0, "CHF", "Cloud")
            self.audit("platform_energy_fallback", r["ref"], "Runtime × node count. No matching billing energy on this day.")

    def add_m365(self):
        # Activity-based partial M365 footprint. SaaS contract rows keep the financial amounts.
        for r in self.data["m365_usage"]:
            beginning = day(r.get("week_start"))
            if not beginning or not inside(beginning):
                continue
            storage = natural(r.get("storage"))
            unit = key(r.get("storage_unit"))
            if storage is not None and unit == "mb":
                storage /= 1000
            quantities = {"gb-day": storage * min(7, (END - beginning).days) if storage is not None and unit in ("mb", "gb") else None,
                          "video-minute": natural(r.get("teams_video_minutes"))}
            for energy_unit, q in quantities.items():
                if q is None:
                    continue
                self.add(r, beginning, "m365", "EU mix", energy_unit, q, 0, "CHF", "SaaS", {"tool": "Microsoft 365"})

    def add_server_energy(self):
        covered = {(r["resource"], r["day"]) for r in self.lines if r["unit"] in
                   ("vcpu-hour", "vcore-hour", "node-hour", "gpu-hour") and r["kwh"] is not None and r["quantity"] > 0}
        pools = self.policy.get("case_measures", {}).get("shutdown_groups", {})
        pool_members = {
            s["pool"]: {rid for rid in self.inventory if rid in s.get("members", []) or
                        (s.get("prefix") and rid.startswith(s["prefix"]))} for s in pools.values() if s.get("pool")}
        from verification import evidence_record
        for pool, members in pool_members.items():
            attestation = evidence_record(self, "meter_pools", pool)
            if attestation:
                confirmed = attestation.get("members")
                if not isinstance(confirmed, list) or any(not isinstance(v, str) for v in confirmed):
                    raise ValueError(f"meter_pools/{pool} requires a list of server IDs.")
                members.intersection_update(confirmed)
        member_pool = {rid: pool for pool, members in pool_members.items() for rid in members}
        meter = defaultdict(float)
        for line in self.lines:
            if line["resource"] in pool_members and line["unit"] in ("vcpu-hour", "vcore-hour"):
                meter[line["resource"], line["day"]] += line["quantity"] or 0
        pending, demand = [], defaultdict(float)
        for r in self.data["server_metrics_weekly"]:
            rid = self.rid(r.get("server_id"))
            srv = self.inventory.get(rid, {})
            beginning, uptime = day(r.get("week_start")), natural(r.get("uptime_h"))
            vcpu = natural(srv.get("vcpu"))
            if rid in self.collisions or not beginning or not srv or uptime is None or uptime > 168 or not vcpu:
                self.audit("unusable_server_metrics", r["ref"], "Missing inventory, size, date or valid uptime")
                continue
            gpu = key(srv.get("type")) == "ml" or natural(r.get("gpu_avg_pct")) is not None
            for i in range(7):
                d = beginning + timedelta(days=i)
                if START <= d < END and (rid, d.isoformat()) not in covered:
                    quantity = uptime / 7 * (1 if gpu else vcpu)
                    pool_day = member_pool.get(rid), d.isoformat()
                    pending.append((r, d, rid, srv, gpu, quantity, pool_day))
                    if not gpu:
                        demand[pool_day] += quantity
        for r, d, rid, srv, gpu, quantity, pool_day in pending:
            original = quantity
            if not gpu and demand[pool_day] and meter[pool_day]:
                quantity *= max(0, 1 - meter[pool_day] / demand[pool_day])
            if original and not quantity:
                continue
            self.add(r, d, rid, srv.get("region"), "gpu-hour" if gpu else "vcpu-hour",
                     quantity, 0, "CHF", "Servers",
                     {"cost_center": srv.get("owner_cost_center"), "environment": srv.get("environment")})
            self.audit("server_energy_fallback", r["ref"], f"{rid} {d}: weekly uptime spread evenly; configured meter pool offsets {original - quantity:.3f} hours")

    def grouped(self, field):
        groups = defaultdict(list)
        for line in self.lines:
            groups[line[field]].append(line)
        return sorted([{"name": name, **total(rows)} for name, rows in groups.items()], key=lambda r: (-r["chf"], r["name"]))
