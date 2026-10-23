// Pure helpers for Workday career sites (no network). Unit-tested in test/local.test.js.
export class FormatError extends Error {}
export const PAGE_SIZE = 20;      // Workday's list endpoint maximum
export const OFFSET_CAP = 2000;   // offsets >= 2000 wrap back to page 1, so big sites are split by facet

const LOCALE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

/** Parse a Workday career-site URL (or "tenant/site" on a known host) into { host, tenant, site, facets, searchText }. */
export function parseSiteUrl(raw) {
    const s = String(raw ?? '').trim();
    if (!s) throw new Error('Empty URL');
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new Error(`Not a valid URL: "${s}"`); }
    const host = u.hostname.toLowerCase();
    const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let tenant; let site;
    const cxs = seg.indexOf('cxs');
    if (seg[0] === 'wday' && cxs === 1 && seg.length >= 4) { tenant = seg[2]; site = seg[3]; }
    else if (/\.myworkdayjobs\.com$/.test(host) || /\.myworkdayjobs-impl\.com$/.test(host)) {
        tenant = host.split('.')[0];
        const rest = seg.filter((p, i) => !(i === 0 && LOCALE.test(p)));
        site = rest[0];
    } else if (/\.myworkdaysite\.com$/.test(host)) {
        const rest = seg.filter((p, i) => !(i === 0 && LOCALE.test(p)));
        const r = rest.indexOf('recruiting');
        if (r >= 0) { tenant = rest[r + 1]; site = rest[r + 2]; }
    } else {
        throw new Error(`"${s}" is not a Workday career site. Use a URL like https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`);
    }
    if (!tenant || !site || site === 'job' || site === 'login') throw new Error(`Couldn't find the career site name in "${s}". Open the company's Workday jobs page and copy the URL from the address bar (e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite).`);
    // Filters from a search URL: ?q=...&locations=...&jobFamilyGroup=... become Workday facets.
    const facets = {}; let searchText = '';
    for (const [k, v] of u.searchParams) {
        if (k === 'q') { searchText = v; continue; }
        if (['source', 'utm_source', 'utm_medium', 'utm_campaign', 'redirect', 'locale'].includes(k) || k.startsWith('utm_')) continue;
        (facets[k] ??= []).push(v);
    }
    return { host, tenant, site, facets, searchText, key: `${host}|${tenant.toLowerCase()}|${site.toLowerCase()}` };
}

export const apiBase = (t) => `https://${t.host}/wday/cxs/${encodeURIComponent(t.tenant)}/${encodeURIComponent(t.site)}`;
export const siteUrl = (t) => `https://${t.host}/${/\.myworkdaysite\.com$/.test(t.host) ? `recruiting/${t.tenant}/` : ''}${t.site}`;

/** "Posted Today" -> {days:0}, "Posted 3 Days Ago" -> {days:3}, "Posted 30+ Days Ago" -> {days:30, plus:true}. */
export function parsePostedOn(text) {
    const t = String(text ?? '').toLowerCase();
    if (!t) return null;
    if (/today|just posted|heute|aujourd/.test(t)) return { days: 0 };
    if (/yesterday|gestern|hier/.test(t)) return { days: 1 };
    const m = t.match(/(\d+)\s*(\+)?\s*(day|tag|jour|día|dia)/);
    if (m) return { days: Number(m[1]), plus: !!m[2] };
    return null;
}

/** Can a list-level posting still match "posted within N days"? Unknown/ambiguous -> keep (decided after details). */
export function maybeWithin(posted, maxDays) {
    if (maxDays == null) return true;
    if (!posted) return true;
    if (posted.plus) return maxDays >= posted.days;
    return posted.days <= maxDays;
}

export function htmlToText(html) {
    if (!html) return '';
    return String(html)
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

const NUM = '\\d{1,3}(?:[,.]\\d{3})*(?:\\.\\d+)?\\s*[kK]?';
const PAY = new RegExp(`(US\\$|CA\\$|C\\$|A\\$|\\$|£|€|USD\\s?|CAD\\s?|EUR\\s?|GBP\\s?)\\s?(${NUM})\\s*(?:-|–|—|to)\\s*(?:US\\$|CA\\$|C\\$|A\\$|\\$|£|€|USD\\s?|CAD\\s?|EUR\\s?|GBP\\s?)?\\s?(${NUM})(?:\\s*(?:USD|CAD|EUR|GBP))?(?:\\s*(?:per|\\/|an?)\\s*(hour|hr|year|yr|annum|annual|month))?`, 'i');
const toNum = (x) => { let s = x.replace(/\s/g, ''); const k = /k$/i.test(s); s = s.replace(/k$/i, ''); s = s.replace(/[,](?=\d{3}\b)/g, '').replace(/\.(?=\d{3}\b)/g, ''); const n = Number(s); return Number.isFinite(n) ? (k ? n * 1000 : n) : null; };
/** First pay range in a description, e.g. "$120,000 - $180,000" -> {salaryText, salaryMin, salaryMax, salaryCurrency, salaryPeriod}. */
export function extractSalary(text) {
    const m = String(text ?? '').match(PAY);
    if (!m) return null;
    const min = toNum(m[2]); const max = toNum(m[3]);
    if (min == null || max == null || max < min || max < 10) return null;
    const sym = m[1].trim().toUpperCase();
    const cur = sym.includes('CA') || sym === 'C$' || sym === 'CAD' ? 'CAD' : sym === 'A$' ? 'AUD' : sym.includes('£') || sym === 'GBP' ? 'GBP' : sym.includes('€') || sym === 'EUR' ? 'EUR' : 'USD';
    const p = (m[4] || '').toLowerCase();
    const period = /hour|hr/.test(p) ? 'hour' : /month/.test(p) ? 'month' : /year|yr|annum|annual/.test(p) ? 'year' : (max <= 500 ? 'hour' : 'year');
    return { salaryText: m[0].trim(), salaryMin: min, salaryMax: max, salaryCurrency: cur, salaryPeriod: period };
}

const pretty = (s) => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Build one output row from a list posting and (optionally) its detail response. */
export function mapJob(t, listItem, detail, { includeHtml = false, includeDescription = true, scrapedAt, companyName } = {}) {
    if (!listItem || typeof listItem !== 'object' || !listItem.externalPath) throw new FormatError('Posting without externalPath');
    const info = detail?.jobPostingInfo;
    if (detail && (!info || typeof info !== 'object')) throw new FormatError('Detail without jobPostingInfo');
    const posted = parsePostedOn(info?.postedOn ?? listItem.postedOn);
    const jobUrl = info?.externalUrl || `${siteUrl(t)}${listItem.externalPath}`;
    const locations = info ? [info.location, ...(info.additionalLocations ?? [])].filter(Boolean) : (listItem.locationsText && !/^\d+\s+locations?$/i.test(listItem.locationsText) ? [listItem.locationsText] : []);
    const descriptionHtml = info?.jobDescription ?? null;
    const descriptionText = descriptionHtml ? htmlToText(descriptionHtml) : null;
    const remoteHay = [info?.remoteType, ...locations, listItem.locationsText, listItem.title].filter(Boolean).join(' | ');
    const row = {
        company: companyName || pretty(t.tenant),
        hiringEntity: detail?.hiringOrganization?.name || null,
        title: (info?.title ?? listItem.title ?? '').trim(),
        jobId: info?.jobReqId || (listItem.bulletFields ?? [])[0] || listItem.externalPath.split('_').pop(),
        location: locations[0] ?? listItem.locationsText ?? null,
        allLocations: locations,
        locationCount: locations.length || (Number((String(listItem.locationsText ?? '').match(/^(\d+)\s+locations?$/i) ?? [])[1]) || null),
        country: info?.country?.descriptor ?? info?.jobRequisitionLocation?.country?.descriptor ?? null,
        countryCode: info?.jobRequisitionLocation?.country?.alpha2Code ?? null,
        remote: info?.remoteType ? !/on[- ]?site/i.test(info.remoteType) : /remote|virtual|work from home|home[- ]based/i.test(remoteHay),
        remoteType: info?.remoteType ?? null,
        timeType: info?.timeType ?? listItem.timeType ?? null,
        postedDate: info?.startDate ?? null,
        postedText: info?.postedOn ?? listItem.postedOn ?? null,
        postedDaysAgo: posted ? posted.days : null,
        postedDaysAgoIsMinimum: posted ? !!posted.plus : null,
        jobUrl,
        applyUrl: info?.canApply === false ? null : `${jobUrl.replace(/\/$/, '')}/apply`,
        ...(includeDescription ? { descriptionText } : {}),
        ...(includeHtml ? { descriptionHtml } : {}),
        ...(extractSalary(descriptionText) ?? { salaryText: null, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null }),
        ats: 'workday',
        workdayTenant: t.tenant,
        workdaySite: t.site,
        careerSiteUrl: siteUrl(t),
        scrapedAt,
    };
    if (!row.title) throw new FormatError('Posting without title');
    return row;
}

/** Pick the facet to split an over-2,000 search by: values with counts, not yet applied, covering most jobs, smallest biggest bucket. */
export function pickSplitFacet(facets, applied, total) {
    const cands = [];
    const visit = (f) => {
        if (!f || !f.facetParameter || !Array.isArray(f.values)) return;
        const vals = f.values.filter((v) => v && v.id && Number.isFinite(v.count) && v.count > 0);
        if (vals.length > 1 && !(f.facetParameter in applied)) {
            const sum = vals.reduce((a, v) => a + v.count, 0); const maxBucket = Math.max(...vals.map((v) => v.count));
            cands.push({ param: f.facetParameter, values: vals, sum, maxBucket });
        }
        for (const v of f.values) if (v && v.facetParameter && Array.isArray(v.values)) visit(v);
    };
    for (const f of facets ?? []) visit(f);
    if (!cands.length) return null;
    const covers = (c) => c.sum >= total * 0.98;
    cands.sort((a, b) => (covers(b) - covers(a)) || ((a.maxBucket >= OFFSET_CAP) - (b.maxBucket >= OFFSET_CAP)) || (a.maxBucket - b.maxBucket));
    return cands[0];
}

/** Minimal robots.txt check for User-agent: * (longest match wins, Allow beats Disallow on ties). */
export function robotsAllows(robotsTxt, path) {
    if (!robotsTxt) return true;
    const groups = []; let cur = null; let lastWasAgent = false;
    for (const lineRaw of String(robotsTxt).split(/\r?\n/)) {
        const line = lineRaw.replace(/#.*/, '').trim(); if (!line) continue;
        const i = line.indexOf(':'); if (i < 0) continue;
        const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
        if (k === 'user-agent') { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
        lastWasAgent = false;
        if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
    }
    const g = groups.filter((x) => x.agents.includes('*'));
    const rules = g.flatMap((x) => x.rules).filter((r) => r.path);
    let best = null;
    for (const r of rules) {
        const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return best ? best.allow : true;
}
