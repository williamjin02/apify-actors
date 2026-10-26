# HTS Code Lookup: US Tariff Rates & Duty Search (USITC)

Look up **US Harmonized Tariff Schedule (HTS)** codes and **import duty rates** straight from the official **USITC** schedule, by code or by product description. Each row gives you the general, special (free trade agreement) and column 2 rates, the full description path from the heading down, the units, and any **Chapter 99** provisions the line points to (for example Section 301 or Section 232 references). It always uses the current release (for example `2026HTSRev21`).

Built for importers, customs brokers, freight forwarders, e-commerce sellers, landed-cost calculators and AI agents that need a reliable tariff answer.

## What can HTS Code Lookup do?

- **Code lookup.** `8507.60.00`, `850760`, `HTS 6109.10` or `8507.60.00.10` all work. You get the line itself plus every line under it (for example all 10-digit statistical lines under an 8-digit tariff line).
- **Product description search.** `cotton t-shirts`, `lithium-ion batteries` or `roasted coffee` return ranked candidate lines. Our own ranking reads the whole description path, understands "not roasted" and "other than", and knows common everyday words (e-bike, smartphone, sneakers).
- **Rates that are never blank.** Ten-digit lines usually have no rate of their own, so the Actor **inherits the rate from the parent 8-digit line** and tells you where it came from (`rateSource`).
- **Chapter 99 references, resolved.** When a line or its heading says "See 9903.88.15", you get that provision's description and rate, plus whether it applies to the general, special or column 2 rate.
- **Misses are free.** A code that doesn't exist comes back as a free `not_found` row that names the closest valid code.
- **One request per run.** The Actor downloads the full schedule from USITC once per run and searches it in memory, so it is fast and gentle on the source.

## What data does it return?

| Field | Example |
|---|---|
| `query`, `status`, `matchType`, `rank`, `score` | `cotton t-shirts`, `found`, `keyword`, `1`, `92.5` |
| `htsNumber`, `htsDigits`, `level` | `6109.10.00.12`, `6109100012`, `statistical` |
| `description`, `fullDescription` | `Men's (338)`, `T-shirts, singlets, tank tops ... > Of cotton > Men's or boys': > Other T-shirts: > Men's (338)` |
| `generalRate`, `specialRate`, `specialPrograms`, `column2Rate` | `16.5%`, `Free (AU,BH,CL,...)`, `["AU","BH","CL"]`, `90%` |
| `rateSource` | `inherited from 6109.10.00` |
| `units`, `footnotes`, `quotaQuantity` | `["doz.","kg"]`, … |
| `additionalDutyRefs` | `[{"htsNumber":"9903.90.08","appliesTo":"column2","description":"...","rate":"..."}]` |
| `htsRelease`, `htsReleaseStart`, `sourceUrl`, `checkedAt` | `2026HTSRev21`, `10/09/2026`, `https://hts.usitc.gov/search?query=6109.10.00.12` |

**Statuses:**

- Charged: `found` (one HTS line returned).
- Free: `not_found`, `invalid_input`, `service_unavailable` and `skipped_charge_limit`.

## How much does it cost?

You pay only for HTS lines returned:

| Plan | Per 1,000 lines |
|---|---|
| Free | $1.00 |
| Bronze | $0.90 |
| Silver | $0.80 |
| Gold | $0.70 |

Ten candidate lines for a product description cost $0.01 or less. Misses and bad input are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "queries": ["8507.60.00", "cotton t-shirts", "roasted coffee", "6403.99"],
  "maxResultsPerQuery": 10
}
```

## Output example

```json
{"query": "8507.60.00", "status": "found", "matchType": "code_child", "rank": 2, "htsNumber": "8507.60.00.10", "level": "statistical",
 "fullDescription": "Electric storage batteries, ... > Lithium-ion batteries > Of a kind used as the primary source of electrical power for electrically powered vehicles ...",
 "generalRate": "3.4%", "specialRate": "Free (A,AU,B,BH,C,CL,CO,D,E,IL,JO,KR,MA,OM,P,PA,PE,S,SG)", "column2Rate": "40%",
 "rateSource": "inherited from 8507.60.00", "units": ["No.", "kg"], "htsRelease": "2026HTSRev21"}
```

```json
{"query": "8507.60.00.20", "status": "not_found", "closestHtsNumber": "8507.60.00",
 "error": "8507.60.00.20 is not in the current HTS. Closest existing code: 8507.60.00. Run that code to see its valid statistical lines. Not charged."}
```

## Use cases

- **Landed-cost and duty calculators:** get the general rate and FTA programs for a code in one call.
- **Product catalog classification:** pass product titles from a scrape (`datasetId`) and get ranked candidate HTS lines to review.
- **Customs and broker workflows:** check that a 10-digit code exists in the current release before filing.
- **Tariff monitoring:** schedule a weekly run over your codes and compare `htsRelease` and rates over time.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/hts-code-lookup"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/hts-code-lookup` and `APIFY_TOKEN` set.

Example prompts:

- "What is the US import duty rate for HTS 8507.60.00?"
- "Find the HTS code and duty rate for men's cotton t-shirts."
- "Which Chapter 99 provisions apply to HTS 8711.30?"

Minimal input: `{"queries": ["8507.60.00"]}`. To cap the cost, pass `maxTotalChargeUsd`. Queries left unrun come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. To chain it, pass `{"datasetId": "...", "queryField": "title"}`. The OUTPUT record holds a run summary (`byStatus`, `htsRelease`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Is this the official source?** Yes. Every run downloads the current schedule from the US International Trade Commission's public HTS service (hts.usitc.gov). Nothing is cached between runs.

**Is a description match a binding classification?** No. Description search returns ranked candidates to help you find the right line. Classification depends on the General Rules of Interpretation and chapter notes; confirm with CBP (binding rulings at rulings.cbp.gov) or a licensed customs broker.

**Does it include Section 301, 232 or IEEPA tariffs?** It includes every Chapter 99 provision that the line or its heading references, with its rate. Some additional duties apply by country of origin through Chapter 99 notes without a reference on the line, so check those for China-origin and other affected goods.

**What is the difference between 8 and 10 digits?** Duty rates are set at the 8-digit tariff line. The last 2 digits are statistical suffixes used on customs entries; they share the 8-digit rate (`rateSource` shows this).

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

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/hts-code-lookup
