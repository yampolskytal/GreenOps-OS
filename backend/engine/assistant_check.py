"""Compare chatbot results with saved official report figures and source rows."""
import json
import os
from urllib.request import build_opener

from engine.assistant_router import NoRedirect
from engine.insights import query

QUESTIONS = {
    "unused-seats": "How many unused AI subscription seats were there in August 2026?",
    "gpu": "How much would GPU on demand save?",
    "production": "Should we switch off production at night?",
}


def check_assistant(work, exports, live=False):
    expected_run = json.loads((exports / "summary.json").read_text(encoding="utf-8"))["run_id"]
    if expected_run != work.run_id:
        raise ValueError("Assistant check needs exports from the same run and source inputs.")
    expected = json.loads((exports / "questions.json").read_text(encoding="utf-8"))
    checks = []
    for key, question in QUESTIONS.items():
        result = query(work, question)["result"]
        checks.append({"question": question, "report": key, "match": result == expected[key]})
    model = os.getenv("GREENOPS_LLM_MODEL") or os.getenv("GREENOPS_APERTUS_MODEL") or os.getenv("GREENOPS_OPENAI_MODEL") or ""
    report = {"run_id": work.run_id, "report_comparisons": checks, "apertus": "Live check was not requested."}
    if not live:
        return report
    if "apertus" not in model.casefold():
        return report | {"apertus": "Blocked: no Apertus endpoint model configured."}
    from engine.assistant_agent import Agent
    from engine.frontend_api import adapter, query as frontend_query

    attempts = []
    def transport(req, timeout):
        attempt = {"success": False}
        attempts.append(attempt)
        try:
            response = build_opener(NoRedirect()).open(req, timeout=timeout)
        except OSError as error:
            attempt["error_type"] = type(error).__name__
            if isinstance(getattr(error, "code", None), int):
                attempt["http_status"] = error.code
            raise
        attempt["success"] = True
        return response

    class Rehearsal(Agent):
        def plan_with_model(self, question, history):
            return super().plan_with_model(question, history, transport)

    class Offline(Agent):
        def plan_with_model(self, question, history):
            return None, None

    api, q = adapter(work), frontend_query({})
    live_agent, offline = Rehearsal(work, api), Offline(work, api)
    german = {"role": "user", "content": "Wie viel geben wir pro Tool aus?"}
    translated = live_agent.answer(q, [german])
    expected_cost = offline.answer(q, [{"role": "user", "content": "cost by tool"}])
    followup = live_agent.answer(q, [german, translated, {"role": "user", "content": "and carbon?"}])
    expected_carbon = offline.answer(q, [expected_cost, {"role": "user", "content": "and carbon?"}])
    refused = live_agent.answer(q, [{"role": "user", "content": "Restart our workloads"}])
    return report | {"apertus": "Endpoint checked" if attempts and all(x["success"] for x in attempts)
                     else "Blocked: Apertus endpoint unavailable or missing credentials.",
                     "api": "/api/v2/chat",
                     "endpoint_requests": attempts,
                     "german_used_model": translated["assistant"] == "Apertus + GreenOps",
                     "german_matches_cost_rows": bool(expected_cost["tables"]) and translated["tables"] == expected_cost["tables"],
                     "followup_preserves_tool_grouping": bool(expected_carbon["tables"]) and
                     followup["tables"] == expected_carbon["tables"],
                     "unsupported_has_no_result": not refused["tables"] and
                     all(a["type"] == "navigate" for a in refused["actions"])}
