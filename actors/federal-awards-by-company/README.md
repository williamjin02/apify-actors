# Federal Contracts & Grants by Company (USAspending)

See which **US federal contracts, grants and loans a company has won**, straight from the official **USAspending.gov** data. Give it company names or SAM.gov UEIs and get back:

- **award rows** with amount, agency, dates, NAICS, PSC, description and a link;
- a **company summary** with total obligated, matched legal entities, top agencies and top NAICS codes.

You can also search with no company at all, by agency, NAICS, PSC, state or keyword.

Built for B2B sales and GovCon teams, analysts and investors doing due diligence, journalists, and AI agents that need to answer "how much federal money does company X get?"

## What can it do?

- **Company to awards in one call.** `"Palantir"` returns PALANTIR USG INC and PALANTIR TECHNOLOGIES INC. with their largest awards, both included automatically.
- **No fuzzy junk.** USAspending's own name search is fuzzy: "Booz Allen" also returns unrelated firms. The Actor keeps only recipients whose name contains every word of your query, then pulls their awards by UEI.
- **UEI lookups.** A 12-character UEI like `JCBMLGPE6Z71` gives an exact match.
- **A company summary row.** It shows obligated in the period, matched recipient names and UEIs, the top 5 awarding agencies and the top 5 NAICS codes.
- **Contracts, IDVs, grants and loans.** IDVs cover GSA schedules, GWACs, IDIQs and BPAs.
- **Filters.** Narrow by date range (back to FY2008), awarding agency, NAICS, PSC, place of performance state, keyword and minimum amount.
- **Filters-only mode.** Leave `companies` empty to find, for example, the largest Department of Energy cybersecurity contracts performed in Virginia.
- **Misses are free.** Unknown companies come back as a free `not_found` row with tips.

## What data does it return?

| Field | Example |
|---|---|
| `type`, `query`, `status`, `rank` | `award`, `Palantir`, `found`, `1` |
| `awardCategory`, `awardType`, `awardId` | `contract`, `DEFINITIVE CONTRACT`, `W52P1J...` |
| `recipientName`, `recipientUei` | `PALANTIR USG INC`, `...` |
| `amount`, `totalOutlays` | `637552404.79`, `...` |
| `startDate`, `endDate`, `description` | `2024-05-29`, `2029-05-28`, `...` |
| `awardingAgency`, `awardingSubAgency`, `fundingAgency` | `Department of Defense`, `Department of the Army` |
| `naicsCode`, `naicsDescription`, `pscCode`, `pscDescription` | `541511`, `CUSTOM COMPUTER PROGRAMMING SERVICES` |
| `assistanceListings` (grants and loans) | `["93.855 Allergy and Infectious Diseases Research"]` |
| `placeOfPerformanceState`, `usaspendingUrl`, `recipientProfileUrl` | `VA`, `https://www.usaspending.gov/award/...` |

The `company_summary` row adds `obligatedInPeriod`, `matchedRecipients` (name, UEI, amount), `topAwardingAgencies`, `topNaics`, `periodStart`, `periodEnd` and `awardsReturned`.

**Statuses:**

- Charged: `found`.
- Free: `not_found`, `invalid_input`, `service_unavailable` and `skipped_charge_limit`.

## How much does it cost?

You pay per record returned. An award row or a company summary row each count as one record:

| Plan | Per 1,000 records |
|---|---|
| Free | $2.00 |
| Bronze | $1.70 |
| Silver | $1.40 |
| Gold | $1.10 |

A company with a summary and its top 20 awards costs about $0.04. Misses are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "companies": ["Booz Allen Hamilton", "Palantir", "JCBMLGPE6Z71"],
  "awardTypes": ["contracts", "idvs"],
  "lookbackDays": 365,
  "maxAwardsPerCompany": 20
}
```

Filters only:

```json
{"keywords": ["cybersecurity"], "agencies": ["Department of Energy"], "states": ["VA"], "lookbackDays": 180, "maxAwardsPerCompany": 50}
```

## Output example

```json
{"type": "company_summary", "query": "Palantir", "status": "found", "obligatedInPeriod": 1981710256.98,
 "matchedRecipients": [{"name": "PALANTIR USG INC", "amount": 1411899868.54}, {"name": "PALANTIR TECHNOLOGIES INC.", "amount": 569810388.44}],
 "topNaics": [{"code": "541511", "name": "Custom Computer Programming Services", "amount": 1157460371.18}]}
```

```json
{"type": "award", "query": "Palantir", "status": "found", "rank": 1, "awardCategory": "contract", "recipientName": "PALANTIR USG INC",
 "amount": 637552404.79, "awardingAgency": "Department of Defense", "naicsCode": "541511", "usaspendingUrl": "https://www.usaspending.gov/award/CONT_AWD_..."}
```

## Use cases

- **Sales prospecting and account research:** see which agencies a target account sells to and how much.
- **Competitor tracking in GovCon:** compare competitors' awards by NAICS, PSC and agency every month.
- **Investment and credit due diligence:** measure a company's federal revenue exposure and agency concentration.
- **Partner and teaming search:** filter by NAICS, PSC and state to find who wins the work you want.
- **Journalism and research:** pull award lists with links to the official records.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/federal-awards-by-company"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/federal-awards-by-company` and `APIFY_TOKEN` set.

Example prompts:

- "How much in federal contracts did Palantir get in the last 12 months, and from which agencies?"
- "List the 10 largest Department of Energy cybersecurity contracts performed in Virginia this year."
- "Compare federal awards for Booz Allen Hamilton and Leidos by NAICS."

Minimal input: `{"companies": ["Palantir"], "maxAwardsPerCompany": 10}`. To cap the cost, pass `maxTotalChargeUsd`. Companies left unrun come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. To enrich a lead list, chain it with `{"datasetId": "...", "companyField": "companyName"}`. The OUTPUT record holds a run summary (`byStatus`, `period`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Where does the data come from?** The public USAspending.gov API (US Treasury), which publishes FPDS contract data and FABS assistance data. No login or API key is needed.

**Why are recent DoD numbers lower than expected?** DoD contract data is published with a 90-day delay, and agencies can revise records later.

**Does it return data about individuals?** No. It never requests assistance types made to individuals (direct payments, insurance and other), and it drops redacted or aggregated "multiple recipients" rows.

**Why does `obligatedInPeriod` differ from the sum of award amounts?** The summary counts obligations made inside your date range. `amount` on an award row is the award's total over its whole life.

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

**Popular workflows**

- **Weekly award watch:** schedule this Actor for your competitors or prospects and append new awards to a sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/federal-awards-by-company
