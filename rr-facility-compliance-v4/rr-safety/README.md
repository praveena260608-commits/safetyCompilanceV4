# Rolls-Royce Facility Compliance
React (Vite) + ASP.NET Core 8 API + SQL Server + Azure Blob Storage.
## Run
Needs .NET 8 SDK, Node 20+, SQL Server (LocalDB ok), Azurite or an Azure Storage connection string.
1. `cd api && dotnet run`  (creates DB, seeds the 6 checklists; API on :5080)
2. `cd web && npm install && npm run dev`
## Why this stack
- React: same frontend framework the team already builds with.
- .NET (ASP.NET Core): matches our backend stack; deploys with everything else we run.
- SQL Server: already managed and backed up by us; relational data fits asset -> inspection -> approval.
- Azure Blob Storage: we are an Azure shop; photos stay in one ecosystem. SQL stores only the blob name.
## Why it is built this way
- Checklists are data (6 Excel sheets -> 6 templates in api/Seed/seed.json), so management can change them without code changes.
- Each checklist has its own frequency (2h / daily / weekly / monthly); overdue is calculated per frequency.
- Roles: `@check.com` email = Inspector (scan + submit); `@rolls-royce.com` = view only. The API enforces this via an X-User header, which is prototype-only and spoofable; production replaces it with company SSO (Microsoft Entra ID) claims.
- Submitting = sign-off: history shows 'Checked by <name> + timestamp' and whether it was QR or Manual. No separate approval step.
- Status follows the paper sheets' calendar periods: compliant = checked this period; due = period running, unchecked; overdue = a period ended unchecked; new equipment shows Not yet inspected.
- QR tags (`SITESAFETY::<code>`) open the right checklist; print them from the QR Codes tab.
## Assumptions / not done yet
WLD seeded as 9th & 8th floor x Hub Room-1/2; locations marked TBC; items marked [confirm wording] were cut off in screenshots. Not done: login/roles (Entra ID), EF migrations, PDF export, Azure deployment.

Sample inspections (by sample.data@check.com) are seeded so the demo history is not empty; delete them before real use. Schema is created with EnsureCreated, so drop the RRSafety database once after upgrading.

## Demo mode
If the API is not reachable, the web app runs in demo mode (same rules, data in the browser, sample history included) and shows a notice, so it can be shown without the server.
