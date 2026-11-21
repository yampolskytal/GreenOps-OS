# Synthetic GreenOps upload package

This package was generated for testing the GreenOps/Lovable project. It follows the 13 core CSV schemas in the public `Fa-Bee/sprintd-basel-green-ai-data` repository.

- Period: 2025-09-01 to 2026-08-31 (the required baseline year)
- Seed: 260921 (deterministic)
- Company and activity values: entirely synthetic
- Currency, cost and usage values: illustrative only, not official factors
- Files: 13 core CSVs, UTF-8 with BOM

Intentional patterns for the dashboard to detect:

1. The development platform (`dp-dev`) runs 24 hours even on weekends with zero active use.
2. The GPU server (`gpu-ai`) is always on but has low GPU utilisation.
3. Test/POC and archive servers show low utilisation or stale access.
4. AI and SaaS subscriptions contain unused seats.
5. One Azure, one AWS and one hoster row have missing costs.
6. AI output tokens contain one missing value.
7. An AI subscription includes a Draft duplicate that should not be treated as final billing.
8. Protection windows and human approvals appear in `it_tickets.csv`.

Unzip the package and upload/select the CSV files. Keep the filenames unchanged.
