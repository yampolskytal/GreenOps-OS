"""HTTP service for one workspace, with optional authenticated shared use."""
import base64
import hashlib
import hmac
import json
import mimetypes
import shutil
import threading
from collections import defaultdict
from datetime import datetime, timezone
from email import policy as email_policy
from email.parser import BytesParser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from assistant_router import route_question, ai_usage_report
import frontend_api
from evidence import explain, totals_explained
from greenops import CORE, SCHEMA, total
from templates import tables


def accounts_from(path):
    if not path:
        return {}
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    for name, row in data.items():
        if not name or ":" in name or row["role"] not in ("viewer", "planner", "reviewer", "admin"):
            raise ValueError("Invalid account or role")
        if len(bytes.fromhex(row["salt"])) < 16 or len(bytes.fromhex(row["digest"])) != 32:
            raise ValueError("Account salt or digest is invalid")
    if not data:
        raise ValueError("Authentication requires at least one account")
    return data


def package_args(query):
    budget, days = (float(query.get(k, default)) for k, default in (("budget", 16500), ("days", 15)))
    mode, objective = query.get("mode", "planning"), query.get("objective", "midpoint")
    if (not 0 <= budget <= 16500 or budget % 1 or not 0 <= days <= 15 or days % .5
            or isinstance(query.get("budget"), bool) or isinstance(query.get("days"), bool)
            or mode not in ("planning", "approved", "conditional")
            or objective not in ("midpoint", "conservative", "first-year")):
        raise ValueError("Use whole CHF 0–16,500, 0–15 person-days in half-day increments and a supported mode and objective.")
    return int(budget), days, mode, objective


def serve(workspace, port, static, *, host="127.0.0.1", accounts=None, catalog=None, factory=None):
    accounts, catalog = accounts or {}, catalog or {}
    service = {"workspace": workspace, "job": {"status": "ready"}}
    lock = threading.Lock()
    if host not in ("127.0.0.1", "localhost") and not accounts:
        raise ValueError("Shared listening requires authentication")

    uploads = Path(__file__).resolve().parent / "inputs" / "uploads"
    max_upload = 64 * 1024 * 1024

    def import_upload(handler):
        """Store uploaded source CSVs as a new dataset folder and rebuild the workspace from it."""
        length = int(handler.headers.get("Content-Length") or 0)
        if not 0 < length <= max_upload:
            handler.close_connection = True
            return 413, {"accepted": False, "message": "Upload between 1 byte and 64 MB of CSV files.", "issues": []}
        raw = handler.rfile.read(length)  # always drain the body so the client sees the response
        if handler.role != "admin" or not factory:
            return 403, {"accepted": False, "message": "Your role cannot import data.", "issues": []}
        content_type = handler.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            return 400, {"accepted": False, "message": "Send files as multipart/form-data.", "issues": []}
        message = BytesParser(policy=email_policy.HTTP).parsebytes(
            b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + raw)
        files, issues = {}, []
        for part in message.iter_parts() if message.is_multipart() else ():
            name = Path(part.get_filename() or "").name
            if not name:
                continue
            if not (name.endswith(".csv") and name[:-4] in SCHEMA):
                issues.append(f"{name}: not a known source file, skipped")
                continue
            files[name] = part.get_payload(decode=True) or b""
        if not files:
            return 200, {"accepted": False, "message": "No recognised source CSV files were uploaded.", "issues": issues}
        with lock:
            if service["job"]["status"] == "running":
                return 409, {"accepted": False, "message": "A rebuild is already running. Try again shortly.", "issues": issues}
            service["job"] = {"status": "running"}
            prior = service["workspace"]
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = uploads / f"{stamp}-{hashlib.sha256(raw).hexdigest()[:8]}"
        missing = [c for c in CORE if f"{c}.csv" not in files]
        try:
            target.mkdir(parents=True)
            if missing:
                # Partial upload: keep the current dataset's other sources and its policy.
                for source in Path(prior.a.path).glob("*.csv"):
                    shutil.copyfile(source, target / source.name)
                (target / "policy.json").write_text(json.dumps(prior.a.policy, ensure_ascii=False), encoding="utf-8")
                issues.append("Partial upload: " + ", ".join(f"{c}.csv" for c in missing)
                              + " kept from the current dataset")
            for name, body in files.items():
                (target / name).write_bytes(body)
            next_work = factory(prior, {"data": str(target)}, None)
            if next_work.store:
                next_work.store.append(handler.actor, next_work.run_id, "import",
                                       {"prior_run": prior.run_id, "data": str(target), "files": sorted(files)})
        except Exception as error:
            shutil.rmtree(target, ignore_errors=True)
            with lock:
                service["job"] = {"status": "error", "message": str(error)}
            if not isinstance(error, (ValueError, TypeError, OSError, KeyError)):
                raise
            return 200, {"accepted": False, "message": f"Import failed: {error}", "issues": issues}
        with lock:
            catalog[f"Upload {stamp}"] = {"data": str(target)}
            service.update(workspace=next_work, job={"status": "ready", "run": next_work.run_id})
        baseline = next_work.a.baseline
        return 200, {"accepted": True, "datasetVersion": next_work.run_id[:12], "issues": issues,
                     "message": f"Imported {len(files)} file(s): {baseline['lines']:,} ledger lines, "
                                f"CHF {baseline['chf']:,.0f} baseline ({next_work.a.mode})."}

    def start_job(payload, actor):
        with lock:
            work = service["workspace"]
            selected = payload.get("dataset")
            if selected is not None and selected not in catalog:
                raise ValueError("Choose a configured dataset.")
            if not factory or service["job"]["status"] == "running":
                raise ValueError("A rebuild is already running or unavailable.")
            if payload.get("run") != work.run_id:
                raise ValueError("Workspace has changed. Reload it before rebuilding.")
            factors = payload.get("factors")
            if factors is not None and not isinstance(factors, dict):
                raise ValueError("Factor configuration must be a JSON object.")
            service["job"] = {"status": "running"}
        def rebuild():
            try:
                next_work = factory(work, catalog.get(selected), factors)
                if next_work.store:
                    next_work.store.append(actor, next_work.run_id, "rebuild", {"prior_run": work.run_id, "dataset": selected})
                with lock:
                    service.update(workspace=next_work, job={"status": "ready", "run": next_work.run_id})
            except (ValueError, TypeError, OSError, KeyError) as error:
                with lock:
                    service["job"] = {"status": "error", "message": str(error)}
            except Exception:
                with lock:
                    service["job"] = {"status": "error", "message": "Unexpected rebuild error. Check server logs."}
                raise
        threading.Thread(target=rebuild, daemon=True).start()
        return {"status": "running"}

    class Handler(BaseHTTPRequestHandler):
        def authenticate(self):
            if not accounts:
                return "local-operator", "admin"
            header = self.headers.get("Authorization", "")
            if not header.startswith("Basic ") or len(header) > 2048:
                return None, None
            try:
                user, password = base64.b64decode(header[6:], validate=True).decode().split(":", 1)
            except (ValueError, UnicodeError):
                return None, None
            account = accounts.get(user)
            if account:
                proof = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(account["salt"]), 600000)
                if hmac.compare_digest(proof, bytes.fromhex(account["digest"])):
                    return user, account["role"]
            return None, None

        def begin(self):
            host_header = self.headers.get("Host", "")
            if not accounts and host_header.split(":")[0] not in ("localhost", "127.0.0.1"):
                self.write(400, {"error": "Unexpected local Host"})
                return False
            self.actor, self.role = self.authenticate()
            if not self.actor:
                self.write(401, {"error": "Sign-in required"}, headers={"WWW-Authenticate": 'Basic realm="GreenOps", charset="UTF-8"'})
                return False
            return True

        def write(self, status, payload, mime="application/json; charset=utf-8", headers=None):
            body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.begin():
                return
            url = urlparse(self.path)
            path = url.path.strip("/")
            params = {k: v[0] for k, v in parse_qs(url.query, keep_blank_values=True).items()}
            work = service["workspace"]
            try:
                if path.startswith("api/v2/"):
                    try:
                        result = frontend_api.handle_get(work, path[7:], params)
                    except frontend_api.UnknownRoute:
                        self.write(404, {"error": "Unknown API route"})
                        return
                    self.write(200, result)
                elif path.startswith("api/"):
                    route = path[4:]
                    if route == "package":
                        result = work.package(*package_args(params))
                    elif route == "assistant-usage":
                        result = ai_usage_report(work)
                    elif route in ("overview", "drivers"):
                        grouping = params.get("by", "tool")
                        if grouping not in ("department", "tool", "region", "provider"):
                            raise ValueError("Group by department, tool, region or provider.")
                        groups = defaultdict(list)
                        for line in work.a.lines:
                            groups[line[grouping]].append(line)
                        result = [{"name": name, "figures": totals_explained(total(rows), sorted({r["ref"].split(":")[0] for r in rows})),
                                   "example_refs": [r["ref"] for r in rows[:5]]} for name, rows in groups.items()]
                        result.sort(key=lambda r: -r["figures"]["cost"]["value"])
                    elif route in ("measures", "waste"):
                        rank = params.get("rank_by", "chf")
                        if rank not in ("chf", "kg"):
                            raise ValueError("Rank by chf or kg.")
                        mode = params.get("mode", "planning")
                        if mode not in ("planning", "conditional", "approved"):
                            raise ValueError("Unknown approval mode.")
                        plan = work.package(mode=mode)
                        selected = {m["id"]: m for m in plan["selected"]}
                        items = plan["selected"] if route == "waste" else [*plan["selected"], *plan["excluded"]]
                        result = [dict(explain(m), requires_approval=m["requires_approval"], included=m["id"] in selected,
                                       evidence_status="blocked" if m["status"] == "blocked" else
                                       "owner review required" if m["requires_approval"] else "eligible")
                                  for m in sorted(items, key=lambda m: (-(m["chf"] if rank == "chf" else m["kg"][1]), m["id"]))]
                    elif route == "issue-queue":
                        result = work.issue_queue()
                    elif route == "projections":
                        from insights import projections
                        result = projections(work.a, work.package(*package_args(params)))
                    elif route == "investment-options":
                        from decision import investment_options
                        result = investment_options(work.reports, work.package(*package_args(params)))
                    elif route.startswith("measures/") and route.endswith("/explain"):
                        measure_id = unquote(route[9:-8])
                        item = next((m for m in work.reports.measures if m["id"] == measure_id), None)
                        if item is None:
                            self.write(404, {"error": "Unknown measure"})
                            return
                        result = explain(item)
                    elif route in ("questions/1", "questions/2", "questions/3"):
                        result = work.answers[{"1":"unused-seats", "2":"gpu", "3":"production"}[route[-1]]]
                    elif route == "settings":
                        result = {"datasets": sorted(catalog), "role": self.role, "run": work.run_id,
                                  "can_rebuild": self.role == "admin" and factory is not None}
                    elif route == "progress":
                        result = service["job"]
                    elif route == "history":
                        histories = work.store.snapshots() if work.store else []
                        result = [{"id": r["id"], "created": r["created"], "mode": r["manifest"]["mode"],
                                   "baseline": r["summary"]} for r in histories]
                    elif route in ("scenarios", "review-history"):
                        kind = "scenario" if route == "scenarios" else "review"
                        result = work.store.history(work.run_id, kind) if work.store else []
                    elif route in ("ledger", "audit") and params:
                        offset, size = int(params.get("offset", 0)), int(params.get("limit", 100))
                        if offset < 0 or not 1 <= size <= 500:
                            raise ValueError("Use nonnegative offset and page sizes of 1–500.")
                        records = work.views[route]
                        result = {"total": len(records), "offset": offset, "items": records[offset:offset + size]}
                    elif route.startswith("questions/") and route[10:] in work.answers:
                        result = work.answers[route[10:]]
                    elif route in work.views:
                        result = work.views[route]
                    else:
                        self.write(404, {"error": "Unknown API route"})
                        return
                    self.write(200, result)
                elif path.startswith("downloads/") and path[10:] in work.outputs:
                    name = path[10:]
                    plan = work.package(*package_args(params)) if params else work.package()
                    if plan["mode"] == "conditional" and params.get("draft") != "1":
                        raise ValueError("Explicit draft=1 is required for conditional downloads.")
                    outputs = tables(work.a, plan, work.template_root) if name.endswith("package.csv") else work.outputs
                    download = "DRAFT-" + name if plan["mode"] == "conditional" else name
                    self.write(200, outputs[name].encode("utf-8-sig"), "text/csv; charset=utf-8",
                               {"Content-Disposition": f'attachment; filename="{download}"'})
                elif path in static and (work.directory / static[path]).is_file():
                    name = static[path]
                    self.write(200, (work.directory / name).read_bytes(),
                               (mimetypes.guess_type(name)[0] or "application/octet-stream") + "; charset=utf-8")
                else:
                    self.write(404, {"error": "Not found"})
            except (ValueError, TypeError) as error:
                self.write(400, {"error": str(error)})

        def do_POST(self):
            if not self.begin():
                return
            origin = self.headers.get("Origin")
            if origin and origin not in {s + self.headers["Host"] for s in ("https://", "http://")}:
                self.write(403, {"error": "Cross-origin write refused"})
                return
            if urlparse(self.path).path.strip("/") == "api/v2/imports":
                self.write(*import_upload(self))
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 512000 or self.headers.get_content_type() != "application/json":
                    raise ValueError("Submit a bounded JSON request.")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("Expected a JSON object.")
                route = urlparse(self.path).path.strip("/")
                work = service["workspace"]
                if route.startswith("api/v2/"):
                    try:
                        self.write(200, frontend_api.handle_post(
                            work, route[7:], {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}, payload))
                    except frontend_api.UnknownRoute:
                        self.write(404, {"error": "Unknown API route"})
                    return
                if route == "api/ask":
                    self.write(200, route_question(work, payload.get("question", ""), payload.get("context")))
                    return
                if route == "api/package/optimize":
                    self.write(200, work.package(*package_args(payload)))
                    return
                if route == "api/package/compare":
                    budget, days, _, objective = package_args(payload)
                    self.write(200, work.compare_package(budget, days, objective, payload.get("exclude", []),
                                                         payload.get("production_annual_quote_chf")))
                    return
                required = {"api/review": ("reviewer", "admin"), "api/issue-review": ("reviewer", "admin"),
                            "api/scenarios": ("planner", "reviewer", "admin"),
                            "api/rebuild": ("admin",)}
                if route not in required:
                    self.write(404, {"error": "Unknown API route"})
                    return
                if self.role not in required[route]:
                    self.write(403, {"error": "Your role cannot perform this action"})
                    return
                if payload.get("run") != work.run_id or not work.store:
                    raise ValueError("Run has changed or durable storage is unavailable.")
                if route == "api/rebuild":
                    self.write(202, start_job(payload, self.actor))
                    return
                if route == "api/issue-review":
                    ident, state = payload.get("id"), payload.get("status")
                    owner = str(payload.get("owner") or "").strip()
                    evidence = str(payload.get("evidence") or "").strip()
                    adjustment = str(payload.get("adjustment_ref") or "").strip()
                    if (not any(item["id"] == ident for item in work.views["issue-queue"])
                            or state not in ("investigating", "resolved") or not 2 <= len(owner) <= 120
                            or not 4 <= len(evidence) <= 2000):
                        raise ValueError("Choose a current issue and record an owner, review status and evidence.")
                    if adjustment and not any(r["ref"] == adjustment and r["code"] in
                                              ("finance_adjustment", "cost_recovered", "reviewed_row_excluded", "reviewed_duplicate_retained")
                                              for r in work.a.events):
                        raise ValueError("Adjustment must reference an applied finance or source adjustment in this run.")
                    sequence = work.store.append(self.actor, work.run_id, "issue_review",
                                                 {"id": ident, "status": state, "owner": owner, "evidence": evidence,
                                                  "adjustment_ref": adjustment or None})
                elif route == "api/review":
                    item = next((m for m in work.reports.measures if m["id"] == payload.get("measure")), None)
                    checks = ("owner_attested", "protection_checked", "dependency_checked", "rollback_tested")
                    decision = payload.get("decision")
                    evidence = str(payload.get("evidence") or "").strip()
                    if not item or payload.get("fingerprint") != item["review_fingerprint"] or decision not in ("approved", "rejected"):
                        raise ValueError("Choose a current measure and decision.")
                    if not 4 <= len(evidence) <= 2000 or (decision == "approved" and
                            (item["hard_blockers"] or item.get("pilot_evidence_complete") is False
                             or item.get("quote_status") == "quote required" or not all(payload.get(k) is True for k in checks))):
                        raise ValueError("Record verifiable evidence and attest protection, dependencies and rollback. Hard blocks cannot be overridden.")
                    entry = {"measure": item["id"], "fingerprint": item["review_fingerprint"], "decision": decision, "evidence": evidence}
                    entry.update({k: payload.get(k) is True for k in checks})
                    sequence = work.store.append(self.actor, work.run_id, "review", entry)
                else:
                    name = str(payload.get("name", "")).strip()
                    if not 1 <= len(name) <= 100:
                        raise ValueError("Name the scenario.")
                    options = package_args(payload)
                    plan = work.package(*options)
                    value = {k: v for k, v in plan.items() if k not in ("selected", "excluded", "reviews")}
                    value["measure_ids"] = [m["id"] for m in plan["selected"]]
                    sequence = work.store.append(self.actor, work.run_id, "scenario",
                                                 {"name": name, "options": options, "result": value})
                self.write(201, {"sequence": sequence})
            except (ValueError, TypeError, AttributeError) as error:
                self.write(400, {"error": str(error)})

    with ThreadingHTTPServer((host, port), Handler) as server:
        print(f"{workspace.a.mode} | http://{host}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
