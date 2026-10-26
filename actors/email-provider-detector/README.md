**Email Provider Detector** tells you, for any list of company domains, **whether they use Google Workspace or Microsoft 365** (or Zoho, Proton, GoDaddy, on-prem and 25 more). It also shows which **secure email gateway** (Proofpoint, Mimecast, Barracuda, Cisco, Cloudflare Area 1…) sits in front of the inbox and **which mailbox is really behind it**, plus a full **SPF, DMARC, DKIM, MTA-STS and BIMI** check.

It's built for **ESP matching** in cold email: send to Google inboxes from Google senders and to Outlook inboxes from Microsoft senders. Most MX lookups stop at "pphosted.com". This Actor reads SPF includes, DKIM selectors and DNS verification tokens to find the Google or Microsoft tenant behind Proofpoint or Mimecast, and flags domains where it can't be known.

Everything comes from **public DNS**. No websites are scraped, no logins, no personal data. Paste emails and only the domain is kept.

**When to use:** splitting a lead list by email provider (ESP matching), cleaning lists before a campaign, deliverability or email-security audits of prospects, or technographics (which SaaS a company uses).
**Input:** domains, website URLs or emails, e.g. `{"domains":["hubspot.com","https://www.stripe.com","jane@acme.com"]}`.
**Output:** one row per domain with `espMatch` (google / microsoft / other / unknown / none), mailbox provider, gateway, SPF/DMARC details, a 0–100 email security score and plain-English issues. From $1.00 per 1,000 domains.

## What can Email Provider Detector do?

- **Google Workspace vs Microsoft 365 lookup in bulk:** classify thousands of domains in about a minute.
- **See through security gateways:** detect Proofpoint, Mimecast, Barracuda, Cisco IronPort, Trend Micro, Sophos, Symantec, Forcepoint, Trellix, Hornetsecurity, Cloudflare Email Security and more. Then infer the real mailbox from SPF (`_spf.google.com`, `spf.protection.outlook.com`), DKIM selectors (`google`, `selector1`/`selector2`) and the `MS=` token.
- **SPF checker with lookup count:** follows includes and redirects recursively and flags records over the **10 DNS lookup limit**, duplicate SPF records, `+all` and `?all`.
- **DMARC checker:** policy (none / quarantine / reject), subdomain policy, pct, and whether reports go to a DMARC vendor (dmarcian, Valimail, EasyDMARC, Proofpoint, Red Sift…). Report mailbox names are never output.
- **DKIM, MTA-STS and BIMI** presence. Wildcard DKIM records are detected and ignored.
- **Email security score and grade (A–F)** with a plain-English list of issues, ready for an outreach hook ("your DMARC is p=none").
- **Sending services from SPF:** HubSpot, Salesforce, Marketo, SendGrid, Mailgun, Amazon SES, Zendesk, Intercom, Klaviyo and 50 more.
- **SaaS technographics from DNS verification records:** Microsoft 365, Atlassian, Slack, Zoom, DocuSign, OpenAI, Anthropic, Stripe, Notion, Figma, Okta and 35 more.
- **Chain from any lead scraper** with `datasetId`: domain, website or email fields are auto-detected.

## What data does it return?

| Field | Example | What it means |
|---|---|---|
| `espMatch` | `google` | Sender pool to use: google, microsoft, other, unknown (hidden behind a gateway) or none (no mail) |
| `mailboxProvider` | `Microsoft 365` | Where the mailboxes live, even behind a gateway |
| `secureEmailGateway` | `Proofpoint` | Filter in front of the inbox; cold email is screened harder |
| `providerDetectedVia` | `spf_dkim_behind_gateway` | How the provider was found: mx, spf_dkim_behind_gateway, spf_dkim_txt |
| `mxHosts` | `["aspmx.l.google.com"]` | MX records by priority |
| `spf` | `{"allQualifier":"~all","dnsLookupCount":7,"tooManyLookups":false}` | SPF record details |
| `dmarc` | `{"policy":"reject","pct":100,"reportingVendors":["dmarcian"]}` | DMARC policy details |
| `dkimSelectorsFound` | `["google"]` | Common DKIM selectors that exist |
| `mtaSts`, `bimi` | `false`, `true` | Transport security and brand logo records |
| `emailSecurityScore`, `emailSecurityGrade` | `85`, `A` | 0–100 score and grade |
| `issues` | `["DMARC policy is p=none (monitor only)…"]` | What's wrong, in plain English |
| `sendingServices` | `["HubSpot","Zendesk"]` | Tools allowed to send as this domain |
| `saasVerifications` | `["Atlassian","Slack","OpenAI (ChatGPT Enterprise/Team)"]` | Tools the domain verified ownership with |
| `status` | `ok` | ok, no_mail, nxdomain, error, invalid_input |

## How to check email providers for a list of domains (step by step)

1. Click **Try for free** and paste your domains, website URLs or emails into **Domains, websites or emails**. You can also give a dataset ID from another Actor run.
2. Keep the defaults (DKIM probe, SPF lookup count and SaaS detection are on).
3. Click **Start**. 1,000 domains usually finish in about a minute.
4. Filter or sort by `espMatch`, and download as CSV, Excel or JSON, or send it to Google Sheets.

## How much does it cost?

You pay only for domains checked, through **pay-per-event** pricing:

- **$1.00–2.00 per 1,000 domains**, depending on your Apify plan: Free $2.00, Starter $1.50, Scale $1.20, Business and up $1.00.
- **Never charged:** domains that don't exist, DNS failures, invalid inputs and duplicates. They're still listed as free rows with a reason.
- A negligible start fee per run.

| Job | Free plan | Starter | Business and up |
|---|---|---|---|
| 500 leads before a campaign | $1.00 | $0.75 | $0.50 |
| 10,000-domain list for ESP matching | $20.00 | $15.00 | $10.00 |
| Weekly email-security check of 200 clients | ≈ $1.73 / month | ≈ $1.30 / month | ≈ $0.87 / month |

Prices drop on bigger Apify plans (Starter = Bronze tier, Scale = Silver, Business and up = Gold). Set a **maximum cost per run** in the run options and the Actor stops cleanly at that limit.

## Input example

```json
{
  "domains": ["apify.com", "hubspot.com", "https://www.salesforce.com", "jane.doe@microsoft.com"],
  "maxDomains": 1000,
  "checkDkim": true,
  "countSpfLookups": true,
  "detectSaas": true
}
```

Chain from another Actor (e.g. a Google Maps or lead scraper):

```json
{"datasetId": "aBcD1234efGH5678", "domainField": "website", "datasetMaxItems": 5000}
```

## Output example

```json
{
  "domain": "salesforce.com",
  "inputType": "domain",
  "status": "ok",
  "espMatch": "google",
  "mailboxProvider": "Google Workspace",
  "secureEmailGateway": "Proofpoint",
  "providerDetectedVia": "spf_dkim_behind_gateway",
  "mxHosts": ["mxa-00177002.gslb.pphosted.com", "mxb-00177002.gslb.pphosted.com"],
  "acceptsMail": true,
  "spf": {"present": true, "multipleRecords": false, "allQualifier": "~all", "includes": ["_spf.google.com", "_spf.salesforce.com"], "dnsLookupCount": 4, "tooManyLookups": false},
  "dmarc": {"present": true, "policy": "reject", "subdomainPolicy": null, "pct": 100, "reportingEnabled": true, "reportingVendors": ["Red Sift OnDMARC"]},
  "dkimSelectorsFound": ["google", "s1"],
  "mtaSts": false,
  "bimi": true,
  "emailSecurityScore": 100,
  "emailSecurityGrade": "A",
  "issues": [],
  "sendingServices": ["Google Workspace", "Salesforce"],
  "saasVerifications": ["Jamf", "Canva", "1Password", "Google Search Console", "Zoom", "Notion", "HubSpot", "Stripe", "Atlassian"],
  "checkedAt": "2026-10-23T21:51:15.953Z"
}
```

The run summary (OUTPUT record) counts domains by `espMatch` and status, and says why if nothing was found.

## Use cases

- **ESP matching for cold email:** split a lead list into Google and Microsoft segments and send from matching inboxes (Instantly, Smartlead, lemlist and others support this). Treat `unknown` and gateway-protected domains carefully.
- **List cleaning:** drop domains that don't exist or accept no email (`status: nxdomain` / `no_mail`) before you pay for verification.
- **Email security prospecting** for MSPs, MSSPs and deliverability agencies: find prospects with no DMARC, `p=none` or SPF over 10 lookups, and open with the exact issue.
- **Technographics:** find companies on Microsoft 365 vs Google, behind Proofpoint or Mimecast, or using HubSpot, Salesforce, Zendesk, OpenAI or Atlassian.
- **Vendor and client audits:** schedule a weekly run over your clients' domains and alert on grade changes.

## Use with AI agents (MCP, ChatGPT, Claude, Cursor, n8n)

AI agents can find and run this Actor through the [Apify MCP server](https://mcp.apify.com). Add it to Claude Desktop, Cursor, VS Code or any MCP client:

```json
{"mcpServers":{"apify":{"url":"https://mcp.apify.com?tools=swillz/email-provider-detector"}}}
```

Or run it locally: `npx -y @apify/actors-mcp-server --tools swillz/email-provider-detector` with `APIFY_TOKEN` set. In n8n or Make, use the Apify node with Actor `swillz/email-provider-detector`.

Example prompts:

- "Which of these 200 domains use Google Workspace and which use Microsoft 365?"
- "Does acme.com have DMARC, and is its SPF over the lookup limit?"
- "Which of my leads sit behind Proofpoint or Mimecast?"

Minimal input:

```json
{"domains": ["hubspot.com", "stripe.com"]}
```

**Keep it fast:** DNS-only, so 1,000 domains take about a minute. Turn off `checkDkim` for the fastest runs.

**Cap the cost:** pass `maxTotalChargeUsd` ("Maximum cost per run") when you call the Actor. The run stops cleanly at the cap, keeps the results so far, lists the unchecked domains as free `skipped_charge_limit` rows, and says why in the status message and the OUTPUT record.

## Integrations and API

- **API and clients:** run it from Python or JavaScript with the Apify client, or call the REST API and download the dataset as CSV or JSON.
- **No-code:** use the official Apify apps for **Make**, **n8n** and **Zapier**. Choose *Run Actor*, then `swillz/email-provider-detector`.
- **AI agents (MCP):** add it as a tool for Claude, Cursor or other MCP clients through `https://mcp.apify.com?tools=swillz/email-provider-detector`.
- **Google Sheets, Slack and webhooks:** set these up from the Integrations tab of any run.

## Email Provider Detector vs alternatives

| | This Actor | Plain MX lookup tools | Single-domain web checkers |
|---|---|---|---|
| Google vs Microsoft (ESP match field) | ✅ | Partly (raw MX) | ❌ |
| Real mailbox behind Proofpoint / Mimecast | ✅ SPF + DKIM + MS= | ❌ | ❌ |
| SPF recursive lookup count | ✅ | ❌ | ✅ one at a time |
| DMARC / DKIM / MTA-STS / BIMI | ✅ | ❌ | ✅ one at a time |
| SaaS and sending services from DNS | ✅ | ❌ | ❌ |
| Bulk, API, MCP, chain from datasets | ✅ | Varies | ❌ |
| Personal data | None (domains only) | Some add WHOIS contacts | — |

## FAQ

**How does it detect Google Workspace vs Microsoft 365?** From the domain's MX records (e.g. `aspmx.l.google.com`, `*.mail.protection.outlook.com`). When MX points at a gateway or an on-prem relay, it checks the SPF includes, DKIM selectors and the `MS=` verification token.

**What does `espMatch: unknown` mean?** The domain accepts mail, but the inbox provider is hidden. This usually means Proofpoint-hosted SPF or an on-prem relay with no Google or Microsoft hints. We don't guess.

**Is this personal data?** No. Only public DNS records of company domains are read. If you paste emails, the part before @ is discarded immediately and never stored or output. DMARC report addresses are reduced to their domain.

**Does it send emails or verify mailboxes?** No. It makes no SMTP connections. Use it before an email verifier to cut cost.

**Why was a domain not charged?** Domains that don't exist, DNS failures, invalid inputs and duplicates are free. They appear with a `status` and an `error`.

**How accurate is it?** MX-based detection is exact. Behind-gateway inference is reported in `providerDetectedVia` so you can filter on confidence.

## Related tools

More tools from the same developer, built to work together:

- [Career Site Jobs Scraper](https://apify.com/swillz/career-site-jobs-scraper): jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.
- [Workday Jobs Scraper](https://apify.com/swillz/workday-jobs-scraper): every job from any myworkdayjobs.com career site, past the 2,000-result cap.
- [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment): turn a list of domains into company name, emails, phones, social links and tech stack.
- [AI Extract](https://apify.com/swillz/ai-extract): structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.
- [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export): send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.
- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): every URL from a website's sitemap, with lastmod, HTTP status and new-page monitoring.
- [AI Brand Visibility Tracker](https://apify.com/swillz/ai-brand-visibility-tracker): track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).
- [Hiring Signals by Company Domain](https://apify.com/swillz/hiring-signals-by-domain): from a list of company domains, find which ATS each uses and how many open roles, by department and location.
- [EU VAT Number Validator (VIES)](https://apify.com/swillz/eu-vat-validator): bulk check EU VAT numbers against official VIES, with company name and address.

**Popular workflows**

- **Cold email list prep:** get domains from a lead or Google Maps scraper, split them by Google Workspace vs Microsoft 365 (`espMatch`) with this Actor, add contacts with [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment), and export with [Google Sheets Import & Export](https://apify.com/swillz/google-sheets-import-export).
- **Email security prospecting:** find companies with `p=none` DMARC or SPF over the lookup limit with this Actor, then get their contacts with [Company Website Enrichment](https://apify.com/swillz/company-website-enrichment).

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/email-provider-detector
