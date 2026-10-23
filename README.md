# Apify Actors

Reliable, tested, and maintained [Apify Actors](https://apify.com/actors) for web data. Each Actor is a standalone Node.js project under [`actors/`](actors), with source, tests, an input schema, a logo, and a Store-ready README.

These Actors are published, or on the way to the Store, under the Apify account [swillz](https://apify.com/swillz).

## Actors

| Actor | Description | Apify Store |
| --- | --- | --- |
| [sitemap-url-extractor](actors/sitemap-url-extractor) | Extract every URL from a website's XML sitemap, including sitemap indexes and `.xml.gz` files, with optional HTTP status checks and new-page monitoring. | [https://apify.com/swillz/sitemap-url-extractor](https://apify.com/swillz/sitemap-url-extractor) |
| [google-play-reviews-scraper](actors/google-play-reviews-scraper) | Scrape Google Play app reviews (rating, text, date, thumbs-up, app version, and developer replies) for any app, country, and language. | Coming soon |
| [career-site-jobs-scraper](actors/career-site-jobs-scraper) | Scrape open jobs from Greenhouse, Lever, Ashby, Workable, and Recruitee career sites, including location, remote status, salary, and apply links. | Coming soon |
| [company-website-enrichment](actors/company-website-enrichment) | Enrich company websites with name, description, role-based emails, phones, address, social profiles, careers page, and tech stack. | Coming soon |
| [google-sheets-import-export](actors/google-sheets-import-export) | Import a Google Sheet into an Apify dataset, or export a dataset to a Google Sheet with append, replace, and deduplication. | Coming soon |
| [ai-extract](actors/ai-extract) | Extract structured JSON from public web pages using a plain-English prompt or a JSON schema. | Coming soon |
| [workday-jobs-scraper](actors/workday-jobs-scraper) | Scrape every open job from any company's public Workday career site, including location, remote status, salary, posted date, and apply links. | Coming soon |

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
