**AI Crawler Access Checker** tells you, for any list of websites, **which AI crawlers are allowed or blocked in robots.txt**: OpenAI's GPTBot, OAI-SearchBot and ChatGPT-User, Anthropic's ClaudeBot, Claude-SearchBot and Claude-User, PerplexityBot, Google-Extended, Applebot-Extended, Meta, Amazon, Common Crawl (CCBot), Bytespider and more (23 crawlers, plus any user-agent you add).

It separates **AI training bots** from **AI search and assistant bots**, so you see at a glance whether a site can still be **cited in ChatGPT, Claude and Perplexity answers** (`aiSearchAllowed`) or only blocks model training (`blocks_ai_training_only`). It also reads **llms.txt / llms-full.txt**, Cloudflare **Content-Signal** (`ai-train`, `ai-input`, `search`), meta robots and X-Robots-Tag (`noai`, `noimageai`, `noindex`).

Rules are evaluated like a real crawler, following **RFC 9309**: the bot's own group overrides `*`, longest match wins, `Allow` wins ties, `*` and `$` wildcards, redirects followed. Only public files are read (robots.txt, llms.txt and the one page you test, if robots.txt allows it). No logins, no personal data.

**When to use:** GEO / AI SEO audits, checking whether your own site or clients are invisible to AI search, publisher and competitor research, lead lists of sites that block (or allow) AI, monitoring robots.txt changes, or filtering sites before an AI scraping job.
**Input:** domains or URLs, e.g. `{"domains":["nytimes.com","stripe.com"]}`.
**Output:** one row per site with `aiAccessVerdict`, `aiSearchAllowed`, blocked and allowed bot lists, per-bot matched rules, llms.txt details and meta robots. From $1.60 per 1,000 sites.

## What can AI Crawler Access Checker do?

- **Bulk check robots.txt for AI bots:** thousands of sites per run, 10 in parallel by default.
- **Training vs AI search, separated:** `trainingBotsBlocked`, `answerBotsBlocked`, `aiSearchAllowed` and a one-word verdict: `allows_all_ai`, `blocks_ai_training_only`, `blocks_some_ai_search` or `blocks_all_ai`.
- **Explain every decision:** for each bot, the user-agent group that matched and the exact rule (e.g. `GPTBot` → `Disallow: /`).
- **llms.txt check:** found or not, title, summary, sections, link count and whether it follows the llms.txt format; plus llms-full.txt.
- **Content signals and meta tags:** Cloudflare Content-Signal, meta robots, X-Robots-Tag, `noai` / `noimageai`, and a hint when a firewall answers 403 to bots.
- **Any path, any bot:** test `/blog/` instead of the whole site, or add your own tokens in `customUserAgents`.
- **Chain from other Actors:** pass a `datasetId` from a lead list, Google Maps or SERP scrape and it reads the website field.

## What data does it return?

| Field | Example | Meaning |
|---|---|---|
| `aiAccessVerdict` | `blocks_some_ai_search` | One-word summary for AI crawlers (Googlebot and Bingbot not counted) |
| `aiSearchAllowed` | `false` | No AI search or assistant bot is blocked, so the site can be cited in AI answers |
| `blockedBots` | `["GPTBot","ClaudeBot",…]` | Crawlers disallowed on the tested path |
| `allowedBots` | `["Bingbot","Applebot"]` | Crawlers allowed |
| `trainingBotsBlocked` / `answerBotsBlocked` | `10` / `8` | Counts by purpose |
| `googlebotAllowed` / `bingbotAllowed` | `true` | Classic search access (also feeds Google AI Overviews and Copilot) |
| `bots` | `[{"bot":"GPTBot","purpose":"training","access":"blocked","matchedRule":"Disallow: /"}]` | Per-bot details |
| `contentSignal` | `{"search":true,"ai-train":false}` | Cloudflare Content-Signal for all crawlers |
| `llmsTxt` | `{"found":true,"title":"Stripe","linkCount":308}` | llms.txt details |
| `homepage` | `{"httpStatus":200,"noai":false}` | Meta robots and X-Robots-Tag of the tested page |
| `sitemaps`, `crawlDelaySecs` | | From robots.txt |
| `status`, `error` | `checked` | Free rows explain why a site could not be checked |

## How to check which AI bots a website blocks (step by step)

1. Open the Actor and paste your domains or URLs into **Domains or website URLs**.
2. Optionally pick specific crawlers, a path to test, or turn off the llms.txt and page checks.
3. Click **Start**. A few hundred sites take about a minute.
4. Filter the dataset by `aiAccessVerdict` or `aiSearchAllowed`, or download it as CSV, Excel or JSON.

## How much does it cost?

You pay only for sites checked, through **pay-per-event** pricing:

- **$1.60–2.00 per 1,000 sites**, depending on your Apify plan: Free $2.00, Starter $2.00, Scale $1.80, Business and up $1.60.
- **Never charged:** sites that don't resolve or answer, robots.txt behind a firewall (401/403/429), invalid inputs and duplicates. They're still listed as free rows with a reason.
- A negligible start fee per run.

| Job | Free plan | Starter | Business and up |
|---|---|---|---|
| Audit 50 client sites | $0.10 | $0.10 | $0.08 |
| 10,000-site research list | $20.00 | $20.00 | $16.00 |
| Weekly check of your 200 competitors | ≈ $1.73 / month | ≈ $1.73 / month | ≈ $1.39 / month |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold). Set a **maximum cost per run** in the run options and the Actor stops cleanly at that limit.

## Input example

```json
{
  "domains": ["nytimes.com", "stripe.com", "https://www.cloudflare.com"],
  "bots": [],
  "customUserAgents": ["YouBot"],
  "testPath": "/",
  "checkLlmsTxt": true,
  "checkHomepage": true
}
```

Leave `bots` empty to check all 23 known AI and search crawlers.

## Output example

Real result for nytimes.com (shortened):

```json
{
  "domain": "nytimes.com",
  "status": "checked",
  "robotsTxtUrl": "https://www.nytimes.com/robots.txt",
  "aiAccessVerdict": "blocks_some_ai_search",
  "blockedBots": ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Meta-ExternalAgent", "Meta-ExternalFetcher", "DuckAssistBot", "CCBot", "Bytespider", "cohere-ai", "Diffbot"],
  "partiallyBlockedBots": ["Googlebot", "Amazonbot"],
  "allowedBots": ["Bingbot", "Applebot", "MistralAI-User"],
  "trainingBotsBlocked": 10,
  "answerBotsBlocked": 8,
  "aiSearchAllowed": false,
  "googlebotAllowed": true,
  "bingbotAllowed": true,
  "bots": [
    {"bot": "GPTBot", "operator": "OpenAI", "purpose": "training", "access": "blocked", "allowed": false, "matchedUserAgent": "GPTBot", "matchedRule": "Disallow: /"}
  ],
  "llmsTxt": {"found": false, "url": "https://www.nytimes.com/llms.txt", "httpStatus": 404},
  "homepage": {"fetched": true, "httpStatus": 403, "noindex": false, "noai": false, "note": "The page answered HTTP 403 to our checker; a firewall or bot protection may also block AI crawlers here even though robots.txt allows them."},
  "checkedAt": "2026-11-02T17:30:09.328Z"
}
```

And stripe.com allows every crawler and publishes an llms.txt: `"aiAccessVerdict": "allows_all_ai"`, `"llmsTxt": {"found": true, "title": "Stripe", "linkCount": 308, "followsSpec": true}`.

## Use cases

- **GEO / AI SEO audits:** make sure your site, or a client's, isn't accidentally invisible to ChatGPT search, Claude or Perplexity.
- **Agencies:** audit a whole client list in one run and export it to a sheet.
- **Publisher and competitor research:** which news, e-commerce or SaaS sites block AI training, and who still allows AI search.
- **Lead generation:** find sites that block AI search (a GEO pitch) or that lack llms.txt.
- **Responsible scraping:** check a list of sites before you crawl them with an AI agent.
- **Monitoring:** schedule weekly runs to catch robots.txt changes.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can find and run this Actor through the [Apify MCP server](https://mcp.apify.com). Add it to Claude Desktop, Cursor, VS Code or any MCP client:

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/ai-crawler-access-checker"}}}
```

Or run it locally: `npx -y @apify/actors-mcp-server --tools swillz/ai-crawler-access-checker` with `APIFY_TOKEN` set. In n8n or Make, use the Apify node with Actor `swillz/ai-crawler-access-checker`.

Example prompts:

- "Does nytimes.com block GPTBot and ClaudeBot?"
- "Which of these 100 sites block AI search bots, and which only block training?"
- "Do my competitors have an llms.txt?"

Minimal input:

```json
{"domains": ["nytimes.com"]}
```

**Keep it fast:** set `checkHomepage` and `checkLlmsTxt` to false to read only robots.txt.

**Cap the cost:** pass `maxTotalChargeUsd` ("Maximum cost per run") when you call the Actor. The run stops cleanly at the cap, keeps the results so far, lists unchecked sites as free `skipped_charge_limit` rows, and says why in the status message and the OUTPUT record.

## Integrations and API

- **API and clients:** run it from Python or JavaScript with the Apify client, or call the REST API and download the dataset as CSV or JSON.
- **No-code:** use the official Apify apps for **Make**, **n8n** and **Zapier**. Choose *Run Actor*, then `swillz/ai-crawler-access-checker`.
- **AI agents (MCP):** add it as a tool for Claude, Cursor or other MCP clients through `https://mcp.apify.com?tools=swillz/ai-crawler-access-checker`.
- **Google Sheets, Slack and webhooks:** set these up from the Integrations tab of any run.

## AI Crawler Access Checker vs alternatives

| | This Actor | Single-site web checkers | Generic robots.txt testers |
|---|---|---|---|
| Bulk (thousands of sites), API, MCP | ✅ | ❌ | ❌ |
| 23 AI crawlers incl. search vs training split | ✅ | Partly | ❌ (one bot at a time) |
| Matched group and rule per bot | ✅ | ❌ | ✅ |
| llms.txt, Content-Signal, noai meta | ✅ | Partly | ❌ |
| Free rows for unreachable sites | ✅ | — | — |

## FAQ

**Is robots.txt the whole story?** No. robots.txt is a request that well-behaved crawlers follow. Some sites also block bots at the firewall (e.g. Cloudflare's AI bot blocking). When robots.txt or the tested page answers 403/429 to our checker we flag it, but we can't see firewall rules directly.

**What's the difference between training and search bots?** Training bots (GPTBot, ClaudeBot, Google-Extended, CCBot…) collect data for model training. Search and user bots (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot…) fetch pages to answer and cite in AI answers. Blocking training only keeps you citable.

**Does blocking Google-Extended remove me from Google?** No. Google-Extended only controls Gemini training and grounding. Googlebot (reported separately) controls Google Search, including AI Overviews.

**What counts as one site?** Each unique host. `nytimes.com` and `www.nytimes.com` are separate inputs only if you enter both.

**What if there's no robots.txt?** A 404 means every crawler is allowed (RFC 9309). The row says so and is charged as a normal check.

**Is it legal?** It reads only public files any crawler reads (robots.txt, llms.txt and one page, only if robots.txt allows it), identifies itself with a clear user-agent and collects no personal data.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).
- [Email Provider Detector](https://apify.com/swillz/email-provider-detector): bulk check whether domains use Google Workspace, Microsoft 365, Proofpoint or Mimecast, plus SPF, DMARC and DKIM.
- [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain): from a list of company domains, find which ATS each uses and how many open roles, by department and location.
- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): bulk check EU VAT numbers against official VIES, with company name and address.
- [EORI Number Validator](https://apify.com/swillz/eori-validator): bulk check EU and UK EORI numbers for customs, with trader name where published.
- [LEI Lookup (GLEIF)](https://apify.com/swillz/lei-lookup): find a company's Legal Entity Identifier, legal name, address, status and parent from official GLEIF data.
- [Sanctions Screener](https://apify.com/swillz/sanctions-screener): screen company and person names against official OFAC, UN, EU and UK sanctions lists with fuzzy matching.
- [HTS Code Lookup (USITC)](https://apify.com/swillz/hts-code-lookup): US HTS codes and import duty rates from the official tariff schedule, by code or product description.
- [Federal Contracts & Grants by Company](https://apify.com/swillz/federal-awards-by-company): federal contracts, grants and loans any US company won, from official USAspending.gov data.

**Popular workflows**

- **GEO audit:** check which AI crawlers a site lets in with this Actor, see whether ChatGPT actually mentions and cites the brand with [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker), and report both in a sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **What AI can read:** list every page from the sitemap with [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor), then test key sections for AI crawlers with this Actor (`testPath`).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/ai-crawler-access-checker
