# Basel Green AI

Project data and requirements

The complete public dataset and hackathon documentation are available here:

https://github.com/Fa-Bee/sprintd-basel-green-ai-data

Before building, try to access and review these files directly from the repository:

README.md

data_dictionary.md

example_questions.md

template_baseline_and_assumptions.csv

template_measures_package.csv

Use the README as the authoritative source for the hackathon requirements, the data dictionary for dataset structure, and the two CSV templates for the mandatory exports.

Also inspect the structure of the 13 core datasets and the 15 bonus datasets in the extra/ directory.

If you cannot directly access or read any of these files, explicitly tell me which ones you need. Do not pretend to have read inaccessible files.

The frontend connects to the GreenOps Python backend in `backend/` (merged from the team's `sprintd` project) through the `GreenOpsApi` HTTP adapter.

Start with the design system, role selection, CEO dashboard, CFO dashboard, IT Manager dashboard and shared navigation.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c6246f98-cd16-4e36-8da3-be9cc48e4088).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Running with the GreenOps backend

The backend (`backend/`, Python 3.11+, no third-party runtime dependencies; install `tzdata` if your OS lacks Europe/Zurich) serves the organizer's data and all calculations. The frontend reaches it at `/api/v2/*`, which the Vite dev server proxies to `http://127.0.0.1:8765` (override with `GREENOPS_BACKEND_URL`).

```sh
# terminal 1 – backend on the official case data (organizer files in backend/inputs/)
npm run backend          # or: npm run backend:demo  (representative demo dataset)

# terminal 2 – frontend
echo 'VITE_API_BASE_URL=/api/v2' > .env.local   # without it the UI uses the built-in DEMO adapter
npm run dev
```

`backend/frontend_api.py` maps the backend's workspace (ledger, measure catalog, optimizer, forecast, diagnostics, assistant) to the frontend contract in `src/lib/api/types.ts`. The backend's own CLI (export, validate, assistant-check) and its legacy dashboard keep working — see `backend/README.md`. Backend tests: `npm run test:backend`.
