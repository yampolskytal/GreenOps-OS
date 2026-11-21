# Green AI & Data: Electricity is the new currency, and hardly anyone keeps the books

**GreenOps for SMEs: make it visible, cut it where it counts.** Sample data for the teams (sprintd Basel, GreenTech Edition)

The **usage and volume data are synthetic** (made up) and describe a fictitious service SME in Basel (around 112 employees). They contain no customer data. **Real public data** are built in (exchange rates, public holidays, list prices), each with its source. **Conversion factors are deliberately not included** (see «Real and synthetic data»). Every column is explained in `data_dictionary.md`.
**Data as of:** 06.09.2026 · **Period:** 01.11.2024 to 06.09.2026 (hourly, daily, weekly or monthly depending on the source)
**Delivery:** ZIP with README at the kick-off, plus the link to the GitHub repository with all files.

## Start here
- **Your task:** show where cloud, servers, AI and SaaS create costs, energy and CO₂ in a Basel SME, and choose safe measures against it.
- **Must-have functions:** Connect · Find · Decide · Know the limits (details below).
- **Target:** CO₂ −40 % (location-based) and costs −25 % per year, with at most CHF 16,500 implementation effort (15 person-days).
- **Submit by Sunday 08:30:** your prototype plus the two filled-in templates (`template_baseline_and_assumptions.csv`, `template_measures_package.csv`).
- **Pitch on Sunday from 09:00:** 5 minutes live demo, 3 minutes questions.
- **Start with:** the 13 files in this folder, `data_dictionary.md` and `example_questions.md`.

## Documents
- `documents/Factsheet_Green_AI_Data_sprintd_Basel_EN.pdf`: the case on one page
- `documents/Presentation_Green_AI_Data_sprintd_Basel_EN.html`: the case presentation from the kick-off. Download it and open it in a browser; use the arrow keys or the space bar to move on
- `documents/Presentation_Green_AI_Data_sprintd_Basel_EN.pdf`: the same presentation as a PDF

## Contents of the package
- `README.md`: this overview (download as ZIP: green «Code» button, then «Download ZIP»)
- `data_dictionary.md`: every file explained column by column
- `example_questions.md`: three questions your solution should be able to answer
- `template_baseline_and_assumptions.csv` and `template_measures_package.csv`: the two tables for your submission
- 13 core sources directly in this folder: these cover the four must-have functions
- Subfolder `extra/`: 15 bonus sources with further patterns (see «Sources»)

**Start with the 13 files in the main folder.** You only need the `extra/` folder once the must-have functions work.

## The task in one sentence
Where in the company do digital work and tools create costs, energy use and CO₂, and what can be done about it without risk?

## Why this matters for Basel
- For an SME in Basel, the emissions of cloud, AI and SaaS are **indirect emissions (Scope 3)**: the electricity flows into data centres in Zurich, Frankfurt or Dublin. But the decisions are made in Basel: which region, which size, how long something runs and which AI model.
- The canton of Basel-Stadt aims to reach net zero on its territory by 2037 and **also wants to reduce the indirect emissions of the Basel economy**. Basel 2037 supports SMEs on this path.
- That is why you calculate CO₂ with the electricity mix at the location of the data centre (location-based). Only then can you see what a decision made in Basel achieves.

## Real and synthetic data
| What | Real or synthetic | Source |
| --- | --- | --- |
| Exchange rates EUR-CHF and USD-CHF (`exchange_rates.csv` and all conversions in the cost sources) | **real:** monthly averages of the ECB reference rates, USD-CHF derived from them | Deutsche Bundesbank, exchange rate statistics, table II.2: https://www.bundesbank.de/resource/blob/804114/6736fe9ffa1c254e056dcb8b1cbc1dc8/472B63F073F071307366337C94F8C870/ii-euro-referenzkurse-der-ezb-data.pdf |
| Public holidays (`business_calendar.csv`, column public_holiday) | **real:** public holidays in Basel-Stadt 2024 to 2026 | Python package holidays 0.108 (subdivision BS), https://pypi.org/project/holidays/ |
| Company holidays (`business_calendar.csv`) | synthetic, simplified company holidays (not the official school holidays) | – |
| Token prices and models (`ai_usage.csv`, `ai_invoice_monthly.csv`) | **real:** list prices per 1 million tokens in USD (for example Claude Sonnet 4.6: 3 dollars input, 15 dollars output, 0.30 dollars for cached input; GPT-5.4: 2.50, 15 and 0.25 dollars). Checked on the providers' pricing pages on 12.11.2026. These are the prices during the data period. Anthropic now lists Sonnet 4.6 as an older model; newer models are cheaper. The token volumes are synthetic. | platform.claude.com/docs/en/about-claude/pricing, developers.openai.com/api/docs/models/gpt-5.4 (as of 12.11.2026) |
| Subscription and licence prices (`ai_subscriptions.csv`, Microsoft 365 in `saas_contracts.csv`) | **real (list prices, USD per seat and month):** Claude Team Standard 25 (monthly billing), ChatGPT Business/Team 25 (monthly), Microsoft 365 Business Standard 12.50, from 01.07.2026 14, Microsoft Copilot 30, from December 2025 Copilot Business 21 (from 01.07. to 31.12.2026 as a promotion 18 in the first year). With annual billing, Claude Team and ChatGPT Business are cheaper at 20. Seats, activity and usage are synthetic. | claude.com/pricing, Microsoft pricing page for Microsoft 365 Business, The Register (05.12.2025) and UC Today (19.05.2026) on the price increase of 01.07.2026. As of 12.11.2026. Prices change and do not apply to all contracts. |
| Electricity mix, PUE, energy per unit, per token and per subscription message | **deliberately not included.** You research these yourselves (see «What you need to research or assume yourselves»). | – |
| Price per vCPU hour and for data egress | **based on real list prices:** AWS m6i.large (2 vCPU) in Zurich 0.1265 dollars per hour, Ireland 0.107 dollars. The volumes are synthetic. | aws-pricing.com (secondary source for the AWS price list), as of 07.11.2026 |
| Volumes, utilisation, servers, projects, tickets, further SaaS contracts, hoster, further cloud prices | synthetic | – |

Note on market-based: many providers match their electricity with renewable energy. This does not mean that the data centres physically run on renewable electricity only. That is exactly the difference between location-based and market-based.

## The sample SME
The data describe a **fictitious consulting and services company focused on data and AI**, based in Basel-Stadt.
- **Size:** around 112 to 120 employees (full-time equivalents). Under the usual Swiss classification, this is a medium-sized company (50 to 249 employees).
- **Departments:** Consulting, Sales, Finance, Marketing, HR, IT, Management (plus Overhead).
- **Digital landscape:** customer portal and webshop, a data platform with production and development environments, 60 Power BI reports, around 50 virtual servers at three providers (Azure, AWS, Swiss hoster), one GPU server for AI, Microsoft 365 and 16 further SaaS contracts, three AI subscriptions, AI applications via APIs and five AI agents, backups with three tools. Development works in eight repositories.
- **Locations:** the SME is based in Basel, and most services run in data centres in Switzerland (Zurich): production platform, app server, database, reporting, storage and the Swiss hoster. As at many SMEs, some services run abroad: the development cluster and GPU server in Germany (Frankfurt), test environments, backup archive and build service in Ireland (Dublin). AI providers and SaaS run in the EU (mixed). The location is stated per row in the invoices.
- **Not included:** devices, printers, network hardware and own data centres. The case covers software, cloud, data and AI only.

## Four must-have functions and bonus
Your solution must do four things. That is enough for a valid submission.
1. **Connect:** bring together at least cloud, servers, AI and SaaS into one overall picture, by department and tool.
2. **Find:** show the biggest drivers and the waste.
3. **Decide:** choose a package of measures with effort and savings in CHF and CO₂ (location-based). It reduces **location-based CO₂ by at least 40 % and costs by at least 25 %** and costs no more than **CHF 16,500 to implement** (1 person-day = CHF 1,100).
4. **Know the limits:** respect protection windows, flag contradictions between sources and hand over to a human when in doubt. Nothing critical may be disrupted.

**Bonus** (counts towards creativity and innovation, but is not required):
- a chat assistant that answers questions about the data and measures and backs every answer with a calculation or source
- a forecast for the coming years: costs, energy and CO₂ with ranges and justified assumptions (for example growth, known changes, seasonality). Enter the growth assumptions in `template_baseline_and_assumptions.csv`.
- the market-based view in addition to the location-based view
- finding groups of similar usage (clustering)
- shifting loads in time (carbon-aware computing): which jobs may run in hours with less CO₂ in the grid? The time windows are in `extra/data_platform_jobs.csv`.
- slimming down build pipelines (DevOps): nightly builds without changes, re-runs, location of the build runners (`extra/ci_pipeline_runs.jsonl`)
- integrating the 15 bonus sources from `extra/`

## Data quality
The data are the way real exports often are: individual missing values and periods, duplicates, drafts next to final versions, samples instead of full records, missing tags, changing units and column names and different formats per source. Preparing the data is part of the task.

## Sources (different systems, each with its own logic)
| File | Core or bonus | System | Content |
| --- | --- | --- | --- |
| `azure_costs.csv` | **Core** | Cloud provider Azure | Daily costs per resource, tags as JSON, currency CHF or EUR |
| `aws_costs.csv` | **Core** | Cloud provider AWS | Daily costs per resource, currency USD, different column names and tags |
| `hoster_invoice.csv` | **Core** | Swiss hoster | Daily line items without a resource key, only a label and cost center |
| `data_platform_usage.csv` | **Core** | Platform monitoring | Runtime and active use of the clusters |
| `extra/data_platform_jobs.csv` | Bonus | Scheduler | Scheduled and manual runs with time window (fixed or flexible) |
| `extra/data_catalog_tables.csv` | Bonus | Data catalogue | 500 tables with size, last read and write time (as of 06.09.2026) |
| `extra/powerbi_usage.csv` | Bonus | Reporting administration | Refreshes, duration, views per report (60 reports) |
| `ai_usage.csv` | **Core** | AI gateway | Requests, input, output and cached tokens per department, tool, provider, model |
| `extra/ai_agent_runs.jsonl` | Bonus | Agent log | Runs of five AI agents with steps, tool calls, retries and tokens |
| `extra/ai_invoice_monthly.csv` | Bonus | AI providers | Monthly invoice per provider in the respective currency |
| `ai_subscriptions.csv` | **Core** | Licence management | AI subscriptions (fixed prices per seat) with active users and messages |
| `saas_contracts.csv` | **Core** | Licence management | 16 SaaS contracts per cost center and month |
| `extra/m365_usage.csv` | Bonus | Microsoft 365 administration | Weekly usage per department: storage, video minutes, mails |
| `extra/web_traffic.csv` | Bonus | Web hosting and CDN | Hourly traffic with bot share |
| `extra/ci_pipeline_runs.jsonl` | Bonus | Build service | Pipeline runs of 8 repositories with runner location and commits since the last nightly build (JSON lines) |
| `extra/log_volume.csv` | Bonus | Logging and monitoring | Log volume and retention for 20 services |
| `extra/backup_chains.csv` | Bonus | Backup administration | Backups per source (36) and backup tool with category, retention, restore test, second site |
| `server_inventory.csv` | **Core** | Server administration | 53 virtual servers (one of them a GPU server) with size, type, owner, last login, utilisation, patch level (as of 06.09.2026) |
| `server_metrics_weekly.csv` | **Core** | Server monitoring | Weekly per server: CPU (average and peak), RAM, network, operating hours, for the GPU server also GPU utilisation |
| `extra/data_center_locations.csv` | Bonus | Provider information | Catalogue of locations (13) and whether the SME uses the location (without information on electricity and efficiency) |
| `extra/provider_monthly_report.csv` | Bonus | Cloud provider | Monthly overview from the provider |
| `exchange_rates.csv` | **Core** | Finance | Monthly rates EUR-CHF and USD-CHF |
| `extra/headcount.csv` | Bonus | HR | Full-time equivalents per department and month |
| `extra/projects.csv` | Bonus | Project administration | 15 projects (internal and customer projects) with cost center, duration, status and recharging |
| `extra/project_hours_monthly.csv` | Bonus | Time tracking | Hours per month, project and department, as a possible allocation key |
| `it_tickets.csv` | **Core** | IT service | Around 290 tickets (changes, incidents, requests, notes) with free text |
| `business_calendar.csv` | **Core** | Calendar | Working days, public holidays, company holidays (simplified) |
| `mapping_departments_tools.csv` | **Core** | Master data | Resource to department, tool, cost center, role |

## Origin and structure of the data
**Usage and volume values are synthetic** (generated with a random generator using fixed patterns). They are not measurements and not customer data. Where public data exist, they are built in (see above). The **structure** of the files is based on exports as they occur in practice. It does not follow these formats field by field, and prices, volumes and provider details are made up.

| File | Based on |
| --- | --- |
| `azure_costs.csv` | Azure Cost Management, cost and usage details (fields such as ResourceId, UnitOfMeasure, Quantity, CostInBillingCurrency, Tags): https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-mca |
| `aws_costs.csv` | AWS Cost and Usage Report, line item fields (line_item_*, product_*, resource_tags_user_*): https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-line-item.html |
| `hoster_invoice.csv` | Invoice details of a Swiss hoster. There is no standard format, hence no resource key. |
| `data_platform_usage.csv`, `data_platform_jobs.csv` | Databricks system tables (system.billing.usage, system.compute.clusters, node_timeline) and job runs: https://docs.databricks.com/en/admin/system-tables/billing |
| `data_catalog_tables.csv` | Metadata of a data catalogue (tables, size, last read and write time) |
| `powerbi_usage.csv` | Activity and refresh logs of a BI service |
| `ai_usage.csv`, `ai_invoice_monthly.csv` | Usage and billing overviews of AI providers and AI gateways (requests, tokens per model) |
| `ai_subscriptions.csv`, `saas_contracts.csv` | Licence and subscription management (seats, active users, price, currency) |
| `ai_agent_runs.jsonl` | Logs of agent observability tools (steps, tool calls, tokens per run) |
| `m365_usage.csv` | Usage reports from Microsoft 365 administration (active users, storage, Teams activity), simplified and weekly |
| `web_traffic.csv` | Hourly analysis of a CDN or web hoster (requests, data volume, bot share, errors) |
| `ci_pipeline_runs.jsonl` | Run logs of CI systems, for example GitHub Actions workflow runs (fields such as run_started_at, conclusion, run_attempt): https://docs.github.com/en/rest/actions/workflow-runs |
| `log_volume.csv`, `backup_chains.csv` | Reports from log and backup administration (volume, retention) |
| `server_inventory.csv`, `server_metrics_weekly.csv` | Server inventory (CMDB or the providers' resource list) and monitoring metrics (CPU, RAM, network) |
| `data_center_locations.csv` | The providers' location lists. The hoster is made up. |
| `it_tickets.csv` | Exports from a service management system (tickets with free text) |
| `provider_monthly_report.csv`, `exchange_rates.csv`, `headcount.csv`, `business_calendar.csv`, `mapping_departments_tools.csv` | Finance, HR and master data |

There is an open standard for comparing cloud invoices from different providers: FinOps Open Cost and Usage Specification (FOCUS), https://focus.finops.org. You may map your data to it.

## Allocating costs
Not every row has a project or a department. Possible attributes for allocation:
- **Cost center and department:** available in most sources, sometimes only via the master data.
- **Project:** only partly filled in many sources (tags, column `project_id`, `ProjectNumber`). The spelling is not the same everywhere. The project master data are in `projects.csv`.
- **Allocation key:** for costs without allocation (for example shared licences), you can use hours (`project_hours_monthly.csv`) or full-time equivalents (`headcount.csv`). Explain which rule you choose.
- **Further attributes** (not everywhere and not always reliable): environment (prod, test, dev), criticality, data class, retention obligation, contract end and notice period, report type, recharging to customers.

## Submission: baseline, assumptions and package of measures
Submit two tables:
1. **Baseline and assumptions** (`template_baseline_and_assumptions.csv`): your total consumption in the baseline year (costs, energy, location-based CO₂) and all factors you chose (electricity mix per location, energy per vCPU hour, node hour, GPU hour, GB, token and subscription message, PUE, allocation rule). For each row (for factors), enter a low, mid and high value, the source and the calculation. The column `must_or_bonus` shows which rows are required. Fill in rows marked «Bonus» (market-based view, growth for the forecast) only if you build that function.
2. **Package of measures** (`template_measures_package.csv`, one row per measure): effort in person-days, savings in CHF, kWh and CO₂ (location-based) per year, plus risks, exceptions, assumptions and sources. The market-based column is bonus.

**Baseline year:** September 2025 to August 2026.

**Target and budget apply against your own baseline.** The jury checks whether the source, range and calculation are correct and whether the package reaches the target. To keep the comparison between teams fair, it also recalculates every package against a uniform reference baseline. An artificially high baseline therefore brings no advantage. The example rows in the templates are placeholders only.

## Core sources: these 13 files cover the four must-have functions
They are directly in the main folder. You do not have to use the bonus sources in `extra/`.
- **Cloud:** `azure_costs.csv`, `aws_costs.csv`, `hoster_invoice.csv`, plus `data_platform_usage.csv` (shows when the data platform is actually working)
- **Servers:** `server_inventory.csv`, `server_metrics_weekly.csv`
- **AI:** `ai_usage.csv`, `ai_subscriptions.csv`
- **SaaS:** `saas_contracts.csv`
- **Connect:** `mapping_departments_tools.csv`, `exchange_rates.csv`
- **Know the limits:** `it_tickets.csv`, `business_calendar.csv`

The other 15 sources in the subfolder `extra/` (for example web, development, logs, backups, data catalogue, Power BI, AI agents) show further patterns and waste. They are bonus.

## Notes
- The sources are connected, but not every source has the same key. Look for common attributes (for example cost center, date, resource, label).
- **AI has three cost types:** fixed subscriptions per seat, tokens via APIs (per provider) and agents. They are not in the same source.
- Times, currencies, units and names are not the same everywhere. Check every source before you use it.
- Sources can contradict each other. Explain which one you trust.
- **Not every idle resource may be switched off.** Check the context before you recommend something.
- **Conversion factors** (electricity mix, energy per unit, energy per AI request or token) are not included. Research them yourselves, name the source and mark all values as estimates with a range. Calculate CO₂ location-based. The market-based view is bonus.
- Show your calculations.

## What you need to research or assume yourselves
These things are not in the data. Research them or make an assumption. Always name the source, give a range and show the calculation. All values count as estimates.
- **Electricity mix per location:** how much CO₂ is emitted per kWh at the locations used (location-based)? This is mandatory. For Switzerland there is the production mix and the consumption mix including imports. The difference is large. Explain your choice. What it looks like based on guarantees of origin (market-based) is bonus.
- **Energy per unit:** for example per vCPU hour, per node hour, per GB of storage, per GB of data traffic, per video minute, per token and per message in an AI subscription.
- **Data centre efficiency:** what do the providers' figures mean (for example PUE)? How far do you trust them?
- **Impact and effort of the measures:** how much energy, CO₂ and cost does a measure save, and how many person-days does it take?
- **Hourly electricity mix (bonus):** how much does the CO₂ value per kWh vary over the day at the locations used? You only need this if you want to shift loads in time.
- **Growth and forecast (bonus):** which assumptions do you make for the coming years, and how certain are they?
- **Shared costs:** which rule do you use to allocate costs that serve several departments (for example licences)?
- **Protection windows and exceptions:** what must not be touched? Some of this is in the free text of the tickets; some you have to derive from the patterns.
- **Rules and standards:** only state something about laws or standards with a source and date.

## Use of the data
- The usage and volume data are **synthetic** and describe a fictitious company. They are not customer or personal data.
- You may use them freely for the sprint, for learning and for your own prototypes, also after the sprint. Please cite the source: «Sample data ALTYCA, sprintd Basel 2026».
- The real data built in (exchange rates, public holidays, list prices) belong to their sources. Observe their terms (see «Real and synthetic data»).
- sprintd agrees the rights to your solutions with you.

## Possible public sources (check yourselves, observe the licence)
- Format of cloud invoices: FinOps Open Cost and Usage Specification (FOCUS), https://focus.finops.org
- Hourly CO₂ values of the Swiss electricity mix: University of Geneva, https://www.unige.ch/sysener/services/CO2
- European electricity data, also hourly: ENTSO-E Transparency Platform
- Energy of AI models: ML.ENERGY Leaderboard, https://ml.energy/leaderboard
