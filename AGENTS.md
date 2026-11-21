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

- All data flows through the `GreenOpsApi` interface (`src/lib/api/types.ts`); `client.ts` uses the demo adapter unless `VITE_API_BASE_URL` is set (`/api/v2` for the bundled backend, proxied by Vite) — so the backend replaces demo data without touching UI.
- Shared cross-view state (role, filters, date range, dataset, plan, budget) lives in `src/lib/store.tsx`, persisted to localStorage — so role switches never reset selections.
- `src/lib/optimizer.ts` is a demo stand-in for backend optimization; the backend stays authoritative.
- CSV export headers live only in `src/lib/api/templates.ts` and must match the organisers' templates exactly.
- Explore and Data routes consolidate analytical and report tabs; legacy paths remain reachable without restoring a map, so existing links do not break.
- Calculations live in the Python backend under `backend/`; the TypeScript frontend never imports raw datasets. `backend/frontend_api.py` is the only place that maps backend structures to `types.ts` — change field mapping there, not in UI components.

- Imported visualization engines take adapter data only and resolve theme tokens before canvas painting; missing cells stay visibly distinct, so rendering never invents analytical values.
- Studio settings and manual selections remain a temporary debounced GreenOpsApi preview; only validated explicit commits persist the shared plan, so experiments never mutate saved selections.
- Official exports use the fixed baseline query and cache prepared files against the plan/query context, so display filters and stale files cannot alter a submission.
- Prebundle route-only React hook libraries at startup and reject outdated optimizer requests, so hot reload cannot mix React dispatchers from different dependency generations.

- Year and month footprints share the original skyline renderer with a tested calendar geometry model; legends derive their ranges from the exact visible metric values, so period and metric changes cannot display stale scales.
- Shared historical charts and forecast fans consume supplied observation granularity; aggregation only averages actual monthly points, so annual endpoints cannot invent finer observations.
- Analytical inspectors and the assistant share a non-modal dock on wide screens and an Analysis/Details view on narrow screens, so evidence never overlays actionable content.
- Optional market emissions and provenance remain unavailable at unsupported levels and are never derived from location reductions, so alternate accounting stays independent of mandatory targets.
- Saved alternative scenarios use the shared persisted store independently of the temporary Studio preview and committed plan; each comparison calls GreenOpsApi.simulate, so alternatives never mutate the plan or invent aggregate savings.
- Studio optimization runs only through explicit generation and loading; manual settings recalculate selected measures through simulation, so tuning a scenario cannot silently replace user choices.
- HTTP provider responses pass runtime schemas before reaching views; invalid required calculations become errors while nullable observations remain unavailable, so real mode never substitutes demo results.
- Charts measure their available container, keep legends in normal document flow and use source timestamps; annual model totals never share an axis with monthly observations, preventing unit mismatches and clipped labels.
- Studio initializes committed settings after persisted state hydration; full-page reloads cannot replace saved selections with an empty preview.
- CSV previews use Papa Parse for quoted fields and remain provisional header checks, so valid CSV quoting is not mistaken for a successful full import.
