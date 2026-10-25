# Sanctions Screener: OFAC, UN, EU & UK Lists

Screen people and companies against the five main official sanctions lists in one run: the **OFAC SDN List**, the **OFAC Consolidated (non-SDN) List**, the **UN Security Council Consolidated List**, the **EU Consolidated Financial Sanctions List** and the **UK Sanctions List**. Lists come straight from the government sources and are refreshed every 6 hours (or downloaded live in your run if you prefer), so results are never weeks out of date.

Fuzzy name matching handles spelling variants (Osama / Usama), word order ("PUTIN, Vladimir"), diacritics, legal suffixes (LLC, GmbH, PJSC) and every listed alias. Each name comes back as `clear` or `potential_match`, with the list, program, countries and date of birth needed for a quick manual review.

## What can Sanctions Screener do?

- Screen a list of names, or a dataset from another Actor (CRM export, supplier list, scraped leads), against 5 official lists at once.
- Match aliases, transliterations and reordered names with a tunable 0-100 score.
- Flag country matches when you pass a country with the name ("John Doe | RU").
- Restrict matching to individuals or to entities.
- Report list record counts, publication dates and download times in the run summary, as an audit trail.
- Never charge for empty names, duplicate names or names screened while a list was down.

## What data does it return?

| Field | Example |
|---|---|
| `name` | Rosneft |
| `status` | potential_match |
| `topScore` | 100 |
| `matchCount` | 3 |
| `matches[].list` / `listName` | uk / UK Sanctions List (FCDO) |
| `matches[].listedName` / `matchedName` | OPEN JOINT-STOCK COMPANY ROSNEFT OIL COMPANY / ROSNEFT |
| `matches[].programs` | ["UKRAINE-EO13662", "RUSSIA-EO14024"] |
| `matches[].countries` / `countryMatch` | ["RU"] / true |
| `matches[].datesOfBirth` | ["07 Oct 1952"] |
| `listsChecked` / `listsNotChecked` | all five / [] |

## How much does it cost?

You pay per name screened (`clear` or `potential_match`). Invalid inputs, duplicates, outage rows and names over your cost limit are free. The price per 1,000 names goes down on higher Apify plans; see the Pricing tab. Set `maxTotalChargeUsd` on the run to cap the cost.

## Input example

```json
{
  "names": ["Vladimir Putin | RU", "Rosneft", "Acme Trading LLC"],
  "lists": ["ofac_sdn", "ofac_consolidated", "un", "eu", "uk"],
  "minScore": 85
}
```

## Output example

```json
{
  "name": "Vladimir Putin",
  "countryHint": "RU",
  "status": "potential_match",
  "topScore": 100,
  "matchCount": 3,
  "matches": [
    {"score": 100, "list": "uk", "listedName": "Vladimir Vladimirovich PUTIN", "type": "individual", "programs": ["Russia"], "countries": ["RU"], "countryMatch": true, "datesOfBirth": ["07/10/1952"]},
    {"score": 99, "list": "ofac_sdn", "listedName": "PUTIN, Vladimir Vladimirovich", "programs": ["RUSSIA-EO14024"], "datesOfBirth": ["07 Oct 1952"]}
  ],
  "listsChecked": ["ofac_sdn", "ofac_consolidated", "un", "eu", "uk"],
  "listsNotChecked": []
}
```

The `OUTPUT` record holds the run summary: counts by status, the record count and date of each list, `zeroResultsReason` and `nextSteps`.

## Use cases

- **Customer and supplier onboarding:** screen new accounts before the first payment.
- **Periodic re-screening:** schedule a weekly run over your customer dataset.
- **Lead and marketplace hygiene:** screen scraped company lists before outreach.
- **Payments and invoicing:** check beneficiaries before sending money abroad.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can run this Actor through the [Apify MCP server](https://mcp.apify.com):

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/sanctions-screener"}}}
```

Or run it locally with `npx -y @apify/actors-mcp-server --tools swillz/sanctions-screener` and `APIFY_TOKEN` set.

Example prompts:

- "Is Acme Trading LLC on any sanctions list?"
- "Screen these 50 suppliers against OFAC, EU and UK sanctions and show me only potential matches."

Minimal input: `{"names": ["Acme Trading LLC"]}`. Every row has a `status`, and a run with no screened names explains why in `zeroResultsReason`.

## Integrations and API

Call it from the Apify API, the JavaScript or Python client, Make, Zapier, n8n or a webhook. To chain it after another Actor, pass that run's `datasetId` (or use an Actor-to-Actor integration). The name field is auto-detected, or set `nameField`.

## FAQ

**Is this legal or compliance advice?** No. This is a screening aid built on the official public lists. Review every `potential_match` by comparing dates of birth, countries and programs before you act, and follow your own compliance procedures.

**How fresh are the lists?** Each list is downloaded from OFAC, the UN, the European Commission or the UK FCDO at most `maxListAgeHours` ago (default 24; the copy is refreshed every 6 hours). Set `alwaysDownloadFresh` to download all lists live in your run. The summary shows each list's publication date, download time and source.

**What if a government site is down?** The run continues with the other lists. Affected rows get a `_incomplete` status, `listsNotChecked` names the missing list, and those rows are not charged.

**Too many matches?** Raise `minScore` to 92 or set `entityType`. To catch more spelling variants, lower it to 80.

**Does it cover PEPs?** No. It covers the five official sanctions lists only.

## Related tools

- [LEI Lookup](https://apify.com/swillz/lei-lookup): find the legal entity, LEI and parent companies behind a company name.
- [EU VAT Number Validator](https://apify.com/swillz/eu-vat-validator): check VAT numbers against VIES.
- [EORI Number Validator](https://apify.com/swillz/eori-validator): validate EU and UK customs numbers.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send the results to a sheet.
