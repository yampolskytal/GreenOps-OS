"""GreenOps platform assistant: Apertus (or any OpenAI-compatible model) as a *planner*.

Safety model (see ASSISTANT_SAFETY.md):
- The model only receives the user's own text, a fixed tool/page catalogue, short measure
  aliases and sanitized filter labels. It never receives ledger rows, free-text dataset fields
  (ticket descriptions, invoice remarks, tags, notes) or tool results, so prompt injection planted
  in the data cannot reach it and no dataset content leaves the machine.
- Every tool call is validated against allow-lists (pages, measure IDs, departments, providers,
  months, limits) and executed locally. Figures in answers are rendered by GreenOps, not the model.
- Model output selects capabilities. Answer text and figures are rendered locally.
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
    "footprint": ("/explore", "footprint", "Footprint calendar: daily cost, energy and emissions"),
    "market-footprint": ("/explore", "footprint-market", "Market-based CO₂ footprint: daily values and coverage"),
    "compare": ("/explore", "compare", "Explore: compare departments, providers, services"),
    "history": ("/ceo", "monthly", "Monthly historical footprint"),
    "findings": ("/findings", "", "Waste findings and data conflicts"),
    "studio": ("/studio", "", "Optimization Studio: pick measures, simulate, optimize, build Paths"),
    "paths": ("/studio", "paths", "Saved Paths: compare up to three alternative plans"),
    "current-plan": ("/current-plan", "", "Current Plan: the committed package and its impact"),
    "forecast": ("/forecast", "forecast", "Forecasts: baseline vs selected plan"),
    "recommendations": ("/studio", "recommendations", "Savings recommendations and protection decisions"),
    "budget": ("/studio", "recommended", "Recommended package and target gaps"),
    "data": ("/data", "", "Data management: dataset health, coverage, conflicts"),
    "submission": ("/submission", "", "Official CSV exports (baseline and measures package)"),
    "import": ("/import", "", "Import new data files"),
}
ROLES = ("ceo", "cfo", "it")
METRICS = {"cost": "Cost", "energy": "Energy", "co2Location": "Location-based CO₂e", "co2Market": "Market-based CO₂e"}
UNITS = {"chf": "CHF", "kwh": "kWh", "kg": "kg CO₂e", "kg_market": "kg CO₂e"}
MEASURE_METRICS = {"chf": "CHF/year", "co2": "kg CO₂e/year", "energy": "kWh/year"}
TOOLS = {
    "query_ledger": "Look up historical cost, energy, location carbon or market carbon. args: {query: English phrase preserving dates, names, grouping and top N}. Examples: 'cost by department', 'market carbon in August 2026'. Translate follow-ups starting 'and' without dropping the follow-up.",
    "list_measures": "Rank plan candidates. args: {sort_by: 'chf'|'co2'|'energy', limit: 1-10}",
    "explain_measure": "Details, risks and evidence of one measure. args: {measure: alias}",
    "protection": "Look up ticket-backed safeguards. args: {topic: 'recovery'|'production'|'backups'|'test'|'audit'|'all'}",
    "challenge": "Answer a case question. args: {topic: 'unused-seats'|'gpu'|'production'}",
    "diagnostic": "Read a bonus report. args: {topic: 'ci'|'carbon_jobs'|'ai'|'clusters'}",
    "simulate_plan": "Check a set of measures against the 25% cost / 40% CO2 / CHF 16,500 / 15 PD constraints. args: {measures: [alias], budget_chf?}",
    "optimize_plan": "Find the best package. args: {priority: 'balanced'|'cost'|'co2', budget_chf?}",
    "forecast": "Baseline vs user's Current Plan forecast. args: {metric: 'cost'|'energy'|'co2Location'|'co2Market', years: 1-3}",
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
LABEL = re.compile(r"^[\w .,&()/+'-]{1,60}$")
MONTH = re.compile(r"^20\d\d-(0[1-9]|1[0-2])$")
FOLLOWUP = re.compile(r"^(?:and\b|what about\b|how about\b|only\b|same\b|und\b|nur\b)", re.I)
DIRECT_NAVIGATION = re.compile(r"^(?:please\s+)?(?:open|go to|take me to|where (?:is|are|can i find)|öffne|wo (?:ist|finde ich))\b", re.I)


def safe_label(text):
    """Dataset-derived labels may only reach the model if short, plain and instruction-free."""
    return isinstance(text, str) and bool(LABEL.match(text)) and not INJECTION.search(text)


def fmt(v):
    if v is None:
        return "Unavailable"
    return f"{v:,.2f}".rstrip("0").rstrip(".")


def table(out, title, columns, rows):
    rows = list(rows)[:10]
    if rows:
        out["tables"].append({"title": title, "columns": columns, "rows": [[str(v) for v in row] for row in rows]})


def linked(out, page, *, label=None, hash_=None):
    to, anchor, desc = PAGES[page]
    anchor = hash_ or anchor
    out["actions"].append({"type": "navigate", "to": to, **({"hash": anchor} if anchor else {}),
                           "label": label or f"Open {desc.split(':')[0]}"})


def midpoint(value):
    return value[1] if isinstance(value, list) else value


def linked_lookup(out, ctx):
    grouping, metric = ctx.get("grouping"), ctx.get("metric")
    category = {"department": "byDepartment", "provider": "byProvider", "tool": "byTool",
                "category": "byService"}.get(grouping)
    if category:
        chart_metric = {"chf": "costChf", "kwh": "energyKwh", "kg": "co2Kg", "kg_market": "co2KgMarket"}[metric]
        linked(out, "compare", label="Open comparison chart", hash_=f"compare-{category}-{chart_metric}")
    elif grouping == "month":
        linked(out, "history", label="Open history graph")
    else:
        linked(out, "market-footprint" if metric == "kg_market" else "footprint")


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
        measures = "\n".join(f"{self.rev[m['id']]}: {m['name']}" for m in self.measures
                             if safe_label(m["name"]))
        pages = "\n".join(f"{k}: {v[2]}" for k, v in PAGES.items())
        tools = "\n".join(f"{k}: {v}" for k, v in TOOLS.items())
        return (
            "Route questions for GreenOps, a dashboard for digital cost, energy, and carbon. "
            "Return only a JSON object: {\"calls\": [{\"tool\": \"<name>\", \"args\": {}}]}. "
            "Choose one primary tool and optionally a second for a requested link or filter. "
            "If the user is asking where to find something, use navigate alone. "
            "For a numeric question use the correct data tool. Preserve dates, grouping, metric, language cues, "
            "and top N. Translate the lookup phrase into English. For a follow-up include 'and' or 'only' "
            "at the start of the lookup phrase so the app can keep the previous grouping or scope. "
            "For protections use protection, never offer to change anything. Return an empty calls list if unsupported. "
            "Do not answer the question in prose. GreenOps uses its own source data to answer.\n"
            'Example: Wie viel geben wir pro Tool aus? -> {"calls":[{"tool":"query_ledger","args":{"query":"cost by tool"}}]}\n'
            'Example: Und CO2? -> {"calls":[{"tool":"query_ledger","args":{"query":"and carbon?"}}]}\n'
            'Example: Take me to the emissions calendar -> {"calls":[{"tool":"navigate","args":{"page":"footprint"}}]}\n'
            f"TOOLS\n{tools}\nPAGES\n{pages}\nMEASURES\n{measures}\n"
            f"DEPARTMENTS: {', '.join(d for d in self.departments if safe_label(d))}\n"
            f"PROVIDERS: {', '.join(p for p in self.providers if safe_label(p))}"
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
        payload = {"model": model, "temperature": 0, "max_tokens": 320, "messages": messages}
        headers = {"Content-Type": "application/json", "User-Agent": "greenops-assistant/2.0"}
        if secret:
            headers["Authorization"] = "Bearer " + secret
        req = Request(base + "/chat/completions", data=json.dumps(payload).encode(), headers=headers)
        try:
            with (transport or build_opener(NoRedirect()).open)(req, timeout=14) as response:
                incoming = json.loads(response.read(65536))
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
        q = question.casefold().strip().replace("co₂", "co2")
        for foreign, english in (("ausgaben", "cost"), ("kosten", "cost"), ("geben wir", "spend"),
                                 ("abteilungen", "departments"), ("abteilung", "department"),
                                 (" pro ", " by "), ("monate", "months"),
                                 ("emissionen", "emissions"), ("prognose", "forecast")):
            q = re.sub(r"\b" + re.escape(foreign) + r"\b", english, q) if foreign.strip() == foreign else q.replace(foreign, english)
        def call(tool, **args):
            return {"tool": tool, "args": args}

        pages = (
            ("market-footprint", ("market-based calendar", "market-based emissions calendar", "market carbon calendar", "market-based footprint")),
            ("paths", ("paths", "alternative plan")),
            ("current-plan", ("current plan",)),
            ("history", ("monthly", "historical", "history")),
            ("budget", ("budget", "target gap")),
            ("recommendations", ("measures", "recommendations")),
            ("compare", ("breakdown", "compare", "by department", "by provider", "by tool")),
            ("forecast", ("forecast", "projection")),
            ("data", ("data quality", "data health", "conflicts", "reconciliation", "source", "duplicates", "missing values")),
            ("submission", ("export", "submission", "csv", "download")),
            ("findings", ("finding", "waste")),
            ("footprint", ("footprint", "calendar", "daily")),
            ("studio", ("studio", "optimization")),
            ("ceo", ("ceo",)),
            ("cfo", ("cfo",)),
            ("it", ("it dashboard", "servers", "resources", "runtime")),
            ("import", ("import", "upload")),
            ("home", ("home", "roles")),
        )
        page = next((p for p, words in pages if any(word in q for word in words)), None)
        metric = ("co2Market" if "market" in q else "co2Location" if any(w in q for w in ("co2", "carbon", "emissions"))
                  else "energy" if "energy" in q or "kwh" in q else "cost")
        protection = next((topic for topic, words in (
            ("recovery", ("disaster recovery", "failover", "t-1094")),
            ("backups", ("backup", "t-1039")),
            ("production", ("production", "closing", "t-1029")),
            ("test", ("freeze", "t-1204")),
            ("audit", ("audit report", "t-1167")),
        ) if any(word in q for word in words)), None)
        action_request = re.match(r"^(?:please\s+)?(?:can you\s+)?(?:delete|remove|shut ?down|switch off|turn off|restart|stop|terminate|approve|commit|decommission)\b", q)
        if action_request:
            calls = [call("protection", topic=protection)] if protection else [call("navigate", page="studio")]
            return {"reply": "I can't change infrastructure or approve a plan from chat.", "calls": calls}
        if protection and (any(w in q for w in ("protected", "keep", "why", "switch off", "shut down", "night", "weekend", "retention")) or "t-" in q):
            return {"calls": [call("protection", topic=protection)]}
        if DIRECT_NAVIGATION.match(q) and page:
            return {"calls": [call("navigate", page=page, metric=metric)]}
        if re.fullmatch(r"(hi|hello|hey|hallo|hoi|bonjour)[!. ]*", q):
            return {"reply": "Hi! Ask me for a figure, a recommendation, or help finding a page.", "calls": []}
        if q in ("help", "what can you do", "what can you do?"):
            return {"reply": "I can look up costs and emissions, explain protected workloads, compare measures, and take you to the matching dashboard view.", "calls": []}
        if ("seat" in q and any(w in q for w in ("unused", "inactive", "not used", "not using"))) or "unused ai subscription" in q:
            return {"calls": [call("challenge", topic="unused-seats", detail="products" if "by product" in q else "total")]}
        if "gpu" in q and any(w in q for w in ("on demand", "on-demand", "schedule", "utilization", "measure", "save")):
            return {"calls": [call("challenge", topic="gpu")]}
        if "current plan" in q and any(w in q for w in ("meet", "target", "savings", "how much")) and "forecast" not in q:
            return {"calls": [call("simulate_plan")]}
        if any(w in q for w in ("best plan", "meets both", "meet the target", "optimal plan", "optimize", "optimise", "best package")):
            priority = "co2" if "prioritize carbon" in q else "cost" if "net savings" in q or "cost first" in q else "balanced"
            budget = re.search(r"(?:chf\s+|budget of\s+)([\d, '\u2019]+)", q)
            parsed = int(re.sub(r"[^0-9]", "", budget[1])) if budget else 16500
            return {"calls": [call("optimize_plan", priority=priority, budget_chf=parsed)]}
        if "forecast" in q or "next year" in q or "projected" in q:
            years = re.search(r"\b([1-3])\s*years?\b", q)
            return {"calls": [call("forecast", metric=metric, years=int(years[1]) if years else 1 if "next year" in q else 3)]}
        if any(w in q for w in ("top measures", "best measures", "which measures", "biggest savings")) or re.search(r"\btop\s+\d+\s+measures", q):
            limit = re.search(r"\btop\s+(\d{1,2})", q)
            return {"calls": [call("list_measures", sort_by={"cost": "chf", "energy": "energy"}.get(metric, "co2"),
                                    limit=int(limit[1]) if limit else 3)]}
        for topic, words in (("ci", ("ci waste", "pipeline waste", "failed builds")),
                             ("carbon_jobs", ("carbon-aware", "shift jobs", "carbon scheduling")),
                             ("ai", ("ai models", "token usage")),
                             ("clusters", ("usage clusters", "similar servers"))):
            if any(w in q for w in words):
                return {"calls": [call("diagnostic", topic=topic)]}
        if page == "data" and any(w in q for w in ("data quality", "data health", "duplicates", "conflict", "missing values", "reconcil")):
            return {"calls": [call("data_quality")]}
        if page in ("submission", "import"):
            return {"calls": [call("navigate", page=page)]}
        if "waste findings" in q or "top waste" in q:
            return {"calls": [call("findings", limit=3)]}
        if re.search(r"\b(?:paid|spending|spent|spend|price|bill)\b", q) and not re.search(r"\b(?:cost|chf)\b", q):
            q += " cost"
        calls = [call("query_ledger", query=q)]
        if page and any(w in q for w in ("open", "link", "graph", "chart", "show the page")):
            calls.append(call("navigate", page=page, metric=metric))
        if "filter" in q or ("only" in q and page):
            filters = {key: value for key, labels in (("department", self.departments), ("provider", self.providers))
                       for value in labels if re.search(r"(?<![\w-])" + re.escape(value.casefold()) + r"(?![\w-])", q)}
            if "clear filter" in q or "reset filter" in q:
                filters = {"department": "all", "provider": "all"}
            if filters:
                calls.append(call("set_filters", **filters))
        return {"calls": calls}

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

    def run(self, call, q, out, context, plan_ids):
        tool, args = call.get("tool"), call.get("args") or {}
        if tool not in TOOLS or not isinstance(args, dict):
            raise ValueError(f"unsupported tool {str(tool)[:30]!r}")
        if tool == "query_ledger":
            text = args.get("query")
            if not isinstance(text, str) or not 0 < len(text) <= 300:
                raise ValueError("query must be 1–300 characters")
            if FOLLOWUP.match(out["question"]) and context and not FOLLOWUP.match(text):
                text = "and " + text
            r = query(self.w, text.replace("CO₂", "CO2").replace("co₂", "co2"), context, scope=q)
            if r.get("result") is None:
                out["hint"] = r.get("answer")  # shown only when nothing else answered
                return
            out["context"] = r.get("context")
            self.render_query(r, out, q)
        elif tool == "list_measures":
            key = args.get("sort_by", "chf")
            if key not in MEASURE_METRICS:
                raise ValueError("unknown savings metric")
            limit = min(10, max(1, int(args.get("limit", 3))))
            field = {"chf": "chf", "co2": "kg", "energy": "kwh"}[key]
            ms = sorted((m for m in self.measures if self.api.decisions[m["id"]]["status"] == "candidate"
                         and midpoint(m[field]) > 0), key=lambda m: -midpoint(m[field]))[:limit]
            if ms:
                top = ms[0]
                out["text"].append(f"{top['name']} leads at {fmt(midpoint(top[field]))} {MEASURE_METRICS[key]} modeled savings.")
                if len(ms) > 1:
                    table(out, "Highest modeled savings", ["Measure", MEASURE_METRICS[key]],
                          ((m["name"], fmt(midpoint(m[field]))) for m in ms))
                out["evidence"] += self.api_evidence(top)
            else:
                out["text"].append("No eligible measure has a supported saving for that metric.")
            linked(out, "recommendations")
        elif tool == "explain_measure":
            m = self.api.measures[self.measure_id(args.get("measure"))]
            risk = "; ".join(m["hard_blockers"] or m["blockers"]) or "none recorded"
            decision = self.api.decisions[m["id"]]
            out["text"].append(f"{m['name']} · {m['status']}. {m['change']}" if decision["status"] == "candidate"
                               else f"{m['name']}. {decision['reason']} {decision.get('nextStep') or ''}".strip())
            out["details"].append(f"{m['approval']} reviews this measure. {risk}" +
                                  (f" It models CHF {fmt(m['chf'])} and {fmt(m['kg'][1])} kg CO₂e in annual savings."
                                   if decision["status"] == "candidate" else ""))
            out["evidence"] += self.api_evidence(m)
            out["actions"].append({"type": "openMeasure", "measureId": m["id"], "label": "Open in Studio"})
        elif tool == "protection":
            self.protection(args.get("topic"), out)
        elif tool == "challenge":
            self.challenge(args.get("topic"), args.get("detail"), out)
        elif tool == "diagnostic":
            self.diagnostic(args.get("topic"), q, out)
        elif tool in ("simulate_plan", "optimize_plan"):
            if tool == "simulate_plan":
                ids = [self.measure_id(x) for x in args["measures"][:30]] if "measures" in args else plan_ids
                r = self.api.simulate(q, {"measureIds": ids, "budgetChf": self.budget(args)})
            else:
                priority = args.get("priority") if args.get("priority") in ("balanced", "cost", "co2") else "balanced"
                o = self.api.optimize(q, {"budgetChf": self.budget(args), "priority": priority})
                ids, r = o["measureIds"], o["result"]
                out["optimized"] = (ids, self.budget(args), priority)
            ids = r.get("includedMeasureIds", ids)
            out["text"].append(f"The {len(ids)}-measure scenario models {r['costReductionPct']:.1f}% cost savings "
                               f"and {r['co2ReductionPct']:.1f}% location-based CO₂e savings. " +
                               ("It meets both targets within the limits. Owner review still applies." if r["feasible"]
                                else "It falls short of at least one target or limit."))
            out["details"].extend([f"Annual savings CHF {fmt(r['savingsChf'])}. First-year net CHF "
                                   f"{fmt(r.get('firstYearNetChf'))}. Implementation takes {r['effortDays']:g} person-days "
                                   f"and CHF {fmt(r['effortChf'])}.", *r["reasons"]])
            out["details"].extend(e["reason"] for e in r["excluded"])
            out["staged"] = ids
            if ids:  # always offer the plan as an uncommitted Path, even if the model forgot stage_plan
                out["actions"].append({"type": "stagePlan", "measureIds": ids, "budgetChf": self.budget(args),
                                       "priority": out.get("optimized", (0, 0, "balanced"))[2],
                                       "label": f"Save {len(ids)} measures as a draft Path (not committed)"})
        elif tool == "forecast":
            metric = args.get("metric") if args.get("metric") in METRICS else "cost"
            years = min(3, max(1, int(args.get("years", 3))))
            ids = out.get("staged", plan_ids)
            f = self.api.forecast(q, metric, years, ids)
            periods = f.get("annualTotals") or (f["points"] if f.get("granularity") == "annual" else [])
            periods = [p for p in periods if p["year"] > 2026]
            if periods:
                out["text"].append(f"{METRICS[metric]} forecast · {f['unit']} per year." +
                                   (f" The plan includes {len(ids)} selected measures." if ids else " Current Plan is empty."))
                table(out, f"{METRICS[metric]} forecast", ["Period", f"Without changes ({f['unit']})"] +
                      ([f"With plan ({f['unit']})"] if ids else []),
                      ([p.get("periodLabel") or p["year"], fmt(p["baseline"]["mid"])] +
                       ([fmt((p.get("optimized") or {}).get("mid"))] if ids else []) for p in periods))
                if f.get("marketScopeLabel"):
                    out["text"].append(f["marketScopeLabel"])
                out["details"].append(f["growthAssumption"])
            else:
                out["text"].append(f"No supported {METRICS[metric].lower()} projection is available.")
            linked(out, "forecast", label="Open forecast graph", hash_=f"forecast-{metric}")
        elif tool == "data_quality":
            dq = self.api.data_quality(q)
            warn = [d for d in dq["datasets"] if d["status"] != "ok"]
            out["text"].append(f"{len(warn)} of {len(dq['datasets'])} data sources need review.")
            table(out, "Flagged issues", ["Issue"], ((c["title"],) for c in dq["conflicts"][:5]))
            linked(out, "data")
        elif tool == "findings":
            limit = min(10, max(1, int(args.get("limit", 5))))
            fs = sorted((f for f in self.api.findings(q) if f.get("decision", {}).get("status") == "candidate"
                         and (f.get("impactChfYear") or 0) > 0), key=lambda f: -f["impactChfYear"])[:limit]
            out["text"].append("Here are the largest modeled cost-saving opportunities." if fs else "No quantified cost-saving finding is available.")
            table(out, "Waste findings", ["Measure", "CHF/year"], ((f["title"], fmt(f["impactChfYear"])) for f in fs))
            linked(out, "findings")
        elif tool == "navigate":
            page = args.get("page")
            if page not in PAGES:
                raise ValueError("unknown page")
            metric = args.get("metric")
            linked(out, page, hash_=f"forecast-{metric}" if page == "forecast" and metric in METRICS else None)
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
            chosen, _ = self.api.resolve_selection(ids)
            ids = [m["id"] for m in chosen]
            if ids:
                out["actions"].append({"type": "stagePlan", "measureIds": ids, "budgetChf": budget, "priority": priority,
                                       "label": f"Save {len(ids)} measures as a draft Path (not committed)"})

    def api_evidence(self, m):
        from frontend_api import files_of
        return files_of(m.get("evidence", []), 4)

    def protection(self, topic, out):
        topics = {"recovery": "disaster-recovery", "production": "production-availability", "backups": "retain-backups",
                  "test": "test-acceptance-freeze", "audit": "receivables-audit"}
        if topic not in (*topics, "all"):
            raise ValueError("unknown protection topic")
        protections = [r for r in self.w.a.policy.get("protection_register", [])
                       if topic == "all" or r["id"] == topics[topic]]
        if not protections:
            if topic == "production" and self.w.answers["production"]["results"]:
                out["text"].append("Keep production running pending owner review of fixed jobs and protection windows.")
                for row in self.w.answers["production"]["results"]:
                    out["evidence"] += [{"source": ticket["ref"], "detail": "Production protection evidence"}
                                        for ticket in row["ticket_evidence"][:3]]
            else:
                out["text"].append("I don't have a verified rule for that resource in this dataset.")
        else:
            rows = []
            for r in protections:
                description = r.get("calendar") or "Review the recorded protection before making a change."
                if r.get("retention_years"):
                    description = f"Keep required backups for {r['retention_years']} years."
                elif r.get("always_on"):
                    description = "Keep available. " + description + "."
                rows.append((r["id"].replace("-", " ").capitalize(), description))
                out["evidence"].append({"source": r["source"], "detail": description})
            if len(rows) == 1:
                out["text"].append(rows[0][1])
            else:
                out["text"].append("These are the protections recorded for this dataset.")
                table(out, "Protection rules", ["Protection", "Requirement"], rows)
        linked(out, "recommendations")

    def challenge(self, topic, detail, out):
        if topic not in self.w.answers:
            raise ValueError("unknown case question")
        if topic == "production":
            self.protection(topic, out)
            return
        answer = self.w.answers[topic]
        data = answer["results"]
        if not data:
            out["text"].append("The dataset has no supporting observations for this question.")
            return
        if topic == "unused-seats":
            unused = sum(row["unused"] for row in data.values())
            missing = sum(row.get("unknown_activity_rows", 0) for row in data.values())
            out["text"].append(f"{unused:,.0f} AI subscription seats were unused in August 2026." +
                               (f" Activity is unverified for {missing} subscriptions." if missing else ""))
            if detail == "products":
                table(out, "Unused seats by product", ["Product", "Unused seats"],
                      ((name, f"{r['unused']:,.0f}") for name, r in sorted(data.items(), key=lambda p: -p[1]["unused"])))
        elif topic == "gpu":
            data = [m for m in data if not m["hard_blockers"]]
            if not data:
                out["text"].append("The GPU change is blocked under the recorded protection rules.")
                linked(out, "recommendations")
                return
            if re.search(r"\b(?:carbon|emissions|co2|co₂)\b", out["question"], re.I):
                savings = sum(m["kg"][1] for m in data)
                out["text"].append(f"GPU on demand models {fmt(savings)} kg CO₂e/year in location-based savings, subject to a pilot.")
            elif re.search(r"\b(?:energy|electricity|kwh)\b", out["question"], re.I):
                savings = sum(m["kwh"][1] for m in data)
                out["text"].append(f"GPU on demand models {fmt(savings)} kWh/year in savings, subject to a pilot.")
            else:
                chf = sum(m["chf"] for m in data)
                kg = sum(m["kg"][1] for m in data)
                out["text"].append(f"GPU on demand models CHF {fmt(chf)} and {fmt(kg)} kg CO₂e in annual savings, subject to a pilot.")
            out["actions"].append({"type": "openMeasure", "measureId": data[0]["id"], "label": "Open GPU recommendation"})
        out["details"].append(answer["method"])
        out["evidence"] += [{"source": ref, "detail": answer["title"]} for ref in answer["sources"][:5]]

    def diagnostic(self, topic, q, out):
        bonus = self.api.bonus(q)
        if topic == "ci":
            title, columns = "Build activity flagged for review", ["Repository", "Flagged CPU time"]
            rows = [(x["label"], x["value"]) for x in bonus["pipelines"][:5]]
        elif topic == "carbon_jobs":
            title, columns = "Carbon-aware job replay", ["Job", "Current", "Suggested"]
            rows = [(x["job"], x["currentStart"], x["suggestedStart"]) for x in bonus["carbonJobs"]]
        elif topic == "ai":
            title, columns = "AI model usage", ["Model", "Spend (CHF)", "Million tokens"]
            rows = [(x["model"], fmt(x["costChf"]), fmt(x["tokensM"])) for x in bonus["aiModels"][:5]]
        elif topic == "clusters":
            title, columns = "Server usage clusters", ["Group", "Servers"]
            rows = [(x["name"], x["members"]) for x in bonus["clusters"][:5]]
        else:
            raise ValueError("unknown diagnostic")
        out["text"].append(title + "." if rows else f"{title} is unavailable in this dataset.")
        table(out, title, columns, rows)
        linked(out, "findings", label="Open operational findings")

    def render_query(self, r, out, q):
        result = r.get("result")
        ctx = r.get("context") or {}
        metric = ctx.get("metric")
        if not metric or not isinstance(result, list):
            if isinstance(result, dict) and result.get("title") == "Unused AI seats in August 2026":
                self.challenge("unused-seats", None, out)
            elif isinstance(result, dict) and result.get("title") == "On-demand GPU operation":
                self.challenge("gpu", None, out)
            elif isinstance(result, dict) and result.get("title") == "Production protection windows":
                self.protection("production", out)
            else:
                out["text"].append(r["answer"] + ".")
                linked(out, "data")
            return
        if not result:
            out["text"].append("No ledger records match that scope.")
            return
        grouping, filters = ctx["grouping"], ctx["filters"]
        if filters.get("month"):
            period = ", ".join(sorted(filters["month"]))
        else:
            period = q["from"] if q["from"] == q["to"] else f"{q['from']} to {q['to']}"
        scoped = [v for field, values in filters.items() if field != "month" for v in values[:3]]
        scope = " · ".join([period, *scoped])
        unit = UNITS[metric]
        name = {"chf": "Cost", "kwh": "Energy", "kg": "Location-based CO₂e", "kg_market": "Market-based CO₂e"}[metric]
        n = re.search(r"\btop\s+(\d{1,2})", out["question"], re.I)
        limit = min(10, max(1, int(n[1]))) if n else 5
        if not n and re.search(r"\b(?:highest|most expensive|largest|biggest)\b", out["question"], re.I):
            limit = 1
        rows = (sorted(result, key=lambda row: row["group"])[-10:] if grouping == "month" and not n and limit != 1
                else result[:limit])
        asked_range = re.search(r"\b(?:range|uncertainty|low and high)\b", out["question"], re.I)
        for row in rows:
            out["evidence"] += [{"source": ref, "detail": scope} for ref in row.get("reference_sample", [])[:2]]
        if len(rows) == 1:
            row = rows[0]
            value = midpoint(row["value"])
            label = row["group"] if grouping else name
            out["text"].append(f"{label} · {fmt(value)} {unit} ({scope})." if value is not None
                               else f"No supported {name.lower()} figure for {label} ({scope}).")
            if asked_range and isinstance(row["value"], list):
                out["text"].append(f"The scenario range is {fmt(row['value'][0])}–{fmt(row['value'][2])} {unit}.")
            if metric == "kg_market" and row.get("coverage_pct") is not None:
                out["text"].append(f"Market factors cover {row['coverage_pct']:.1f}% of modeled energy in this scope.")
        else:
            out["text"].append(f"{name} by {grouping} · {scope}.")
            if metric == "kg_market":
                columns = [grouping.capitalize(), unit, "Energy coverage"]
                display = ([row["group"], fmt(midpoint(row["value"])),
                            f"{row['coverage_pct']:.1f}%" if row.get("coverage_pct") is not None else "Unavailable"]
                           for row in rows)
            else:
                columns = [grouping.capitalize(), unit] + ([f"Range ({unit})"] if asked_range and metric != "chf" else [])
                display = ([row["group"], fmt(midpoint(row["value"]))] +
                           ([f"{fmt(row['value'][0])}–{fmt(row['value'][2])}" if isinstance(row["value"], list)
                             else "Unavailable"] if len(columns) == 3 else []) for row in rows)
            table(out, name, columns, display)
        gather = sum(row["missing_lines"] for row in rows)
        if gather:
            out["details"].append(f"{gather} ledger lines in the displayed result are missing this metric.")
        linked_lookup(out, ctx)

    # ---------------------------------------------------------------- entry point
    def answer(self, q, history, plan_ids=()):
        users = [m.get("content", "") for m in history if m.get("role") == "user" and isinstance(m.get("content"), str)]
        question = users[-1].strip() if users else ""
        if not 0 < len(question) <= 500:
            raise ValueError("Enter a question of 1–500 characters.")
        prior = next((m["context"] for m in reversed(history) if m.get("role") == "assistant"
                      and isinstance(m.get("context"), dict) and m["context"].get("metric") in tuple(UNITS)), None)
        chosen, _ = self.api.resolve_selection(plan_ids[:30])
        plan_ids = [m["id"] for m in chosen]
        local = self.plan_locally(question)
        # Local navigation, greetings and protection checks do not need a remote model round trip.
        immediate = bool(local.get("reply")) or (local["calls"] and
                    local["calls"][0]["tool"] in ("protection", "navigate", "challenge"))
        source = "GreenOps"
        out = {"text": [], "tables": [], "details": [], "actions": [], "evidence": [], "context": None, "question": question}
        if prior and (prior.get("grouping") is None or isinstance(prior["grouping"], str)) and re.fullmatch(
                r"(?:please )?(?:show|open)(?: me)? (?:that|this|it|the)(?: (?:on|in|as) (?:a |the )?)?"
                r" ?(?:chart|graph|table)?[.!?]?", question, re.I):
            linked_lookup(out, prior)
            return {"role": "assistant", "content": "Open the chart for your previous answer.",
                    "actions": out["actions"], "context": prior, "assistant": "GreenOps"}
        model_plan, _ = (None, None) if immediate else self.plan_with_model(question, users[:-1])
        rejected = 0
        for plan in (model_plan, local):
            if not plan:
                continue
            calls = plan.get("calls")
            if not isinstance(calls, list):
                continue
            for call in calls[:3]:
                try:
                    self.run(call if isinstance(call, dict) else {}, q, out, prior, plan_ids)
                except (ValueError, TypeError, KeyError, OverflowError):
                    rejected += 1
            if out["text"] or out["tables"] or out["actions"]:
                source = "Apertus + GreenOps" if plan is model_plan else "GreenOps"
                break
        if local.get("reply"):
            out["text"].insert(0, local["reply"])
        if not out["text"]:
            out["text"].append("Use the button below to open the relevant view." if out["actions"] else
                               "Try a specific question, such as “Cost by department” or “Why is disaster recovery protected?”")
        context = out["context"] or (prior if FOLLOWUP.match(question) else None)
        actions = list({json.dumps(a, sort_keys=True): a for a in out["actions"]}.values())
        evidence = list({(e["source"], e["detail"]): e for e in out["evidence"]}.values())
        note = "Source calculations were run by GreenOps."
        if rejected:
            note += f" Rejected calls: {rejected}."
        return {"role": "assistant", "content": "\n\n".join(out["text"])[:2500],
                "evidence": evidence[:6], "actions": actions[:3], "tables": out["tables"][:2],
                "context": context, "calculation": note, "details": " ".join(out["details"])[:1600],
                "assistant": source}


def agent_for(work, api):
    agent = getattr(work, "_assistant_agent", None)
    if agent is None:
        agent = work._assistant_agent = Agent(work, api)
    return agent
