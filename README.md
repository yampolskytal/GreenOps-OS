# GreenOps OS

**[Open the live dashboard →](https://greenops-os.lovable.app/)**

GreenOps OS helps a CEO, CFO and IT manager decide which changes to cloud infrastructure, software subscriptions and AI usage are worth making. Built for the sprintd Basel Green AI challenge, it uses the same case data across all three dashboards so each role can trace a proposed saving back to its evidence.

## Try a planning session

1. **Start on the CEO dashboard.** Compare the cost and carbon targets with the recommended starting plan. Switch to CFO or IT Manager to inspect spending or resource usage behind the totals.
2. **Open Studio.** Change the budget or selection of measures and compare alternatives. Save an alternative as a Path to revisit it later.
3. **Adopt a Current Plan**, then open **Submission** to check and export the baseline and measures CSVs. Savings are projections for a fictional company; saving a plan on this device does not approve or execute infrastructure changes.

## Run locally

Use Node.js 22.12+ with npm and Python 3.11+ available as `python`. From the repository root, install the JavaScript dependencies once:

```sh
npm ci
```

**Terminal 1 — start the Python backend with the bundled challenge dataset:**

```sh
npm run backend
```

Wait for the backend at `http://127.0.0.1:8765`. If Python reports that `Europe/Zurich` is missing, run `python -m pip install tzdata` and restart it.

**Terminal 2 — start the web dashboard from the same repository root:**

```sh
npm run dev
```

Open **[http://127.0.0.1:8080](http://127.0.0.1:8080)**, or the local URL printed by Vite. Keep both terminals open: the dashboard forwards `/api/v2` requests to the Python process on port 8765. Press `Ctrl+C` in each terminal to stop. To explore the smaller demo dataset instead, use `npm run backend:demo` in terminal 1.

## Repository guide

| Location | What lives here |
| --- | --- |
| [`src/routes/`](src/routes/) and [`src/components/`](src/components/) | React and TanStack Start dashboards, planning tools and reports |
| [`src/lib/api/`](src/lib/api/) | Typed interface between dashboard views and the GreenOps API |
| [`backend/`](backend/README.md) | Python accounting, optimization, forecasts, CLI and classic dashboard |
| [`backend/inputs/`](backend/inputs/) and [`backend/templates/`](backend/templates/) | Case datasets and official export formats |
| [`docs/`](docs/README.md) | API contract, deployment notes, audits and project history |

## Development checks

| Command | Checks |
| --- | --- |
| `npm run typecheck` | TypeScript types |
| `npm run lint` | Lint and code style |
| `npm test` | Frontend unit and component tests |
| `npm run test:backend` | Python backend tests |
| `npm run build` | Production dashboard build |

**Dataset credit:** Sample data ALTYCA, sprintd Basel 2026. See the [organizer’s dataset and challenge brief](https://github.com/Fa-Bee/sprintd-basel-green-ai-data) for the data dictionary, example questions and submission requirements.
