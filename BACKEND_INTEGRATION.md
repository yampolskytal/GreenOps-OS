# GreenOps OS V4 backend integration

The team backend now lives in `backend/` (merged from `sprintd`). Run it with `npm run backend` and set `VITE_API_BASE_URL=/api/v2`; Vite proxies `/api` to `http://127.0.0.1:8765`.

## Implemented contract (`/api/v2`, `backend/frontend_api.py`)

| Frontend method | Route | Backend source |
| --- | --- | --- |
| getOverview | GET overview | summary figures, ledger by month (filtered), package risks |
| getBreakdowns | GET breakdowns | ledger grouped by department/provider/category/tool |
| getResources | GET resources | server inventory, weekly metrics, measure savings |
| getLocations | GET locations | ledger by region, grid factors |
| getFindings | GET findings | measure catalog + contradiction register |
| getMeasures | GET measures | measure catalog (`Reports.measures`) |
| simulate | POST simulation | catalog sums with scope/exclusive/requires/hard-blocker checks vs 25 % / 40 % / CHF / 15 PD |
| optimize | POST optimize | `Workspace.package` branch-and-bound (balanced→midpoint, cost→first-year, co2→conservative) |
| getForecast | GET forecast | `bonus.forecast` 3-year scenarios (annual; market forecast unsupported) |
| getDailyFootprint | GET metrics/daily | ledger by day; monthly invoices spread over the month, weekly metrics over 7 days (`allocated`) |
| getDataQuality | GET data-quality | sources, coverage, audit events, contradictions |
| getBonus | GET bonus | carbon replay, CI diagnostics, workload clusters, AI usage, unused seats |
| chat | POST chat | `assistant_router.route_question` (local rules, optional Apertus/OpenAI); follow-up context round-trips in `ChatMessage.context` |
| exportBaseline / exportMeasures | GET exports/baseline, POST exports/measures | `templates.tables` with the organizer templates |
| importFiles | POST imports | not supported over HTTP — restart backend with `--data` |

Known gaps: market-based monthly/daily/forecast values (backend market coverage is partial), monthly forecast granularity, backend plan persistence for the frontend's Current Plan.

---

## Original handoff notes


No actual backend contract or base URL has been supplied. All currently visible company numbers remain DEMO. No independent backend, new endpoint or raw dataset import was added.

## Existing boundary

`GreenOpsApi` remains the only data boundary. `createHttpApi` contains the pre-existing **proposed**, unconfirmed endpoint paths. Do not treat them as an implemented team contract. Once the team supplies its contract, map its actual field names in that adapter, never in the UI. Real mode must not fall back to demo fields on partial responses.

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

## Connected versus unavailable

Connected now: UI → existing demo adapter, shared-device plan persistence, exact-template DEMO export preparation (downloads blocked).

Awaiting team contract: all authoritative company analytics; market methodology/procurement evidence; daily/monthly market data; market scenario effects; supported monthly forecast points; source-specific monthly/forecast evidence; backend plan persistence and approval records.
