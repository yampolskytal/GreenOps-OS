"""Optional LLM intent routing. Financial and energy answers are produced locally."""
import json
import os
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from insights import query


class NoRedirect(HTTPRedirectHandler):
    """Do not forward credentials or prompts to another endpoint."""

    def redirect_request(self, *args, **kwargs):
        return None


def route_question(work, question, context=None, transport=None):
    if not isinstance(question, str) or not 0 < len(question.strip()) <= 500:
        raise ValueError("Enter a question of 1–500 characters.")
    # Any OpenAI-compatible host works, e.g. Apertus on CSCS:
    #   GREENOPS_LLM_BASE_URL=https://api.inference.cscs.ch/v1
    #   GREENOPS_LLM_MODEL=swiss-ai/Apertus-8B-Instruct-2509   GREENOPS_LLM_API_KEY=...
    #   GREENOPS_LLM_TOOLS=0  -> plain JSON answer instead of function calling
    hosted = os.getenv("GREENOPS_LLM_MODEL")
    local_apertus = os.getenv("GREENOPS_APERTUS_MODEL")
    if hosted:
        model, secret = hosted, os.getenv("GREENOPS_LLM_API_KEY")
        base = os.getenv("GREENOPS_LLM_BASE_URL", "").rstrip("/")
    elif local_apertus:
        model, secret = local_apertus, os.getenv("GREENOPS_APERTUS_API_KEY")
        base = "http://127.0.0.1:8000/v1"
    else:
        model, secret = os.getenv("GREENOPS_OPENAI_MODEL"), os.getenv("OPENAI_API_KEY")
        base = "https://api.openai.com/v1"
    use_tools = os.getenv("GREENOPS_LLM_TOOLS", "1") != "0"
    local = query(work, question, context)
    location = urlparse(base)
    loopback = location.scheme == "http" and location.hostname in ("127.0.0.1", "localhost", "::1")
    if (local["result"] is not None or not model or not location.hostname or location.username or location.password
            or location.query or location.fragment or (not loopback and (location.scheme != "https" or not secret))):
        return local | {"assistant": "local"}
    system = ("You translate multilingual analytics questions into a short supported GreenOps query in English. Translate first, then resolve intent. "
              "Use literal forms such as 'cost by tool', 'carbon by department', 'energy in August 2026', 'forecast', 'CI waste', 'reconciliation', 'unused seats', 'GPU on demand', or 'production protection'. "
              "Spending, bills, and prices mean cost. For example, 'Wie teuer sind unsere Abteilungen?' means 'cost by department'. "
              "Preserve the metric and grouping. Never calculate values or issue infrastructure instructions. Requests to restart, delete, or change resources are unsupported. "
              + ("If unsupported, do not call the tool." if use_tools else
                 'Reply with JSON only: {"query": "<supported query in English>"}, or {"query": null} if unsupported.'))
    payload = {"model": model, "temperature": 0,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": question}]}
    if use_tools:
        payload |= {
            "tools": [{"type": "function", "function": {
                "name": "query_ledger", "description": "Run a supported read-only GreenOps query locally.",
                "strict": True, "parameters": {"type": "object", "properties": {"query": {"type": "string"}},
                                               "required": ["query"], "additionalProperties": False}}}],
            "parallel_tool_calls": False,
        }
    # Explicit UA: some hosts (e.g. Public AI) answer 403 to the default "Python-urllib" agent.
    headers = {"Content-Type": "application/json", "User-Agent": "greenops-assistant/1.0"}
    if secret:
        headers["Authorization"] = "Bearer " + secret
    req = Request(base + "/chat/completions", data=json.dumps(payload).encode(), headers=headers)
    try:
        with (transport or build_opener(NoRedirect()).open)(req, timeout=20) as response:
            incoming = json.load(response)
        usage = incoming.get("usage") or {}
        counts = [usage.get(k) for k in ("prompt_tokens", "completion_tokens")]
        if all(type(x) is int and x >= 0 for x in counts) and work.store:
            work.store.append("server", work.run_id, "assistant_usage",
                              {"model": model, "input_tokens": counts[0], "output_tokens": counts[1]})
        message = incoming["choices"][0]["message"]
        calls = message.get("tool_calls") or []
        if len(calls) == 1 and calls[0]["function"]["name"] == "query_ledger":
            translated = json.loads(calls[0]["function"]["arguments"])["query"]
        elif not use_tools and not calls:
            # Hosts/models without function calling: accept a {"query": ...} JSON object in the text.
            text = message.get("content") or ""
            start, end = text.find("{"), text.rfind("}")
            if start < 0 or end <= start:
                return local | {"assistant": "local"}
            translated = json.loads(text[start:end + 1]).get("query")
        else:
            return local | {"assistant": "local"}
        if not isinstance(translated, str) or not 0 < len(translated) <= 500:
            return local | {"assistant": "local"}
        return query(work, translated, context) | {"assistant": f"LLM intent routing ({model}); local calculations"}
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError):
        return local | {"assistant": "local fallback"}


def ai_usage_report(work):
    entries = work.store.history(work.run_id, "assistant_usage", 10000) if work.store else []
    records = [e["payload"] for e in entries] + work.a.policy.get("building_ai_usage", [])
    inp = sum(e.get("input_tokens", 0) for e in records)
    out = sum(e.get("output_tokens", 0) for e in records)
    weight = work.a.factors["ai_input_weight"]
    factor = work.a.factors["energy"]["token-large"]
    return {"logged_records": len(records), "input_tokens": inp, "output_tokens": out,
            "estimated_kwh": [(inp * weight + out) * v for v in factor["values"]] if records else None,
            "formula": "(logged input tokens × configured weight + logged output tokens) × facility energy factor",
            "source": factor["source"],
            "coverage": "Includes recent recorded routing calls and any externally supplied measured building token usage. Historical build use requires a separate usage export."}
