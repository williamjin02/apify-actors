# EORI Number Validator: Bulk EU & UK Customs Check

Check thousands of **EORI** (Economic Operators Registration and Identification) numbers against the official sources: the European Commission's **EOS** validation service for EU and Northern Ireland (`XI`) numbers, and **HMRC** for UK (`GB`) numbers. For each number you get valid or invalid, the trader's name and address where the trader has agreed to publish them, and an optional **name match** against your own records.

Built for customs brokers, freight forwarders, e-commerce sellers shipping cross-border, and compliance teams onboarding importers or exporters.

## What can EORI Number Validator do?

- **EU and UK in one run.** GB numbers are routed to HMRC automatically; EU member-state and XI numbers to the EU EOS service. Both are queried in batches of 10, the maximum each service allows.
- **Forgiving input.** `gb 117 223 643 000`, `EORI No: DE1234567`, `EL…` (converted to `GR`) and numbers without a prefix (with `defaultCountry`) all work.
- **Free local format check.** Numbers that can't be valid (for example a GB number that isn't 12 digits) are returned as free `invalid_format` rows. Non-EORI countries such as CH or US return free `unsupported_country` rows.
- **Handles outages.** Retries with backoff, then returns free `service_unavailable` rows instead of failing the run.
- **Name match.** Add ` | Expected name` to a number, or set `nameField` for a dataset, to get `exact`, `close`, `partial` or `mismatch`.

## What data does it return?

| Field | Example |
|---|---|
| `eori`, `status`, `valid` | `GB117223643000`, `valid`, `true` |
| `name`, `address` | `APPLE DISTRIBUTION INTERNATIONAL LIMITED`, `HM REVENUE AND CUSTOMS, AB10 1ZP, ABERDEEN, GB` |
| `street`, `postalCode`, `city` | split address fields when published |
| `countryCode`, `countryName` | `GB`, `United Kingdom` |
| `expectedName`, `nameMatch`, `namePublished` | `Apple Distribution International`, `exact`, `true` |
| `source`, `requestDate`, `checkedAt` | `HMRC (UK)`, … |

**Statuses:**

- Charged: `valid`, and `invalid` (not registered, or expired).
- Free: `invalid_format`, `unsupported_country`, `service_unavailable`, `invalid_input`, `error` and `skipped_charge_limit`.

Most traders do not consent to publishing their name and address. In that case `name` is `null`, `namePublished` is `false` and `nameMatch` is `not_available`, but `valid` is still authoritative.

## How much does it cost?

You pay only for numbers the official service actually answered (`valid` or `invalid`):

| Plan | Per 1,000 numbers |
|---|---|
| Free | $3.00 |
| Bronze | $2.50 |
| Silver | $2.00 |
| Gold | $1.50 |

Format errors, unsupported countries and outages are **free**. There is also a tiny Apify start fee of $0.00005 per run.

## Input example

```json
{
  "eoriNumbers": ["GB117223643000 | Apple Distribution International", "BE0403448140", "XI220430231000"]
}
```

## Output example

```json
{"eori": "GB117223643000", "status": "valid", "valid": true, "name": "APPLE DISTRIBUTION INTERNATIONAL LIMITED",
 "address": "HM REVENUE AND CUSTOMS, AB10 1ZP, ABERDEEN, GB", "countryCode": "GB", "expectedName": "Apple Distribution International",
 "nameMatch": "exact", "namePublished": true, "source": "HMRC (UK)"}
```

```json
{"eori": "GB123", "status": "invalid_format", "valid": false, "error": "GB EORI numbers are GB + 12 digits (usually the 9-digit VAT number + 000). Not sent."}
```

## Use cases

- **Customs declarations:** confirm the importer's or exporter's EORI before filing.
- **Freight and logistics onboarding:** validate a shipper or consignee list and flag name mismatches.
- **Marketplaces and e-commerce:** check B2B buyers' and sellers' EORI numbers in bulk.
- **Periodic re-checks:** schedule the Actor monthly to catch EORIs that have been revoked.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/eori-validator"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/eori-validator` and `APIFY_TOKEN` set.

Example prompts:

- "Is GB117223643000 a valid EORI number, and who is it registered to?"
- "Validate the EORI numbers in this consignee list."

Minimal input: `{"eoriNumbers": ["GB117223643000"]}`. To cap the cost, pass `maxTotalChargeUsd`. Numbers left unchecked come back as free `skipped_charge_limit` rows.

## Integrations and API

Run it from the Apify API, the clients, Make, Zapier or n8n. To chain it, pass `{"datasetId": "...", "eoriField": "eori"}`. The OUTPUT record holds a run summary (`byStatus`, `zeroResultsReason`, `nextSteps`).

## FAQ

**Is this the official source?** Yes. Every answer comes live from the European Commission's EOS validation service or HMRC's public EORI API. Nothing is cached.

**Why is there no name for a valid number?** The trader has not consented to publication. The validity result is still official.

**Is an EORI the same as a VAT number?** No, but in many countries it is derived from it (for example GB + VAT number + 000). To check VAT numbers, use the EU VAT Number Validator below.

## Related tools

- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): check EU VAT numbers with name and address.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): read numbers from a sheet and write the results back.
