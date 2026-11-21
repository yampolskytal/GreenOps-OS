# GreenOps assistant: capabilities and data safety

`assistant_agent.py` powers the frontend chat (`POST /api/v2/chat`). Apertus (or any OpenAI-compatible model configured in `apertus.env`) acts as a planner. It picks tools; GreenOps validates and runs them locally. Without a model, or when its reply is unusable, a deterministic local planner takes over.

## What it can do

| Tool | Effect |
| --- | --- |
| `query_ledger` | Cost, energy and CO₂ by department, tool, provider, region, project, resource or month, with scope and follow-ups |
| `challenge`, `protection`, `diagnostic` | Official case answers, ticket-backed protections and scoped bonus reports |
| `list_measures`, `explain_measure`, `findings` | Rank and explain measures (risks, approver, evidence), list top waste findings |
| `simulate_plan`, `optimize_plan` | Check a package against 25 % cost / 40 % CO₂ / CHF 16,500 / 15 PD, or run the backend optimizer |
| `forecast`, `data_quality` | 3-year baseline vs optimized forecast; dataset health and conflicts |
| `navigate`, `open_measure`, `highlight_resource` | Buttons linking to any page, measure or resource |
| `set_filters`, `set_role` | Buttons that apply global filters or switch the CEO/CFO/IT view |
| `stage_plan` | Button that saves an **uncommitted** draft Path after eligibility and dependency checks |

The assistant cannot commit a plan, approve or review measures, rebuild data, export files or change infrastructure. For these it explains that a person must act and links to the right page.

## Dataset safety assessment

| Risk in the consumed data | Where | Handling |
| --- | --- | --- |
| **Prompt injection**: free text addressed to AI assistants (e.g. "ignore previous instructions…", "ignore the cost column") | `it_tickets.csv` descriptions, `hoster_invoice.csv` remarks, Azure `Notes`, tags | No free-text field is ever sent to the model. Dataset-derived labels (departments, providers, measure names/resources) are sent only if short, plain and instruction-free (`safe_label`). |
| **Personal or business identifiers**: person-named sandboxes (`sbx-<name>-NN`), customer names, cost centres, `last_login` | inventory, projects, catalogue | Not in the prompt. Resource IDs are only validated locally when the user types them. |
| **Confidential data classes** | `data_catalog_tables.csv` `data_class` | Never sent. Only aggregates are rendered locally. |
| **Hallucinated or manipulated figures** | model output | The model selects validated tools. GreenOps renders the answer and figures from local results. |
| **Unsafe actions** | model output | Tools are allow-listed; measure IDs, pages, departments, providers, months and budgets are validated. Rejected calls are listed in the answer's calculation note. Actions run only when the user clicks. |
| **Data egress** | network | Outbound: the user's last three questions, the tool/page catalogue, measure aliases (`M1…`) with names, and sanitized filter labels. Ledger rows, results, follow-up context and Current Plan IDs stay in the backend. HTTPS with key or loopback only. Redirects are refused. |

Residual risks: user-typed text is sent as is, so don't paste confidential content when a remote host is configured. The local-only option is `GREENOPS_APERTUS_MODEL` on `127.0.0.1:8000`. Token usage is logged to the run store (`/api/assistant-usage`).

Tests: `python -m unittest test_assistant_agent`.
