# Apify Actors

Reliable, tested, and maintained [Apify Actors](https://apify.com/actors) for web data. Each Actor is a standalone Node.js project under [`actors/`](actors), with source, tests, an input schema, a logo, and a Store-ready README.

These Actors are published, or on the way to the Store, under the Apify account [swillz](https://apify.com/swillz).

## Actors

| Actor | Description | Apify Store |
| --- | --- | --- |
| [sitemap-url-extractor](actors/sitemap-url-extractor) | Extract every URL from a website's XML sitemap, including sitemap indexes and `.xml.gz` files, with optional HTTP status checks and new-page monitoring. | [https://apify.com/swillz/sitemap-url-extractor](https://apify.com/swillz/sitemap-url-extractor) |
| [google-play-reviews-scraper](actors/google-play-reviews-scraper) | Scrape Google Play app reviews (rating, text, date, thumbs-up, app version, and developer replies) for any app, country, and language. | Coming soon |
| [career-site-jobs-scraper](actors/career-site-jobs-scraper) | Scrape open jobs from Greenhouse, Lever, Ashby, Workable, and Recruitee career sites, including location, remote status, salary, and apply links. | [https://apify.com/swillz/career-site-jobs-scraper](https://apify.com/swillz/career-site-jobs-scraper) |
| [company-website-enrichment](actors/company-website-enrichment) | Enrich company websites with name, description, role-based emails, phones, address, social profiles, careers page, and tech stack. | [https://apify.com/swillz/company-website-enrichment](https://apify.com/swillz/company-website-enrichment) |
| [google-sheets-import-export](actors/google-sheets-import-export) | Import a Google Sheet into an Apify dataset, or export a dataset to a Google Sheet with append, replace, and deduplication. | [https://apify.com/swillz/google-sheets-import-export](https://apify.com/swillz/google-sheets-import-export) |
| [ai-extract](actors/ai-extract) | Extract structured JSON from public web pages using a plain-English prompt or a JSON schema. | [https://apify.com/swillz/ai-extract](https://apify.com/swillz/ai-extract) |
| [workday-jobs-scraper](actors/workday-jobs-scraper) | Scrape every open job from any company's public Workday career site, including location, remote status, salary, posted date, and apply links. | [https://apify.com/swillz/workday-jobs-scraper](https://apify.com/swillz/workday-jobs-scraper) |
| [ai-brand-visibility-tracker](actors/ai-brand-visibility-tracker) | Track how often ChatGPT (with live web search) mentions, ranks, and cites your brand versus competitors, with share of voice, sentiment, and cited domains. | [https://apify.com/swillz/ai-brand-visibility-tracker](https://apify.com/swillz/ai-brand-visibility-tracker) |
| [email-provider-detector](actors/email-provider-detector) | Detect whether a domain uses Google Workspace, Microsoft 365 or another mailbox provider, including the provider behind secure email gateways like Proofpoint and Mimecast, with SPF, DMARC and DKIM checks. DNS only. | [https://apify.com/swillz/email-provider-detector](https://apify.com/swillz/email-provider-detector) |
| [hiring-signals-by-domain](actors/hiring-signals-by-domain) | Turn company domains into hiring signals: whether the company is hiring, open roles by function and seniority, leadership hires, locations, remote share and posting velocity, from its public Greenhouse, Lever, Ashby, Workable or Recruitee board. | [https://apify.com/swillz/hiring-signals-by-domain](https://apify.com/swillz/hiring-signals-by-domain) |
| [eu-vat-validator](actors/eu-vat-validator) | Bulk-validate EU VAT numbers against the official EU VIES service, with registered name and address, consultation number and name match. Bad formats and VIES outages return status rows. | [https://apify.com/swillz/eu-vat-validator](https://apify.com/swillz/eu-vat-validator) |
| [eori-validator](actors/eori-validator) | Bulk-validate EU and UK (GB/XI) EORI numbers against the official EU EOS and UK HMRC services, with registered trader name and address where published. Bad formats and outages return status rows. | [https://apify.com/swillz/eori-validator](https://apify.com/swillz/eori-validator) |
| [lei-lookup](actors/lei-lookup) | Look up Legal Entity Identifiers (LEI) in the official GLEIF register by LEI, company name, BIC or ISIN, with legal name, addresses, status, renewal date and parent companies. | [https://apify.com/swillz/lei-lookup](https://apify.com/swillz/lei-lookup) |
| [sanctions-screener](actors/sanctions-screener) | Screen people and companies against the official OFAC SDN and Consolidated, UN, EU and UK sanctions lists with fuzzy name matching, aliases and country hints. Lists refreshed every 6 hours. | [https://apify.com/swillz/sanctions-screener](https://apify.com/swillz/sanctions-screener) |
| [hts-code-lookup](actors/hts-code-lookup) | Look up US HTS codes and import duty rates in the official USITC Harmonized Tariff Schedule by code or product description, with general, special and column 2 rates, units and Chapter 99 references. | [https://apify.com/swillz/hts-code-lookup](https://apify.com/swillz/hts-code-lookup) |
| [federal-awards-by-company](actors/federal-awards-by-company) | Get the federal contracts, grants and loans a US company won from official USAspending.gov data, by company name or UEI, with a per-company summary of total obligated, top agencies and NAICS. | [https://apify.com/swillz/federal-awards-by-company](https://apify.com/swillz/federal-awards-by-company) |
| [grants-gov-opportunity-search](actors/grants-gov-opportunity-search) | Search open and forecasted US federal grant opportunities from the official Grants.gov API by keyword, agency, eligibility, category or opportunity number, with deadlines, award ceilings, funding and eligibility details. | [https://apify.com/swillz/grants-gov-opportunity-search](https://apify.com/swillz/grants-gov-opportunity-search) |
| [ai-crawler-access-checker](actors/ai-crawler-access-checker) | Bulk check which AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and 18 more) websites allow or block in robots.txt, with a training-vs-AI-search verdict, llms.txt, Content-Signal and meta robots. | [https://apify.com/swillz/ai-crawler-access-checker](https://apify.com/swillz/ai-crawler-access-checker) |

## Run an Actor

### On Apify

1. Open a live Actor from the table above. Actors marked **Coming soon** are not on the Store yet.
2. Sign in and choose **Try for free**.
3. Fill in the input, start the run, and export the dataset as CSV, JSON, Excel, or XML.

You can also start runs with the [Apify API](https://docs.apify.com/api/v2) or the [JavaScript](https://docs.apify.com/api/client/js) and [Python](https://docs.apify.com/api/client/python) clients. Create a token in Apify Console under **Settings → API & Integrations**. Keep that token out of this repository and out of committed input files.

### Locally

Actors require Node.js 20 or newer.

```bash
cd actors/sitemap-url-extractor
npm install
npm test
```

Repeat that in any other `actors/<name>` directory. `npm test` runs the local unit tests and does not call Apify.

To execute an Actor the way the platform does, use the [Apify CLI](https://docs.apify.com/cli). Put your input in `storage/key_value_stores/default/INPUT.json` (that directory is gitignored), then:

```bash
npm install -g apify-cli
apify run
```

`npm start` runs `src/main.js` directly. A full local run expects the SDK environment that `apify run` sets up.

## Use these tools from an AI agent

Every Actor here works as an MCP tool for Claude, ChatGPT, Cursor and other agents through [mcp.apify.com](https://mcp.apify.com). Load all of them at once:

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/sitemap-url-extractor,swillz/career-site-jobs-scraper,swillz/company-website-enrichment,swillz/google-sheets-import-export,swillz/workday-jobs-scraper,swillz/ai-extract,swillz/ai-brand-visibility-tracker,swillz/email-provider-detector,swillz/hiring-signals-by-domain,swillz/eu-vat-validator,swillz/eori-validator,swillz/lei-lookup,swillz/sanctions-screener,swillz/hts-code-lookup,swillz/federal-awards-by-company,swillz/grants-gov-opportunity-search,swillz/ai-crawler-access-checker"}}}
```

Agent-friendly by design: plain JSON inputs with real defaults, input descriptions that show the exact shape, and no silent empty runs (an input that returns nothing gets a free status row with the reason). Pipeline example: Workday Jobs Scraper → Company Website Enrichment → Google Sheets Import & Export.

## Make, n8n, Zapier, and MCP

Apify connects these Actors to automation tools and AI clients. Sign in with your Apify account, choose **Run Actor**, and select the Actor (for example `swillz/sitemap-url-extractor`).

- [Make](https://docs.apify.com/integrations/make) — visual scenarios that run an Actor and pass dataset items to the next step.
- [n8n](https://docs.apify.com/integrations/n8n) — open-source workflows that use the Apify node.
- [Zapier](https://docs.apify.com/integrations/zapier) — Zaps that start an Actor or run when an Actor finishes.
- [MCP](https://docs.apify.com/mcp) — expose Actors as tools for Claude, Cursor, and other MCP clients through [mcp.apify.com](https://mcp.apify.com).

## Contributing

Bug reports and feature requests belong on [GitHub Issues](https://github.com/williamjin02/apify-actors/issues). Include the Actor name, the input you used (with any tokens removed), and the relevant run log or test output.

Pull requests should keep each Actor's tests passing. GitHub Actions installs dependencies and runs `npm test` for every Actor that defines a test script.

## License

[MIT](LICENSE). Copyright (c) 2026 William Jin.
