# Hiring Signals by Company Domain

Give it a list of company domains. For each one you get a single row that says whether the company is hiring, how many roles are open, and which teams are growing. It also shows how senior the roles are, where they are based, the remote share and how many roles were posted in the last 7 and 30 days. The data comes from the company's public Greenhouse, Lever, Ashby, Workable or Recruitee job board.

Built for sales, recruiting and investor workflows where the input is a list of domains and the question is "who is hiring for what right now?"

## What can Hiring Signals by Company Domain do?

- **Finds the job board for you.** It reads the company's homepage and careers page (respecting robots.txt), follows the link to the ATS, and reads jobs through the ATS's official public job-board API. If no board is linked, it tries the domain name on each ATS. Each row shows how the board was found (`detectedVia`) and how sure the match is (`matchConfidence`).
- **Turns open roles into signals.** `scaling_sales`, `building_engineering`, `investing_in_data_ai`, `growing_marketing`, `expanding_customer_success`, `hiring_leadership`, `international_expansion`, `remote_friendly`, `hiring_surge_last_30_days`, `high_volume_hiring`.
- **One row per domain, always.** If no board is found, the site is down, the ATS isn't supported (for example Workday) or the input is invalid, you still get a row with a clear `status` and `error`. Those rows are free.
- **Chains with other Actors.** Pass a `datasetId` from a Google Maps, lead-list or company-enrichment run and it reads the domains from that dataset.

## What data does it return?

| Field | Example |
|---|---|
| `domain`, `status` | `stripe.com`, `ok` |
| `isHiring`, `openJobs`, `hiringIntensity` | `true`, `412`, `very_high` |
| `signals` | `["scaling_sales","hiring_leadership"]` |
| `jobsByFunction`, `topFunction` | `{"engineering":180,"sales":90,...}`, `engineering` |
| `jobsBySeniority`, `leadershipRoles` | `{"senior":120,...}`, `["VP Sales, EMEA"]` |
| `postedLast7Days`, `postedLast30Days`, `medianJobAgeDays` | `14`, `60`, `41` |
| `topLocations`, `countries`, `remoteShare` | `[{"name":"Dublin","count":30}]`, `["US","IE"]`, `0.25` |
| `topDepartments`, `salaryDisclosedShare` | `[{"name":"Engineering","count":150}]`, `0.4` |
| `ats`, `boardUrl`, `matchConfidence`, `detectedVia` | `greenhouse`, `https://job-boards.greenhouse.io/stripe`, `high`, `careers_page_link` |
| `sampleJobs` | the newest roles, with title, department, location, posting date and URL |

**Statuses:**

- `ok`: hiring.
- `not_hiring`: a board was found but it has 0 open roles.
- `no_public_board_found`: if a board with the same name exists but nothing links it to this domain, the row includes a `possibleBoard` hint.
- `unsupported_ats`: the careers site uses an ATS this Actor doesn't read yet, such as Workday or SmartRecruiters. Workday rows include a `workdayUrl`.
- `site_unreachable`, `not_a_company_domain`, `invalid_input`, `error` and `skipped_charge_limit`.

## How much does it cost?

You pay per domain where a job board was found (`ok` or `not_hiring`):

| Plan | Per 1,000 domains |
|---|---|
| Free | $5.00 |
| Bronze | $4.50 |
| Silver | $4.00 |
| Gold | $3.50 |

All other rows are **free**, including no board found, unsupported ATS, unreachable site and invalid input. There is also a tiny Apify start fee of $0.00005 per run. 100 domains cost at most $0.50, whatever the size of each company.

## Input example

```json
{
  "domains": ["stripe.com", "notion.so", "https://ramp.com", "jane@figma.com"],
  "sampleJobsPerDomain": 5
}
```

## Output example

```json
{
  "domain": "linear.app", "status": "ok", "isHiring": true, "openJobs": 34, "hiringIntensity": "high",
  "signals": ["scaling_sales", "building_engineering", "international_expansion", "remote_friendly"],
  "topFunction": "engineering", "jobsByFunction": {"engineering": 14, "sales": 6, "design": 3},
  "postedLast30Days": 10, "remoteShare": 0.7, "ats": "ashby", "boardUrl": "https://jobs.ashbyhq.com/linear",
  "matchConfidence": "high", "detectedVia": "careers_page_link"
}
```

A domain with no board:

```json
{"domain": "acme-bakery.com", "status": "no_public_board_found", "isHiring": null, "error": "No Greenhouse, Lever, Ashby, Workable or Recruitee board was found for this domain..."}
```

## Use cases

- **Sales triggers:** find accounts that are hiring SDRs, RevOps or a new VP of Sales. A new leader usually buys new tools.
- **Recruiting and staffing:** find companies hiring heavily in your niche, such as data or engineering.
- **Investors and market research:** compare hiring velocity across a portfolio or a list of competitors.
- **Lead scoring:** add `openJobs`, `hiringIntensity` and `signals` to a CRM or Clay table.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can find and run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/hiring-signals-by-domain"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/hiring-signals-by-domain` and `APIFY_TOKEN` set.

Example prompts:

- "Which of these 50 domains are hiring salespeople right now?"
- "Is ramp.com hiring, and for which teams?"
- "Rank my target accounts by how many roles they posted in the last 30 days."

Minimal input: `{"domains": ["stripe.com"]}`.

**Cap the cost:** pass `maxTotalChargeUsd` when you call the Actor. The run stops cleanly at the cap, keeps the results so far, and lists the unchecked domains as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the Python or JavaScript client, Make, Zapier or n8n. To chain it, pass `{"datasetId": "<another run's dataset>"}`. When this Actor runs as an integration after another Actor, it uses the triggering run's dataset automatically. The OUTPUT record holds a run summary (`byStatus`, `bySignal`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Is it legal?** It reads public job postings through the ATS vendors' public job-board APIs, which exist so that companies can publish their jobs. Company websites are read only where robots.txt allows it.

**Why did a company come back `no_public_board_found`?** Either the company isn't hiring through a public board, or it uses an ATS this Actor doesn't read yet. If the careers page links to Workday, SmartRecruiters, BambooHR and similar, the row says so (`unsupported_ats`).

**How accurate is the match?** `high` means the board is linked from the company's own site, or the job URLs or company name match the domain. `medium` means the board name equals the domain name and no other company name contradicts it. Boards that only share a name are not used unless you set `includeLowConfidence`.

## Related tools

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): every open role, with full descriptions, from the same ATS boards.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): for companies on Workday.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): emails, socials and tech from company sites.
- [Email Provider Detector](https://apify.com/swillz/email-provider-detector): Google Workspace or Microsoft 365, plus email security.
