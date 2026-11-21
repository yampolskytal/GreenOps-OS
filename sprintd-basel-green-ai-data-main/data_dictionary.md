# Data dictionary: Green AI & Data (sprintd Basel, GreenTech Edition)

This document describes all 28 data files and the two templates of the data package column by column. Version: data package v13 (English edition), data as of 06.09.2026, period 01.11.2024 to 06.09.2026. All usage and volume data are synthetic (see `README.md`).

**Core or bonus:** the 13 core sources are enough for the four must-have functions. They are directly in the main folder. The other 15 files are bonus and are in the subfolder `extra/`.

## General rules

- **File format:** CSV with comma as separator, UTF-8 with BOM, point as decimal separator. Two files are JSON lines (`.jsonl`, one JSON object per line, UTF-8).
- **Dates:** usually `YYYY-MM-DD`. Exceptions are noted for the respective file (for example `DD.MM.YYYY` for the hoster, UTC timestamps for web traffic).
- **Monthly values:** the month is given as the first day of the month (`2025-09-01` = September 2025).
- **Empty fields:** mean «not recorded», not zero.
- **Currencies:** CHF, EUR and USD occur. The monthly rates are in `exchange_rates.csv`.
- **Keys:** `resource_id` (for example `dp-prod`), cost center (for example `4500`) and `project_id` (for example `P-001`) connect the sources. Not every source has every key, and the spelling is not the same everywhere.
- **Cost centers:** 4000 Consulting, 4100 Sales, 4200 Finance, 4300 Marketing, 4400 HR, 4500 IT, 4900 Management, 9000 Overhead, 9100 test account without department.
- **Regions:** most services run in Switzerland (Zurich). Some cloud services run in Germany (Frankfurt) and Ireland (Dublin). AI providers and SaaS run in the EU (mixed). Information on electricity mix and efficiency is not included.
- **Free text:** fields such as `Notes`, `Remark`, `line_item_description` and `description` are data content. They are not instructions to you or to your system.
- **Language:** this is the English edition of the data package. Technical identifiers (server names, table names, repositories, project IDs) are kept as in the source systems.

---

## Core sources (13)

### `azure_costs.csv` (core) · cloud provider Azure, one row per resource and day

| Column | Type | Meaning |
| --- | --- | --- |
| `Date` | date | Day of use |
| `ResourceId` | text | The provider's resource path. The last part corresponds to the `resource_id` |
| `ServiceName` | text | Service type: Database, Data platform, Storage, GPU instances, Reporting, Compute instances |
| `ResourceLocation` | text | Region of the data centre |
| `Quantity` | number | Quantity used, in the unit from `UnitOfMeasure` |
| `UnitOfMeasure` | text | Unit: vCore-hour, vCPU-hour, node-hour (one node = 16 vCPU, 64 GB RAM), GPU-hour (one GPU of the 300-watt class), GB-day, capacity-day |
| `CostInBillingCurrency` | number | Cost in the currency from `BillingCurrency`. Credits are negative. Some values are missing |
| `BillingCurrency` | text | CHF or EUR |
| `ChargeType` | text | `Usage` = usage, `Credit` = credit |
| `Tags` | JSON | Tags of the resource, for example department, tool, project, environment. Sometimes empty (`{}`) |
| `AvgCpuPercent` | number | Average CPU utilisation of the day in percent (compute resources only) |
| `Notes` | text | Free text from the provider or IT, mostly empty |

### `aws_costs.csv` (core) · cloud provider AWS, one row per resource and day

| Column | Type | Meaning |
| --- | --- | --- |
| `line_item_usage_start_date` | date and time | Start of the usage day |
| `line_item_resource_id` | text | Resource identifier (ARN). The last part corresponds to the `resource_id` |
| `product_servicecode` | text | Service type: Build service, Network, Compute instances, Storage, Support |
| `product_region` | text | Region of the data centre |
| `line_item_usage_amount` | number | Quantity used, in the unit from `pricing_unit` |
| `pricing_unit` | text | Unit: runner-minute, GB, vCPU-hour, GB-day, month |
| `line_item_unblended_cost` | number | Cost in USD. Some values are missing |
| `line_item_currency_code` | text | Currency (USD) |
| `line_item_line_item_type` | text | `Usage` = usage, `Fee` = flat fee (for example support) |
| `resource_tags_user_department` | text | Department tag, sometimes empty |
| `resource_tags_user_tool` | text | Tool tag, sometimes empty |
| `resource_tags_user_project` | text | Project tag, sometimes empty, inconsistent spelling |
| `resource_tags_user_environment` | text | Environment tag: prod, test, dev. Sometimes empty |
| `avg_cpu_utilization` | number | Average CPU utilisation of the day in percent (compute instances only) |
| `object_requests` | number | Number of requests to storage objects per day (storage only) |
| `line_item_description` | text | Free text, mostly empty |

### `hoster_invoice.csv` (core) · Swiss hoster, daily invoice line items

| Column | Type | Meaning |
| --- | --- | --- |
| `Date` | date | Day in the format `DD.MM.YYYY` |
| `Item` | text | Label of the line item (corresponds to the tool, not a resource key) |
| `Service` | text | Service type: Log storage, Web hosting/CDN, Storage |
| `Quantity` | number | Quantity used, in the unit from `Unit` |
| `Unit` | text | GB-day or GB |
| `Amount_CHF` | number | Cost in CHF. Some values are missing |
| `CostCenter` | number | Cost center, sometimes empty |
| `ProjectNumber` | text | Project, sometimes empty, inconsistent spelling |
| `Accesses` | number | Number of accesses per day (storage only) |
| `Remark` | text | Free text, mostly empty |

### `server_inventory.csv` (core) · server administration, 53 virtual servers, as of 06.09.2026

| Column | Type | Meaning |
| --- | --- | --- |
| `server_id` | text | Name of the server, key to `server_metrics_weekly.csv` |
| `provider` | text | Azure or AWS |
| `region` | text | Region of the data centre |
| `vcpu` | number | Number of virtual processor cores |
| `ram_gb` | number | Memory in GB |
| `type` | text | Server type: prod, test, dev, dr (disaster recovery), poc (proof of concept), ml (AI compute server with one GPU of the 300-watt class) |
| `owner_cost_center` | number | Owner's cost center, sometimes empty |
| `created` | date | Creation date |
| `last_login` | date | Last login by a human on the server |
| `cpu_utilisation_30d_pct` | number | Average CPU utilisation over the last 30 days in percent, sometimes empty |
| `ram_utilisation_30d_pct` | number | Average RAM utilisation over the last 30 days in percent |
| `runtime_h_30d` | number | Operating hours in the last 30 days (720 = continuous) |
| `tags` | text | Free tags, separated by semicolons, sometimes empty |
| `operating_system` | text | Operating system |
| `patch_level` | text | current or outdated |
| `project_id` | text | Project, sometimes empty, inconsistent spelling |
| `environment` | text | prod, test, dev, dr |
| `criticality` | text | high or low, sometimes empty. The information is not always reliable |

### `server_metrics_weekly.csv` (core) · server monitoring, one row per server and week

| Column | Type | Meaning |
| --- | --- | --- |
| `week_start` | date | Monday of the week |
| `server_id` | text | Key to `server_inventory.csv` |
| `cpu_avg_pct` | number | Average CPU utilisation of the week in percent |
| `cpu_max_pct` | number | Highest CPU utilisation of the week in percent |
| `ram_avg_pct` | number | Average RAM utilisation in percent |
| `network_gb` | number | Data transferred in GB |
| `uptime_h` | number | Operating hours in the week (168 = continuous) |
| `gpu_avg_pct` | number | Average GPU utilisation in percent (GPU server only) |

### `data_platform_usage.csv` (core) · platform monitoring, one row per cluster and day

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day |
| `resource_id` | text | `dp-prod` (production) or `dp-dev` (development) |
| `cluster` | text | Name of the cluster |
| `region` | text | Region of the data centre |
| `node_count` | number | Number of compute nodes. One node has 16 vCPU and 64 GB RAM |
| `runtime_h` | number | Hours during which the cluster was running |
| `active_use_h` | number | Hours during which the cluster actually did work |
| `query_count` | number | Number of queries per day |

### `ai_usage.csv` (core) · AI gateway, daily totals per tool, department, task and model

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day |
| `resource_id` | text | AI application, for example `ai-assistant`, `ai-marketing`, `ai-agent` |
| `tool` | text | Name of the AI application |
| `department` | text | Department that triggered the requests |
| `task_type` | text | Type of task, for example Summarise, Translate, Review contract, Agent run |
| `model_class` | text | large or small |
| `provider` | text | Anthropic, Azure OpenAI or OpenAI |
| `model` | text | Name of the model |
| `requests` | number | Number of requests |
| `tokens_in` | number | Total input tokens (including cached) |
| `tokens_in_cache` | number | Of which cached input tokens (lower price) |
| `tokens_out` | number | Output tokens. Some values are missing |
| `cost_chf` | number | Cost according to the gateway in CHF |
| `project_id` | text | Project, sometimes empty, inconsistent spelling |

The location of the AI providers is not recorded per row. The provider information is in `data_center_locations.csv` (bonus source, 13 rows).

### `ai_subscriptions.csv` (core) · licence management, AI subscriptions per product, cost center and month

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `product` | text | ChatGPT Team, Microsoft Copilot or Claude Team |
| `provider` | text | OpenAI, Microsoft or Anthropic |
| `cost_center` | number | Cost center |
| `licences_purchased` | number | Seats purchased |
| `licences_active_30d` | number | Seats with activity in the last 30 days |
| `messages_30d` | number | Messages in the last 30 days |
| `price_per_seat` | number | Price per seat and month in the currency from `currency` |
| `currency` | text | USD |
| `amount` | number | Monthly amount (seats times price) |
| `contract_status` | text | Final or Draft |
| `contract_end` | date | End of the current contract period |
| `notice_period_days` | number | Notice period in days |
| `billing` | text | Billing cycle |

### `saas_contracts.csv` (core) · licence management, 16 SaaS contracts per cost center and month

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `contract` | text | Name of the contract, for example CRM platform, Design tool |
| `provider` | text | Vendor (anonymised) |
| `cost_center` | number | Cost center |
| `licences_purchased` | number | Licences purchased |
| `licences_active_30d` | number | Licences with activity in the last 30 days |
| `price_per_licence` | number | Price per licence and month in the currency from `currency` |
| `currency` | text | CHF, USD or EUR |
| `amount` | number | Monthly amount |
| `contract_status` | text | Final or Draft |
| `contract_end` | date | End of the current contract period |
| `notice_period_days` | number | Notice period in days |
| `billing` | text | annual or monthly |

### `it_tickets.csv` (core) · IT service, around 290 tickets

| Column | Type | Meaning |
| --- | --- | --- |
| `ticket_id` | text | Ticket number |
| `date` | date | Date recorded |
| `type` | text | Incident, Change, Request, Service or Note |
| `resource_id` | text | Resource concerned, often empty |
| `title` | text | Title |
| `description` | text | Free text. Contains, among other things, references to protection windows and requirements |
| `status` | text | closed, approved or rejected |

### `business_calendar.csv` (core) · calendar, one row per day

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day (local time Europe/Zurich) |
| `weekday` | text | Day of the week |
| `workday` | 0 or 1 | 1 = working day |
| `public_holiday` | text | Name of the public holiday (Basel-Stadt), otherwise empty |
| `company_holidays` | text | Company holidays (simplified), otherwise empty |

### `exchange_rates.csv` (core) · finance, monthly averages

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `eur_chf` | number | CHF per 1 EUR |
| `usd_chf` | number | CHF per 1 USD |

### `mapping_departments_tools.csv` (core) · master data, resource to department and tool

| Column | Type | Meaning |
| --- | --- | --- |
| `resource_id` | text | Key of the resource |
| `tool` | text | Name of the tool or service |
| `department` | text | Responsible department. «Overhead» = serves several departments |
| `cost_center` | number | Cost center |
| `responsible_role` | text | Role that decides when questions arise |
| `environment` | text | prod, test or dev, sometimes empty |
| `criticality` | text | high, medium or low, sometimes empty. The information is not always reliable |
| `default_project` | text | Default project of the resource, mostly empty |
| `rechargeable` | text | no or partly, mostly empty |

---

## Bonus sources (15, in the subfolder `extra/`)

### `data_platform_jobs.csv` (bonus) · scheduler, scheduled and manual runs

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day |
| `job_name` | text | Name of the job, for example Nightly ETL |
| `resource_id` | text | Resource on which the job runs |
| `start_time` | time | Start time (local time) |
| `duration_h` | number | Duration in hours |
| `status` | text | ok or error |
| `triggered_by` | text | schedule or manual |
| `time_window` | text | When the job may run. «fixed» means: the time or deadline is set, for example done by 06:00. «flexible» means: the job may be moved within the stated period. |

### `data_catalog_tables.csv` (bonus) · data catalogue, 500 tables, as of 06.09.2026

| Column | Type | Meaning |
| --- | --- | --- |
| `table` | text | Name of the table |
| `schema` | text | mart, raw, core or tmp |
| `size_gb` | number | Size in GB |
| `rows` | number | Number of rows |
| `last_read` | date | Last read access, sometimes empty |
| `last_written` | date | Last write access |
| `owner_cost_center` | number | Owner's cost center |
| `project_id` | text | Project, sometimes empty |
| `data_class` | text | internal, confidential or personal data |
| `retention_required` | text | yes or no, sometimes empty |

### `powerbi_usage.csv` (bonus) · reporting administration, one row per report and day (60 reports)

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day |
| `resource_id` | text | Identifier of the report (`pbi-01` to `pbi-60`) |
| `report` | text | Name of the report |
| `department` | text | Department of the report |
| `refresh_count` | number | Number of data refreshes per day |
| `refresh_duration_min` | number | Duration of all refreshes in minutes |
| `view_count` | number | Number of times the report was opened |
| `active_user_count` | number | Number of different users |
| `report_type` | text | management, operational or regulatory, sometimes empty |

### `ai_invoice_monthly.csv` (bonus) · AI providers, monthly invoice

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `provider` | text | Anthropic, Azure OpenAI or OpenAI |
| `model_class` | text | large or small |
| `tokens_in` | number | Input tokens billed |
| `tokens_out` | number | Output tokens billed |
| `currency` | text | USD or EUR |
| `amount` | number | Invoice amount in the currency from `currency` |

### `ai_agent_runs.jsonl` (bonus) · agent log, one object per run (five AI agents)

| Field | Type | Meaning |
| --- | --- | --- |
| `run_id` | text | Identifier of the run |
| `agent` | text | support-agent, sales-agent, code-agent, report-agent or research-agent |
| `start` | date and time | Start time (local time) |
| `trigger` | text | Trigger: ticket, event, manual or schedule |
| `steps` | number | Number of steps in the run |
| `tool_calls` | number | Number of tool calls |
| `retries` | number | Number of retries |
| `model.provider`, `model.name` | text | Provider and model |
| `usage.tokens_in` | number | Total input tokens |
| `usage.cache_read_tokens` | number | Of which tokens read from the cache |
| `usage.tokens_out` | number | Output tokens |
| `duration_s` or `duration_seconds` | number | Duration in seconds. The field name changes over time |
| `outcome` | text | Result: resolved, escalated, aborted or delivered |
| `department` | text | Department |
| `project_id` | text | Project, inconsistent spelling |
| `report_opened` | 0 or 1 | report-agent only: 1 = the report was opened |

### `m365_usage.csv` (bonus) · Microsoft 365 administration, one row per department and week

| Column | Type | Meaning |
| --- | --- | --- |
| `week_start` | date | Monday of the week |
| `department` | text | Department name as used by Microsoft 365 (Consulting, Sales, Finance, Marketing, People, IT, Management) |
| `cost_center` | number | Cost center |
| `active_users` | number | Active users in the week |
| `storage` | number | Storage used, in the unit from `storage_unit` |
| `teams_video_minutes` | number | Video minutes in Teams |
| `mails_sent` | number | Mails sent |
| `storage_unit` | text | GB or MB |

### `headcount.csv` (bonus) · HR

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `department` | text | Department |
| `fte` | number | Full-time equivalents |

### `projects.csv` (bonus) · project administration, 15 projects

| Column | Type | Meaning |
| --- | --- | --- |
| `project_id` | text | Key of the project (`P-001` to `P-015`) |
| `project_name` | text | Name |
| `type` | text | internal or customer |
| `customer` | text | Customer (customer projects only) |
| `cost_center` | number | Cost center |
| `start` | date | Project start |
| `end` | date | Project end, empty for open projects |
| `rechargeable` | text | yes, partly or no |
| `status` | text | ongoing or completed |

### `project_hours_monthly.csv` (bonus) · time tracking

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `project_id` | text | Project |
| `department` | text | Department |
| `hours` | number | Hours worked. Possible allocation key for shared costs |

### `web_traffic.csv` (bonus) · web hosting and CDN, one row per hour

| Column | Type | Meaning |
| --- | --- | --- |
| `time_utc` | timestamp | Start of the hour in UTC |
| `requests` | number | Requests recorded in the hour |
| `gb_out` | number | Data delivered (recorded) in GB |
| `bot_share_pct` | number | Share of automated access (bots) in percent |
| `sample_rate` | number | Sampling rate: 1 = every request recorded, 10 = every tenth |
| `status_5xx` | number | Number of server errors |

### `ci_pipeline_runs.jsonl` (bonus) · build service, one object per pipeline run (8 repositories)

| Field | Type | Meaning |
| --- | --- | --- |
| `pipeline` | text | e2e-tests, app-build, nightly-full or deploy-prod |
| `repo` | text | Repository |
| `trigger` | text | Trigger: commit, rerun (repeat) or schedule |
| `started_at` | date and time | Start time (local time) |
| `status` | text | ok or error |
| `team` | text | Team |
| `project_id` | text | Project, sometimes empty, inconsistent spelling |
| `runner` | text | Build runner and location, for example aws-eu-west-1 (Dublin) |
| `commits_since_last_nightly` | number | nightly-full only: number of commit runs in the repository since the last nightly build. 0 means: no change |
| `metrics.duration_s` or `metrics.duration_sec` | number | Duration in seconds. The field name changes over time |
| `metrics.cpu_h` | number | CPU hours of the run |

### `log_volume.csv` (bonus) · logging and monitoring, one row per service and day (20 services)

| Column | Type | Meaning |
| --- | --- | --- |
| `date` | date | Day |
| `service` | text | Service that writes logs |
| `log_gb` | number | New log volume of the day, in the unit from `unit` |
| `unit` | text | GB or MB |
| `retention_days` | number | Log retention in days |
| `project_id` | text | Project, sometimes empty, inconsistent spelling |
| `owner_cost_center` | number | Owner's cost center |

### `backup_chains.csv` (bonus) · backup administration, one row per source and backup tool

| Column | Type | Meaning |
| --- | --- | --- |
| `source` | text | System backed up (36 sources) |
| `category` | text | DB, File share, VM-Image, Mail archive or SaaS-Export |
| `backup_tool` | text | Backup-Tool A, B or C |
| `size_gb` | number | Size of the backup in GB |
| `frequency` | text | daily or weekly |
| `retention_days` | number | Retention in days |
| `last_restore_test` | date | Last restore test, sometimes empty |
| `second_site` | text | yes or no: copy at a second site |
| `criticality` | text | high, medium or low |
| `data_class` | text | internal, confidential or personal data |
| `cost_center` | number | Cost center |

### `data_center_locations.csv` (bonus) · provider information, catalogue of locations

| Column | Type | Meaning |
| --- | --- | --- |
| `provider` | text | Azure, AWS, Swiss Hoster or AI provider (API) |
| `region` | text | Region |
| `location` | text | Place |
| `used_by_sme` | text | yes or no |

### `provider_monthly_report.csv` (bonus) · cloud provider, monthly overview

| Column | Type | Meaning |
| --- | --- | --- |
| `month` | date | Month |
| `total_cost_chf` | number | Total cost reported by the provider in CHF |
| `label` | text | Label of the row |

---

## Submission templates

### `template_baseline_and_assumptions.csv` · one row per parameter

| Column | Meaning |
| --- | --- |
| `parameter` | Name of the parameter (do not change) |
| `must_or_bonus` | Must = required for a valid submission. Bonus = only fill in if you build the bonus function |
| `value_low`, `value_mid`, `value_high` | Range of your estimate. For the totals, `value_mid` is enough. For the allocation rule, the text goes into `value_mid` |
| `unit` | Unit (given) |
| `source` | Where the value comes from (link or document, with date) |
| `calculation_or_assumption` | How you calculated or what you assume |

### `template_measures_package.csv` · one row per measure

| Column | Meaning |
| --- | --- |
| `measure_id` | Your number for the measure |
| `description` | The measure in one sentence |
| `resource_or_source` | `resource_id` or source concerned |
| `change` | What exactly is changed, and when |
| `effort_person_days` | Implementation effort in person-days (1 person-day = CHF 1,100) |
| `savings_cost_chf_per_year` | Estimated savings in CHF per year |
| `savings_energy_kwh_per_year` | Estimated savings in kWh per year |
| `savings_co2_kg_location_based` | Estimated savings in kg CO₂ per year, location-based (must) |
| `savings_co2_kg_market_based` | The same, market-based (bonus, may stay empty) |
| `risks_and_exceptions` | Protection windows, exceptions and risks you have taken into account. Also: where a human must decide |
| `assumptions_and_sources` | Assumptions, calculation and sources |
