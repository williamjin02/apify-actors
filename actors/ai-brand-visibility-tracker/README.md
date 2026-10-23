# AI Brand Visibility Tracker: ChatGPT Mentions, Rank & Citations

**Does ChatGPT recommend your brand?** Give this Actor your brand, your competitors and the questions your buyers ask. It asks each question to ChatGPT **with live web search** through the official OpenAI API and tells you, for every answer:

- whether your brand is **mentioned**, in what **order** (rank among tracked brands) and at which **list position**
- whether ChatGPT **cites your website** and which domains it cites instead
- the **sentiment** and whether the answer **recommends** you
- which **competitors** and **other brands** show up

Then it rolls everything up into a **share-of-voice leaderboard**: mention rate, average rank, first-place count, citation rate and sentiment per brand, per-prompt results, and the most-cited domains (the sites you need to be on).

No OpenAI key needed. **$0.04 per check** (one prompt asked once), or **$0.01 per check with your own OpenAI key**.

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

| | Price |
|---|---|
| Check with the built-in AI (web search included) | **$0.04** |
| Check with your own OpenAI key | **$0.01** (+ your OpenAI usage, about $0.01-0.02 per check on the default model) |

Failed checks are not charged. Example: 10 prompts x 3 samples = 30 checks = $1.20. Set *Max checks* or the run's maximum cost to cap spend.

## How it works and limitations

- Uses the **official OpenAI Responses API with the web search tool**. It does **not** scrape chatgpt.com, so it never logs in and does not break when the UI changes.
- API answers are close to, but **not identical to**, what a logged-in ChatGPT user sees (no personalization or memory). Treat results as a consistent benchmark, not a screenshot.
- AI answers are non-deterministic: use *samples per prompt* and track trends over time.
- Mentions are matched on the names and aliases you provide (whole words, case-insensitive). Rank = order of first mention among the brands you track.
- **Privacy**: query strings are stripped from every URL (some sites put tracking IDs or e-mail addresses in them), and e-mail addresses and phone numbers in answers are removed. Track brands, not people.
- Coming next: Perplexity, Gemini and Google AI Overviews engines.

## FAQ

**Can I schedule it?** Yes. Save your input as a task and add an Apify schedule (e.g. weekly). Each run's summary makes a clean time series.

**Which model is used?** `gpt-6-luna` with web search by default. With your own key you can choose any web-search-capable OpenAI model.

**Is it legal?** It only sends your prompts to OpenAI's public API under OpenAI's terms and returns the answers. No website is scraped.

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/ai-brand-visibility-tracker. Issues and feature requests are welcome in the Issues tab.
