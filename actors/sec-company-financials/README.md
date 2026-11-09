# SEC Company Financials: Revenue, Net Income & EPS API

Get the **income statement, balance sheet and cash flow summary** of **any US-listed company** by **ticker, CIK or company name**, straight from **official SEC EDGAR XBRL data**. Each row is one company and one fiscal year or quarter, with **revenue, gross profit, operating income, net income, EPS, operating cash flow, capex, free cash flow, cash, assets, liabilities, equity and long-term debt**, plus **margins** and **year-over-year revenue growth**.

Built for analysts, investors, finance students, sales and market-research teams, and **AI agents** that need to answer "what was Nvidia's revenue growth last quarter?" with a sourced number instead of a guess. Try it free: 3 years for 2 companies is 6 rows, under $0.01.

## What can it do?

- **Look up by ticker, CIK or name.** `"AAPL"`, `"BRK.B"`, `"320193"` or `"Microsoft"`. A name that matches several filers comes back as a free `ambiguous` row listing candidate tickers.
- **Annual or quarterly.** `period: "annual"` gives fiscal years from the 10-K (or 20-F/40-F). `"quarterly"` gives fiscal quarters from the 10-Q, and **Q4 is derived** (full year minus nine months), which the SEC data does not report on its own.
- **Real quarterly cash flow.** 10-Qs report cash flow year-to-date. This Actor subtracts the previous year-to-date figure so each quarter has its own operating cash flow and capex. Every derived value is listed in `derivedMetrics`.
- **Consistent fields across companies.** Companies tag the same item differently (`Revenues`, `SalesRevenueNet`, `RevenueFromContractWithCustomer...`). The Actor picks the right concept for each period, so you can compare Apple, Walmart and Bank of America in one table.
- **Latest restated values, original filing linked.** Values reflect the latest filing; `restated: true` flags periods that a later filing changed, and `filingUrl` links the original 10-K or 10-Q.
- **IFRS filers too.** Foreign filers such as TSMC (20-F, IFRS) return annual rows in their reporting currency (`currency: "TWD"`).
- **Never silent.** Unknown tickers, ambiguous names, filers without XBRL data and empty ranges come back as free status rows with the reason.

## What data does it return?

| Field | Example |
|---|---|
| `ticker`, `cik`, `companyName`, `exchange`, `sic`, `sicDescription` | `AAPL`, `320193`, `Apple Inc.`, `Nasdaq`, `3571`, `Electronic Computers` |
| `periodType`, `fiscalYear`, `fiscalPeriod`, `periodStart`, `periodEnd` | `annual`, `2026`, `FY`, `2025-09-28`, `2026-09-26` |
| `form`, `filed`, `accessionNumber`, `filingUrl` | `10-K`, `2026-11-03`, `0000320193-26-000026`, EDGAR link |
| `revenue`, `costOfRevenue`, `grossProfit` | `478834000000`, `245232000000`, `233602000000` |
| `researchAndDevelopment`, `sellingGeneralAdmin`, `operatingIncome`, `netIncome` | `45765000000`, `29774000000`, `158063000000`, `132175000000` |
| `epsBasic`, `epsDiluted`, `dilutedSharesWeighted` | `9.01`, `8.98`, `14720306000` |
| `operatingCashFlow`, `capitalExpenditure`, `freeCashFlow` | `145097000000`, `9041000000`, `136056000000` |
| `cashAndEquivalents`, `totalAssets`, `totalLiabilities`, `stockholdersEquity`, `longTermDebt` | `36305000000`, `404548000000`, `292455000000`, `112093000000`, `68208000000` |
| `grossMargin`, `operatingMargin`, `netMargin`, `revenueGrowthYoY` | `0.4879`, `0.3301`, `0.276`, `0.1506` |
| `currency`, `taxonomy`, `derivedMetrics`, `restated`, `metricsFound` | `USD`, `us-gaap`, `[]`, `false`, `17` |

Turn on `includeSources` to add the XBRL concept behind every metric (for audits).

**Statuses:**

- Charged: `found`.
- Free: `not_found`, `ambiguous`, `no_xbrl_data`, `no_periods`, `duplicate`, `service_unavailable` and `skipped_charge_limit`.

## How much does it cost?

You pay per company-period returned (one row = one company for one fiscal year or quarter, with all metrics):

| Plan | Per 1,000 rows |
|---|---|
| Free | $1.50 |
| Bronze | $1.50 |
| Silver | $1.20 |
| Gold | $1.00 |

Five years of annual data for the 500 S&P companies is 2,500 rows, about **$3.75**. One company's last 12 quarters costs **$0.018**. Misses are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "companies": ["AAPL", "MSFT", "NVDA"],
  "period": "annual",
  "years": 5
}
```

Quarterly history for a fixed range:

```json
{"companies": ["Walmart"], "period": "quarterly", "fiscalYearFrom": 2022, "fiscalYearTo": 2025}
```

## Output example

```json
{"type": "financials", "query": "AAPL", "status": "found", "cik": 320193, "ticker": "AAPL", "companyName": "Apple Inc.",
 "periodType": "annual", "fiscalYear": 2026, "fiscalPeriod": "FY", "periodStart": "2025-09-28", "periodEnd": "2026-09-26",
 "form": "10-K", "filed": "2026-11-03", "currency": "USD",
 "revenue": 478834000000, "grossProfit": 233602000000, "operatingIncome": 158063000000, "netIncome": 132175000000,
 "epsDiluted": 8.98, "operatingCashFlow": 145097000000, "freeCashFlow": 136056000000,
 "totalAssets": 404548000000, "totalLiabilities": 292455000000, "longTermDebt": 68208000000,
 "grossMargin": 0.4879, "netMargin": 0.276, "revenueGrowthYoY": 0.1506, "derivedMetrics": [], "restated": false,
 "filingUrl": "https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/0000320193-26-000026-index.htm"}
```

A name that matches more than one filer:

```json
{"type": "status", "query": "bank", "status": "ambiguous", "candidates": [{"cik": 70858, "ticker": "BAC", "name": "BANK OF AMERICA CORP /DE/"}],
 "error": "\"bank\" matches several SEC filers. Re-run with one of the tickers or CIKs in candidates. Not charged."}
```

## How to get company financials (step by step)

1. Add tickers, CIKs or company names to **Companies**.
2. Choose **Period**: annual, quarterly or both.
3. Set **Years of history** (or a fiscal year range).
4. Click **Start**. Each company takes about a second.
5. Download the table as CSV, Excel or JSON, or send it to Google Sheets.

## Use cases

- **Comparable company analysis:** revenue, margins and growth for a peer set in one table.
- **Financial modeling and screens:** 10+ years of annual or quarterly history without copying from PDFs.
- **Sales and account research:** check a prospect's size, growth and cash before outreach.
- **Credit and supplier risk:** watch leverage (liabilities, long-term debt) and cash for counterparties.
- **Students and case competitions:** fast, sourced numbers for valuation and pitch work.
- **Earnings monitoring:** schedule weekly with `years: 1` and `period: "quarterly"` to catch new quarters.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can call this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/sec-company-financials"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/sec-company-financials` and `APIFY_TOKEN` set.

Example prompts:

- "Compare revenue growth and net margin for Apple, Microsoft and Nvidia over the last 3 fiscal years."
- "What was Tesla's free cash flow in each of the last 8 quarters?"
- "Is Walmart's long-term debt going up or down since 2022?"

Minimal input: `{"companies": ["NVDA"]}`. The output shape is fixed (same fields for every company), so agents can read it without guessing. To cap the cost, pass `maxTotalChargeUsd`.

## Integrations and API

Run it from the Apify API, the JavaScript or Python client, Make, Zapier or n8n, or schedule it. The OUTPUT record holds a run summary (`byStatus`, `perCompany`, `zeroResultsReason`, `nextSteps`).

## SEC Company Financials vs alternatives

| | This Actor | Typical XBRL scrapers |
|---|---|---|
| Input | Ticker, CIK or company name | Ticker or CIK |
| Quarterly Q4 and quarterly cash flow | Derived and flagged | Often missing |
| Same fields for every company | Yes (17 metrics + margins + growth) | Raw concepts per company |
| IFRS (20-F) filers | Yes, annual | Often US GAAP only |
| Misses | Free status rows | Charged or silent |
| Price | from $1.00 per 1,000 rows (all three statements in one row), $0.00005 start | ~$0.95–2.00 per 1,000 statements + $0.004–0.005 start |

## FAQ

**Where does the data come from?** SEC EDGAR's official XBRL APIs (`data.sec.gov` companyfacts and submissions) and the SEC ticker list. It is public-domain data that companies file with the SEC. No login or API key is needed, and the Actor follows SEC's fair-access rules (identified User-Agent, well under 10 requests per second).

**Why is a value null?** The company did not tag that item for that period (for example, banks have no cost of revenue or gross profit, and some companies don't tag total liabilities). Q4 EPS is null because per-share figures can't be derived by subtraction.

**Why does fiscalYear look off by one?** Fiscal years follow the company's own label. Apple's fiscal 2026 ended in September 2026; Walmart's fiscal 2026 ended in January 2026.

**How fresh is the data?** SEC updates it within minutes of a filing. A new 10-Q shows up on the next run.

**Does it cover private companies?** No. Only companies that file financial statements with the SEC.

**Is this investment advice?** No. It returns reported data. Check `filingUrl` for the full statements and notes.

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
- [Grants.gov Opportunity Search](https://apify.com/swillz/grants-gov-opportunity-search): open and forecasted US federal grants by keyword, agency or eligibility, with deadlines, award ceilings and funding.
- [AI Crawler Access Checker](https://apify.com/swillz/ai-crawler-access-checker): which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended and more) any list of websites allows or blocks in robots.txt, plus llms.txt.

**Popular workflows**

- **Public-company due diligence:** pull 5 years of financials with this Actor, see how much revenue comes from federal contracts with [Federal Contracts & Grants by Company](https://apify.com/swillz/federal-awards-by-company), and confirm the legal entity and parent with [LEI Lookup (GLEIF)](https://apify.com/swillz/lei-lookup).
- **Growth screen:** compare revenue growth and margins with this Actor, check who is still hiring with [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain), and keep a watchlist sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/sec-company-financials
