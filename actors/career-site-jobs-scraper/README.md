**Career Site Jobs Scraper** extracts **open job postings directly from company career sites** hosted on **Greenhouse, Lever, Ashby, Workable and Recruitee**, and exports them to **CSV, JSON or Excel**. For every job you get the title, department, team, location, remote/hybrid flag, **salary range** (when published), posted date, full description and the apply link.

Just paste company names or job-board URLs. The actor reads each ATS's **official public job-board API** (the same feed that powers the company's own careers page), so it's fast, accurate and doesn't break when page layouts change: **1,000 jobs take a few seconds and cost $2 or less**. No login, no browser, no proxy.

**When to use:** you need the open jobs of specific companies that hire through Greenhouse, Lever, Ashby, Workable or Recruitee.
**Input:** board names or URLs, e.g. `{"companies":["stripe","https://jobs.lever.co/spotify"]}`.
**Output:** one row per job with title, department, location, remote, salary, posted date, description and apply URL. From $1.30 per 1,000 jobs.

## What can Career Site Jobs Scraper do?

- 🏢 **Scrape any company's careers page** on Greenhouse, Lever, Ashby, Workable or Recruitee. Thousands of tech companies and startups (Stripe, Spotify, Ramp, Hugging Face, Notion, OpenAI and more) use these ATSs.
- 🔍 **Auto-detects the ATS.** Type just `stripe` and the actor finds which platform the company uses. Or paste the job-board URL.
- 💰 **Salary data** from the ATS's structured pay fields (Ashby, Lever, Recruitee) plus pay ranges detected in the description (e.g. US pay-transparency ranges on Greenhouse).
- 🎯 **Filters:** job title keywords (include/exclude), location, department, remote only, posted since.
- 🔁 **Monitor new openings.** Schedule it daily with *Posted since* = `1 day` to get every new job at your target accounts or competitors.
- 📈 **Hiring signals for sales and recruiting.** See which companies are hiring for which teams, where, and at what pay.
- ⚡ **Reliable by design.** Official public APIs, automatic retries, polite rate limits, and a loud failure (never a silent empty run) if an API ever changes.

## What data can you extract?

| Field | Example |
|---|---|
| `companyName`, `companySlug`, `ats` | Ramp, `ramp`, `ashby` |
| `title`, `department`, `team` | Security Engineer, Cloud · Engineering · Backend |
| `location`, `locations`, `country` | New York, NY (HQ) · [Remote (US), Miami, FL] · USA |
| `remote`, `workplaceType`, `employmentType` | `true` · `hybrid` · FullTime |
| `salaryText`, `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryInterval` | $211.4K - $290.6K · 211400 · 290600 · USD · year |
| `postedAt`, `updatedAt` | `2026-10-16T11:13:03.220Z` |
| `jobUrl`, `applyUrl`, `boardUrl` | Direct links to the posting, the application form and the careers page |
| `descriptionText` (`descriptionHtml` optional) | Full job description |
| `jobId`, `scrapedAt` | Stable ATS job ID and scrape time |

## How to scrape company career sites (step by step)

1. Click **Try for free** and sign in to Apify (free plan, no card needed).
2. In **Companies**, paste board names (e.g. `stripe`, `notion`) or job-board URLs, one per line.
3. Optional: add title keywords (e.g. `engineer`, `account executive`), a location, *Remote only*, or *Posted since* = `7 days`.
4. Click **Start**. Download the jobs as CSV, Excel or JSON, or open them in the table view.

**How to find a company's board name:** open the company's careers page and click a job. If the link goes to `job-boards.greenhouse.io/NAME`, `jobs.lever.co/NAME`, `jobs.ashbyhq.com/NAME`, `apply.workable.com/NAME` or `NAME.recruitee.com`, then `NAME` is the board name. Or paste that link directly.

**Same name on two ATSs?** Board names are only unique within one ATS. For example, `ramp` on Greenhouse is a different organisation with a single posting, while Ramp's real board is on Ashby. With a bare name, the actor checks all five ATSs and uses the board with the most open jobs. It logs a warning and lists the other matches in the run summary (`alsoFoundOn`). To choose a board yourself, paste its URL or pin the ATS with a prefix: `ashby:ramp`, `greenhouse:stripe`, `lever:spotify`, `workable:huggingface` or `recruitee:bunq`.

## How much does it cost?

This actor uses **pay-per-result pricing**: **$1.30-2.00 per 1,000 jobs** saved (by Apify plan), plus a tiny $0.00005 per run start. Jobs that you filter out are free. There are no monthly fees and no compute or proxy charges on top.

| Apify plan | Per 1,000 jobs | 10,000 jobs |
|---|---|---|
| Free | $2 | $20 |
| Starter | $2 | $20 |
| Scale | $1.60 | $16 |
| Business and up | $1.30 | $13 |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold).

Apify's **free plan includes $5 of monthly credit**, which covers about **2,500 jobs a month for free**. You can set a maximum cost per run, and the actor stops cleanly when it reaches it.

## Input example

```json
{
  "companies": ["stripe", "https://jobs.lever.co/spotify", "https://jobs.ashbyhq.com/ramp"],
  "titleKeywords": ["engineer", "data"],
  "locationKeywords": ["Remote", "New York"],
  "postedSince": "14 days"
}
```

## Output example

```json
{
  "ats": "ashby",
  "companySlug": "ramp",
  "companyName": "Ramp",
  "jobId": "34413f8d-26bf-4bbc-8ade-eb309a0e2245",
  "title": "Security Engineer, Cloud",
  "department": "Engineering",
  "team": "Backend",
  "location": "New York, NY (HQ)",
  "locations": ["New York, NY (HQ)", "Remote (Canada)", "Remote (US)", "Miami, FL"],
  "country": "USA",
  "remote": true,
  "workplaceType": "hybrid",
  "employmentType": "FullTime",
  "salaryText": "$211.4K - $290.6K",
  "salaryMin": 211400,
  "salaryMax": 290600,
  "salaryCurrency": "USD",
  "salaryInterval": "year",
  "postedAt": "2026-04-07T17:12:35.753Z",
  "jobUrl": "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
  "applyUrl": "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application",
  "boardUrl": "https://jobs.ashbyhq.com/ramp",
  "descriptionText": "ABOUT RAMP\n\nRamp is building the smart infrastructure for finance teams…",
  "scrapedAt": "2026-10-23T08:38:40.523Z"
}
```

A run summary (which ATS each company uses, jobs found vs saved, any errors) is saved to the `OUTPUT` record in the key-value store.

## Use cases

- **Sales prospecting (hiring signals):** companies hiring SDRs, data engineers or security staff are likely buyers. Feed new openings into your CRM.
- **Recruiting and talent intelligence:** track openings, pay ranges and locations at competitors.
- **Job boards and newsletters:** build a niche job board (remote, AI, climate…) from direct career-site postings, not reposts.
- **Market and labor research:** salary bands by role and city, team growth, remote vs on-site trends.
- **Investors:** monitor portfolio and target companies' hiring velocity.

## How to monitor new job openings

1. Save your input with *Posted since* = `1 day` (or `7 days` for weekly).
2. Open **Schedules** in Apify Console and run the task daily.
3. Add an integration (Slack, email, Google Sheets, webhook) to receive each day's new jobs.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can find and run this Actor through the [Apify MCP server](https://mcp.apify.com). Add it to Claude Desktop, Cursor, VS Code or any MCP client:

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/career-site-jobs-scraper"}}}
```

Or run it locally: `npx -y @apify/actors-mcp-server --tools swillz/career-site-jobs-scraper` with `APIFY_TOKEN` set. In n8n or Make, use the Apify node with Actor `swillz/career-site-jobs-scraper`.

Example prompts:

- "Is Stripe hiring backend engineers in London?"
- "List remote data jobs at Ramp, Notion and Figma posted this week"
- "Export all Spotify openings to a spreadsheet"

Minimal input:

```json
{"companies": ["stripe"], "titleKeywords": ["engineer"], "maxJobs": 100}
```

**Keep it fast:** Set `maxJobs` to 50–200 and use `titleKeywords` / `locationKeywords` filters. Companies with no matching jobs return a free status row with the reason (e.g. "120 open jobs found, 0 matched your filters").

**Cap the cost:** pass `maxTotalChargeUsd` ("Maximum cost per run") when you call the Actor. The run stops cleanly at the cap, keeps the results so far, and says why in the status message and the OUTPUT record.

## Send results to Google Sheets automatically

Every run saves the exact next step in its `OUTPUT` record (`nextSteps`). To make it automatic, open your saved Task → *Integrations* tab → *Add integration*, pick [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export), set your `spreadsheet` URL, set `datasetId` to `{{resource.defaultDatasetId}}` and trigger it when the run succeeds. The new jobs land in your sheet after every scheduled run, for $0.01 per 1,000 rows.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/career-site-jobs-scraper`.
- **API:** `POST https://api.apify.com/v2/acts/swillz~career-site-jobs-scraper/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns the jobs directly. JavaScript and Python clients are available.
- **AI agents (MCP):** connect `https://mcp.apify.com?tools=swillz/career-site-jobs-scraper` to Claude, Cursor or any MCP client and ask, for example, "list Ramp's open engineering jobs with salaries".

## Career Site Jobs Scraper vs alternatives

| | This actor | LinkedIn / Indeed scrapers | Manual |
|---|---|---|---|
| Source | Company's own ATS (original posting) | Reposts, often stale | Careers page |
| Salary fields | ✅ structured when published | 😐 | 😐 |
| Login / cookies needed | ❌ none | Often | ❌ |
| Breaks on layout changes | ❌ official APIs | Often | – |
| Multi-ATS auto-detection | ✅ | – | ❌ |
| Price | $1.30-2 per 1,000 jobs by plan | Varies | Your time |

## FAQ

**Is it legal to scrape career sites?**
This actor only reads job postings that companies publish publicly through their ATS's public job-board API, which exists so job boards and websites can display them. It doesn't log in and doesn't collect personal data (recruiter names and emails are deliberately left out). Respect each site's terms and applicable laws for your use case.

**Which ATS platforms are supported?**
Greenhouse, Lever (including EU), Ashby, Workable and Recruitee. For Workday (`myworkdayjobs.com`) sites use our [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper). SmartRecruiters and others are on the roadmap; tell us on the **Issues** tab which one you need.

**Why does a company return no jobs?**
Either it uses a different ATS, the board name is different from the company name (e.g. `openai` vs `open-ai`), or it currently has no open roles. The run summary shows which boards were found. You're never charged for jobs that weren't returned.

**Do I need a proxy?**
No. The APIs are public and the actor paces its requests politely.

**How fresh is the data?**
Live: every run reads the current postings directly from the ATS.

**Found a bug or need a field?**
Open an issue on the **Issues** tab. We usually reply within 24 hours.

## Related tools

More tools from the same developer, built to work together:

- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).
- [Email Provider Detector](https://apify.com/swillz/email-provider-detector): bulk check whether domains use Google Workspace, Microsoft 365, Proofpoint or Mimecast, plus SPF, DMARC and DKIM.
- [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain): from a list of company domains, find which ATS each uses and how many open roles, by department and location.
- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): bulk check EU VAT numbers against official VIES, with company name and address.

**Popular workflows**

- **Hiring-signal leads:** scrape open roles with this Actor, enrich each hiring company's domain with [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment), and append new rows daily with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **From signal to job list:** find which companies are hiring with [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain), then pull every open role with this Actor.

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/career-site-jobs-scraper
