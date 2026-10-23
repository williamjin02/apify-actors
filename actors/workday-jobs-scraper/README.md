# Workday Jobs Scraper

Get **every job** from any company's Workday career site (`*.myworkdayjobs.com` / `myworkdaysite.com`): title, locations, remote type, full-time/part-time, posted date, requisition ID, salary range (when it's in the posting), full description and the apply link. You get clean JSON, CSV or Excel. No login, no browser, no cookies.

**$1.50 per 1,000 jobs.** You pay only for jobs saved after your filters.

## Why this one

- **No 2,000-job ceiling.** Workday's search stops paging at 2,000 results, and big employers like NVIDIA, Salesforce and Walmart have more than that. The scraper detects this and splits the search by location, job family or other facets, so you get the full list (for example, 2,718 of 2,718 NVIDIA jobs in our tests).
- **Many companies in one run.** Paste as many career-site URLs as you like.
- **Search-URL aware.** Filter a Workday page in your browser, then paste that URL; `q=` and facet filters are applied.
- **Filters before you pay:** title include/exclude keywords, location keywords, posted within N days, remote only, max jobs per site.
- **Fast mode.** Set `includeDetails: false` to list jobs without opening each posting (title, location, posted text, URL).
- **Per-site summary** in the `OUTPUT` record: ok / invalid_url / not_found / robots_disallowed / error, with job counts.

## How to find a Workday URL

Open the company's careers page and click through to the job search. If the address bar shows something like
`https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite` or `https://wd3.myworkdaysite.com/recruiting/acme/Careers`, that's the URL to paste. Language prefixes like `/en-US/` are fine.

## Input example

```json
{
  "startUrls": [
    { "url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" },
    { "url": "https://adobe.wd5.myworkdayjobs.com/external_experienced" }
  ],
  "titleKeywords": ["engineer"],
  "postedWithinDays": 7
}
```

## Output example

```json
{
  "company": "Adobe",
  "hiringEntity": "Adobe Inc.",
  "title": "Senior Software Engineer",
  "jobId": "R160000",
  "location": "San Jose",
  "allLocations": ["San Jose", "Seattle"],
  "remote": false,
  "timeType": "Full time",
  "postedDate": "2026-10-21",
  "postedDaysAgo": 2,
  "jobUrl": "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Senior-Software-Engineer_R160000",
  "applyUrl": "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Senior-Software-Engineer_R160000/apply",
  "salaryMin": 139000,
  "salaryMax": 257550,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "descriptionText": "…",
  "ats": "workday"
}
```

## Pricing

Pay per event: **$0.0015 per job saved** ($1.50 per 1,000). Jobs you filter out are free. Set a max cost per run in Apify and the run stops when it's reached.

## Notes

- The scraper only reads the public job listings that Workday serves to any visitor. It respects each site's robots.txt and skips sites that disallow crawling. It collects no candidate or personal data.
- Salary is taken from the posting text when the employer publishes a pay range (common in US states with pay-transparency laws).
- Greenhouse, Lever, Ashby, Workable or Recruitee boards? Use our Career Site Jobs Scraper.

Source: https://github.com/williamjin02/apify-actors/tree/main/actors/workday-jobs-scraper
