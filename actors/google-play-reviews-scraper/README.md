**Google Play Reviews Scraper** extracts **app reviews from the Google Play Store** and exports them to **CSV, JSON or Excel**. For every review you get the star rating, the full text, the date, the thumbs-up count, the app version and the **developer reply**.

Scrape any Android app in any **country and language**, filter by **star rating** and **date**, and schedule it to monitor new reviews. It uses plain HTTP, with no login, no browser and no Google account, so it's fast and cheap: **1,000 reviews take about 2 seconds and cost $0.10**. Try it free: the Apify free plan covers tens of thousands of reviews every month.

## What can Google Play Reviews Scraper do?

- ⭐ **Scrape Google Play reviews for any app.** Paste a package name (`com.spotify.music`) or a Play Store URL. Add as many apps as you like.
- 🌍 **Any country and language.** Get reviews from the US, UK, Germany, India, Brazil, Japan and more, in the local language.
- 🎯 **Filter by stars and date.** Only 1-star complaints, only 5-star praise, or only reviews from the last 7 days.
- 💬 **Developer replies included.** See how a developer answers each review, and when.
- 🔁 **Monitor new reviews.** Schedule it with sort = Newest and *Only reviews since* = `1 day` to get each day's new reviews in Slack, Google Sheets or your database.
- ⚡ **Fast and reliable.** Uses Google Play's own review data endpoint, with automatic retries and clear error messages. No data is invented, and no silent empty runs.
- 📦 **Export anywhere.** CSV, Excel, JSON, XML or HTML, plus API, webhooks, Make, n8n, Zapier and MCP.

## What data can you extract from Google Play reviews?

| Field | Example |
|---|---|
| `appTitle`, `appId` | Spotify: Music and Podcasts, `com.spotify.music` |
| `rating` | 1–5 stars |
| `text` | Full review text |
| `date` | `2026-10-22T07:50:30.359Z` |
| `userName`, `userImage` | Reviewer display name and avatar URL |
| `thumbsUpCount` | How many people found the review helpful |
| `appVersion` | App version the reviewer used, e.g. `9.1.44.2120` |
| `replyText`, `replyDate` | Developer reply and when it was posted |
| `language`, `country` | `en`, `us` |
| `reviewId`, `reviewUrl` | Stable ID and a direct link to the review |

## How to scrape Google Play reviews (step by step)

1. Click **Try for free** and sign in to Apify (free plan, no card needed).
2. In **Apps**, paste one or more package names or Google Play URLs.
3. Set **Max reviews per app** (for example 1,000) and pick a sort order.
4. Optional: choose star ratings, a date such as `30 days`, a language and a country.
5. Click **Start**. When the run finishes, download the reviews as CSV, Excel or JSON, or open them in the table view.

**Tip:** to find the package name, open the app on play.google.com. It's the `id=` part of the URL.

## How much does it cost to scrape Google Play reviews?

This actor uses **pay-per-result pricing**: you pay **$0.10 per 1,000 reviews** plus a tiny $0.00005 per run start. There are no monthly fees and no compute or proxy charges on top. Apify Store discounts on higher plans make it even cheaper.

| Reviews | Price |
|---|---|
| 1,000 | $0.10 |
| 10,000 | $1.00 |
| 100,000 | $10.00 |

Apify's **free plan includes $5 of monthly credit**, which is enough for about **50,000 reviews a month for free**. You can also set a maximum cost per run, and the actor stops cleanly when it reaches it.

## Input example

```json
{
  "apps": ["com.spotify.music", "https://play.google.com/store/apps/details?id=com.duolingo"],
  "maxReviewsPerApp": 500,
  "sort": "NEWEST",
  "ratings": ["1", "2"],
  "reviewsSince": "30 days",
  "language": "en",
  "country": "us"
}
```

## Output example

```json
{
  "reviewId": "daedd14d-a196-459f-a2de-321963ae08b2",
  "appId": "com.spotify.music",
  "appTitle": "Spotify: Music and Podcasts",
  "userName": "Noone",
  "userImage": "https://play-lh.googleusercontent.com/a/ACg8oc...",
  "rating": 1,
  "text": "spotify was so much better before... 5 ads in a span of 10mins? atrocious!!",
  "date": "2026-10-22T07:50:30.359Z",
  "thumbsUpCount": 0,
  "appVersion": "9.1.44.2120",
  "replyText": null,
  "replyDate": null,
  "language": "en",
  "country": "us",
  "reviewUrl": "https://play.google.com/store/apps/details?id=com.spotify.music&reviewId=daedd14d-a196-459f-a2de-321963ae08b2",
  "scrapedAt": "2026-10-23T07:51:33.120Z"
}
```

A run summary (apps found, reviews per app, requests and retries) is saved to the `OUTPUT` record in the key-value store.

## Use cases

- **App review analysis and sentiment analysis.** Feed reviews into ChatGPT, Claude or a BI tool to find top complaints and feature requests.
- **Competitor research.** Compare ratings and pain points across competing apps and countries.
- **Customer support and ASO.** Track unanswered 1-star reviews and how fast developers reply. Find keywords users actually use.
- **Product and QA.** Catch crash or login complaints right after a release by filtering on `appVersion`.
- **Market research and academic datasets.** Build multilingual app review datasets for NLP and LLM fine-tuning.

## How to monitor new Google Play reviews

1. Set **Sort by** = Newest and **Only reviews since** = `1 day` (or `7 days` for a weekly run).
2. Save the input as a task, and add a **Schedule** (daily at 8:00, for example).
3. Connect an integration: send new reviews to **Slack**, **Google Sheets**, **email** or a **webhook**.

Because the scraper stops as soon as it reaches older reviews, a daily monitoring run usually costs less than a cent.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/google-play-reviews-scraper`. Then map the dataset items to the next step.
- **API:** start runs and fetch results with the [Apify API](https://docs.apify.com/api/v2) or the JavaScript and Python clients. For example, `POST https://api.apify.com/v2/acts/swillz~google-play-reviews-scraper/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns the reviews directly.
- **AI agents (MCP):** connect `https://mcp.apify.com?tools=swillz/google-play-reviews-scraper` to Claude, Cursor or any MCP client, and ask, for example, "get the latest 200 one-star reviews of com.duolingo".

## Google Play Reviews Scraper vs alternatives

| | This actor | Manual copy-paste | Google Play Console |
|---|---|---|---|
| Any app (not just yours) | ✅ | ✅ | ❌ own apps only |
| Countries and languages | ✅ any | 😐 one at a time | ✅ |
| Star and date filters | ✅ | ❌ | ✅ |
| Developer replies | ✅ | 😐 | ✅ |
| Export to CSV/JSON/Excel, API | ✅ | ❌ | 😐 CSV, delayed |
| Scheduling and alerts | ✅ | ❌ | ❌ |
| Price | $0.10 per 1,000 | Your time | Free (own apps) |

## FAQ

**Is it legal to scrape Google Play reviews?**
Reviews are publicly visible. This actor only collects public data and doesn't log in. Reviews contain personal data such as user names, so make sure your use complies with GDPR and other applicable laws, and only collect what you need. If in doubt, consult a lawyer.

**How many reviews can I get?**
As many as Google Play shows for the app, country and language. Popular apps have hundreds of thousands. Set *Max reviews per app* to `0` for no limit.

**Why do I get fewer reviews than the app's total rating count?**
Many users leave a star rating without text. Google Play only lists reviews with text, and it lists them per language and country. Try another language or country to get more.

**Do I need a proxy?**
Usually not. For very large runs (hundreds of thousands of reviews), turn on Apify Proxy if you see HTTP 429 errors. The actor retries automatically.

**What if an app doesn't exist?**
The run finishes with a clear message in the log and the run status. You're never charged for reviews that weren't returned.

**Can I scrape iOS App Store reviews too?**
An App Store reviews scraper is on our roadmap. See *Related tools* below.

**Found a bug or need a field?**
Open an issue on the **Issues** tab. We usually reply within 24 hours.

## Related tools

- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): extract every URL from any website's sitemap.

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/google-play-reviews-scraper
