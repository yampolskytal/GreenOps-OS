# First-time visitor experience — Preview only

## Delivered
- Fresh device storage opens the CEO workspace directly and requests a Balanced recommendation through the existing same-origin API adapter: CHF 16,500 budget, CHF 1,100/person-day (15-day budget equivalent), September 2025–August 2026, all departments/providers. No API contract, credentials, proxy or backend optimization changes.
- The backend response is persisted separately as **Recommended starting plan**, never as approved implementation or a committed plan. CEO, CFO, IT, Current Plan and forecasts use the same suggested selection for projections.
- Adoption uses the existing simulation/eligibility validation and explicit commitment flow. Customization opens the package in Studio. Existing Paths, official exports and independent market accounting remain intact; unadopted suggestions are not silently included in committed-plan exports.
- Compact preparation state hides empty savings/targets. Failure preserves baseline analysis and offers explicit Retry, with no demo fallback.
- Existing device records—including legacy empty plans—are conservatively treated as existing visitors. Saved settings, decisions, Paths and committed plans are never automatically replaced. A confirmed Clear plan action persists deliberate emptiness.
- One root initializer and shared optimizer query keys prevent repeat generation during navigation/role switches. Persisted suggestions survive refresh. An interrupted in-flight initialization requires explicit Retry after refresh rather than automatically submitting another calculation.

## Verification
- **119 automated tests passed**, including 16 new initialization/persistence/overwrite regressions. Latest Preview compilation: OK.
- Connected deployed backend exercised through localhost Preview; optimizer response matched persisted suggestion exactly. Observed initial package: **7 measures**, **CHF 116,517.16 annual savings**, **25.1% cost reduction**, **43.5% location-based CO₂ reduction**. These are observations, not hardcoded UI values.
- Browser flow verified fresh storage → loading → recommendation → explicit adoption → CEO/CFO/IT/forecasts → refresh → lower-budget custom plan → refresh → intentional clearing → refresh. No automatic overwrite; no runtime errors.
- Backend errors were simulated only for the optimizer request; baseline data still came from the connected backend. Explicit Retry returned a real recommendation.
- Both themes checked at 1440, 779, 390 and 320px. Actions fit without horizontal page overflow. Browser requests remained same-origin without Basic Authentication credentials.
- Teammates' concurrent accounting updates were incorporated; all tests and the full connected-backend adoption/customization/clearing flow passed again afterward.

## Review notes
- Test the new first-time experience in a private browser window or fresh device storage. Existing visitors intentionally retain their saved/empty plans.
- No publishing was requested or performed. The public site remains on its previously published version.