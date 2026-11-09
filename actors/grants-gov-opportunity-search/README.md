# Grants.gov Opportunity Search: Federal Grants API

Search **open and upcoming US federal grants** on **Grants.gov** with the official API. Filter by keyword, agency, eligible applicant type (small businesses, nonprofits, universities, tribes, local governments), funding category or Assistance Listing (ALN/CFDA). For each opportunity you get the **deadline**, **award floor and ceiling**, **total program funding**, **expected number of awards**, **eligibility**, **cost sharing**, a plain-text **description** and the Grants.gov link.

Built for grant writers and consultants, nonprofits, universities and research offices, startups chasing non-dilutive funding (SBIR/STTR, DOE, NSF, NIH), and AI agents that need to answer "which federal grants can we apply for this month?"

## What can it do?

- **Keyword search across all federal agencies.** `"artificial intelligence"`, `"rural broadband"` or `"opioid"` searches titles and descriptions, the same as the Grants.gov site.
- **Eligibility filters that make sense.** Use codes or labels: `["Small businesses"]`, `["23"]` or `["Nonprofits having a 501(c)(3)"] (a label prefix works)`.
- **Department-level agency filter.** `"HHS"`, `"DOE"` or `"USDA"` automatically includes every sub-agency (NIH, CDC, NIFA and so on). Grants.gov's own API returns nothing for these codes.
- **Deadline and size filters.** `closingWithinDays: 30` returns calls due in the next month. `minAwardCeiling: 500000` returns only big awards. `postedWithinDays: 1` gives a daily new-grants alert.
- **Forecasts as well as open calls.** Forecasted opportunities include the fiscal year and the estimated post, deadline and award dates when the agency publishes them.
- **Exact lookups.** Pass `opportunityNumbers` such as `"DE-FOA-0003631"` to refresh specific calls.
- **No duplicates.** An opportunity matched by several keywords is returned, and charged, once.
- **Misses are free.** Searches with no matches come back as a free `no_results` or `not_found` row that says why.

## What data does it return?

| Field | Example |
|---|---|
| `type`, `query`, `status`, `rank` | `opportunity`, `artificial intelligence`, `found`, `1` |
| `opportunityNumber`, `opportunityId`, `title` | `DE-FOA-0003631`, `364135`, `Unlocking New Levels of Output and Capacity... SBIR/STTR` |
| `agencyCode`, `agencyName`, `topAgencyCode` | `DOE-ARPAE`, `Advanced Research Projects Agency Energy`, `DOE` |
| `opportunityStatus`, `docType` | `posted`, `synopsis` |
| `postedDate`, `closeDate`, `daysUntilClose`, `archiveDate` | `2026-10-21`, `2026-11-20`, `18`, `2027-05-20` |
| `awardFloor`, `awardCeiling`, `estimatedTotalFunding`, `expectedAwards` | `323090`, `4630944`, `45000000`, `12` |
| `eligibleApplicants`, `eligibilityText`, `costSharingRequired` | `["Small businesses"]`, `...`, `false` |
| `fundingInstruments`, `fundingCategories`, `assistanceListings` | `["Cooperative Agreement","Grant"]`, `["Science and Technology and other Research and Development"]`, `[{"number":"81.135","title":"Advanced Research Projects Agency - Energy"}]` |
| `fiscalYear`, `estimatedPostDate`, `estimatedCloseDate`, `estimatedAwardDate` (forecasts) | `2027`, `2026-07-01`, `2026-09-29`, `2027-07-01` |
| `descriptionText`, `additionalInfoUrl`, `grantsGovUrl`, `lastUpdated` | `...`, `https://exchange.energy.gov/`, `https://www.grants.gov/search-results-detail/364135`, `2026-10-21` |

No personal data: agency contact names, emails and phone numbers are left out.

**Statuses:**

- Charged: `found`.
- Free: `no_results`, `not_found`, `invalid_input`, `service_unavailable` and `skipped_charge_limit`.

## How much does it cost?

You pay per opportunity returned:

| Plan | Per 1,000 opportunities |
|---|---|
| Free | $1.20 |
| Bronze | $1.20 |
| Silver | $1.00 |
| Gold | $0.90 |

A daily alert that finds 20 new grants costs about $0.024. Searches with no matches are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "keywords": ["artificial intelligence", "cybersecurity"],
  "statuses": ["posted", "forecasted"],
  "eligibilities": ["Small businesses"],
  "closingWithinDays": 60,
  "maxResults": 50
}
```

Daily alert for one department, filters only:

```json
{"agencies": ["DOE"], "postedWithinDays": 1, "sortBy": "newest"}
```

## Output example

```json
{"type": "opportunity", "query": "artificial intelligence", "status": "found", "rank": 3,
 "opportunityNumber": "DE-FOA-0003631", "title": "Unlocking New Levels of Output and Capacity for Key Subsurface Resources SBIR/STTR (UNLOCK SBIR/STTR)",
 "agencyCode": "DOE-ARPAE", "topAgencyCode": "DOE", "opportunityStatus": "posted", "postedDate": "2026-10-21", "closeDate": "2026-11-20", "daysUntilClose": 18,
 "awardFloor": 323090, "awardCeiling": 4630944, "estimatedTotalFunding": 45000000, "expectedAwards": 12, "costSharingRequired": false,
 "fundingInstruments": ["Cooperative Agreement", "Grant"], "eligibleApplicants": ["Small businesses"],
 "assistanceListings": [{"number": "81.135", "title": "Advanced Research Projects Agency - Energy"}],
 "additionalInfoUrl": "https://exchange.energy.gov/", "grantsGovUrl": "https://www.grants.gov/search-results-detail/364135"}
```

A search with no matches:

```json
{"type": "status", "query": "NOPE-123", "status": "not_found", "error": "Opportunity number \"NOPE-123\" not found with statuses posted/forecasted. Try fewer filters, add \"closed\" or \"archived\" to statuses, or a broader keyword. Not charged."}
```

## Use cases

- **Grant prospecting:** a weekly list of open calls that match your mission, eligibility and minimum award size.
- **New-grant alerts:** schedule `postedWithinDays: 1` and send new rows to Google Sheets, Slack or email through Make, Zapier or n8n.
- **Deadline calendar:** `closingWithinDays: 30` with `sortBy: "closingSoonest"` for a submission pipeline.
- **Non-dilutive funding for startups:** filter on `["Small businesses"]` plus a technology keyword.
- **Research offices and consultants:** monitor NIH, NSF, DOE or USDA calls across many keywords in one run.
- **Market and policy research:** track how much funding agencies put into a topic over time (add `closed` and `archived`).

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/grants-gov-opportunity-search"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/grants-gov-opportunity-search` and `APIFY_TOKEN` set.

Example prompts:

- "Find open federal grants for small businesses about artificial intelligence that close in the next 60 days."
- "Which NIH funding opportunities were posted this week?"
- "List DOE grants with an award ceiling over $1 million and summarize the eligibility."

Minimal input: `{"keywords": ["climate resilience"], "maxResults": 20}`. To cap the cost, pass `maxTotalChargeUsd`. Searches left unrun come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. Schedule it daily or weekly with `postedWithinDays` to get only new calls. The OUTPUT record holds a run summary (`byStatus`, `perSearch`, `zeroResultsReason`, `nextSteps`).

## Grants.gov Opportunity Search vs alternatives

| Actor | Price per 1,000 opportunities | Start fee | What it covers |
|---|---|---|---|
| **This Actor** | $1.20 (down to $0.90 on Gold) | $0.00005 | Department-level agency filter, eligibility labels, deadline and award-size filters, forecasts; misses free |
| `hridayrungta/grants-gov-scraper` | $1.50 | none | Grants.gov opportunities |
| `pink_comic/grants-gov-opportunities` | $2.00 | $0.0001 | Grants.gov opportunities |
| `solidcode/grants-gov-scraper` | $9.60 | $0.005 | Grants.gov opportunities |

Prices are from each Apify Store listing on Nov 9, 2026 (Free plan). Check the listings for current prices.

## FAQ

**Where does the data come from?** The public Grants.gov API (`api.grants.gov`, Search2 and fetchOpportunity), which is run by the US Department of Health and Human Services for all federal grant-making agencies. No login or API key is needed.

**Is the data live?** Yes. Every run queries Grants.gov directly, so new and updated calls show up as soon as Grants.gov publishes them. Always confirm deadlines on the official page before you apply.

**Why is `awardCeiling` empty for some calls?** Many agencies (NSF and NIH, for example) don't publish a ceiling in Grants.gov and put the budget in the full announcement instead. Follow `additionalInfoUrl`.

**Why is `closeDate` empty?** Forecasts and rolling or continuous calls have no fixed deadline. Check `closeDateNote` and `estimatedCloseDate`.

**Does it include SAM.gov contracts?** No. It covers grants and cooperative agreements listed on Grants.gov. For awards already made, use [Federal Contracts & Grants by Company](https://apify.com/swillz/federal-awards-by-company).

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).
- [Email Provider Detector](https://apify.com/swillz/email-provider-detector): bulk check whether domains use Google Workspace, Microsoft 365, Proofpoint or Mimecast, plus SPF, DMARC and DKIM.
- [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain): from a list of company domains, find which ATS each uses and how many open roles, by department and location.
- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): bulk check EU VAT numbers against official VIES, with company name and address.
- [EORI Number Validator](https://apify.com/swillz/eori-validator): bulk check EU and UK EORI numbers for customs, with trader name where published.
- [LEI Lookup (GLEIF)](https://apify.com/swillz/lei-lookup): find a company's Legal Entity Identifier, legal name, address, status and parent from official GLEIF data.
- [Sanctions Screener](https://apify.com/swillz/sanctions-screener): screen company and person names against official OFAC, UN, EU and UK sanctions lists with fuzzy matching.
- [HTS Code Lookup (USITC)](https://apify.com/swillz/hts-code-lookup): US HTS codes and import duty rates from the official tariff schedule, by code or product description.
- [Federal Contracts & Grants by Company](https://apify.com/swillz/federal-awards-by-company): federal contracts, grants and loans any US company won, from official USAspending.gov data.
- [AI Crawler Access Checker](https://apify.com/swillz/ai-crawler-access-checker): which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended and more) any list of websites allows or blocks in robots.txt, plus llms.txt.

**Popular workflows**

- **Grant pipeline:** search open calls with this Actor, see who won similar awards before with [Federal Contracts & Grants by Company](https://apify.com/swillz/federal-awards-by-company), and track deadlines in a sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **Partner research:** find open programs with this Actor, check partner organisations with [LEI Lookup (GLEIF)](https://apify.com/swillz/lei-lookup) and [Sanctions Screener](https://apify.com/swillz/sanctions-screener), and add contacts with [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/grants-gov-opportunity-search
