# Approvals audit: September 2025–August 2026 baseline

Scope: the September 2025–August 2026 official dataset in `backend/inputs/sprintd-basel-green-ai-data-main`, evaluated with `challenge-policy.json` as of 6 September 2026. Five of the original 29 entries were removed and four added, leaving 28. A candidate is a planning scenario requiring owner review; its savings are not measured rollout results. Estimates on overlapping scopes must not be added together.

Removed: the catalog does not identify the storage meter for its tables, so it cannot justify separate tiering decisions for `dp-storage`, `st-proj` or `m365`. The data dictionary identifies `web_traffic.csv` as CDN/hosting telemetry, not `net-egress`. `ai-agent2` is mapped to “Other agents”, which does not identify a specific agent in the run log.

| Decision | Resource | Result and evidence limit |
|---|---|---|
| Rightsize nonproduction VM | build-agent-old | Candidate. Headroom supports a smaller-VM pilot; no attributable CHF saving. Check build peaks and ownership. |
| Reduce idle runtime | dp-dev | Candidate. Timeout applies outside protected training; fixed or failed jobs need review. |
| Reduce idle runtime | dp-prod | Blocked. Idle time is not permission to stop production; closing and fixed jobs need availability. |
| Rightsize nonproduction VM | dr-failover | Blocked. Low load is expected for standby; the smaller configuration has not established failover capacity. |
| Schedule GPU on demand | gpu-ml | Candidate. Excludes training dates; test cold start and deadlines before treating the assumed removable hours as achievable. |
| Rightsize nonproduction VM | migration-alt | Candidate. Energy estimate only; verify nonproduction scope and RAM peaks. |
| Rightsize nonproduction VM | poc-ki-2024 | Candidate. Energy estimate only; confirm ownership and that the PoC still needs to run before resizing it. |
| Reduce retry waste | ai-agent | Investigate. Support-Agent runs and billed usage match by tool and date. Trace the incremental retry tokens before claiming savings. |
| Review scheduled AI reports that go unopened | ai-report | Investigate. Of 361 scheduled deliveries on dates with matching gateway usage, 329 were marked unopened. Confirm downstream use and Finance obligations before piloting a digest or on-demand delivery. |
| Consolidate backup processing | st-backup | Blocked. Retention and copy requirements take precedence over the hypothetical reduction. |
| Shorten log retention | logs | Candidate. Compare volume and retention to billed storage; preserve audit/authentication logs and confirm service requirements. |
| Reduce duplicate log ingestion | logs | Candidate. The 15% reduction is a pilot assumption, not a measured duplicate rate. Alternative to changing retention on this meter. |
| Reduce automated web traffic | web-cdn | Investigate. No endpoint attribution; establish eligible CDN traffic before claiming savings. |
| Relocate development workloads | dp-dev | Candidate. Exclude protected training dates from the standalone relocation estimate as well as the combined scenario. Energy use stays constant; destination price unverified. |
| Clean up unused seats | licences | Candidate. Financial only. Three months of activity, a seat buffer and notice-period checks bound the estimate. |
| Consolidate duplicate subscriptions | subscriptions | Candidate. Depends on the seat cleanup; uses incremental savings after replacement seats. Verify feature parity before cancellation. |
| Schedule Dublin test servers | vm-test | Candidate. Pooled allocation is inferred without owner attestation. Preserve release and patch windows. |
| Review temporary portal capacity | vm-test | Investigate. T-1058 planned to reverse the expansion after go-live, and August invoices still show the expanded load. Confirm go-live, worker ownership and failover before claiming any savings. This concerns machine size/count rather than the operating schedule. |
| Retire three abandoned VMs | orphan-vms | Candidate. Energy and emissions are modeled; unlinked bills provide no basis for a CHF claim. Check dependencies before retirement. |
| Retire stale sandboxes | stale-sandboxes | Candidate. Stale logins are a screening signal; only the allocated compute share is counted. Obtain owner confirmation. |
| Auto-terminate and relocate | dp-dev | Candidate. Apply the destination factor only to remaining eligible activity. Alternative to separately claiming timeout or relocation. |
| Autoscale production workers | dp-prod | Candidate for a capacity-floor pilot, distinct from stopping production. Keep closing, Sundays and uncertain jobs out of scope. |
| Negotiate production rate | dp-prod | Investigate. CHF 85,777.04 annual billed cost; savings unknown without an equivalent-service quote. |
| Negotiate development rate | dp-dev | Investigate. CHF 37,226.38 annual billed cost; same quote requirement. |
| Resize Power BI capacity | pbi-kap | Investigate. CHF 23,225.31 annual billed cost. Obtain a comparable quote and test peak refresh, audit report pbi-07 and rollback. No energy or emissions change is assumed. |
| Pilot daily refresh for Marketing campaigns 2024 | pbi-06 | Investigate. 17,280 refreshes and 8 recorded views across 360 observed days. Confirm downstream freshness requirements before the pilot; measure capacity load. Attribute any eventual billing change only to the capacity resize. |
| Investigate portal end-to-end test reruns | portal-e2e | Investigate. 472 accepted rerun records after exact duplicate removal, all successful. Team-portal should trace original runs to identify recurring faults; the log does not establish that retries can be skipped. |
| Route AI calls and cache prefixes | ai-gateway | Candidate. Uses the higher modeled saving per workload, not the sum of two overlapping techniques. Verify quality, tariffs and cache isolation. |
