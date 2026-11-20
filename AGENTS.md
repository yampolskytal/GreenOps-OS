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
- All data flows through the `GreenOpsApi` interface (`src/lib/api/types.ts`); `client.ts` uses the demo adapter unless `VITE_API_BASE_URL` is set — so the teammates' backend replaces demo data without touching UI.
- Shared cross-view state (role, filters, date range, dataset, plan, budget) lives in `src/lib/store.tsx`, persisted to localStorage — so role switches never reset selections.
- `src/lib/optimizer.ts` is a demo stand-in for backend optimization; the backend stays authoritative.
- CSV export headers live only in `src/lib/api/templates.ts` and must match the organisers' templates exactly.
- Leaflet map is loaded lazily behind `<ClientOnly>` (browser-only library).
- No backend and no raw dataset import in this frontend — calculations belong to the separate team backend.
