# EU VAT Number Validator (VIES): Bulk Check, Name & Address

Check thousands of EU VAT numbers against the European Commission's official **VIES** service. For each number you get valid or invalid, the registered company name and address, and an optional **VIES consultation number** that you can keep as audit proof. If you supply names, you also get a **name match** against your own records.

Built for finance, accounts-payable, e-commerce and marketplace teams that need to apply the EU reverse charge, onboard B2B customers or clean a supplier list.

## What can EU VAT Number Validator do?

- **Bulk validation in one run.** Paste numbers or chain from another Actor's dataset. Duplicates are checked once.
- **Forgiving input.** `de 811.128.135`, `VAT No: FR40303265045`, `GR…` (converted to `EL`) and numbers without a prefix (with `defaultCountry`) all work.
- **Free local format check.** Numbers that can't be valid are caught before they reach VIES and returned as free `invalid_format` rows.
- **Handles VIES outages.** National databases go offline for maintenance and reject request bursts. The Actor limits requests per country, retries with backoff, and returns free `service_unavailable` rows instead of failing.
- **Audit proof.** Set `requesterVatNumber` to your own EU VAT number and VIES issues a consultation number for each check.
- **Name match.** Add ` | Expected name` to a number, or set `nameField` for a dataset, to get `exact`, `close`, `partial` or `mismatch`.

## What data does it return?

| Field | Example |
|---|---|
| `vatId`, `status`, `valid` | `IE6388047V`, `valid`, `true` |
| `name`, `address`, `addressLines` | `GOOGLE IRELAND LIMITED`, `3RD FLOOR, GORDON HOUSE, BARROW STREET, DUBLIN 4` |
| `countryCode`, `countryName`, `vatNumber` | `IE`, `Ireland`, `6388047V` |
| `expectedName`, `nameMatch` | `Google Ireland`, `exact` |
| `consultationNumber`, `requestDate` | `WAPI…`, `2026-10-24T02:27:55Z` |

**Statuses:**

- Charged: `valid`, and `invalid` (not registered for intra-EU trade).
- Free: `invalid_format`, `unsupported_country` (for example GB or CH), `service_unavailable`, `invalid_input`, `error` and `skipped_charge_limit`.

Some countries, Germany and Spain among them, never return a name or address through VIES. In that case `name` is `null` and `nameMatch` is `not_available`.

## How much does it cost?

You pay only for numbers that VIES actually answered (`valid` or `invalid`):

| Plan | Per 1,000 numbers |
|---|---|
| Free | $2.00 |
| Bronze | $1.70 |
| Silver | $1.40 |
| Gold | $1.10 |

Format errors, non-EU numbers and VIES outages are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "vatNumbers": ["IE6388047V | Google Ireland", "BE0403448140", "DE 811 128 135"],
  "requesterVatNumber": ""
}
```

## Output example

```json
{"vatId": "IE6388047V", "status": "valid", "valid": true, "name": "GOOGLE IRELAND LIMITED",
 "address": "3RD FLOOR, GORDON HOUSE, BARROW STREET, DUBLIN 4", "countryCode": "IE",
 "expectedName": "Google Ireland", "nameMatch": "exact", "consultationNumber": null, "source": "EU VIES"}
```

```json
{"vatId": "DE12", "status": "invalid_format", "valid": false, "error": "Wrong format for Germany (DE). Not sent to VIES."}
```

## Use cases

- **Reverse charge and invoicing:** confirm a B2B customer's VAT number before you zero-rate an invoice.
- **Supplier and customer onboarding:** validate a whole vendor master or CRM export, and flag name mismatches.
- **Marketplaces:** check seller VAT IDs in bulk.
- **Periodic re-checks:** schedule the Actor monthly so you know when a customer's number stops being valid.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/eu-vat-validator"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/eu-vat-validator` and `APIFY_TOKEN` set.

Example prompts:

- "Is IE6388047V a valid EU VAT number, and who is it registered to?"
- "Validate the VAT numbers in this supplier list and flag the ones whose name doesn't match."

Minimal input: `{"vatNumbers": ["IE6388047V"]}`. To cap the cost, pass `maxTotalChargeUsd`. Numbers left unchecked come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. To chain it, pass `{"datasetId": "...", "vatField": "vat"}`. The OUTPUT record holds a run summary (`byStatus`, `memberStatesUnavailable`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Is this the official source?** Yes. Every answer comes live from the European Commission's VIES REST service. Nothing is cached.

**What about UK VAT numbers?** Since Brexit, GB numbers are not in VIES. They return `unsupported_country` (free). Northern Ireland `XI` numbers are supported.

**Why is a number `service_unavailable`?** The member state's database was offline or busy. Run it again later. Those rows are free.

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

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/eu-vat-validator
