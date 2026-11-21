"""Offline checks for the platform assistant's safety boundary (no network)."""
import io
import json
import os
import unittest
from datetime import date
from unittest import mock

from app import ROOT, Workspace
import assistant_agent
import frontend_api


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def model_returning(plan, seen):
    def transport(request, timeout):
        seen.append(json.loads(request.data))
        return Resp(json.dumps({"choices": [{"message": {"content": json.dumps(plan)}}]}).encode())
    return transport


class AgentSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = Workspace(ROOT / "demo-data", ROOT / "factors.json", ROOT / "dist", date(2026, 9, 6), {}, None, None)
        cls.api = frontend_api.adapter(cls.work)
        cls.agent = assistant_agent.Agent(cls.work, cls.api)
        cls.q = frontend_api.query({})

    def ask(self, text, plan=None):
        env = {"GREENOPS_LLM_MODEL": "m", "GREENOPS_LLM_BASE_URL": "https://llm.invalid/v1", "GREENOPS_LLM_API_KEY": "k"} if plan else {}
        seen = []
        with mock.patch.dict(os.environ, env, clear=True):
            original = self.agent.plan_with_model
            with mock.patch.object(self.agent, "plan_with_model", lambda q, h: original(q, h, model_returning(plan, seen))):
                return self.agent.answer(self.q, [{"role": "user", "content": text}]), seen

    def test_model_never_receives_dataset_rows_or_free_text(self):
        _, seen = self.ask("cost by department", {"reply": "", "calls": []})
        prompt = json.dumps(seen[0])
        self.assertNotIn(".csv:", prompt)
        for row in self.work.a.data["it_tickets"][:50]:
            if len(row.get("description", "")) > 20:
                self.assertNotIn(row["description"], prompt)

    def test_unknown_tools_bad_args_links_and_invented_figures_are_dropped(self):
        plan = {"reply": "You save 123,456 CHF at https://x.example", "calls": [
            {"tool": "approve_measure", "args": {}}, {"tool": "navigate", "args": {"page": "https://x.example"}},
            {"tool": "set_filters", "args": {"department": "nope"}}, {"tool": "stage_plan", "args": {"measures": ["not-a-measure"]}}]}
        reply, _ = self.ask("hi", plan)
        self.assertNotIn("123,456", reply["content"])
        self.assertNotIn("x.example", json.dumps(reply))
        self.assertFalse(any(a["type"] in ("setFilters", "stagePlan") for a in reply["actions"]))
        self.assertIn("Rejected calls", reply["calculation"])

    def test_actions_are_offers_and_plans_are_previews(self):
        reply, _ = self.ask("Give me the best plan that meets both targets")
        staged = [a for a in reply["actions"] if a["type"] == "stagePlan"]
        self.assertTrue(staged and all(i in self.api.measures for i in staged[0]["measureIds"]))
        self.assertIn("not committed", staged[0]["label"])

    def test_destructive_requests_are_redirected_to_humans(self):
        reply, _ = self.ask("delete the production platform now")
        self.assertIn("can't change", reply["content"])
        self.assertTrue(all(a["type"] in ("navigate", "openMeasure") for a in reply["actions"]))


if __name__ == "__main__":
    unittest.main()
