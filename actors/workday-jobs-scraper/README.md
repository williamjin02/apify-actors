# Workday Jobs Scraper

Get **every job** from any company's Workday career site (`*.myworkdayjobs.com` / `myworkdaysite.com`): title, locations, remote type, full-time/part-time, posted date, requisition ID, salary range (when it's in the posting), full description and the apply link. You get clean JSON, CSV or Excel. No login, no browser, no cookies.

**$1.00-1.50 per 1,000 jobs**, depending on your Apify plan. You pay only for jobs saved after your filters.

## Why this one

- **No 2,000-job ceiling.** Workday's search stops paging at 2,000 results, and big employers like NVIDIA, Salesforce and Walmart have more than that. The scraper detects this and splits the search by location, job family or other facets, so you get the full list (for example, 2,718 of 2,718 NVIDIA jobs in our tests).
- **Many companies in one run.** Paste as many career-site URLs as you like.
- **Search-URL aware.** Filter a Workday page in your browser, then paste that URL; `q=` and facet filters are applied.
- **Filters before you pay:** title include/exclude keywords, location keywords, posted within N days, remote only, max jobs per site.
- **Fast mode.** Set `includeDetails: false` to list jobs without opening each posting (title, location, posted text, URL).
- **Per-site summary** in the `OUTPUT` record: ok / invalid_url / not_found / robots_disallowed / error, with job counts.

## What data can you extract from Workday?

| Field | Example |
|---|---|
| Company and hiring entity | Adobe / Adobe Inc. |
| Job title, requisition ID | Senior Software Engineer, R160000 |
| Locations (all of them), remote type | San Jose, Seattle; remote: false |
| Time type | Full time |
| Posted date (absolute) and days ago | 2026-10-21, 2 |
| Salary min / max / currency / period | 139000 / 257550 / USD / year |
| Full description (text) | ... |
| Job URL and apply URL | links to the original posting |

## How to scrape Workday jobs (step by step)

1. Open the company's careers page and copy its Workday job-search URL (see below).
2. Paste one or many URLs into **Start URLs**.
3. Optionally add title keywords, location keywords, *posted within N days* or *remote only*.
4. Click **Start**, then download the jobs as **CSV, Excel or JSON**, or read them through the API.

## How to find a Workday URL

Open the company's careers page and click through to the job search. If the address bar shows something like
`https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite` or `https://wd3.myworkdaysite.com/recruiting/acme/Careers`, that's the URL to paste. Language prefixes like `/en-US/` are fine.

## Input example

```json
{
  "startUrls": [
    { "url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" },
    { "url": "https://adobe.wd5.myworkdayjobs.com/external_experienced" }
  ],
  "titleKeywords": ["engineer"],
  "postedWithinDays": 7
}
```

## Output example

```json
{
  "company": "Adobe",
  "hiringEntity": "Adobe Inc.",
  "title": "Senior Software Engineer",
  "jobId": "R160000",
  "location": "San Jose",
  "allLocations": ["San Jose", "Seattle"],
  "remote": false,
  "timeType": "Full time",
  "postedDate": "2026-10-21",
  "postedDaysAgo": 2,
  "jobUrl": "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Senior-Software-Engineer_R160000",
  "applyUrl": "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Senior-Software-Engineer_R160000/apply",
  "salaryMin": 139000,
  "salaryMax": 257550,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "descriptionText": "…",
  "ats": "workday"
}
```

## Use cases

- **Job boards and aggregators:** keep enterprise employers' jobs (banks, healthcare, retail, tech) in sync. Most large employers use Workday rather than Greenhouse or Lever.
- **Sales and recruiting intelligence:** spot companies hiring for the roles you sell to, then enrich them.
- **Labor-market and salary research:** collect pay ranges from pay-transparency postings across many employers.
- **Job seekers and career coaches:** a daily list of new roles at target companies.

## How to monitor new Workday jobs

1. Save your input with *Posted within days* = `1` and save it as a task.
2. In **Schedules**, run the task daily.
3. Add an integration (Slack, email, Google Sheets or a webhook) to get each day's new jobs.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/workday-jobs-scraper`.
- **API:** `POST https://api.apify.com/v2/acts/swillz~workday-jobs-scraper/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns the jobs directly. JavaScript and Python clients are available.
- **AI agents (MCP):** add `https://mcp.apify.com?tools=swillz/workday-jobs-scraper` to Claude, Cursor or any MCP client and ask "list NVIDIA's open data engineering jobs posted this week".

## Workday Jobs Scraper vs alternatives

| | This Actor | Generic browser scrapers | Copying by hand |
|---|---|---|---|
| Boards over 2,000 jobs | ✅ auto-split, full list | Usually stop at 2,000 | ❌ |
| Salary, all locations, absolute posted date | ✅ | Partial | 😐 |
| Login, cookies or browser | ❌ none | Often a browser | – |
| Many companies per run | ✅ | Varies | ❌ |
| Price | $1.00-1.50 per 1,000 jobs by plan, filtered-out jobs free | Varies | Your time |

## Pricing

Pay per event, per 1,000 jobs saved:

| Apify plan | Per 1,000 jobs |
|---|---|
| Free | $1.50 |
| Starter | $1.50 |
| Scale | $1.10 |
| Business and up | $1.00 |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold). Jobs you filter out are free. Set a max cost per run in Apify and the run stops when it's reached.

## FAQ

**Does Workday have a public jobs API?**
Not a documented one. Every Workday career site loads its job list from a JSON endpoint in the visitor's browser; this Actor reads that same public data politely, pages through it and fetches each posting's details.

**Why do other tools stop at 2,000 jobs?**
Workday's search reports at most 2,000 results per query. This Actor detects the cap and splits the search by location, job family or other facets, then de-duplicates, so you get every job.

**Can I get only new jobs?**
Yes. Set *Posted within days* to 1 and schedule the run daily.

**Do I need a proxy?**
No. The Actor needs no login and paces its requests.

**Found a bug or a site that doesn't work?**
Open an issue on the **Issues** tab with the career-site URL. We usually reply within 24 hours.

## Notes

- The scraper only reads the public job listings that Workday serves to any visitor. It respects each site's robots.txt and skips sites that disallow crawling. It collects no candidate or personal data.
- Salary is taken from the posting text when the employer publishes a pay range (common in US states with pay-transparency laws).
- Greenhouse, Lever, Ashby, Workable or Recruitee boards? Use our Career Site Jobs Scraper.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).

**Popular workflows**

- **Enterprise hiring tracker:** pull Workday jobs with this Actor, add company contacts with [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment), and keep a live sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source: https://github.com/williamjin02/apify-actors/tree/main/actors/workday-jobs-scraper
