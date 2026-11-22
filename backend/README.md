# GreenOps Basel

GreenOps evaluates the cost, energy and carbon footprint of the sprintd Basel case across 13 core and 15 bonus exports. The project includes the organizer's case inputs, both official CSV templates, generated case reports, a separate representative demo, tests and a local dashboard. The case company and its usage patterns are fictional. Source data attribution is “Sample data ALTYCA, sprintd Basel 2026”.

## Start the product

For the current web dashboard, follow the [two-terminal setup](../README.md#run-locally). The commands below run the standalone Python dashboard from the `backend/` directory.

On Windows, from the `backend/` folder, run `scripts\launch-challenge.cmd`. From a terminal in the `backend/` folder:

    python app.py serve --data inputs/sprintd-basel-green-ai-data-main --policy challenge-policy.json

Open http://127.0.0.1:8765/. Use Workspace to switch between the organizer's dataset and the representative demo. Run python app.py serve without arguments to start with the demo. Python 3.11 or later is required. Install tzdata if Python cannot find Europe/Zurich in your operating system's timezone registry. The HTTP app and static assets otherwise use no third-party runtime dependencies.

## Review, plan and export

For the organizer's case, the default package includes proposals that need a human decision. Each has an approver and an evidence trail. Approval remains a separate recorded step. The package explains any remaining target gap and exposes optimistic catalog ceilings. See `/api/protections` for the ticket register and `/api/contradictions` for aligned runtime checks and other conflicts.

Use `/api/overview?by=tool`, `/api/drivers`, `/api/waste`, `/api/measures`, `/api/measures/{url-encoded-id}/explain`, and `/api/questions/1` through `/api/questions/3` for auditable figures. `POST /api/package/optimize` accepts JSON with budget, days, mode and objective. An optional OpenAI intent router activates only when both `GREENOPS_OPENAI_MODEL` and `OPENAI_API_KEY` are configured. It sends unmatched question text to the configured model and runs its suggested query locally. Keep it off for sensitive questions. `/api/assistant-usage` reports recorded router tokens and any supplied historical build usage with estimated energy. It cannot recover previous development token logs.

- **Drivers** groups CHF, estimated energy and emissions by category, department, tool, month, region, provider and project. The market view shows residual coverage gaps.
- **Measures** separates planning proposals, conditional drafts and measures with recorded owner evidence. Try alternative cap and objective combinations. Compare saved scenarios and download CSVs for the current settings. An owner approval is scoped to a specific analysis run and measure fingerprint. Production continuity and other hard protections cannot be overridden.
- **Example questions** gives the documented challenge answers. **Ask GreenOps** answers ledger and operational questions locally. Try “top 5 tools by carbon”, “and cost?”, or “energy in August 2026”. The assistant combines filters, groupings, metrics and limited follow-ups. It returns evidence or supported query choices when the language cannot be resolved.
- **Forecast** shows three-year demand scenarios, a post-measures view and a holdout check. **Diagnostics** includes CI runs, observed workload clusters, backup, reporting and retention review signals, and a carbon scheduling analysis. **Data quality** links to source coverage, normalized rows, reconciliation, and the audit trail.

To regenerate the case reports, or load other files in the same structure:

    python app.py export --data inputs/sprintd-basel-green-ai-data-main --policy challenge-policy.json --out challenge-results
    python app.py export --data "C:/your/case-folder" --out custom-results

Keep CSVs in the input folder, with bonus files under extra. The original templates are read from that folder when present or from the bundled organizer originals. A different template folder can be selected with --templates. Outputs preserve the official columns, row identifiers and units. Exports contain the current eligible planning selection, with conditional and approved packages in separate JSON reports. Planning exports are proposals for review. Comparison with an independent jury baseline is available when reference_baseline in the policy provides positive CHF and kg plus a source.

## Data and configuration

### Validate savings and assign open questions

In **Measures → Compare a quote or exclude a measure**, test the effect of excluding a proposal or entering a hypothetical variable-rate production quote. The preview reruns the optimizer at the displayed budget, time limit, and objective. It shows replacements, target gaps and approvals. It does not change official outputs or approval records. A dated equivalent-service quote under `measured_evidence.commercial_quotes.dp-prod` can be combined with autoscaling when `scales_with_usage: true` confirms proportional pricing and no minimum commitment. The discounted rate applies only to the remaining modeled bill. The combined proposal still requires the production pilot evidence.

Export the official case and validate its CSVs, source hashes, and package in one workflow:

    python app.py export --data inputs/sprintd-basel-green-ai-data-main --policy challenge-policy.json --out challenge-results-decision --swiss-sensitivity
    python app.py validate --data inputs/sprintd-basel-green-ai-data-main --out challenge-results-decision

The validator independently checks templates, totals, both implementation caps, overlapping scopes, protected resources, and run fingerprints. A structurally valid submission can still miss the savings targets. The export shows fixed-package sensitivity to the Swiss consumption grid mix in `swiss-sensitivity.json`.

`submission-readiness.json` shows the break-even jury baselines, the estimated extra savings required under simple reference-baseline stresses, and the best modeled replacement package if any selected measure is withheld. It records outstanding measure checks, footprint gaps, CI evidence, and the status of hourly grid data. The production quote comparison is available before a real quote arrives; it is a price ceiling for an equivalent variable-rate offer. `coverage-priorities.json` includes the exact row references and source hashes needed to submit evidence for unpriced ledger lines. The baseline CSV records the configured growth range, metric-specific estimates and documented dated capacity steps.

`investment-options.json` lists scoped production and development compute rates and Power BI capacity quotes. It calculates the savings and price needed if current measures must be replaced. Add dated entries to `measured_evidence.commercial_quotes` under `dp-prod`, `dp-dev`, or `pbi-kap` with `annual_chf`, `equivalent_service: true`, and optional `one_time_chf`. Power BI requires `peak_test`, `audit_test` and `rollback_test` source references. The production autoscaling proposal requires `measured_evidence.production_pilots.dp-prod` before approval, with `minimum_capacity_fraction` of at least 0.75 and source references in `capacity_test`, `deadlines_test`, `month_end_rehearsal`, and `rollback_test`. These records supplement owner review and do not execute changes.

`coverage-priorities.json` ranks missing data by overlap with selected measures and observed spend. Use `recovered_costs` keyed by exact ledger line reference for verified gaps only, with `source_sha256`, `amount_chf`, `source` and `owner`. The system rejects stale hashes, ambiguous rows and replacements of observed costs. When resolving a data issue, optionally link the applied adjustment reference. The issue export retains the evidence and link.

**Diagnostics → Recoverable impact** ranks the selected non-overlapping package by annual CHF or location-based CO₂e. Use the owner-approved filter to see savings with recorded sign-off. **Data quality** groups contradictions and lets a reviewer record an owner, investigation status, and evidence. These notes stay with the analysis run. Financial restatements require a separate source decision or finance adjustment.

Put evidence in the policy’s `measured_evidence` object. Each record requires `source`, `owner`, `from`, and `through` dates valid on `--as-of`.

| Record | Scope key | Additional fields |
| --- | --- | --- |
| `destination_quotes` | `dp-dev` | `chf_per_node_hour`, optional one-time `migration_chf` |
| `renewals` | Lowercase aggregate licence resource ID from the package components | `effective_date` matching the contract end and `chf_per_seat_month` |
| `meter_pools` | Meter ID such as `vm-test` | `members` with the confirmed server IDs |
| `ai_benchmarks` | AI workload resource ID | `scope` with the exact pilot measure ID, `quality_passed: true`, and observed `cost_saving_fraction` and `energy_saving_fraction` from 0 to 1 |

Use `site_pue` and `resource_energy` in the factor file to replace proxies with measured ranges and sources. **Data quality → Footprint coverage by region** reports modeled kWh, market-covered kWh, and observed CHF on lines with no energy estimate. No measured evidence files or approvals are bundled for the organizer’s case.

Add sourced changes in `forecast.dated_changes` with `effective_date`, `source`, and optional `annual_delta_chf`, `annual_delta_kwh`, or `annual_delta_kg`. Changes prorate by effective date across forecast years. The forecast shows annual run-rate savings, first-year gross savings and first-year spend including implementation.

For live scheduling, place timestamped grid data in `hourly_grid.csv`. In `job_dependencies`, each exact job name needs a matching `resource`, `owner`, `source`, dates `from` and `through`, and true values for `independent`, `capacity_tested`, and `rollback_tested`. Optionally list `reviewed_ticket_ids` after reviewing each applicable ticket. Protected windows and continuous availability remain enforced.

### Apertus

For local development, copy `apertus.env.example` to `apertus.env`, enter your Public AI key, and restart the Python backend. The example uses `swiss-ai/apertus-70b-instruct` at `https://api.publicai.co/v1`. The loader accepts this file on Windows and the file is ignored by Git.

On the deployed Python service, configure `GREENOPS_LLM_BASE_URL`, `GREENOPS_LLM_MODEL`, `GREENOPS_LLM_TOOLS=0`, and `GREENOPS_LLM_API_KEY` as service environment variables. The Python backend talks to Public AI. The frontend only calls `/api/v2/chat`. For a self-hosted model, set `GREENOPS_APERTUS_MODEL` and serve the endpoint on `127.0.0.1:8000`.

The assistant opens views directly for clear navigation requests. Apertus routes analytical questions into local read-only tools. Sources, assumptions and the routing source appear under **Sources and details**. If Apertus is unavailable, common questions still run through the local lookup.

### Bonus evidence

Export the case and check the chatbot against its official figures and source rows:

    python app.py export --data inputs/sprintd-basel-green-ai-data-main --policy challenge-policy.json --out challenge-results-bonuses
    python app.py assistant-check --data inputs/sprintd-basel-green-ai-data-main --policy challenge-policy.json --out challenge-results-bonuses

Add `--live-model` after configuring Apertus to test the German paraphrase, follow-up, and unsupported action against the endpoint. The live check exits with an error if routing cannot be demonstrated.

- `projections.json` compares the frozen and rolling three-month historical baselines. It applies the case’s documented increase from 20 to 24 production nodes using observed August cost and energy per node-hour, prorated from October. The rate, meter lines and constant-capacity assumption are included. First-year contract effects use the existing dated renewals. Future grid changes require sourced inputs.
- `market-breakdown.json` splits market coverage by region and month. Germany and Ireland use 2025 AIB residual factors. For the 2026 case period the value is carried forward as an explicit proxy. Swiss electricity remains uncovered where supplier-specific evidence is missing.
- `carbon-replay.json` demonstrates a historical case job with measured German generation as input and shows a protected production job that remains in place. The replay does not grant operational clearance or add savings to the package.
- `ci-attribution.json` compares CI and billing by month and region. To count avoidable runs, configure `measured_evidence.ci_runner_meters` under the exact runner name with `meter` and `region`, and `measured_evidence.ci_required_checks` under `repo|pipeline` with `required` and `allow_no_change_skip` or `allow_rerun_suppression`. Both require a dated owner and source. Missing scope and unknown check requirements stay outside claimed savings.
- `diagnostics.json` shows split-period server cluster stability and a protected-versus-review comparison. `bonus-decisions.json` links all 15 bonus sources to decisions, including audit reporting, backup retention, and project-hour allocation.

- The supplied schema registry checks the documented v13 column layout. The loader accepts UTF-8 CSV with or without BOM and the two JSONL streams. Source hashes, observed baseline months, accepted counts, and issue references are recorded. Each source is cached by content, schema and adjudication. Changed files are reparsed. SQLite retains factor snapshots, summaries, approval decisions and scenarios. Raw data stays in the input folder.
- Monthly FX, signed credits, and final contract versions determine CHF in the ledger. A source_decisions entry can drop a specific source line or retain a duplicate after finance review. The decision requires that file's SHA-256, actor, and reason. Install a source decision only after reviewing the rows. FinOps adjustments can explicitly add or reverse audited CHF entries with a unique ID, date, actor and evidence. Reconciliation does not post adjustments on its own.
- Full cloud resource IDs are retained when their short aliases collide. Supply resource_aliases to resolve qualified billing paths or link verified renames. Supply dated allocation_mappings with source evidence where ownership changed. The shared cost view uses project hours then FTE by month. It reconciles back to the ledger and can estimate customer recharges with documented eligibility and rates.
- factors.json holds regional grid intensities, PUE and energy coefficients with low, midpoint and high values. Site PUE and resource-specific factors can be entered through site_pue and resource_energy. An optional seat-month factor can cover SaaS with provider evidence. Location-based estimates show rows without energy. The market view uses regional residual factors for mapped consumption and reports missing Swiss coverage. A supplier instrument requires verified coverage, an exclusive allocation attestation, source, validity dates, and unique instrument ID. No unauthorized claim is inferred from ticket text. Embodied emissions require a separate hardware inventory and lifecycle evidence.
- The policy can specify dated ai_prices for uncached input, cached input and output, provider_report_scope for reconciliation, recharge_rates, protection_register, job_dependencies, region_options, reference_baseline, and per-measure prerequisites, exclusion groups, migration cost, rollout phase, and first-year timing. The bundled challenge policy is derived from the original tickets and documentation. It contains no approvals or destination price quotes.
- Forecast policy can assign categories their own growth ranges, price growth, and grid change. known_changes can carry sourced CHF, kWh and kg steps. The holdout check uses an earlier monthly mean as a calibration benchmark. The carbon scheduler accepts hourly_grid.csv at the input root with timestamp, region, kg_per_kwh, kind and source columns. Use offset-aware timestamps aligned to whole UTC hours, normalized region codes, and observed or forecast as kind. Scheduled runs need per-job owner dependency clearance in job_dependencies. The representative demo has a labeled synthetic profile. The organizer's case folder supplies no hourly signal.
- The optimizer respects CHF 16,500 and 15 person-days, including declared migration cost and overlapping scope restrictions. It supports midpoint targets, first-year cash, and a conservative emissions objective. It reports both gaps and its search status. If no eligible package meets the targets, the display and exports retain the shortfall. No cloud, HR, or procurement changes are executed.

## Shared operation

Local access is single-operator by default. To provision separate viewer, planner, reviewer, or admin accounts:

    python app.py account --accounts state/accounts.json --username operator --role admin
    python app.py serve --accounts state/accounts.json

For a shared deployment, run the Python service behind an HTTPS reverse proxy and restrict backend access to that proxy. Give the service write access to its SQLite state directory and read-only access to input data and credentials. Set `--host 0.0.0.0` only for an authenticated, network-restricted deployment. API read endpoints support optional paging on ledger and audit. An administrator can reload configured datasets and edit factors without restarting the process. Use `--catalog` for an additional allowlist of names mapped to data, factors, and policy paths.

## Verify

    python app.py build
    python -m unittest discover -s tests
    node --check dist/app.js

The case integration test runs when the organizer's dataset is in the bundled input location. Tests cover both template schemas, rules and resource protection, dated schedule behavior, persisted review and scenario operations, assistant queries, driver attribution, and HTTP and export routes. [PITCH.md](../docs/pitch.md) is a five-minute walkthrough.

## Layout

| Path | What lives here |
| --- | --- |
| `app.py` | Command line, export builder, workspace loader and loopback server |
| `engine/` | Ingestion, accounting, planning, forecasts, assistant and the `/api/v2` contract |
| `tests/` | Python regression and integration tests |
| `scripts/` | Helper scripts and the one-off hourly grid replay used for bonus evidence |
| `inputs/` | Official case data, the example upload package and runtime uploads |
| `templates/` | Official submission CSV templates |
| `frontend/` | Classic standalone dashboard served by `app.py serve` (built into `dist/`) |
| `demo-data/`, `factors.json`, `challenge-policy.json`, `schema-v13.json` | Representative demo, emission factors, case policy and source schema |
