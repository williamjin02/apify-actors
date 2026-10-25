# LEI Lookup (GLEIF): Company Search by Name, LEI, ISIN or BIC

Look up **Legal Entity Identifiers (LEI)** in the official **GLEIF** registry, the global source used by banks, regulators and KYC teams. Search by LEI, company name (with an optional country), ISIN or BIC, and get the legal name, entity and LEI status, legal form, legal and headquarters addresses, the business-registry number, the next renewal date and the **direct and ultimate parent companies**.

Built for KYC/AML, onboarding, procurement and financial-data teams, and for AI agents that need a reliable company identity.

## What can LEI Lookup do?

- **Four ways to search.** Paste LEIs, company names, ISINs or BICs and the type is detected automatically. Use `name:`, `lei:`, `isin:` or `bic:` to force it.
- **Bulk LEI checks.** LEIs are looked up 100 per request, so thousands finish quickly.
- **Smart name matching.** Legal suffixes are normalized (`AG` = `Aktiengesellschaft`, `Ltd` = `Limited`), other and transliterated names are searched too (so "Toyota Motor Corporation" finds トヨタ自動車株式会社), and each match gets a 0-100 `matchScore`.
- **Corporate ownership.** The direct and ultimate accounting parents, as reported to GLEIF.
- **Free check-digit validation.** Bad LEI or ISIN check digits are caught locally and returned as free `invalid_format` rows. Misses are free `not_found` rows.

## What data does it return?

| Field | Example |
|---|---|
| `lei`, `legalName`, `otherNames` | `W38RGI023J3WT1HWRP32`, `Siemens Aktiengesellschaft` |
| `entityStatus`, `registrationStatus` | `ACTIVE`, `ISSUED` (`LAPSED` = not renewed) |
| `legalForm`, `legalFormCode`, `jurisdiction` | `Aktiengesellschaft`, `6QQB`, `DE` |
| `legalAddressText`, `headquartersAddressText` | `Werner-von-Siemens-Str. 1, 80333 München, DE-BY, DE` |
| `registrationAuthorityId`, `registeredAs` | `RA000304`, `HRB 6684` |
| `initialRegistrationDate`, `nextRenewalDate` | `2012-06-06…`, `2027-10-25…` |
| `directParent`, `ultimateParent` | `{lei, legalName, country, entityStatus}` |
| `bic`, `managingLou`, `corroborationLevel`, `gleifUrl` | … |
| `matchScore`, `matchRank` | `100`, `1` (name searches) |

## How much does it cost?

You pay per LEI record returned (`found`):

| Plan | Per 1,000 records |
|---|---|
| Free | $2.00 |
| Bronze | $1.70 |
| Silver | $1.40 |
| Gold | $1.10 |

`not_found`, `invalid_format` and outage rows are **free**. There is also a tiny Apify start fee of $0.00005 per run. With `maxMatchesPerName` above 1, each returned match counts as a record.

## Input example

```json
{
  "queries": ["HWUPKR0MPOU8FGXBT394", "Siemens AG | DE", "US0378331005", "DEUTDEFFXXX"],
  "includeParents": true
}
```

## Output example

```json
{"query": "APPLE DISTRIBUTION INTERNATIONAL LIMITED", "status": "found", "lei": "54930027SQL2KPSDBM58",
 "legalName": "APPLE DISTRIBUTION INTERNATIONAL LIMITED", "country": "IE", "entityStatus": "ACTIVE",
 "registrationStatus": "ISSUED", "legalForm": "Private Company Limited by Shares",
 "directParent": {"lei": "549300G81RQKP7XW2N18", "legalName": "APPLE OPERATIONS INTERNATIONAL LIMITED", "country": "IE"},
 "ultimateParent": {"lei": "HWUPKR0MPOU8FGXBT394", "legalName": "Apple Inc.", "country": "US"}}
```

```json
{"query": "HWUPKR0MPOU8FGXBT395", "queryType": "lei", "status": "invalid_format", "error": "Not a valid LEI: 20 characters with a mod-97 check digit. Not sent."}
```

## Use cases

- **KYC and counterparty onboarding:** confirm a legal entity, its status and its ultimate parent.
- **Regulatory reporting (EMIR, MiFID II, SFTR):** check that counterparties' LEIs are ISSUED and not LAPSED before you report.
- **Data enrichment:** add LEI, registry number and parent company to a CRM or supplier list.
- **Securities and banking data:** map ISINs or BICs to the issuing legal entity.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/lei-lookup"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/lei-lookup` and `APIFY_TOKEN` set.

Example prompts:

- "What is the LEI of Siemens AG, and is it still current?"
- "Who is the ultimate parent of LEI 54930027SQL2KPSDBM58?"
- "Find the LEIs for the companies in this list."

Minimal input: `{"queries": ["Siemens AG | DE"]}`. To cap the cost, pass `maxTotalChargeUsd`. Queries left unrun come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. To chain it, pass `{"datasetId": "...", "queryField": "companyName", "countryField": "country"}`. The OUTPUT record holds a run summary (`byStatus`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Is this the official source?** Yes. Every answer comes live from the GLEIF API, which publishes the LEI golden copy. Nothing is cached between runs.

**Why is `legalName` in Japanese, Chinese or Cyrillic?** GLEIF stores the legal name in its original script. The English or transliterated name is in `otherNames`, and name searches match it.

**Why is there no parent?** Many entities report an exception (for example, natural-person owners or no consolidating parent). Then `directParent` and `ultimateParent` are `null`.

## Related tools

- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): check EU VAT numbers with name and address.
- [EORI Number Validator](https://apify.com/swillz/eori-validator): check EU and UK customs numbers.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): find company contacts and details from websites.
