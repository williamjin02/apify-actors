# AI Brand Visibility Tracker: ChatGPT Mentions, Rank & Citations

**Does ChatGPT recommend your brand?** Give this Actor your brand, your competitors and the questions your buyers ask. It asks each question to ChatGPT **with live web search** through the official OpenAI API and tells you, for every answer:

- whether your brand is **mentioned**, in what **order** (rank among tracked brands) and at which **list position**
- whether ChatGPT **cites your website** and which domains it cites instead
- the **sentiment** and whether the answer **recommends** you
- which **competitors** and **other brands** show up

Then it rolls everything up into a **share-of-voice leaderboard**: mention rate, average rank, first-place count, citation rate and sentiment per brand, per-prompt results, and the most-cited domains (the sites you need to be on).

No OpenAI key needed. **$0.04-0.05 per check** (one prompt asked once, depending on your Apify plan), or **$0.01 per check with your own OpenAI key**.

## Use cases

- **GEO / AI SEO**: measure your visibility in AI answers and track it weekly with an Apify schedule.
- **Competitor benchmarking**: see who ChatGPT recommends for "best X for Y" prompts in your category.
- **Content and PR targeting**: the *top cited domains* list shows which review sites, blogs and docs feed the AI answers.
- **Agencies**: run the same prompt set for many clients and export to Sheets, Looker Studio or your BI tool.

## Input

| Field | Example | Notes |
|---|---|---|
| Your brand | `Notion` | Companies and products only, not private people |
| Your website domain | `notion.com` | Detects citations of your site |
| Other names | `Notion AI` | Also count as a mention |
| Competitors | `Coda \| coda.io` | One per line, domain optional, up to 20 |
| Prompts | `What is the best wiki tool for a small startup?` | Up to 100 |
| Samples per prompt | `1`-`5` | AI answers vary; more samples give a steadier rate |
| Country | `US` | Localizes the web search |

```json
{
  "brand": "Notion",
  "brandDomain": "notion.com",
  "competitors": ["Coda | coda.io", "Confluence | atlassian.com", "ClickUp | clickup.com"],
  "prompts": ["What is the best wiki tool for a small startup?", "Best alternatives to Confluence for documentation"],
  "samplesPerPrompt": 1,
  "country": "US"
}
```

## Output

**Dataset: one row per check**

```json
{
  "engine": "chatgpt", "model": "gpt-6-luna", "prompt": "What is the best wiki tool for a small startup?", "sample": 1, "country": "US",
  "brand": "Notion", "brandMentioned": true, "brandRank": 1, "brandListPosition": 1, "brandCited": true,
  "brandSentiment": "positive", "brandRecommended": true,
  "competitorsMentioned": ["Confluence"], "mentionedOrder": ["Notion", "Confluence"],
  "entities": [{ "name": "Notion", "role": "brand", "mentioned": true, "mentionCount": 3, "rank": 1, "listPosition": 1, "cited": true, "citedUrls": ["https://www.notion.com/product/wikis"], "sentiment": "positive", "recommended": true }],
  "citations": [{ "url": "https://www.notion.com/product/wikis", "title": "Wikis | Notion", "domain": "notion.com", "kind": "cited" }],
  "citedDomains": ["notion.com", "support.atlassian.com"],
  "otherBrandsMentioned": ["Slab", "Slite"],
  "searchQueries": ["best wiki tool small startup 2026"],
  "answer": "1. **Notion** - ...", "status": "ok", "checkedAt": "2026-10-23T17:00:00.000Z"
}
```

**Summary (key-value store `OUTPUT`)**: `brandMentionRate`, `brandShareOfVoice`, `brandAvgRank`, a `leaderboard` (mentions, mentionRate, shareOfVoice, avgRank, firstPlace, citationRate, recommended, sentiment per brand), per-prompt results, `topCitedDomains` and `otherBrandsMentioned`.

## Pricing

| Apify plan | Check with the built-in AI (web search included) | Check with your own OpenAI key |
|---|---|---|
| Free | **$0.05** | **$0.01** (+ your OpenAI usage, about $0.01-0.02 per check on the default model) |
| Starter | **$0.05** | **$0.01** |
| Scale | **$0.045** | **$0.01** |
| Business and up | **$0.04** | **$0.01** |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold).

Failed checks are not charged. Example: 10 prompts x 3 samples = 30 checks = $1.50 on Starter ($1.20 on Business). Set *Max checks* or the run's maximum cost to cap spend. On the Apify free plan, the built-in AI runs up to 10 checks per run; add your own OpenAI key, or use any paid Apify plan, for bigger runs.

## How it works and limitations

- Uses the **official OpenAI Responses API with the web search tool**. It does **not** scrape chatgpt.com, so it never logs in and does not break when the UI changes.
- API answers are close to, but **not identical to**, what a logged-in ChatGPT user sees (no personalization or memory). Treat results as a consistent benchmark, not a screenshot.
- AI answers are non-deterministic: use *samples per prompt* and track trends over time.
- Mentions are matched on the names and aliases you provide (whole words, case-insensitive). Rank = order of first mention among the brands you track.
- **Privacy**: query strings are stripped from every URL (some sites put tracking IDs or e-mail addresses in them), and e-mail addresses and phone numbers in answers are removed. Track brands, not people.
- Coming next: Perplexity, Gemini and Google AI Overviews engines.

## How to track AI visibility every week

1. Run it once with your brand, competitors and 10-30 buyer prompts, then **Save as task**.
2. In **Schedules**, run the task weekly (same prompts every time, so the numbers are comparable).
3. Send each run's `OUTPUT` summary to a Google Sheet, Slack or a webhook. You get a share-of-voice trend line per brand.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/ai-brand-visibility-tracker`.
- **API:** `POST https://api.apify.com/v2/acts/swillz~ai-brand-visibility-tracker/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns one row per check.
- **AI agents (MCP):** add `https://mcp.apify.com?tools=swillz/ai-brand-visibility-tracker` to Claude, Cursor or any MCP client and ask "how often does ChatGPT recommend us vs Coda for wiki prompts?".
- **Looker Studio or BI:** export the dataset as CSV or JSON, or append it to a sheet on every run.

## AI Brand Visibility Tracker vs alternatives

| | This Actor | GEO SaaS dashboards | Asking ChatGPT by hand |
|---|---|---|---|
| Price | $0.04-0.05 per check, no subscription | Typically a monthly subscription | Your time |
| Raw data (answers, citations, ranks) | ✅ JSON / CSV / Sheets | Varies | ❌ |
| Competitor share of voice | ✅ up to 20 competitors | ✅ | ❌ |
| Scheduling and API | ✅ Apify schedules, API, MCP | Varies | ❌ |
| Reproducible benchmark | ✅ same prompts, samples per prompt | ✅ | ❌ |

## FAQ

**Can I schedule it?** Yes. Save your input as a task and add an Apify schedule (e.g. weekly). Each run's summary makes a clean time series.

**Which model is used?** `gpt-6-luna` with web search by default. With your own key you can choose any web-search-capable OpenAI model.

**Is it legal?** It only sends your prompts to OpenAI's public API under OpenAI's terms and returns the answers. No website is scraped.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.

**Popular workflows**

- **Weekly AI-visibility report:** schedule this Actor weekly and append each run's share of voice to a sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/ai-brand-visibility-tracker. Issues and feature requests are welcome in the Issues tab.
