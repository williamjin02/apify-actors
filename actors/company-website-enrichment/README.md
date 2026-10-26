**Company Website Enrichment** turns a list of company domains into **ready-to-use B2B lead data**. For every website you get the **company name, description, logo, generic contact emails (info@, sales@, support@), phone numbers, postal address, LinkedIn company page and other social profiles**, the contact, about and careers pages, the **job board the company uses** and its **tech stack (130+ technologies)**. Export to **CSV, JSON or Excel**, or push straight into your CRM.

Paste domains, click Start. The actor reads the homepage plus up to 3 key pages per site over fast HTTP (no browser), **respects robots.txt**, and costs **$0.65-1 per 1,000 enriched websites**. Websites that can't be reached are free.

**When to use:** you have a list of company domains and need firmographic and contact data for each one.
**Input:** a list of domains, e.g. `{"websites":["stripe.com","hubspot.com"]}`, or the `datasetId` of another Actor run (Google Maps, lead lists, directories) to enrich its `website` column.
**Output:** one row per company with name, description, logo, generic emails, phones, address, social links, key pages and 130+ detected technologies. From $0.65 per 1,000 websites.

## What can Company Website Enrichment do?

- 🏢 **Firmographics from the source:** company name, legal name, description, logo, language, founding date and address from the site's own schema.org data.
- ✉️ **Company contact details:** generic, role-based emails on the company's own domain (info@, hello@, sales@, support@, press@…) and phone numbers. Personal emails like `jane.doe@` are never collected.
- 🔗 **Social profiles:** LinkedIn company page, X/Twitter, Facebook, Instagram, YouTube, TikTok, GitHub and Pinterest.
- 🧰 **Tech stack detection:** 130+ technologies across CMS, ecommerce, analytics, marketing automation (HubSpot, Marketo, Pardot), ad pixels, live chat, JavaScript frameworks, CDN and hosting, payments, cookie consent and monitoring.
- 💼 **Hiring signals:** finds the careers page and detects the ATS (Greenhouse, Lever, Ashby, Workable, Recruitee, Workday, SmartRecruiters, BambooHR, Personio, Teamtailor).
- ⚡ **Fast and cheap:** about 10 websites in parallel, no proxy needed for most sites, failed sites are not charged.
- ✅ **Polite by design:** reads robots.txt and honors crawl-delay; never logs in.

## What data can you extract?

| Field | Example |
|---|---|
| `domain`, `url`, `companyName`, `legalName` | zapier.com · https://zapier.com/ · Zapier |
| `description`, `language`, `logoUrl` | "Automate without limits…" · en · logo URL |
| `emails` | `["support@acme.com", "sales@acme.com"]` (role-based only) |
| `phones` | `["+1 888 482 7768"]` |
| `address` | `{street: "548 Market St. #62411", city: "San Francisco", region: "CA", postalCode: "94104", country: "US"}` |
| `socials` | `{linkedin: "https://www.linkedin.com/company/zapier", twitter: "https://x.com/zapier", …}` |
| `contactPageUrl`, `aboutPageUrl`, `careersPageUrl`, `legalPageUrl` | Direct links |
| `jobBoard` | `{ats: "ashby", slug: "zapier", url: "https://jobs.ashbyhq.com/zapier/…"}` |
| `technologies` | `[{name: "HubSpot", category: "Marketing automation"}, {name: "Next.js", category: "JavaScript framework"}, …]` |
| `foundingDate`, `numberOfEmployees` | When the site publishes them |
| `status`, `error`, `pagesFetched`, `scrapedAt` | `ok`, or why a site wasn't enriched |

## How to enrich a list of company websites (step by step)

1. Click **Try for free** and sign in to Apify (free plan, no card needed).
2. Paste your domains into **Websites or domains**, one per line (`stripe.com`, `https://www.hubspot.com`, or `info@acme.com`).
3. Optional: change **Max pages per website** (more pages find more contacts) or turn off tech-stack detection.
4. Click **Start**, then download the results as CSV, Excel or JSON, or open the **Overview** table.

## How much does it cost?

This actor uses **pay-per-result pricing**: **$0.65-1.00 per 1,000 websites enriched** (by Apify plan), plus a tiny $0.00005 per run start. Websites that are unreachable, blocked or invalid are returned with a status but **not charged**. No monthly fee, no compute or proxy charges on top.

| Apify plan | Per 1,000 websites | 10,000 websites |
|---|---|---|
| Free | $1 | $10 |
| Starter | $1 | $10 |
| Scale | $0.80 | $8 |
| Business and up | $0.65 | $6.50 |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold).

Apify's **free plan includes $5 of monthly credit**, enough for about **5,000 websites a month for free**. You can set a maximum cost per run and the actor stops cleanly when it's reached.

## Input example

```json
{
  "websites": ["stripe.com", "hubspot.com", "zapier.com"],
  "maxPagesPerSite": 4,
  "includeTechStack": true
}
```

## Output example

```json
{
  "input": "zapier.com",
  "domain": "zapier.com",
  "url": "https://zapier.com/",
  "status": "ok",
  "companyName": "Zapier",
  "description": "Build and scale AI workflows and agents across 8,000+ apps…",
  "language": "en",
  "emails": ["recruiting@zapier.com"],
  "phones": [],
  "address": { "street": "548 Market St. #62411", "city": "San Francisco", "region": "CA", "postalCode": "94104", "country": "US" },
  "socials": {
    "linkedin": "https://www.linkedin.com/company/zapier",
    "twitter": "https://x.com/zapier",
    "facebook": "https://www.facebook.com/ZapierApp",
    "youtube": "https://www.youtube.com/user/ZapierApp/videos",
    "github": "https://github.com/zapier"
  },
  "contactPageUrl": "https://zapier.com/l/contact-sales",
  "careersPageUrl": "https://zapier.com/jobs",
  "jobBoard": { "ats": "ashby", "slug": "zapier", "url": "https://jobs.ashbyhq.com/zapier/…" },
  "technologies": [
    { "name": "Contentful", "category": "CMS" },
    { "name": "Google Tag Manager", "category": "Tag manager" },
    { "name": "Optimizely", "category": "A/B testing" },
    { "name": "Next.js", "category": "JavaScript framework" },
    { "name": "Vercel", "category": "Hosting" },
    { "name": "OneTrust", "category": "Cookie consent" }
  ],
  "pagesFetched": ["https://zapier.com/", "https://zapier.com/l/contact-sales", "https://zapier.com/legal", "https://zapier.com/jobs"],
  "scrapedAt": "2026-10-23T09:05:12.000Z"
}
```

A run summary (enriched count, status counts, requests) is saved to the `OUTPUT` record in the key-value store.

## Use cases

- **Lead enrichment:** fill in company name, LinkedIn page, phone and address for a domain list from your CRM, a trade-show list or a directory.
- **Lead qualification by tech stack:** find sites on Shopify, WordPress, HubSpot or a competitor's tool, or sites *without* analytics or chat.
- **Sales intelligence:** spot companies that are hiring (careers page and ATS detected), then pull their jobs with [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper).
- **Agencies:** audit prospects' marketing stack (pixels, consent, chat, A/B testing) before outreach.
- **Data cleaning:** check which domains still resolve and where they redirect.

## Enrich Google Maps or other scraper results (chain Actors)

Already scraped businesses with another Actor? Pass its dataset and this Actor reads the website column for you, removes duplicates and adds emails, social profiles and tech stack:

```json
{"datasetId": "YOUR_DATASET_ID", "websiteField": "website", "datasetMaxItems": 500}
```

- **Field auto-detect:** leave `websiteField` empty and it tries `website`, `websiteUrl`, `companyWebsite`, `companyUrl`, `companyDomain`, `domain`, `homepage`, `url` and `loc`. This covers Google Maps scrapers (`website`) and the [Sitemap URL Extractor](https://apify.com/swillz/sitemap-url-extractor) (`loc`). Dot paths like `company.url` work too.
- **Run it automatically:** in the source Actor or Task, open the *Integrations* tab → *Add integration*, pick Company Website Enrichment, trigger it when the run succeeds and set `datasetId` to `{{resource.defaultDatasetId}}`. Each new run's results are enriched automatically.
- **Then export:** send the enriched rows to a spreadsheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export) the same way. The run's `OUTPUT` record lists the exact input under `nextSteps`.
- **Predictable cost:** `datasetMaxItems` (default 1,000) caps how many websites are read. Sites that can't be reached are not charged.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can find and run this Actor through the [Apify MCP server](https://mcp.apify.com). Add it to Claude Desktop, Cursor, VS Code or any MCP client:

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/company-website-enrichment"}}}
```

Or run it locally: `npx -y @apify/actors-mcp-server --tools swillz/company-website-enrichment` with `APIFY_TOKEN` set. In n8n or Make, use the Apify node with Actor `swillz/company-website-enrichment`.

Example prompts:

- "What tech stack does linear.app use?"
- "Find contact emails and LinkedIn pages for these 20 companies"
- "Which of these SaaS sites use HubSpot?"

Minimal input:

```json
{"websites": ["linear.app"]}
```

**Keep it fast:** Keep `maxPagesPerSite` at 4 or lower; 20–50 domains finish in well under a minute. Unreachable sites come back as free rows with `status` and `error`.

**Cap the cost:** pass `maxTotalChargeUsd` ("Maximum cost per run") when you call the Actor. The run stops cleanly at the cap, keeps the results so far, and says why in the status message and the OUTPUT record.

## Integrations and API

- **Make, n8n and Zapier:** use the official Apify app or node, choose *Run Actor* and pick `swillz/company-website-enrichment`.
- **API:** `POST https://api.apify.com/v2/acts/swillz~company-website-enrichment/run-sync-get-dataset-items?token=YOUR_TOKEN` with the input JSON returns the rows directly. JavaScript and Python clients are available.
- **AI agents (MCP):** connect `https://mcp.apify.com?tools=swillz/company-website-enrichment` to Claude, Cursor or any MCP client and ask, for example, "what tech stack and LinkedIn page does acme.com have?".

## Company Website Enrichment vs alternatives

| | This actor | Contact scrapers (per page) | Paid enrichment APIs |
|---|---|---|---|
| Price | $0.65-1 per 1,000 websites by plan | ~$2 per 1,000 pages (+ extras) | $50+/month |
| Tech stack | ✅ 130+ technologies | ❌ | Sometimes |
| Social profiles + address | ✅ | ✅ | ✅ |
| Job board / hiring signal | ✅ | ❌ | Rarely |
| Personal emails | ❌ never (GDPR-friendly) | Often | Often |
| Failed sites charged | ❌ free | Varies | Yes |

## FAQ

**Is it legal to scrape company websites?**
The actor reads only public pages on a company's own website, respects robots.txt, and never logs in. It deliberately collects **company** data only: role-based mailboxes like info@ and sales@, company phones and company social pages. Personal email addresses and personal LinkedIn profiles are filtered out. Make sure your use of the data (for example, cold email) complies with laws like GDPR, CAN-SPAM and the site's terms.

**Why are some emails or phones missing?**
Many large companies don't publish a generic email on their website, and some sites hide contacts behind forms. Raising *Max pages per website* helps on smaller business sites.

**What do the statuses mean?**
`ok` = enriched (charged). `unreachable` = DNS or connection failure. `http_error` = the homepage returned an error, often 403 bot protection (try enabling a proxy). `blocked_by_robots_txt` = the site disallows automated access. `not_html` or `invalid_input` = nothing to enrich. Only `ok` rows are charged.

**How accurate is tech-stack detection?**
It matches known script, HTML and HTTP-header signatures on the homepage. Tools loaded only after a click or consent, or only on other pages, may be missed.

**Found a bug or need a field?**
Open an issue on the **Issues** tab. We usually reply within 24 hours.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).
- [Email Provider Detector](https://apify.com/swillz/email-provider-detector): bulk check whether domains use Google Workspace, Microsoft 365, Proofpoint or Mimecast, plus SPF, DMARC and DKIM.
- [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain): from a list of company domains, find which ATS each uses and how many open roles, by department and location.
- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): bulk check EU VAT numbers against official VIES, with company name and address.

**Popular workflows**

- **Hiring-signal leads:** scrape open roles with [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper), enrich each hiring company's domain with this Actor, and append new rows daily with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **Enterprise hiring tracker:** pull Workday jobs with [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper), add company contacts with this Actor, and keep a live sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **Cold email list prep:** get domains from a lead or Google Maps scraper, split them by Google Workspace vs Microsoft 365 (`espMatch`) with [Email Provider Detector](https://apify.com/swillz/email-provider-detector), add contacts with this Actor, and export with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **Email security prospecting:** find companies with `p=none` DMARC or SPF over the lookup limit with [Email Provider Detector](https://apify.com/swillz/email-provider-detector), then get their contacts with this Actor.
- **Site audits for prospects:** check a prospect's pages and status codes with [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor), then get their contacts with this Actor.
- **Hiring-signal prospecting:** rank target accounts by open roles with [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain), add contacts with this Actor, and track weekly in a sheet with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/company-website-enrichment
