**AI Extract** turns **any public web page into structured JSON** using a **plain-English prompt or a JSON schema**. Paste product, article, event, job or listing URLs (or crawl a whole section of a site), describe the fields you want, and get one clean row per page: `{"title": …, "price": 19.99, "inStock": true, …}`. Export to **CSV, JSON or Excel**, or call it from your app, Make, n8n, Zapier or an AI agent.

**The AI is included, so you don't need an API key.** Each page is cleaned into compact markdown, sent to a fast, accurate model with **strict schema-constrained output**, and checked against your schema. AI Extract **respects robots.txt** and costs **$8 per 1,000 pages extracted**, or **$2 per 1,000 if you bring your own AI key**. Pages that fail are free.

## What can AI Extract do?

- 🧠 **Prompt or schema:** write "product name, price as a number, currency and stock status", give a JSON Schema, or both. A shorthand such as `{"title":"string","price":"number","tags":"string[]"}` also works.
- ✅ **Validated output:** every answer is checked against your schema. If it doesn't match, AI Extract retries with the errors. Pages that still don't match are returned as `invalid_output` and **not charged**.
- 🕸️ **URLs or crawl:** process a list of URLs, or start from a category page and follow links up to a crawl depth, with a page limit, same-site restriction and include/exclude URL patterns.
- 🧹 **Clean markdown, fewer tokens:** scripts, navigation, footers, cookie banners and ads are stripped. You can narrow extraction to a CSS selector (`main`, `.product`) and get the markdown back for RAG.
- 🔑 **Bring your own key (optional):** OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq, OpenRouter, Together or any OpenAI-compatible API. Your key is stored encrypted, and you can cap your AI spend per run.
- 🛡️ **Safe defaults:** robots.txt and crawl-delay are honored, there are no logins, and requests to the same site are spaced out. The AI is told to use only what's on the page, return `null` instead of guessing, and ignore instructions hidden in page text.

## What data can you extract?

Anything that's visible in the page text. Typical examples:

| Page type | Example fields |
|---|---|
| Product pages | name, brand, price, currency, availability, rating, SKU, specs |
| Category / listing pages | `items: [{name, price, url}]` for every product on the page |
| Articles and blogs | headline, author byline, published date, summary, tags |
| Events | name, date, venue, city, price, ticket URL |
| Job posts | title, company, location, salary range, remote, requirements |
| Company pages | company name, what they do, pricing plans, integrations |
| Documentation | API endpoints, parameters, version numbers |

Each row has `url`, `status`, `title`, `data` (your fields), `error`, `truncated`, `inputTokens`, `outputTokens`, `model` and `extractedAt`.

## How to extract data from a website with AI (step by step)

1. Click **Try for free** and sign in to Apify. The free plan needs no card.
2. Paste your page URLs into **Start URLs**.
3. Describe what you want in **Instructions**, and/or paste a **JSON schema**.
4. Optional: set **Crawl depth** to 1+ to follow links, and use **Only follow URLs matching** (e.g. `/product/`) to stay on relevant pages.
5. Click **Start**, then open the **Overview** table or download CSV, Excel or JSON.

## How much does it cost?

AI Extract uses **pay-per-result pricing**. You pay only for pages where data was successfully extracted and validated, plus a tiny $0.00005 per run start. The AI cost is included.

| Apify plan | Built-in AI, per 1,000 pages | Your own AI key, per 1,000 pages |
|---|---|---|
| Free | $12 | $2 (+ your provider's tokens) |
| Starter | $12 | $2 |
| Scale | $10 | $2 |
| Business and up | $8 | $2 |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold). Example: 10,000 pages with the built-in AI cost $120 on Starter, $100 on Scale or $80 on Business.

Pages that fail to load, are blocked by robots.txt, are empty, fail AI extraction or don't match your schema are returned with a status and **not charged**. Apify's **free plan includes $5 of monthly credit**. On the free plan the built-in AI processes up to **25 pages per run** (add your own AI key, or use any paid Apify plan, for bigger runs). You can set a maximum cost per run, and the actor stops cleanly when it's reached.

## Input example

```json
{
  "startUrls": [{ "url": "https://books.toscrape.com/catalogue/category/books/travel_2/index.html" }],
  "maxCrawlDepth": 1,
  "maxPages": 20,
  "includeUrlPatterns": ["/catalogue/[^/]+_\\d+/index\\.html"],
  "instructions": "Extract the book title, price as a number, currency code, whether it is in stock and the star rating (1-5).",
  "jsonSchema": { "title": "string", "price": "number", "currency": "string", "inStock": "boolean", "rating": "integer" }
}
```

## Output example

```json
{
  "url": "https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html",
  "loadedUrl": "https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html",
  "depth": 1,
  "status": "ok",
  "title": "It's Only the Himalayas | Books to Scrape - Sandbox",
  "data": { "title": "It's Only the Himalayas", "price": 45.17, "currency": "GBP", "inStock": true, "rating": 2 },
  "error": null,
  "truncated": false,
  "inputTokens": 1873,
  "outputTokens": 41,
  "model": "gpt-6-luna",
  "aiKey": "built-in",
  "extractedAt": "2026-10-23T18:05:12.000Z"
}
```

A run summary is saved to the `OUTPUT` record in the key-value store. It includes pages extracted, status counts, tokens and AI cost.

## Use cases

- **Ecommerce monitoring:** prices, stock and ratings from any store without writing a scraper per site.
- **Lead and market research:** pricing plans, features and integrations from competitor and vendor pages.
- **Content and RAG pipelines:** clean markdown plus structured metadata (title, date, summary) for every article.
- **Directories and listings:** turn a listing page into `items: [...]` rows in one call.
- **One-off data jobs:** when a site changes layout, your prompt still works and no selectors break.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/ai-extract`.
- **API:** `POST https://api.apify.com/v2/acts/swillz~ai-extract/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns the rows directly. JavaScript and Python clients are available.
- **AI agents (MCP):** connect `https://mcp.apify.com?tools=swillz/ai-extract` to Claude, Cursor or any MCP client and ask, for example, "get the price and stock status from these 5 product pages".

## AI Extract vs alternatives

| | AI Extract | Typical AI scraper actors | Hand-written scrapers |
|---|---|---|---|
| Price per 1,000 pages | $8-12 by plan (AI included), $2 with your key | $20-30 by plan | Your dev time |
| Schema-validated JSON | ✅ with automatic retry | Varies | ✅ |
| Works when layout changes | ✅ | ✅ | ❌ selectors break |
| Bring your own AI key | ✅ 8 providers | Rarely | n/a |
| Failed pages charged | ❌ free | Varies | n/a |

## FAQ

**Do I need an OpenAI or other AI API key?**
No. The built-in AI is included in the $8-12 per 1,000 pages price (lower on bigger Apify plans). Add your own key only if you want the lower $2 per 1,000 price or a specific model.

**How accurate is it?**
On clean product, article and event pages it is very accurate, because the model sees only the page's main content and answers are schema-constrained and validated. Fields that aren't on the page come back as `null`; the AI is instructed never to invent values. Pages longer than **Max input tokens per page** are trimmed (`truncated: true`), so use a **Content CSS selector** for very long pages.

**Does it work on JavaScript-heavy sites?**
AI Extract loads pages over fast HTTP without a browser. Sites that render everything in the browser can come back as `empty_page`; those pages are not charged.

**Is it legal?**
AI Extract reads only public, logged-out pages and respects robots.txt. Please don't use it to collect personal data about private individuals; the AI is also instructed to skip personal contact details. Make sure your use of the data complies with the site's terms and laws like GDPR and copyright law.

**What do the statuses mean?**
- `ok`: extracted and charged.
- `http_error`: the page returned an error. A 403 usually means bot protection, so try enabling a proxy.
- `fetch_error`: the page could not be reached.
- `blocked_by_robots_txt`: the site disallows automated access.
- `not_html` or `empty_page`: there was nothing to read.
- `ai_error` or `invalid_output`: the AI failed or its answer didn't match your schema.
- `skipped_cost_cap`: your spending limit was reached.

Only `ok` rows are charged.

**Found a bug or need a feature?**
Open an issue on the **Issues** tab. We usually reply within 24 hours.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).

**Popular workflows**

- **Catalog or content extraction:** list every product or article URL with [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor), turn each page into JSON with this Actor, and export with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/ai-extract
