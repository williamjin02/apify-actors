**XML Sitemap URL Extractor** pulls **every URL from any website's XML sitemap** and exports it to **CSV, JSON or Excel**, with `lastmod`, `changefreq`, `priority`, images and hreflang.

It works from just a domain. Sitemaps are auto-discovered through `robots.txt` and common paths, and sitemap indexes and `.xml.gz` files are followed automatically.

It's the fastest way to **extract all URLs from a sitemap**, convert a **sitemap to CSV**, check sitemap URLs for 404s, or get alerted when a site publishes new pages. Try it free: the Apify free plan covers thousands of URLs every month.

## What can XML Sitemap URL Extractor do?

- 🗺️ **Extract all URLs from a sitemap.** Give it a domain or a sitemap link and get a clean, deduplicated URL list in seconds. A 10,000-URL sitemap usually takes less than 30 seconds.
- 📄 **Convert sitemap XML to CSV, Excel or JSON.** Download in one click or fetch the results through the API.
- 🔎 **Check sitemap URLs.** The optional HTTP status check finds 404s, redirects and 5xx errors in your sitemap.
- 🆕 **Monitor new pages.** Schedule it with *Only new URLs* to catch competitor launches, new products, blog posts and job pages.
- 🎯 **Filter.** Use include and exclude patterns, a `lastmod` date range (`2026-01-01` or `7 days`) or a sub-path scope.
- ⚡ **No proxy and no browser.** Runs are fast and cheap, and it works on Shopify, WordPress, WooCommerce, Magento and custom sites.

## What data can you extract from a sitemap?

| Field | Description |
|---|---|
| `url` | Page URL listed in the sitemap |
| `lastmod` | Last modification date (ISO 8601) |
| `changefreq`, `priority` | Sitemap hints, when present |
| `imageCount` / images | Image sitemap entries (optional) |
| `alternates` | hreflang language alternates (optional) |
| `isNew` | `true` if the URL appeared since the last monitoring run |
| `httpStatus`, `finalUrl` | Status code and redirect target (optional status check) |
| `sitemapUrl`, `site` | Which sitemap and site the URL came from |

Supported formats: XML urlset, sitemap indexes nested to any depth, gzip `.xml.gz`, plain-text sitemaps, RSS/Atom feeds and Google News sitemaps.

## How to extract URLs from a sitemap (step by step)

1. Click **Try for free** and sign in to Apify. The free plan works.
2. Paste one or more domains or sitemap URLs into **Websites or sitemap URLs** (for example, `example.com`).
3. Optionally add URL patterns, a `lastmod` date range or **Check HTTP status**.
4. Click **Start**.
5. Open the **Output** tab and export the results as **CSV**, Excel, JSON or XML. That's your sitemap converted to CSV.

## How much does it cost to extract URLs from a sitemap?

You pay only for results, through **pay-per-event** pricing:

- **$0.40 per 1,000 URLs extracted.** You're charged only for URLs written to your dataset, after filters and deduplication.
- **$1.00 per 1,000 HTTP status checks**, and only if you enable the status check.
- A negligible start fee per run.

| Job | Approximate cost |
|---|---|
| Blog with 500 URLs | $0.20 |
| Store with 10,000 product URLs | $4.00 |
| 10,000 URLs + status check | $14.00 |
| Daily new-page monitor (≈20 new URLs/day) | ≈ $0.25 / month |

Set a **maximum cost per run** in the run options and the actor stops cleanly when that limit is reached. Higher Apify plans may get volume discounts (see the Pricing tab).

## Input example

```json
{
  "startUrls": [{ "url": "https://www.example.com" }],
  "includeUrlPatterns": ["*/blog/*"],
  "excludeUrlPatterns": ["*/tag/*"],
  "lastmodFrom": "30 days",
  "onlyNewUrls": false,
  "checkUrlStatus": false,
  "maxUrlsPerSite": 50000
}
```

If you pass a sub-path such as `https://example.com/blog/`, only URLs inside that path are returned. To get the whole domain, set `restrictToStartPath` to `false`.

## Output example

```json
{
  "url": "https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/",
  "lastmod": "2026-10-08T16:23:17.000Z",
  "changefreq": null,
  "priority": null,
  "imageCount": 0,
  "isNew": true,
  "httpStatus": 200,
  "finalUrl": null,
  "sitemapUrl": "https://wordpress.org/news/sitemap-2.xml",
  "site": "https://wordpress.org",
  "extractedAt": "2026-10-23T07:18:07.910Z"
}
```

A run summary is saved to the `OUTPUT` record. For each site it shows how the sitemap was discovered, which sitemaps failed, and how many URLs were filtered.

## Use cases

- **SEO audits:** list every indexable URL, then find broken or redirected URLs in the sitemap.
- **Content inventory and site migrations:** export the sitemap to CSV and confirm that every URL returns 200 after a migration.
- **Competitor monitoring:** get a daily list of new product, landing and blog pages.
- **Crawler and RAG seeding:** feed a complete URL list to Website Content Crawler or your own scraper.
- **Ecommerce research:** list every product URL of a Shopify or WooCommerce store.

## How to monitor a website for new pages

1. Enable **Only new URLs since the last run**. To run several independent monitors, give each one its own `stateKey`.
2. Create a **Schedule** in Apify (for example, daily). The first run saves a baseline, and each later run outputs only new URLs.
3. Add an integration to get notified: email, Slack, a webhook, Zapier, Make or n8n.

## Integrations and API

- **API and clients:** run it from Python or JavaScript with the Apify client, or call the REST API and download the dataset as CSV or JSON.
- **No-code:** use the official Apify apps for **Make**, **n8n** and **Zapier**. Choose *Run Actor*, then `swillz/sitemap-url-extractor`.
- **AI agents (MCP):** add it as a tool for Claude, Cursor or other MCP clients through `https://mcp.apify.com?tools=swillz/sitemap-url-extractor`.
- **Google Sheets, Slack and webhooks:** set these up from the Integrations tab of any run.

## XML Sitemap URL Extractor vs alternatives

| | This actor | Online sitemap extractor tools | Browser extensions |
|---|---|---|---|
| Auto-discovery (robots.txt, indexes, .gz) | ✅ | Partial | ❌ |
| Millions of URLs | ✅ | Usually capped | ❌ |
| Export CSV, Excel and JSON plus API | ✅ | CSV only | Copy and paste |
| HTTP status check | ✅ | ❌ | ❌ |
| Scheduled new-page monitoring | ✅ | ❌ | ❌ |
| Price | $0.40 / 1,000 URLs | Free with limits | Free |

## FAQ

**The site has no sitemap. What happens?**
The run still succeeds. The site is reported with `discoveredVia: none` in the run summary, and you aren't charged for it. If you know the exact sitemap URL, pass it directly.

**Do I need a proxy?**
Usually not, because sitemaps are meant for bots. If a site blocks datacenter IPs, enable Apify Proxy in the **Proxy** section.

**Can it handle huge sites?**
Yes. It handles indexes with hundreds of files and millions of URLs. To keep runs small, use `maxUrlsPerSite`, `maxSitemaps` and the `lastmod` filter.

**How does monitoring know which pages are new?**
Seen URLs are stored in a named key-value store (`sitemap-url-extractor-state`), under a key derived from your start URLs or under your own `stateKey`.

**Is it legal to extract URLs from a sitemap?**
Sitemaps are public files that site owners publish so automated tools can discover their pages. This actor reads only sitemaps and `robots.txt` (plus status codes, if you enable the check). It never logs in, bypasses protections or collects personal data. You are responsible for how you use the data.

**Something doesn't work, or you need a custom solution?**
Open an issue on the **Issues** tab. Bug reports and feature requests are welcome.

## Related tools

- **Website Content Crawler:** turn the extracted URLs into clean text for LLMs and RAG.

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/sitemap-url-extractor
