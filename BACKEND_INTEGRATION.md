# GreenOps OS V4 backend handoff

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
