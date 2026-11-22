# Contributing to GreenOps OS

Start with the [two-terminal setup](README.md#run-locally). Use the bundled challenge case when comparing dashboard figures so the inputs are reproducible.

## Where to make a change

| If you are changing… | Start here |
| --- | --- |
| A dashboard, chart or interaction | [`src/routes/`](src/routes/) and [`src/components/greenops/`](src/components/greenops/). Read values through `GreenOpsApi`; leave missing observations visibly unavailable. |
| A calculation or estimate | [`backend/`](backend/README.md). Add a Python regression test near the existing `test_*.py` files. |
| A field returned by the API | Update [`backend/engine/frontend_api.py`](backend/engine/frontend_api.py), then the [TypeScript contract and runtime schemas](src/lib/api/). See the [endpoint guide](docs/integration/api.md). |
| A saved setting or plan | [`src/lib/store.tsx`](src/lib/store.tsx). Check that switching roles and reloading preserve the selection. |

## Before opening a pull request

- Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` for dashboard changes. Run `npm run test:backend` for calculation or API changes. For a contract change, run both sets.
- Use `npm run format` to format application source. Keep organizer data and export templates out of formatting-only changes.
- Describe the behavior a reviewer can verify. For a chart or layout change, include the route, role and a screenshot. For a calculation change, identify the input and explain how the expected result changed.

The connected branch syncs to Lovable. Keep published history intact and make schema changes through the Lovable editor. See [project conventions](AGENTS.md) for generated files and integration details.
