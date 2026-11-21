<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- All data flows through `GreenOpsApi`; the active adapter uses the same-origin `/api/v2` server proxy with no demo fallback, so credentials and authoritative calculations remain server-side.
- Shared cross-view state (role, filters, date range, dataset, plan, budget) lives in `src/lib/store.tsx`, persisted to localStorage — so role switches never reset selections.
- `src/lib/optimizer.ts` is a demo stand-in for backend optimization; the backend stays authoritative.
- CSV export headers live only in `src/lib/api/templates.ts` and must match the organisers' templates exactly.
- Explore and Data routes consolidate analytical and report tabs; legacy paths remain reachable without restoring a map, so existing links do not break.
- Calculations live in the Python backend under `backend/`; the TypeScript frontend never imports raw datasets. `backend/frontend_api.py` is the only place that maps backend structures to `types.ts` — change field mapping there, not in UI components.

- Imported visualization engines take adapter data only and resolve theme tokens before canvas painting; missing cells stay visibly distinct, so rendering never invents analytical values.
- Planning has a separate first-visit suggestion, committed Current Plan and up to three Paths (no preview basket); persisted initialization guards legacy/cleared state, shared optimizer queries deduplicate requests, and only validated explicit commits replace the plan.
- Official exports use the fixed baseline query and cache prepared files against the plan/query context, so display filters and stale files cannot alter a submission.
- Prebundle route-only React hook libraries at startup and reject outdated optimizer requests, so hot reload cannot mix React dispatchers from different dependency generations.

- Year and month footprints share the original skyline renderer with a tested calendar geometry model; legends derive their ranges from the exact visible metric values, so period and metric changes cannot display stale scales.
- Shared historical charts and forecast fans consume supplied observation granularity; aggregation only averages actual monthly points, so annual endpoints cannot invent finer observations.
- Analytical inspectors and the assistant share a non-modal side-by-side dock from 768px, with the CSS and matchMedia breakpoint kept identical; smaller phones use Analysis/Details so evidence never overlays actionable content.
- Optional market emissions and provenance remain unavailable at unsupported levels and are never derived from location reductions, so alternate accounting stays independent of mandatory targets.
- Saved alternative scenarios use the shared persisted store independently of the temporary Studio preview and committed plan; each comparison calls GreenOpsApi.simulate, so alternatives never mutate the plan or invent aggregate savings.
- Studio recommendations recompute automatically using a budget debounce and settings-keyed queries; saved Paths and Current Plan never follow generator updates.
- HTTP provider responses pass runtime schemas before reaching views; invalid required calculations become errors while nullable observations remain unavailable, so real mode never substitutes demo results.
- Charts measure their available container, keep legends in normal document flow and use source timestamps; annual model totals never share an axis with monthly observations, preventing unit mismatches and clipped labels.
- Compare Paths and Forecasts share one scenario chart fed by `scenario-series.ts`: monthly history from Overview.monthly, per-selection provider forecasts, annual forecasts as yearly monthly averages only, so no quarterly or historical values are invented.
- CSV previews use Papa Parse for quoted fields and remain provisional header checks, so valid CSV quoting is not mistaken for a successful full import.

- Demo exception decisions persist in the shared store, preserve original restrictions and only affect a demo planning adapter; real provider authorization and errors are never bypassed.
- Current Plan saving validates calculation integrity and operational eligibility separately from numerical compliance; over-limit strategies remain explicit local proposals, not submissions.
- Comparison tracks occupy a shared full-width grid row independently of labels and icons; rendered bounds must match within one pixel.
- Path-result links use stable Path hashes and an origin-local open event; opening an existing Path never changes membership or Current Plan.
- Management DEMO risk links use explicit recommendation IDs; Studio always reveals the linked measure despite browsing filters, without changing saved selections.
- Switching inspector triggers updates the active dock directly; outside-click dismissal excludes other inspector triggers to prevent close/reopen layout jumps.
- Inspectors opened inside a dock use its local detail stack and preserve the parent content, so nested details cannot unmount their own trigger or leave an empty panel.
- Footprint ranges use the tested inclusive `footprint-range.ts` filter on supplied daily rows while planning uses the fixed official query; historical domains and selected-month summaries consume supplied values only.
- The proxy reads saved Basic credentials inside its handler, pins the approved HTTPS origin, allows only bounded analytical endpoints and blocks imports/persisted writes; per-instance limits are best-effort, so public access never grants operational authority.
