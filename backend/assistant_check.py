"""Compare chatbot results with saved official report figures and source rows."""
import json
import os
from urllib.request import build_opener

from assistant_router import NoRedirect, route_question
from insights import query

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
    attempts = []
    def transport(req, timeout):
        attempts.append({"success": False})
        response = build_opener(NoRedirect()).open(req, timeout=timeout)
        attempts[-1]["success"] = True
        return response
    translated = route_question(work, "Wie viel geben wir pro Tool aus?", transport=transport)
    expected_cost = query(work, "cost by tool")
    followup = route_question(work, "and carbon?", translated["context"], transport=transport)
    refused = route_question(work, "Restart our workloads", transport=transport)
    return report | {"apertus": "Endpoint checked" if attempts and all(x["success"] for x in attempts)
                     else "Blocked: Apertus endpoint unavailable or missing credentials.",
                     "endpoint_requests": attempts,
                     "german_matches_cost_rows": translated["result"] == expected_cost["result"],
                     "followup_preserves_tool_grouping": (followup["context"].get("grouping"), followup["context"].get("metric")) == ("tool", "kg"),
                     "unsupported_has_no_result": refused["result"] is None}
