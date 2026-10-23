#!/usr/bin/env python3
"""Rewrite the '## Related tools' section of each actor README with cross-links to our own Apify Store actors
plus 'pair with' workflows. Only links to apify.com/swillz/* (Publishing Terms 2.2.4.2: no off-platform promotion).

  python3 tools/readme_links.py                 # all actors link to all siblings (repo version)
  python3 tools/readme_links.py --public-only   # drop links to actors that are not public yet (needs APIFY_TOKEN)
  python3 tools/readme_links.py --only sitemap-url-extractor --public-only
"""
import os, re, sys, json, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'actors'
CAT = {  # slug: (Store title, one-line pitch with search keywords)
 'career-site-jobs-scraper': ('Career Site Jobs Scraper', 'jobs from Greenhouse, Lever, Ashby, Workable and Recruitee boards, with salary fields, as a jobs API or CSV.'),
 'workday-jobs-scraper': ('Workday Jobs Scraper', 'every job from any myworkdayjobs.com career site, past the 2,000-result cap.'),
 'company-website-enrichment': ('Company Website Enrichment', 'turn a list of domains into company name, emails, phones, social links and tech stack.'),
 'ai-extract': ('AI Extract', 'structured JSON from any web page with a plain-English prompt or a JSON schema. AI included.'),
 'google-sheets-import-export': ('Google Sheets Import & Export', 'send any Apify dataset to a Google Sheet (append, replace or dedupe) or read a sheet as JSON.'),
 'sitemap-url-extractor': ('XML Sitemap URL Extractor & Sitemap to CSV', 'every URL from a website\'s sitemap, with lastmod, HTTP status and new-page monitoring.'),
 'ai-brand-visibility-tracker': ('AI Brand Visibility Tracker', 'track whether ChatGPT mentions, ranks and cites your brand vs competitors (GEO).'),
}
FLOWS = [  # (actors involved in order, text)
 (['career-site-jobs-scraper', 'company-website-enrichment', 'google-sheets-import-export'], '**Hiring-signal leads:** scrape open roles with {0}, enrich each hiring company\'s domain with {1}, and append new rows daily with {2}.'),
 (['workday-jobs-scraper', 'company-website-enrichment', 'google-sheets-import-export'], '**Enterprise hiring tracker:** pull Workday jobs with {0}, add company contacts with {1}, and keep a live sheet with {2}.'),
 (['sitemap-url-extractor', 'ai-extract', 'google-sheets-import-export'], '**Catalog or content extraction:** list every product or article URL with {0}, turn each page into JSON with {1}, and export with {2}.'),
 (['ai-brand-visibility-tracker', 'google-sheets-import-export'], '**Weekly AI-visibility report:** schedule {0} weekly and append each run\'s share of voice to a sheet with {1}.'),
 (['sitemap-url-extractor', 'company-website-enrichment'], '**Site audits for prospects:** check a prospect\'s pages and status codes with {0}, then get their contacts with {1}.'),
]
def link(s): return f'[{CAT[s][0]}](https://apify.com/swillz/{s})'
def public_set():
    req = urllib.request.Request('https://api.apify.com/v2/acts?my=1&limit=100', headers={'Authorization': 'Bearer ' + os.environ['APIFY_TOKEN']})
    items = json.load(urllib.request.urlopen(req, timeout=60))['data']['items']
    out = set()
    for a in items:
        if a.get('name') in CAT:
            d = json.load(urllib.request.urlopen(urllib.request.Request(f"https://api.apify.com/v2/acts/{a['id']}", headers={'Authorization': 'Bearer ' + os.environ['APIFY_TOKEN']}), timeout=60))['data']
            if d.get('isPublic'): out.add(a['name'])
    return out
def block(me, allowed):
    sib = [s for s in CAT if s != me and s in allowed]
    flows = [(ss, t) for ss, t in FLOWS if me in ss and all(x in allowed or x == me for x in ss)]
    if not sib: return None
    L = ['## Related tools', '', 'More tools from the same developer, built to work together:', '']
    L += [f'- {link(s)}: {CAT[s][1]}' for s in sib]
    if flows:
        L += ['', '**Popular workflows**', '']
        L += ['- ' + t.format(*[('this Actor' if x == me else link(x)) for x in ss]) for ss, t in flows]
    return '\n'.join(L) + '\n'
def apply(me, allowed):
    p = ROOT / me / 'README.md'; s = p.read_text()
    b = block(me, allowed)
    m = re.search(r'^## Related tools\n.*?(?=^Source( code)?:|\Z)', s, re.M | re.S)
    if b is None:
        # no linkable siblings: drop any existing Related tools section
        if not m: return False
        new = s[:m.start()] + s[m.end():]
    elif m: new = s[:m.start()] + b + '\n' + s[m.end():]
    else:
        m2 = re.search(r'^Source( code)?:', s, re.M)
        new = (s[:m2.start()] + b + '\n' + s[m2.start():]) if m2 else s.rstrip('\n') + '\n\n' + b
    if new != s: p.write_text(new); return True
    return False
if __name__ == '__main__':
    args = sys.argv[1:]
    only = args[args.index('--only') + 1] if '--only' in args else None
    allowed = public_set() if '--public-only' in args else set(CAT)
    for me in CAT:
        if only and me != only: continue
        if '--public-only' in args: allowed_me = allowed | {me}
        else: allowed_me = allowed
        print(me, 'changed' if apply(me, allowed_me) else 'unchanged')
