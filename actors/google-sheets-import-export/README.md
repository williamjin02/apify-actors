**Google Sheets Import & Export** moves data between **Apify datasets and Google Sheets** in both directions. **Export any scraper's results to a Google Sheet** (append new rows or replace everything, with header merging and **deduplication**), or **import a Google Sheet tab or range into a dataset** as JSON, CSV or Excel. There's no OAuth pop-up and no Google login: you share your sheet with our service account email once, and it just works on schedules and integrations.

Try it free: Apify's free plan ($5/month credit) covers **hundreds of thousands of rows a month**.

## What can Google Sheets Import & Export do?

- 📤 **Export a dataset to Google Sheets.** Send the output of any actor run (Google Maps, Amazon, jobs, sitemaps…) to a sheet. Nested fields are flattened (`address.city`) and arrays are joined, stored as JSON or expanded.
- ➕ **Append or replace.** *Append* adds rows under your existing data and adds any new columns to the header. *Replace* overwrites the tab, and the old rows are cleared only **after** the new data is written, so a failed run never leaves you with an empty sheet.
- 🧹 **Deduplicate.** Skip rows whose `url`, `id` or any other columns already exist in the sheet. That makes daily scheduled exports safe to re-run, and skipped rows are free.
- 📥 **Import a sheet into a dataset.** Read a whole tab or an A1 range (`A1:F500`, `B:D`) with formatted or raw values, a header row or column letters, and optional dedup. Use it to feed URLs, keywords or product IDs into other actors.
- 🔐 **Sheet lock.** A spreadsheet shared with our service account can only be used by **your** Apify account. On first use the actor tags the sheet with your account ID (hidden metadata only our Google project can see), so nobody else can read or write it through this actor, even with the URL.
- 🛡️ **Reliable by design.** Automatic retries with backoff on Google rate limits (429) and 5xx errors, grid auto-resize, 10M-cell and 50k-characters-per-cell checks, and clear error messages that tell you exactly what to fix.

## How to export an Apify dataset to Google Sheets (step by step)

1. Open your Google Sheet and click **Share**. Paste **`sheets-tool@apify-tools-512508.iam.gserviceaccount.com`**, choose **Editor**, untick *Notify people*, and click **Share**.
2. Copy the sheet's URL from the address bar.
3. In this actor, choose **Operation: Write**, paste the URL, and paste the **Dataset ID** (open any run → **Storage** → *Dataset ID*).
4. Pick **Append** or **Replace**, and optionally add *Deduplicate by* columns such as `url`.
5. Click **Start**. The rows appear in your sheet within seconds, and the run's **OUTPUT** tells you how many rows were written and how many duplicates were skipped.

**To import a sheet:** do step 1 (Editor is recommended, Viewer also works for reading), choose **Operation: Read**, paste the URL, and optionally set a tab and a range. Then download the dataset as JSON, CSV or Excel, or use it via the API.

**Prefer your own Google credentials?** Create a service account in your Google Cloud project, enable the Sheets and Drive APIs, and paste its JSON key into *Your own service account key* (a secret, encrypted input). Then share the sheet with **your** service account's email instead.

## How much does it cost?

This actor uses **pay-per-event pricing**: **$0.01 per 1,000 rows** read or written, plus $0.00005 per run start. Duplicates that are skipped and failed runs cost nothing for rows. There are no monthly fees.

| Rows per run | Price |
|---|---|
| 1,000 | $0.01 |
| 100,000 | $1.00 |
| 1,000,000 | $10.00 |

A daily export of 2,000 new rows costs about **$0.60 a month**. You can set a maximum cost per run, and the actor stops cleanly when it reaches it.

## Input example

Export a dataset, appending only rows with new URLs:

```json
{
  "operation": "write",
  "spreadsheet": "https://docs.google.com/spreadsheets/d/1AbC.../edit#gid=0",
  "sheetName": "Leads",
  "datasetId": "WkzbQMuFYuamGv3YF",
  "writeMode": "append",
  "deduplicateBy": ["url"]
}
```

Import a range:

```json
{
  "operation": "read",
  "spreadsheet": "https://docs.google.com/spreadsheets/d/1AbC.../edit",
  "sheetName": "Keywords",
  "range": "A1:C500"
}
```

## Output example

Read operation, one dataset item per row (keys come from your header row):

```json
{ "sku": "A-001", "name": "Blue mug", "price": "12.5", "inStock": "TRUE" }
```

Every run also stores a summary in the key-value store record `OUTPUT`:

```json
{
  "operation": "write",
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/1AbC.../edit",
  "sheetName": "Leads",
  "writeMode": "append",
  "inputRows": 250,
  "rowsWritten": 212,
  "duplicatesSkipped": 38,
  "columns": ["title", "url", "price", "address.city"]
}
```

## Use cases

- **Live lead lists:** run a Google Maps or contact scraper daily and append only new businesses to your team's sheet.
- **Price and stock tracking:** append each day's prices to a log tab, or replace a "current prices" tab.
- **Inputs from a sheet:** keep keywords, URLs or ASINs in a sheet that non-technical teammates edit, and read them at the start of a workflow.
- **Reporting:** keep Looker Studio dashboards and pivot tables fed from scraped data.
- **Backups:** copy a sheet into a dataset on a schedule (versioned JSON/CSV exports).

## Integrations & API

- **After another actor finishes:** in that actor's **Integrations** tab, add *Run an actor* → this actor, with input `{"operation":"write","spreadsheet":"…","datasetId":"{{resource.defaultDatasetId}}","writeMode":"append","deduplicateBy":["url"]}`. Every run then lands in your sheet automatically.
- **Schedules:** run imports and exports hourly, daily or weekly from Apify Schedules.
- **Make, n8n and Zapier:** use the official Apify app or node, pick *Run actor* → `swillz/google-sheets-import-export`.
- **API and clients:** start runs from the Apify API or the Python and JavaScript clients, and read the `OUTPUT` record for the result.
- **AI agents (MCP):** `https://mcp.apify.com?tools=swillz/google-sheets-import-export`.

## Google Sheets Import & Export vs alternatives

| | This actor | Typical Sheets actors |
|---|---|---|
| Authorization | Share with one email, works on schedules | OAuth token that expires or needs a first interactive run |
| Append + new columns | Header auto-merged | Often fails or misaligns columns |
| Deduplication | Against existing sheet rows | Within the run only, or none |
| Replace safety | Old data cleared after the new data is written | Clear first (empty sheet on failure) |
| Access control | Sheet lock to your Apify account | – |
| Price | $0.01 per 1,000 rows | Free to $5 per 1,000 |

## FAQ

**Is my data safe?** The actor only opens spreadsheets you explicitly share with the service account, and the sheet lock stops other Apify accounts from using a sheet you shared. You can revoke access at any time by removing the email in Google Sheets → Share. Want full control? Use your own service account key.

**Why does it say "Can't open spreadsheet"?** The sheet isn't shared with `sheets-tool@apify-tools-512508.iam.gserviceaccount.com`, or it's shared as Viewer and you're writing. Share it as **Editor**, and double-check the URL.

**"Locked to another Apify account"?** Someone else's Apify account used this sheet through the actor first. Make a copy of the sheet, or use your own service account key.

**Limits?** Google Sheets allows 10 million cells per spreadsheet and 50,000 characters per cell. The actor checks both before writing and truncates over-long cells with a warning. Large exports are written in chunks with automatic retries.

**Formulas?** By default values are written as **RAW** text, so scraped text starting with `=` can't run as a formula. Choose `USER_ENTERED` if you want Google to parse formulas, dates and numbers.

**Need a feature or found a bug?** Open an issue on the **Issues** tab. We usually reply within a day.

## Related tools

- [XML Sitemap URL Extractor & Sitemap to CSV](https://apify.com/swillz/sitemap-url-extractor): get every URL of a website, then export them to a sheet with this actor.

Source code: https://github.com/williamjin02/apify-actors/tree/main/actors/google-sheets-import-export
