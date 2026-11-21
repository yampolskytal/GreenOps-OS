"""GreenOps platform assistant: Apertus (or any OpenAI-compatible model) as a *planner*.

Safety model (see ASSISTANT_SAFETY.md):
- The model only receives the user's own text, a fixed tool/page catalogue, short measure
  aliases and sanitized filter labels. It never receives ledger rows, free-text dataset fields
  (ticket descriptions, invoice remarks, tags, notes) or tool results, so prompt injection planted
  in the data cannot reach it and no dataset content leaves the machine.
- Every tool call is validated against allow-lists (pages, measure IDs, departments, providers,
  months, limits) and executed locally. Figures in answers are rendered by GreenOps, not the model.
- The model's own prose is kept only if it contains no figures and no links.
- Actions are returned as buttons the user must click. Nothing is committed, approved, deleted or
  exported by the assistant; staged plans open as an uncommitted Studio preview.
"""
import json
import os
import re
from urllib.parse import urlparse
from urllib.request import Request, build_opener

from assistant_router import NoRedirect
from insights import query

PAGES = {
    "home": ("/", "", "Role selection (CEO, CFO, IT manager)"),
    "ceo": ("/ceo", "", "CEO dashboard: executive snapshot, targets, plan impact"),
    "cfo": ("/cfo", "", "CFO dashboard: costs, savings, payback, budget"),
    "it": ("/it", "", "IT manager dashboard: resources, utilisation, idle cost"),
    "footprint": ("/explore", "", "Explore: digital footprint calendar, map and breakdowns"),
    "compare": ("/explore", "compare", "Explore: compare departments, providers, services"),
    "findings": ("/findings", "", "Waste findings and data conflicts"),
    "studio": ("/studio", "", "Optimization Studio: pick measures, simulate, optimize, build Paths"),
    "paths": ("/studio", "paths", "Saved Paths: compare up to three alternative plans"),
    "current-plan": ("/current-plan", "", "Current Plan: the committed package and its impact"),
    "forecast": ("/forecast", "", "Forecasts: baseline vs optimized 3-year paths"),
    "data": ("/data", "", "Data management: dataset health, coverage, conflicts"),
    "submission": ("/submission", "", "Official CSV exports (baseline and measures package)"),
    "import": ("/import", "", "Import new data files"),
}
ROLES = ("ceo", "cfo", "it")
METRICS = ("cost", "energy", "co2Location")
TOOLS = {
    "query_ledger": "Read-only analytics question, e.g. 'cost by department', 'carbon by tool', 'energy in August 2026', 'unused seats', 'CI waste', 'reconciliation'. args: {query}",
    "list_measures": "Rank savings measures. args: {sort_by: 'chf'|'co2', limit: 1-10}",
    "explain_measure": "Details, risks and evidence of one measure. args: {measure: alias}",
    "simulate_plan": "Check a set of measures against the 25% cost / 40% CO2 / CHF 16,500 / 15 PD constraints. args: {measures: [alias], budget_chf?}",
    "optimize_plan": "Find the best package. args: {priority: 'balanced'|'cost'|'co2', budget_chf?}",
    "forecast": "Baseline vs optimized forecast. args: {metric: 'cost'|'energy'|'co2Location', years: 1-3}",
    "data_quality": "Dataset health and conflicts summary. args: {}",
    "findings": "Top waste findings. args: {limit: 1-10}",
    "navigate": "Offer a link to a page. args: {page}",
    "open_measure": "Offer a link to a measure in the Studio. args: {measure: alias}",
    "highlight_resource": "Offer a link to a resource on the IT dashboard. args: {resource_id}",
    "set_filters": "Offer to apply global filters. args: {department?, provider?, from? 'YYYY-MM', to? 'YYYY-MM'} ('all' clears)",
    "set_role": "Offer to switch dashboard role. args: {role: 'ceo'|'cfo'|'it'}",
    "stage_plan": "Offer to save measures (or the optimizer result) as an uncommitted Path in the Studio. args: {measures?: [alias], priority?, budget_chf?}",
}
INJECTION = re.compile(r"ignore (all |any )?(previous|prior|above)|instruction|system prompt|you are now|assistant", re.I)
LABEL = re.compile(r"^[\w .,&()/+'-]{1,48}$")
MONTH = re.compile(r"^20\d\d-(0[1-9]|1[0-2])$")
URL = re.compile(r"https?://\S+|www\.\S+|\[[^\]]*\]\([^)]*\)")
NUMBER = re.compile(r"\d[\d',.]*")


def safe_label(text):
    """Dataset-derived labels may only reach the model if short, plain and instruction-free."""
    return isinstance(text, str) and bool(LABEL.match(text)) and not INJECTION.search(text)


def fmt(v):
    return f"{v:,.0f}" if abs(v) >= 100 else f"{v:,.2f}"


class Agent:
    def __init__(self, work, api):
        self.w, self.api = work, api
        self.measures = list(api.measures.values())
        self.alias = {f"M{i + 1}": m["id"] for i, m in enumerate(self.measures)}
        self.rev = {v: k for k, v in self.alias.items()}
        self.departments = sorted({l["department"] for l in work.a.lines if l["department"]})
        self.providers = sorted({l["provider"] for l in work.a.lines if l["provider"]})
        self.resources = set(work.reports.by_resource) | set(work.a.inventory)

    # ---------------------------------------------------------------- model call
    def catalogue(self):
        measures = "\n".join(f"{self.rev[m['id']]}: {m['name']} ({m['resource']})" for m in self.measures
                             if safe_label(m["name"]) and safe_label(m["resource"]))
        pages = "\n".join(f"{k}: {v[2]}" for k, v in PAGES.items())
        tools = "\n".join(f"{k}: {v}" for k, v in TOOLS.items())
        return (
            "You are the GreenOps platform assistant. You never see company data: you plan which local tools to run and which "
            "links to offer; GreenOps computes and shows all figures itself.\n"
            "Reply with JSON only: {\"reply\": \"<one or two sentences, NO numbers, NO links>\", \"calls\": [{\"tool\": \"<name>\", \"args\": {...}}]}\n"
            "Use at most 4 calls. Combine a data tool with a navigation/action tool when helpful. Translate non-English questions. "
            "Spending, bills and prices mean cost; emissions mean co2. Requests to delete, restart, shut down, approve, commit or "
            "change infrastructure are not tools: explain that a human must do it on the relevant page and offer navigate/open_measure. "
            "If nothing fits, return an empty calls list. Actions only happen when the user clicks the offered buttons, so phrase "
            "them as offers ('Use the button below to ...'), never as already done. Always run a data tool when the user asks for figures.\n"
            "EXAMPLES\n"
            "Q: Wie teuer sind unsere Abteilungen? Zeig mir auch die Daten-Seite.\n"
            "A: {\"reply\": \"Hier sind die Kosten pro Abteilung; die Daten-Seite können Sie unten öffnen.\", \"calls\": [{\"tool\": \"query_ledger\", \"args\": {\"query\": \"cost by department\"}}, {\"tool\": \"navigate\", \"args\": {\"page\": \"data\"}}]}\n"
            "Q: Plan that hits both targets, cheapest first\n"
            "A: {\"reply\": \"Here is the optimized package; use the button to preview it in the Studio.\", \"calls\": [{\"tool\": \"optimize_plan\", \"args\": {\"priority\": \"cost\"}}, {\"tool\": \"stage_plan\", \"args\": {}}]}\n\n"
            f"TOOLS\n{tools}\n\nPAGES\n{pages}\n\nMEASURES\n{measures}\n\n"
            f"DEPARTMENTS: {', '.join(d for d in self.departments if safe_label(d))}\n"
            f"PROVIDERS: {', '.join(p for p in self.providers if safe_label(p))}\n"
            "Baseline period 2025-09 to 2026-08."
        )

    def endpoint(self):
        hosted, local = os.getenv("GREENOPS_LLM_MODEL"), os.getenv("GREENOPS_APERTUS_MODEL")
        if hosted:
            model, secret, base = hosted, os.getenv("GREENOPS_LLM_API_KEY"), os.getenv("GREENOPS_LLM_BASE_URL", "").rstrip("/")
        elif local:
            model, secret, base = local, os.getenv("GREENOPS_APERTUS_API_KEY"), "http://127.0.0.1:8000/v1"
        else:
            model, secret, base = os.getenv("GREENOPS_OPENAI_MODEL"), os.getenv("OPENAI_API_KEY"), "https://api.openai.com/v1"
        loc = urlparse(base)
        loopback = loc.scheme == "http" and loc.hostname in ("127.0.0.1", "localhost", "::1")
        if (not model or not loc.hostname or loc.username or loc.password or loc.query or loc.fragment
                or (not loopback and (loc.scheme != "https" or not secret))):
            return None
        return model, secret, base

    def plan_with_model(self, question, history, transport=None):
        target = self.endpoint()
        if not target:
            return None, None
        model, secret, base = target
        messages = [{"role": "system", "content": self.catalogue()}]
        for text in history[-2:]:  # prior *user* turns only, for follow-ups
            messages.append({"role": "user", "content": text[:500]})
        messages.append({"role": "user", "content": question})
        payload = {"model": model, "temperature": 0, "max_tokens": 400, "messages": messages}
        headers = {"Content-Type": "application/json", "User-Agent": "greenops-assistant/2.0"}
        if secret:
            headers["Authorization"] = "Bearer " + secret
        req = Request(base + "/chat/completions", data=json.dumps(payload).encode(), headers=headers)
        try:
            with (transport or build_opener(NoRedirect()).open)(req, timeout=25) as response:
                incoming = json.load(response)
            usage = incoming.get("usage") or {}
            counts = [usage.get(k) for k in ("prompt_tokens", "completion_tokens")]
            if all(type(x) is int and x >= 0 for x in counts) and self.w.store:
                self.w.store.append("server", self.w.run_id, "assistant_usage",
                                    {"model": model, "input_tokens": counts[0], "output_tokens": counts[1]})
            text = incoming["choices"][0]["message"].get("content") or ""
            start, end = text.find("{"), text.rfind("}")
            plan = json.loads(text[start:end + 1]) if 0 <= start < end else None
            if not isinstance(plan, dict):
                return None, model
            return plan, model
        except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError):
            return None, model

    # ---------------------------------------------------------------- local fallback planner
    def plan_locally(self, question):
        q = question.lower()
        calls = []
        if re.search(r"\b(delete|remove|shut ?down|switch off|turn off|restart|stop|terminate|approve|commit|decommission)\b", q):
            target = next((m for m in self.measures if m["resource"].lower() in q or m["name"].lower() in q), None)
            if not target and "production" in q:
                target = next((m for m in self.measures if m["resource"] == "dp-prod"), None)
            calls = [{"tool": "explain_measure", "args": {"measure": self.rev[target["id"]]}}] if target else []
            calls.append({"tool": "navigate", "args": {"page": "studio"}})
            return {"reply": "I can't change, approve or shut down infrastructure. A responsible person has to review and decide "
                             "this on the Studio page; here are the relevant details and link.", "calls": calls}
        words = {"studio": "studio", "optimi": "studio", "forecast": "forecast", "data quality": "data", "data health": "data",
                 "import": "import", "export": "submission", "csv": "submission", "submission": "submission", "download": "submission",
                 "footprint": "footprint", "calendar": "footprint", "map": "footprint", "compare": "compare", "finding": "findings",
                 "waste": "findings", "ceo": "ceo", "cfo": "cfo", "it dashboard": "it", "resources": "it"}
        page = next((p for k, p in words.items() if k in q), None)
        if any(k in q for k in ("best plan", "meets both", "meet the target", "optimal plan", "optimize", "optimise")):
            priority = "co2" if "co2" in q or "carbon" in q else "cost" if "cost" in q and "co2" not in q else "balanced"
            calls += [{"tool": "optimize_plan", "args": {"priority": priority}}, {"tool": "stage_plan", "args": {"priority": priority}}]
        elif any(k in q for k in ("top measures", "best measures", "which measures", "biggest savings")):
            calls.append({"tool": "list_measures", "args": {"sort_by": "co2" if "co2" in q or "carbon" in q else "chf", "limit": 5}})
        if "forecast" in q:
            metric = "energy" if "energy" in q else "co2Location" if "co2" in q or "carbon" in q else "cost"
            calls.append({"tool": "forecast", "args": {"metric": metric, "years": 3}})
        if any(k in q for k in ("data quality", "data health", "conflict", "duplicate")):
            calls.append({"tool": "data_quality", "args": {}})
        filters = {}
        if any(k in q for k in ("only", "filter", "show me", "focus")):
            for d in self.departments:
                if re.search(rf"\b{re.escape(d.lower())}\b", q):
                    filters["department"] = d
            for p in self.providers:
                if p and re.search(rf"\b{re.escape(p.lower())}\b", q):
                    filters["provider"] = p
        if "clear filter" in q or "reset filter" in q:
            filters = {"department": "all", "provider": "all"}
        if filters:
            calls.append({"tool": "set_filters", "args": filters})
        for token in re.findall(r"[a-z0-9][a-z0-9-]{2,}", q):
            if token in self.resources:
                calls.append({"tool": "highlight_resource", "args": {"resource_id": token}})
                break
        for m in self.measures:
            if m["name"].lower() in q:
                calls.append({"tool": "open_measure", "args": {"measure": self.rev[m["id"]]}})
                break
        if page and not any(c["tool"] in ("stage_plan", "navigate") for c in calls):
            calls.append({"tool": "navigate", "args": {"page": page}})
        if not any(c["tool"] in ("optimize_plan", "list_measures", "forecast", "data_quality") for c in calls):
            calls.insert(0, {"tool": "query_ledger", "args": {"query": question}})
        return {"reply": "", "calls": calls}

    # ---------------------------------------------------------------- validation + execution
    def measure_id(self, value):
        if isinstance(value, str):
            value = value.strip()
            if value.upper() in self.alias:
                return self.alias[value.upper()]
            if value in self.api.measures:
                return value
        raise ValueError(f"unknown measure {str(value)[:40]!r}")

    def budget(self, args):
        b = args.get("budget_chf", 16500)
        if isinstance(b, bool) or not isinstance(b, (int, float)) or not 0 <= b <= 16500:
            raise ValueError("budget must be CHF 0–16,500")
        return int(b)

    def run(self, call, q, out, context):
        tool, args = call.get("tool"), call.get("args") or {}
        if tool not in TOOLS or not isinstance(args, dict):
            raise ValueError(f"unsupported tool {str(tool)[:30]!r}")
        if tool == "query_ledger":
            text = args.get("query")
            if not isinstance(text, str) or not 0 < len(text) <= 300:
                raise ValueError("query must be 1–300 characters")
            r = query(self.w, text, context)
            if r.get("result") is None:
                out["hint"] = r.get("answer")  # shown only when nothing else answered
                return
            out["context"] = r.get("context")
            out["text"].append(self.render_query(r, out))
        elif tool == "list_measures":
            key = "co2" if args.get("sort_by") == "co2" else "chf"
            limit = min(10, max(1, int(args.get("limit", 5))))
            ms = sorted((m for m in self.measures if not m["hard_blockers"]),
                        key=lambda m: -(m["kg"][1] if key == "co2" else m["chf"]))[:limit]
            out["text"].append("**Top measures by " + ("CO₂" if key == "co2" else "cost") + " savings**\n" + "\n".join(
                f"- {m['name']} ({m['resource']}): CHF {fmt(m['chf'])}/yr, {fmt(m['kg'][1])} kg CO₂e/yr, {m['days']} PD" for m in ms))
            out["actions"] += [{"type": "openMeasure", "measureId": m["id"], "label": f"Open: {m['name'][:40]}"} for m in ms[:3]]
        elif tool == "explain_measure":
            m = self.api.measures[self.measure_id(args.get("measure"))]
            risk = "; ".join(m["hard_blockers"] or m["blockers"]) or "none recorded"
            out["text"].append(f"**{m['name']}** on `{m['resource']}`\n- Change: {m['change']}\n- Savings: CHF {fmt(m['chf'])}/yr, "
                               f"{fmt(m['kwh'][1])} kWh, {fmt(m['kg'][1])} kg CO₂e (range {fmt(m['kg'][0])}–{fmt(m['kg'][2])})\n"
                               f"- Effort: {m['days']} PD / CHF {fmt(m['implementation_chf'])}\n- Status: {m['status']}; approver: {m['approval']}\n- Risks: {risk}")
            out["evidence"] += self.api_evidence(m)
            out["actions"].append({"type": "openMeasure", "measureId": m["id"], "label": "Open in Studio"})
        elif tool in ("simulate_plan", "optimize_plan"):
            if tool == "simulate_plan":
                ids = [self.measure_id(x) for x in (args.get("measures") or [])][:30]
                r = self.api.simulate(q, {"measureIds": ids, "budgetChf": self.budget(args)})
            else:
                priority = args.get("priority") if args.get("priority") in ("balanced", "cost", "co2") else "balanced"
                o = self.api.optimize(q, {"budgetChf": self.budget(args), "priority": priority})
                ids, r = o["measureIds"], o["result"]
                out["optimized"] = (ids, self.budget(args), priority)
            names = ", ".join(f"{self.api.measures[i]['name']} ({self.api.measures[i]['resource']})" for i in ids if i in self.api.measures) or "none"
            lines = [f"- {c['label']}: {fmt(c['achieved'])}{'%' if c['unit'] == '%' else ' ' + c['unit']} "
                     f"({'≥' if c['direction'] == 'atLeast' else '≤'} {fmt(c['target'])}) {'✅' if c['met'] else '❌'}" for c in r["constraints"]]
            out["text"].append(f"**{'Optimized package' if tool == 'optimize_plan' else 'Simulation'}** ({len(ids)} measures: {names})\n"
                               f"Savings CHF {fmt(r['savingsChf'])}/yr, {fmt(r['savingsCo2Kg'])} kg CO₂e/yr. "
                               f"{'Feasible.' if r['feasible'] else 'Not feasible: ' + '; '.join(r['reasons'])}\n" + "\n".join(lines)
                               + "".join(f"\n- Excluded {e['id']}: {e['reason']}" for e in r["excluded"]))
            out["staged"] = ids
            if ids:  # always offer the plan as an uncommitted Path, even if the model forgot stage_plan
                out["actions"].append({"type": "stagePlan", "measureIds": ids, "budgetChf": self.budget(args),
                                       "priority": out.get("optimized", (0, 0, "balanced"))[2],
                                       "label": f"Save {len(ids)}-measure plan as Path 'Assistant suggestion' (not committed)"})
        elif tool == "forecast":
            metric = args.get("metric") if args.get("metric") in METRICS else "cost"
            years = min(3, max(1, int(args.get("years", 3))))
            ids = out.get("staged") or [m["id"] for m in self.w.plan["selected"]]
            f = self.api.forecast(q, metric, years, ids)
            out["text"].append(f"**Forecast ({metric}, {f['unit']})** — baseline vs with {len(ids)} measures\n" + "\n".join(
                f"- {p.get('periodLabel', p['year'])}: {fmt(p['baseline']['mid'])} → {fmt(p['optimized']['mid'])} "
                f"(range {fmt(p['baseline']['low'])}–{fmt(p['baseline']['high'])})" for p in f["points"]))
            out["actions"].append({"type": "navigate", "to": "/forecast", "label": "Open Forecasts"})
        elif tool == "data_quality":
            dq = self.api.data_quality(q)
            warn = [d for d in dq["datasets"] if d["status"] != "ok"]
            out["text"].append(f"**Data quality** — {len(dq['datasets'])} sources, {len(warn)} with warnings"
                               + "".join(f"\n- {d['file']}: {d['missing']} missing, {d['duplicates']} duplicates, {d['conflicts']} conflicts" for d in warn[:6])
                               + "\n**Conflicts:** " + "; ".join(c["title"] for c in dq["conflicts"][:6]))
            out["actions"].append({"type": "navigate", "to": "/data", "label": "Open Data management"})
        elif tool == "findings":
            limit = min(10, max(1, int(args.get("limit", 5))))
            fs = sorted((f for f in self.api.findings(q) if f["category"] != "conflict"), key=lambda f: -f["impactChfYear"])[:limit]
            out["text"].append("**Top waste findings**\n" + "\n".join(
                f"- {f['title']} ({f['resource']}): CHF {fmt(f['impactChfYear'])}/yr, {fmt(f['impactCo2KgYear'])} kg CO₂e" for f in fs))
            out["actions"].append({"type": "navigate", "to": "/findings", "label": "Open Findings"})
        elif tool == "navigate":
            page = args.get("page")
            if page not in PAGES:
                raise ValueError("unknown page")
            to, hash_, desc = PAGES[page]
            out["actions"].append({"type": "navigate", "to": to, **({"hash": hash_} if hash_ else {}), "label": f"Open {desc.split(':')[0]}"})
        elif tool == "open_measure":
            mid_ = self.measure_id(args.get("measure"))
            out["actions"].append({"type": "openMeasure", "measureId": mid_, "label": f"Open: {self.api.measures[mid_]['name'][:40]}"})
        elif tool == "highlight_resource":
            rid = args.get("resource_id")
            if rid not in self.resources:
                raise ValueError("unknown resource")
            out["actions"].append({"type": "highlight", "resourceId": rid, "label": f"Show {rid} on IT dashboard"})
        elif tool == "set_filters":
            f = {}
            for key, allowed in (("department", self.departments), ("provider", self.providers)):
                if key in args:
                    if args[key] != "all" and args[key] not in allowed:
                        raise ValueError(f"unknown {key}")
                    f[key] = args[key]
            for key in ("from", "to"):
                if key in args:
                    if not isinstance(args[key], str) or not MONTH.match(args[key]):
                        raise ValueError(f"{key} must be YYYY-MM")
                    f[key] = args[key]
            if not f:
                raise ValueError("no filter given")
            out["actions"].append({"type": "setFilters", **f,
                                   "label": "Apply filter: " + ", ".join(f"{k} {v}" for k, v in f.items())})
        elif tool == "set_role":
            if args.get("role") not in ROLES:
                raise ValueError("unknown role")
            out["actions"].append({"type": "setRole", "role": args["role"], "label": f"Switch to {args['role'].upper()} view"})
        elif tool == "stage_plan":
            if args.get("measures"):
                ids, budget, priority = [self.measure_id(x) for x in args["measures"]][:30], self.budget(args), "balanced"
            elif out.get("optimized"):
                ids, budget, priority = out["optimized"]
            else:
                priority = args.get("priority") if args.get("priority") in ("balanced", "cost", "co2") else "balanced"
                o = self.api.optimize(q, {"budgetChf": self.budget(args), "priority": priority})
                ids, budget = o["measureIds"], self.budget(args)
            out["actions"].append({"type": "stagePlan", "measureIds": ids, "budgetChf": budget, "priority": priority,
                                   "label": f"Save {len(ids)}-measure plan as Path 'Assistant suggestion' (not committed)"})

    def api_evidence(self, m):
        from frontend_api import files_of
        return files_of(m.get("evidence", []), 4)

    def render_query(self, r, out):
        content, result = r.get("answer", ""), r.get("result")
        if isinstance(result, list):
            rows = []
            for row in result[:10]:
                if isinstance(row, dict) and "group" in row:
                    v = row.get("value")
                    rows.append(f"- **{row['group']}**: " + (f"{fmt(v[1])} (range {fmt(v[0])}–{fmt(v[2])})" if isinstance(v, list)
                                                             else fmt(v) if isinstance(v, (int, float)) else str(v)))
                    out["evidence"] += [{"source": s, "detail": ", ".join(row.get("reference_sample", [])[:3])} for s in row.get("source_files", [])[:1]]
            if rows:
                content += "\n" + "\n".join(rows)
        elif isinstance(result, dict) and result.get("value") is not None:
            content += f"\n**{result['value']}** {result.get('unit', '')}"
        return content

    # ---------------------------------------------------------------- entry point
    def answer(self, q, history):
        users = [m.get("content", "") for m in history if m.get("role") == "user" and isinstance(m.get("content"), str)]
        question = users[-1].strip() if users else ""
        if not 0 < len(question) <= 500:
            raise ValueError("Enter a question of 1–500 characters.")
        context = next((m.get("context") for m in reversed(history) if m.get("role") == "assistant" and m.get("context")), None)
        plan, model = self.plan_with_model(question, users[:-1])
        source = f"Apertus planner ({model})" if plan else "local planner" + (" (model reply unusable or unavailable)" if model else "")
        if not plan:
            plan = self.plan_locally(question)
        calls = plan.get("calls") if isinstance(plan.get("calls"), list) else []
        out = {"text": [], "actions": [], "evidence": [], "context": None}
        rejected = []
        for call in calls[:4]:
            try:
                self.run(call if isinstance(call, dict) else {}, q, out, context)
            except (ValueError, TypeError, KeyError) as error:
                rejected.append(f"{(call or {}).get('tool', '?') if isinstance(call, dict) else '?'}: {error}")
        if plan is not None and not out["text"] and not out["actions"] and source.startswith("Apertus"):
            # Model chose nothing usable: fall back to the deterministic planner.
            fallback = self.plan_locally(question)
            for call in fallback["calls"]:
                try:
                    self.run(call, q, out, context)
                except (ValueError, TypeError, KeyError) as error:
                    rejected.append(f"{call['tool']}: {error}")
        reply = plan.get("reply") if isinstance(plan.get("reply"), str) else ""
        reply = URL.sub("", reply)[:400].strip()
        allowed_numbers = set(NUMBER.findall(question)) | {k[1:] for k in self.alias}
        if any(n not in allowed_numbers for n in NUMBER.findall(reply)) or INJECTION.search(reply):
            reply = ""  # model prose with unverified figures or instruction-like text is withheld
        parts = [reply] if reply else []
        parts += out["text"]
        if not parts and out.get("hint") and not actions_present(out):
            parts = [out["hint"]]
        if not parts and out["actions"]:
            parts = ["Here are the matching links and actions."]
        if not parts:
            parts = ["I can answer cost, energy and CO₂ questions, rank or explain measures, simulate or optimize a plan, "
                     "forecast, summarise data quality, apply filters and open any page. Changes to infrastructure, approvals "
                     "and plan commits stay with you on the relevant page."]
        seen, actions = set(), []
        for a in out["actions"]:
            key = json.dumps(a, sort_keys=True)
            if key not in seen:
                seen.add(key)
                actions.append(a)
        note = f"{source}; figures computed locally by GreenOps from run {self.w.run_id[:12]}. The model saw no dataset rows."
        if rejected:
            note += " Rejected calls: " + "; ".join(rejected[:3])
        return {"role": "assistant", "content": "\n\n".join(parts), "evidence": out["evidence"][:8], "actions": actions[:6],
                "context": out["context"], "calculation": note}


def actions_present(out):
    return bool(out["actions"])


def agent_for(work, api):
    agent = getattr(work, "_assistant_agent", None)
    if agent is None:
        agent = work._assistant_agent = Agent(work, api)
    return agent
