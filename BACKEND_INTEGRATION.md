# GreenOps OS backend integration

The Python backend lives in `backend/`. The application uses the same-origin `/api/v2` proxy. See [the production connection report](BACKEND_CONNECTION_REPORT.md) for authentication and proxy configuration.

## Implemented contract (`/api/v2`, `backend/frontend_api.py`)

| Frontend method | Route | Backend source |
| --- | --- | --- |
| getOverview | GET overview | baseline summary, filtered monthly ledger with market-based emissions and evidence, package risks |
| getBreakdowns | GET breakdowns | ledger grouped by department/provider/category/tool |
| getResources | GET resources | server inventory, weekly metrics, measure savings |
| getLocations | GET locations | ledger by region, grid factors |
| getFindings | GET findings | measure catalog + contradiction register |
| getMeasures | GET measures | measure catalog (`Reports.measures`) |
| simulate | POST simulation | catalog sums with scope/exclusive/requires/hard-blocker checks vs 25 % / 40 % / CHF / 15 PD |
| optimize | POST optimize | `Workspace.package` branch-and-bound (balanced→midpoint, cost→first-year, co2→conservative) |
| getForecast | GET forecast | monthly cost, energy and location emissions scenarios, plus an annual scenario for the evidenced residual-mix market scope |
| getDailyFootprint | GET metrics/daily | ledger by day; monthly invoices spread over the month, weekly metrics over 7 days (`allocated`) |
| getDataQuality | GET data-quality | sources, coverage, audit events, contradictions |
| getBonus | GET bonus | carbon replay, CI diagnostics, workload clusters, AI usage, unused seats |
| chat | POST chat | `assistant_router.route_question` (local rules, optional Apertus/OpenAI); follow-up context round-trips in `ChatMessage.context` |
| exportBaseline / exportMeasures | GET exports/baseline, POST exports/measures | `templates.tables` with the organizer templates |
| importFiles | POST imports | not supported over HTTP — restart backend with `--data` |

## Market-based CO₂e

- Overview history, daily footprint and breakdown rows carry `co2KgMarket`, `co2KgMarketRange` and `marketCoverage`. The monthly calculation is in `evidence.co2KgMarket`. A supported subtotal can be partial. Unavailable figures are `null`, while a sourced zero remains numeric.
- `marketCoverage` reports the share of modeled kWh covered, unknown-energy row counts, missing factor counts, uncovered regions, factor references and assumptions. Coverage excludes activity with unknown kWh from its denominator. `allocatedCoveredKwh` identifies covered activity spread across days from monthly or weekly inputs.
- Measures, simulation and optimization expose market-based savings only for evidenced effects. The response identifies partially covered and unavailable measures. Moves require comparable origin and destination evidence. Competition targets continue to use the location-based reduction and CHF savings.
- The market forecast compounds configured activity growth on covered residual-mix energy at fixed evidenced factors. It excludes dated supplier instruments because future renewal is unknown. Annual values carry the covered scope. The optimized path is `null` when a selection has no supported effect, and explicitly partial when only part of the selection is supported.

## Required response capabilities

- **Overview:** optional `co2Market` KPI with low/mid/high annual emissions, unit, calculation period, formula, factors and sources. Optional region, entity, coverage, missing inputs and procurement assumptions. Matching location/market periods, units and scopes are required for differences; these perspectives are never summed.
- **Monthly history:** one ordered record per month, backend-calculated monthly totals (`costChf`, `energyKwh`, `co2Kg`, optional `co2KgMarket`). Missing values are null/omitted, not zero. Optional metric-specific monthly calculation evidence, status and validated equivalent previous-period value/period. Annual evidence does not validate monthly observations.
- **Daily footprint / entity breakdown / resource summaries:** independently supplied market-based values at that granularity. An annual total does not enable daily, department, provider or resource results. Missing coverage disables corresponding selectors.
- **Simulation:** optional `savingsCo2KgMarket` from the authoritative scenario calculation. No copied location percentage or locally invented market factors. Existing location-based constraints remain the mandatory 40% target; costs 25%, effort 15 PD / CHF 16,500.
- **Forecast support:** overview `forecastSupport` lists supported metrics and ordered horizon choices. Forecast points supply `year`, optional ISO `date`, actual historical `observed`, separate baseline/optimized low/mid/high ranges, and `granularity`. Optional forecast-specific `methodology`, implementation timing and point coverage. Annual-only data remains annual. Monthly source points can be shown as monthly values, 3-month means (2/3-year view), or 6-month means (5-year view); incomplete groups are labeled, not filled.
- **Official CSVs:** existing export methods must return files with exactly the organizer headers in `templates.ts`. Optional annual market field: `total_co2_market_based_baseline_year_kg`; optional measure field: `savings_co2_kg_market_based`. Baseline queries remain Sep 2025–Aug 2026 regardless of display filters. Values/factors/provenance must be supplied by the backend; no client recomputation is introduced.
- **Copilot:** distinguish accounting methods and physical reductions, cite actual evidence, and identify missing inputs. Demo replies remain isolated and marked.

## Planning persistence

Per the existing frontend-only project architecture, the committed plan/settings persist on this device in the shared store. Live scenarios are temporary and never persisted as the Current Plan. Commit revalidates through `GreenOpsApi.simulate`, rejects stale contexts and blocked/unknown measures or exceeded limits, then writes storage before reporting success. Pending review is not approval or execution. Cross-device/backend plan persistence needs a future team contract; no endpoint has been invented.
