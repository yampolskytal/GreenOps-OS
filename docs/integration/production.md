# Production backend connection

Published and verified on 21 November 2026 at https://greenops-os.lovable.app.

## Implementation
- The existing GreenOpsApi adapter now uses the same-origin `/api/v2` proxy, never silently falling back to demo data.
- The proxy reads the three saved GREENOPS_BACKEND secrets only inside its server handler and authenticates requests upstream with HTTP Basic Authentication.
- The approved upstream origin is pinned to `https://greenops-os-v5-4.onrender.com`. Arbitrary destinations, redirects, operational writes, rebuilds, approvals and imports are not allowed.
- GET/POST methods, supported query parameters, valid JSON bodies and successful JSON response data/statuses are preserved. Upstream failure statuses are preserved with sanitized messages; redirects and invalid responses become safe gateway errors.
- JSON requests are bounded to 64 KiB and responses to 8 MiB. Upstream timeout is 90 seconds.
- User-approved best-effort per-instance limits: 120 GETs, 20 analytical POSTs and 6 chat POSTs per minute per visitor. They are not a distributed global guarantee and reset when an instance restarts.
- Cross-site POSTs are refused. Browser cookies, authorization and Origin are not forwarded upstream. Responses are not cached.
- Existing layouts and source-data semantics remain intact; existing calendar type errors were corrected without changing its geometry or scales.

## Verified endpoints
All returned HTTP 200 through the proxy in both preview and the published application:

| Method | Endpoints |
| --- | --- |
| GET | overview, breakdowns, resources, locations, findings, measures, forecast, metrics/daily, data-quality, bonus, exports/baseline |
| POST | simulation, optimize, chat, exports/measures |

The production overview returned baseline annual cost **CHF 463,658.02** from the backend response, not a frontend constant.

Browser verification covered all eleven analytical/planning/report pages in preview and production baseline, generator, nested measure details and assistant replies. Export preparation succeeded. No runtime errors were observed in the exercised flows.

Browser API calls remained same-origin with no Basic Authentication credentials. Forty-three loaded production JavaScript asset responses were checked for backend authorization material and server-secret identifiers; none were found. The source was also reviewed for handler-only credential reads and sanitized errors. Private backend credentials are not stored in project source or the generated public configuration.

Security checks returned the expected failures for imports (404), cross-site POSTs (403), invalid JSON object fields (400), and oversized request bodies (413). All **103 automated tests** passed. The latest preview build reported OK.

## Incomplete or intentionally restricted
- Public imports remain blocked. The team's newly synchronized backend code now supports administrator-only uploads, but enabling that flow safely requires an authenticated administrator connection; this task does not expose shared administrator authority to anonymous visitors.
- Current Plan and Paths keep their existing device-local persistence. Calculations use the deployed backend; centralized plan persistence/approval records were not added.
- Authentication-failure and timeout handling were implemented and reviewed; actual backend cold starts or credential failures were not deliberately induced against production.
- API rate limits remain best-effort, as approved. Reliable distributed abuse protection requires upstream/platform support.
- The dependency scan was current and had no findings; other available scan results were stale. A fresh broader security scan is recommended before broad sharing.