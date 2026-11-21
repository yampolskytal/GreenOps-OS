"""GreenOps command line, export builder and loopback dashboard server."""
import argparse
import getpass
import hashlib
import secrets
import json
import shutil
from copy import copy
from collections import Counter
from datetime import date
from pathlib import Path


def _load_env_file(path=Path(__file__).with_name("apertus.env")):
    """Load `export KEY=value` lines from apertus.env so it works without `source` (also on Windows)."""
    import os
    if not path.is_file():
        return
    allowed = {"GREENOPS_LLM_BASE_URL", "GREENOPS_LLM_MODEL", "GREENOPS_LLM_API_KEY", "GREENOPS_LLM_TOOLS",
               "GREENOPS_APERTUS_MODEL", "GREENOPS_APERTUS_API_KEY"}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.split(" #", 1)[0].strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.removeprefix("export ").partition("=")
        value = value.strip().strip("'\"")
        if sep and key.strip() in allowed and value and value not in ("PASTE_KEY_HERE", "hf_PASTE_TOKEN_HERE"):
            os.environ.setdefault(key.strip(), value)


from accounting import ai_price_reconciliation, allocate, coverage, embodied_inventory, market_breakdown
from analytics import Reports
from evidence import contradictions, figure, question_figures, totals_explained
from verification import energy_coverage, review_queue
from decision import attribution_checks, combine_production, gap_priorities, investment_options, savings_timing, swiss_sensitivity
from submission import validate, write_receipt
from insights import projections
from service import accounts_from, serve
from records import Records, fingerprint
from templates import BASE_NAME, MEASURE_NAME, tables
from bonus import diagnostics, forecast
from bonus_evidence import considered_joins
from scheduler import schedule
from assistant_check import check_assistant
from demo import generate
from greenops import END, ROOT, START, Analysis, day, number

STATIC = {"": "index.html", "index.html": "index.html", "app.js": "app.js", "style.css": "style.css"}


def load_factors(path):
    f = path if isinstance(path, dict) else json.loads(Path(path).read_text(encoding="utf-8-sig"))
    periods = f.get("market_grid_periods", {})
    for region, entries in periods.items():
        dates = sorted((day(e.get("from")) or date.min, day(e.get("through")) or date.min) for e in entries)
        if any(s == date.min or e < s or (i and dates[i-1][1] >= s) for i, (s, e) in enumerate(dates)):
            raise ValueError(f"Invalid or overlapping market factor dates in {region}")
    for name, item in [*f["grid"].items(), *f["energy"].items(), *f.get("market_grid", {}).items(),
                       *((region, e) for region, values in periods.items() for e in values),
                       *f.get("site_pue", {}).items(), *(pair for scope in f.get("resource_energy", {}).values() for pair in scope.items()),
                       ("pue", f["pue"]), ("growth", f["growth"])]:
        values = item["values"]
        minimum = -1 if name == "growth" else 1 if name == "pue" else 0
        if (len(values) != 3 or any(not isinstance(v, (int, float)) or number(v) is None or v < minimum for v in values)
                or values != sorted(values) or not item.get("source") or not item.get("note")):
            raise ValueError(f"Invalid factor {name}: supply ordered low/mid/high values, source and note")
    if not 0 <= f["ai_input_weight"] <= 1:
        raise ValueError("AI input token weight must be between zero and one")
    if set(f["regions"]) - set(f["grid"]) or "unknown" not in f["grid"]:
        raise ValueError("Each normalized region and unknown must have a grid factor")
    for region, profile in f.get("hourly_grid", {}).items():
        if (len(profile["values"]) != 24 or any(not isinstance(v, (int, float)) or number(v) is None or v < 0
                                                for v in profile["values"]) or not profile.get("source")):
            raise ValueError(f"Invalid hourly grid configuration for {region}")
    return f


class Workspace:
    def __init__(self, data, factors, directory, as_of, policy=None, store=None, template_root=None):
        if not data.is_dir():
            raise ValueError(f"Data directory does not exist: {data}")
        self.a = Analysis(data, load_factors(factors), (data / "DEMO_ONLY.txt").is_file(), as_of, policy, store)
        self.reports = Reports(self.a)
        self.answers = question_figures(self.reports.answers())
        self.directory = directory
        self.store, self.template_root = store, template_root
        signature_files = ("app.py", "greenops.py", "analytics.py", "accounting.py", "planning.py", "case_measures.py", "evidence.py", "assistant_router.py", "assistant_check.py", "bonus.py", "bonus_evidence.py", "scheduler.py", "grid_replay.py", "insights.py", "templates.py", "schema-v13.json", "verification.py", "decision.py", "submission.py", "forecast_scenarios.py", "runtime.py")
        self.manifest = {"engine": fingerprint([(n, (ROOT / n).read_text(encoding="utf-8")) for n in signature_files]),
                         "mode": self.a.mode, "as_of": str(as_of), "factors": self.a.factors, "policy": self.a.policy,
                         "sources": {k: v.get("sha256") for k, v in self.a.sources.items()}}
        replay = ROOT / "bonus-evidence" / "de-hourly-replay.csv"
        use_replay = bool(self.a.policy.get("case_measures") and replay.is_file() and not self.a.demo)
        if use_replay:
            self.manifest["bonus_replay_sha256"] = hashlib.sha256(replay.read_bytes()).hexdigest()
        for name in ("hourly_grid.csv", BASE_NAME, MEASURE_NAME):
            root = data if name == "hourly_grid.csv" else template_root or data
            path = root / name
            if not path.is_file() and name != "hourly_grid.csv":
                path = ROOT / "templates" / name
            if path.is_file():
                self.manifest["sources"][name] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.run_id = store.snapshot(self.manifest, self.a.baseline) if store else fingerprint(self.manifest)
        self.plan = self.package()
        self.outputs = tables(self.a, self.plan, template_root)
        tariff = ai_price_reconciliation(self.a)
        quality = coverage(self.a)
        footprint_coverage = energy_coverage(self.a.lines)
        conflicts = contradictions(self.reports)
        allocation = allocate(self.a)
        examples = schedule(self.reports, replay=replay) if use_replay else []
        shifted = max((r for r in examples if r.get("kg_avoided", [0,0,0])[1] > 0),
                      key=lambda r: r["kg_avoided"][1], default=None)
        kept = next((r for r in examples if r.get("resource") == "dp-prod" and r["blockers"]), None)
        self.views = {
            "summary": {"mode": self.a.mode, "period": [str(START), str(END.replace(month=8, day=31))],
                        "figures": totals_explained(self.a.baseline, sorted({r["ref"].split(":")[0] for r in self.a.lines})),
                        "as_of": as_of.isoformat(), "baseline": self.a.baseline, "run_id": self.run_id,
                        "footprint_coverage": footprint_coverage["total"],
                        "departments": self.a.grouped("department"), "tools": self.a.grouped("tool"),
                        "categories": self.a.grouped("category"), "months": self.a.grouped("month"),
                        "regions": self.a.grouped("region"), "projects": self.a.grouped("project"), "providers": self.a.grouped("provider"),
                        "sources": list(self.a.sources.values()), "audit_counts": dict(Counter(r["code"] for r in self.a.events))},
            "package": self.plan, "questions": self.answers, "reconciliation": self.reports.reconciliation,
            "forecast": forecast(self.a), "diagnostics": diagnostics(self.reports),
            "audit": self.a.events, "ledger": self.a.lines, "factors": self.a.factors,
            "manifest": self.manifest, "allocation": allocation, "coverage": quality, "ai-pricing": tariff,
            "projections": projections(self.a, self.plan), "embodied": embodied_inventory(self.a),
            "protections": {"rules": self.a.policy.get("protection_register", []),
                            "ticket_records": [r for r in self.a.data["it_tickets"]
                                               if any(r["ticket_id"] in p["source"] for p in self.a.policy.get("protection_register", []))]},
            "contradictions": conflicts, "footprint-coverage": footprint_coverage,
            "issue-queue": [*attribution_checks(self.reports), *review_queue(conflicts)],
            "coverage-priorities": gap_priorities(self.a.lines, self.plan),
            "investment-options": investment_options(self.reports, self.plan),
            "market-breakdown": market_breakdown(self.a),
            "ci-attribution": self.reports.ci_attribution,
            "bonus-decisions": considered_joins(self.reports, allocation),
            "carbon-replay": {"shifted_case_job": shifted, "protected_case_job": kept,
                              "operational_approval": False,
                              "method": "Historical replay only. Uses a proxy for local coal and gas generation intensity, excluding imports and treating unmodeled categories as zero contribution. No operational booking."},
        }

    def package(self, budget=16500, days=15, mode="planning", objective="midpoint", *, exclude=(), catalog=None,
                daily_rate=1100):
        entries = self.store.history(self.run_id, "review", 10000) if self.store else []
        approvals = {}
        for row in entries:
            p = row["payload"]
            approvals.setdefault(p["measure"], p | {"actor": row["actor"], "created": row["created"]})
        package = (catalog or self.reports).optimize(budget, days, mode, objective, approvals, exclude, daily_rate)
        savings = package["savings"]
        measures = [r["id"] for r in package["selected"]]
        package["figures"] = {
            field: figure(value[1] if isinstance(value, list) else value, unit, "Sum of the non-overlapping selected measures.",
                          {"selected_measure_ids": measures}, ["GET /api/measures/{id}/explain"],
                          value[0] if isinstance(value, list) else None, value[2] if isinstance(value, list) else None)
            for field, unit in (("chf", "CHF/year"), ("kwh", "kWh/year"), ("kg", "kg CO2e/year"))
            for value in (savings[field],)}
        package["reviews"] = approvals
        package["savings_timing"] = savings_timing(package)
        reference = self.a.policy.get("reference_baseline", {})
        ref_chf, ref_kg = number(reference.get("chf")), number(reference.get("kg"))
        if ref_chf and ref_kg and reference.get("source"):
            package["reference"] = {"source": reference["source"], "cost_fraction": package["savings"]["chf"] / ref_chf,
                                    "carbon_fraction": package["savings"]["kg"][1] / ref_kg}
        else:
            package["reference"] = None
        return package

    def compare_package(self, budget, days, objective, excluded, quote):
        available = {item["id"]: item for item in self.reports.measures}
        if (not isinstance(excluded, list) or len(excluded) > 25 or
                any(not isinstance(identifier, str) or identifier not in available for identifier in excluded)):
            raise ValueError("Choose up to 25 known measure IDs to exclude.")
        current = self.package(budget, days, "planning", objective)
        catalog = None
        if quote is not None:
            if isinstance(quote, bool) or (quote := number(quote)) is None or quote < 0:
                raise ValueError("Set a nonnegative variable-rate annual quote in CHF.")
            rate = available.get("Negotiate production compute rate:dp-prod")
            autoscale = available.get("Autoscale surplus production workers:dp-prod")
            if not (rate and autoscale):
                raise ValueError("This dataset has no comparable production compute and autoscaling scopes.")
            from planning import apply_policy
            item = apply_policy(self.reports, combine_production(autoscale, rate, quote, hypothetical=True))
            item["review_fingerprint"] = fingerprint(item)
            catalog = copy(self.reports)
            catalog.measures = [r for r in self.reports.measures if r["id"] != item["id"]] + [item]
            if {rate["id"], autoscale["id"]}.intersection(excluded):
                excluded = [*excluded, item["id"]]
        alternative = self.package(budget, days, "planning", objective, exclude=excluded, catalog=catalog)
        old_ids = {m["id"] for m in current["selected"]}
        new_ids = {m["id"] for m in alternative["selected"]}
        def compact(source):
            fields = ("savings", "cost_fraction", "carbon_fraction", "cost_gap_chf", "carbon_gap_kg", "target_met",
                      "spent_chf", "days", "first_year_net_chf", "optimum_proven", "pending_approvals")
            return {k: source[k] for k in fields} | {"selected": [{
                k: m.get(k) for k in ("id", "name", "chf", "kg", "approval", "requires_approval", "calculation_inputs")
            } for m in source["selected"]]}
        return {"baseline": compact(current), "alternative": compact(alternative), "added": sorted(new_ids-old_ids),
                "removed": sorted(old_ids-new_ids), "hypothetical_quote_chf": quote,
                "method": "Read-only comparison. The hypothetical quote does not amend policy, record approvals, or change official exports."}

    def issue_queue(self):
        decisions = {}
        if self.store:
            for row in self.store.history(self.run_id, "issue_review", 10000):
                decisions.setdefault(row["payload"]["id"], row)
        return [item | {"review": decisions.get(item["id"])} for item in self.views["issue-queue"]]

    def export(self, destination, include_sensitivity=False):
        destination.mkdir(parents=True, exist_ok=True)
        names = list(self.outputs) + [name + ".json" for name in self.views]
        for name, value in self.outputs.items():
            (destination / name).write_text(value, encoding="utf-8-sig")
        for name, value in self.views.items():
            contents = self.issue_queue() if name == "issue-queue" else value
            (destination / (name + ".json")).write_text(json.dumps(contents, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
        for mode in ("conditional", "approved"):
            name = f"package-{mode}.json"
            names.append(name)
            (destination / name).write_text(
                json.dumps(self.package(mode=mode), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
        if include_sensitivity:
            name = "swiss-sensitivity.json"
            (destination / name).write_text(json.dumps(swiss_sensitivity(self), ensure_ascii=False, indent=2), encoding="utf-8")
            names.append(name)
        name = "assistant-report-check.json"
        (destination / name).write_text(json.dumps(check_assistant(self, destination), ensure_ascii=False, indent=2), encoding="utf-8")
        names.append(name)
        write_receipt(destination, names, self.manifest)


def build():
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    for name in STATIC.values():
        shutil.copyfile(ROOT / "frontend" / name, out / name)
    print("Built dashboard in dist/")


def main():
    _load_env_file()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("serve", "demo", "export", "validate", "assistant-check", "build", "account"))
    parser.add_argument("--live-model", action="store_true", help="Send canned evaluation prompts to a configured Apertus endpoint.")
    parser.add_argument("--data", type=Path)
    parser.add_argument("--swiss-sensitivity", action="store_true", help="Reprice the fixed selected package under Swiss low/mid/high factors on export.")
    parser.add_argument("--factors", type=Path, default=ROOT / "factors.json")
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--templates", type=Path)
    parser.add_argument("--state", type=Path, default=ROOT / "state" / "greenops.sqlite3")
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--accounts", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--username")
    parser.add_argument("--role", choices=("viewer", "planner", "reviewer", "admin"), default="viewer")
    parser.add_argument("--as-of", type=date.fromisoformat, default=date(2026, 9, 6))
    parser.add_argument("--out", type=Path, default=ROOT / "submission")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        if args.command == "validate":
            print(json.dumps(validate(args.out, args.data, args.templates), indent=2))
            return
        args.data = args.data or ROOT / "demo-data"
        if args.command == "build":
            build()
        elif args.command == "account":
            if not args.accounts or not args.username or ":" in args.username:
                raise ValueError("Use --accounts FILE --username NAME --role ROLE")
            password = getpass.getpass("New GreenOps password: ")
            if len(password) < 14 or password != getpass.getpass("Confirm password: "):
                raise ValueError("Use matching passwords of at least 14 characters.")
            current = accounts_from(args.accounts) if args.accounts.exists() else {}
            salt = secrets.token_bytes(24)
            current[args.username] = {"role": args.role, "salt": salt.hex(),
                                      "digest": hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600000).hex()}
            args.accounts.parent.mkdir(parents=True, exist_ok=True)
            next_path = args.accounts.with_name(args.accounts.name + ".new")
            with next_path.open("x", encoding="utf-8") as handle:
                json.dump(current, handle, indent=2)
            next_path.replace(args.accounts)
        elif args.command == "demo":
            generate(args.data)
            print(f"Representative demo written to {args.data}")
        else:
            store = Records(args.state)
            def read_policy(path, data):
                if path is None and (data / "policy.json").is_file():
                    path = data / "policy.json"
                return json.loads(path.read_text(encoding="utf-8-sig")) if path else {}
            workspace = Workspace(args.data, args.factors, ROOT / "dist", args.as_of,
                                  read_policy(args.policy, args.data), store, args.templates)
            if args.command == "assistant-check":
                check = check_assistant(workspace, args.out, args.live_model)
                print(json.dumps(check, ensure_ascii=False, indent=2))
                if not all(r["match"] for r in check["report_comparisons"]):
                    raise ValueError("An assistant answer differs from its same-run export.")
                if args.live_model and (check["apertus"] != "Endpoint checked" or not all(check.get(k) for k in
                    ("german_matches_cost_rows", "followup_preserves_tool_grouping", "unsupported_has_no_result"))):
                    raise ValueError("Live Apertus checks are incomplete; see the report.")
            elif args.command == "export":
                if args.out.resolve() == args.data.resolve() or args.out.resolve().is_relative_to(args.data.resolve()):
                    raise ValueError("Keep exports outside the input directory")
                workspace.export(args.out, args.swiss_sensitivity)
                print(f"{workspace.a.mode} | Exported to {args.out}")
            else:
                if not (ROOT / "dist" / "index.html").is_file():
                    build()
                catalog = {"Representative demo": {"data": str(ROOT / "demo-data")}}
                known = ROOT / "inputs" / "sprintd-basel-green-ai-data-main"
                if known.is_dir():
                    catalog["Official challenge data"] = {"data": str(known), "policy": str(ROOT / "challenge-policy.json")}
                if args.catalog:
                    catalog.update(json.loads(args.catalog.read_text(encoding="utf-8-sig")))
                def factory(prior, entry, factors):
                    data = Path(entry["data"]) if entry else prior.a.path
                    policy_path = Path(entry["policy"]) if entry and entry.get("policy") else None
                    policy = read_policy(policy_path, data) if entry else prior.a.policy
                    selected_factors = entry.get("factors", args.factors) if entry else prior.a.factors
                    return Workspace(data, factors or selected_factors, ROOT / "dist", args.as_of, policy, store, args.templates)
                serve(workspace, args.port, STATIC, host=args.host, accounts=accounts_from(args.accounts),
                      catalog=catalog, factory=factory)
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(2, f"GreenOps: {exc}\n")


if __name__ == "__main__":
    main()
