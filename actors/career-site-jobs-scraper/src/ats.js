// Parsing + mapping for public ATS job-board APIs. No personal data is emitted
// (recruiter names / mailbox emails present in some APIs are deliberately dropped).

export const ATS_LIST = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee'];

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

/** Returns { ats: string|null, slug, region } from a URL, "ats:slug" or bare slug. Throws on garbage. */
export function parseCompany(raw) {
    const s = String(raw ?? '').trim();
    if (!s) throw new Error('Empty company entry');
    const pref = s.match(/^(greenhouse|lever|ashby|workable|recruitee)\s*[:/]\s*([^/?#\s]+)$/i);
    if (pref) return { ats: pref[1].toLowerCase(), slug: pref[2], region: null };
    if (/^https?:\/\//i.test(s) || /^[a-z0-9.-]+\.(io|co|com)\//i.test(s) || /\.recruitee\.com/i.test(s)) {
        let u;
        try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new Error(`"${s}" is not a valid URL`); }
        const h = u.hostname.toLowerCase();
        const parts = u.pathname.split('/').filter(Boolean);
        if (h.endsWith('greenhouse.io')) {
            const forParam = u.searchParams.get('for');
            if (forParam) return { ats: 'greenhouse', slug: forParam, region: null };
            if (h.startsWith('boards-api')) { const i = parts.indexOf('boards'); if (i >= 0 && parts[i + 1]) return { ats: 'greenhouse', slug: parts[i + 1], region: null }; }
            if (parts[0] && parts[0] !== 'embed') return { ats: 'greenhouse', slug: parts[0], region: null };
        }
        if (h.endsWith('lever.co')) {
            const region = h.includes('.eu.') ? 'eu' : null;
            if (h.startsWith('api.')) { const i = parts.indexOf('postings'); if (i >= 0 && parts[i + 1]) return { ats: 'lever', slug: parts[i + 1], region }; }
            if (parts[0]) return { ats: 'lever', slug: parts[0], region };
        }
        if (h.endsWith('ashbyhq.com')) {
            if (h.startsWith('api.')) { const i = parts.indexOf('job-board'); if (i >= 0 && parts[i + 1]) return { ats: 'ashby', slug: parts[i + 1], region: null }; }
            if (parts[0]) return { ats: 'ashby', slug: parts[0], region: null };
        }
        if (h.endsWith('workable.com')) {
            if (parts[0] === 'api') { const i = parts.indexOf('accounts'); if (i >= 0 && parts[i + 1]) return { ats: 'workable', slug: parts[i + 1], region: null }; }
            if (parts[0] && parts[0] !== 'j') return { ats: 'workable', slug: parts[0], region: null };
        }
        if (h.endsWith('.recruitee.com')) return { ats: 'recruitee', slug: h.split('.')[0], region: null };
        throw new Error(`"${s}" is not a supported career-site URL. Supported: Greenhouse, Lever, Ashby, Workable and Recruitee job boards (or just type the company's board name, e.g. "stripe").`);
    }
    if (!SLUG_RE.test(s)) throw new Error(`"${s}" is not a valid company board name (use e.g. "stripe" or a job-board URL)`);
    return { ats: null, slug: s, region: null };
}

export function endpoint(ats, slug, region) {
    const e = encodeURIComponent(slug);
    switch (ats) {
        case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${e}/jobs?content=true`;
        case 'lever': return `https://api.${region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${e}?mode=json`;
        case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${e}?includeCompensation=true`;
        case 'workable': return `https://apply.workable.com/api/v1/widget/accounts/${e}?details=true`;
        case 'recruitee': return `https://${e}.recruitee.com/api/offers/`;
        default: throw new Error(`Unknown ATS ${ats}`);
    }
}
export function boardUrl(ats, slug, region) {
    const e = encodeURIComponent(slug);
    return {
        greenhouse: `https://job-boards.greenhouse.io/${e}`,
        lever: `https://jobs.${region === 'eu' ? 'eu.' : ''}lever.co/${e}`,
        ashby: `https://jobs.ashbyhq.com/${e}`,
        workable: `https://apply.workable.com/${e}`,
        recruitee: `https://${e}.recruitee.com`,
    }[ats];
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™' };
export function decodeEntities(s) {
    return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, g) => {
        if (g[0] === '#') { const n = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
        return ENT[g.toLowerCase()] ?? m;
    });
}
export function htmlToText(html) {
    if (!html) return null;
    let s = String(html);
    if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s); // Greenhouse double-encodes
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s || null;
}
export function decodedHtml(html) {
    if (!html) return null;
    const s = String(html);
    return /&lt;\/?[a-z]/i.test(s) ? decodeEntities(s) : s;
}

const CUR = { $: 'USD', '£': 'GBP', '€': 'EUR', USD: 'USD', GBP: 'GBP', EUR: 'EUR', CAD: 'CAD', AUD: 'AUD', CHF: 'CHF' };
function num(x, k) { let n = parseFloat(String(x).replace(/,/g, '')); if (/k/i.test(k || '')) n *= 1000; return n; }
/** Best-effort salary range extraction from free text, e.g. "$120,000 - $150,000" or "$180K–$220K USD". */
export function extractSalary(text) {
    if (!text) return null;
    const re = /(USD|CAD|AUD|GBP|EUR|CHF|[$£€])\s?(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s?([kK])?\s*(?:-|–|—|to)\s*(?:USD|CAD|AUD|GBP|EUR|CHF|[$£€])?\s?(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s?([kK])?/;
    const m = String(text).match(re);
    if (!m) return null;
    const min = num(m[2], m[3] || m[5]); const max = num(m[4], m[5]);
    if (!(min > 0 && max >= min)) return null;
    if (max < 1000 && !/k/i.test((m[3] || '') + (m[5] || ''))) { // hourly-ish
        return { salaryText: m[0].trim(), salaryMin: min, salaryMax: max, salaryCurrency: CUR[m[1]] ?? null, salaryInterval: max < 500 ? 'hour' : null };
    }
    return { salaryText: m[0].trim(), salaryMin: min, salaryMax: max, salaryCurrency: CUR[m[1]] ?? null, salaryInterval: 'year' };
}

const iso = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' UTC', 'Z').replace(/^(\d{4}-\d\d-\d\d) (\d)/, '$1T$2'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const isRemoteText = (s) => /\bremote\b|anywhere|work from home|telecommut/i.test(s || '');

function base(ats, slug, companyName) {
    return { ats, companySlug: slug, companyName: companyName || null };
}
function finish(o, includeHtml) {
    const sal = o.salaryMin == null ? extractSalary(o.descriptionText) : null;
    if (sal) Object.assign(o, sal);
    if (!includeHtml) delete o.descriptionHtml;
    for (const k of ['salaryText', 'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryInterval']) if (o[k] === undefined) o[k] = null;
    return o;
}

/** Returns { companyName, jobs: raw[] } or throws FormatError. */
export class FormatError extends Error {}
export function extractRaw(ats, body) {
    switch (ats) {
        case 'greenhouse': if (!Array.isArray(body?.jobs)) throw new FormatError('greenhouse: no jobs array'); return { companyName: body.jobs[0]?.company_name ?? null, jobs: body.jobs };
        case 'lever': if (!Array.isArray(body)) throw new FormatError('lever: response is not an array'); return { companyName: null, jobs: body };
        case 'ashby': if (!Array.isArray(body?.jobs)) throw new FormatError('ashby: no jobs array'); return { companyName: null, jobs: body.jobs.filter((j) => j.isListed !== false) };
        case 'workable': if (!Array.isArray(body?.jobs)) throw new FormatError('workable: no jobs array'); return { companyName: body.name ?? null, jobs: body.jobs };
        case 'recruitee': if (!Array.isArray(body?.offers)) throw new FormatError('recruitee: no offers array'); return { companyName: body.offers[0]?.company_name ?? null, jobs: body.offers };
        default: throw new FormatError(`unknown ats ${ats}`);
    }
}

export function mapJob(ats, slug, companyName, j, { includeHtml = false, region = null } = {}) {
    const b = base(ats, slug, companyName);
    if (ats === 'greenhouse') {
        const html = decodedHtml(j.content); const text = htmlToText(j.content);
        const loc = j.location?.name ?? null;
        return finish({ ...b, jobId: String(j.id), title: j.title?.trim() ?? null,
            department: j.departments?.map((d) => d.name).filter(Boolean).join(', ') || null, team: null,
            location: loc, locations: loc ? [loc] : [], country: null,
            remote: isRemoteText(loc) || null, workplaceType: isRemoteText(loc) ? 'remote' : null, employmentType: null,
            postedAt: iso(j.first_published), updatedAt: iso(j.updated_at),
            jobUrl: j.absolute_url ?? null, applyUrl: j.absolute_url ?? null, boardUrl: boardUrl(ats, slug),
            descriptionText: text, descriptionHtml: html }, includeHtml);
    }
    if (ats === 'lever') {
        const c = j.categories || {};
        const html = [j.opening, j.descriptionBody || j.description, ...(j.lists || []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`), j.additional].filter(Boolean).join('\n');
        const text = [j.openingPlain || j.descriptionPlain, ...(j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content) || ''}`), j.additionalPlain].filter(Boolean).join('\n\n').trim() || htmlToText(html);
        const sr = j.salaryRange;
        const locs = c.allLocations?.length ? c.allLocations : (c.location ? [c.location] : []);
        return finish({ ...b, jobId: j.id, title: j.text?.trim() ?? null, department: c.department ?? null, team: c.team ?? null,
            location: c.location ?? null, locations: locs, country: j.country ?? null,
            remote: j.workplaceType ? j.workplaceType === 'remote' : (isRemoteText(c.location) || null), workplaceType: j.workplaceType && j.workplaceType !== 'unspecified' ? j.workplaceType : null,
            employmentType: c.commitment ?? null, postedAt: iso(j.createdAt), updatedAt: null,
            jobUrl: j.hostedUrl ?? null, applyUrl: j.applyUrl ?? null, boardUrl: boardUrl(ats, slug, region),
            ...(sr ? { salaryText: null, salaryMin: sr.min ?? null, salaryMax: sr.max ?? null, salaryCurrency: sr.currency ?? null, salaryInterval: sr.interval ?? null } : {}),
            descriptionText: text, descriptionHtml: html || null }, includeHtml);
    }
    if (ats === 'ashby') {
        const comp = j.compensation || {};
        const tier = comp.summaryComponents?.find((x) => x.compensationType === 'Salary') ?? comp.compensationTiers?.[0]?.components?.find((x) => x.compensationType === 'Salary');
        const locs = [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean);
        return finish({ ...b, jobId: j.id, title: j.title?.trim() ?? null, department: j.department ?? null, team: j.team ?? null,
            location: j.location ?? null, locations: locs, country: j.address?.postalAddress?.addressCountry ?? null,
            remote: typeof j.isRemote === 'boolean' ? j.isRemote : null, workplaceType: j.workplaceType ? String(j.workplaceType).toLowerCase() : null,
            employmentType: j.employmentType ?? null, postedAt: iso(j.publishedAt), updatedAt: null,
            jobUrl: j.jobUrl ?? null, applyUrl: j.applyUrl ?? null, boardUrl: boardUrl(ats, slug),
            ...(tier ? { salaryText: comp.scrapeableCompensationSalarySummary ?? comp.compensationTierSummary ?? null, salaryMin: tier.minValue ?? null, salaryMax: tier.maxValue ?? null, salaryCurrency: tier.currencyCode ?? null, salaryInterval: tier.interval ? String(tier.interval).replace(/^1 /, '').toLowerCase() : null } : {}),
            descriptionText: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml), descriptionHtml: j.descriptionHtml ?? null }, includeHtml);
    }
    if (ats === 'workable') {
        const locs = (j.locations || []).filter((l) => !l.hidden).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')).filter(Boolean);
        const loc = [j.city, j.state, j.country].filter(Boolean).join(', ') || locs[0] || null;
        return finish({ ...b, jobId: j.shortcode ?? null, title: j.title?.trim() ?? null, department: j.department || null, team: j.function || null,
            location: loc, locations: locs.length ? locs : (loc ? [loc] : []), country: j.locations?.[0]?.countryCode ?? null,
            remote: typeof j.telecommuting === 'boolean' ? j.telecommuting : null, workplaceType: j.telecommuting ? 'remote' : null,
            employmentType: j.employment_type || null, postedAt: iso(j.published_on || j.created_at), updatedAt: null,
            jobUrl: j.url ?? j.shortlink ?? null, applyUrl: j.application_url ?? null, boardUrl: boardUrl(ats, slug),
            descriptionText: htmlToText(j.description), descriptionHtml: j.description ?? null }, includeHtml);
    }
    if (ats === 'recruitee') {
        const locs = (j.locations || []).map((l) => [l.city, l.state, l.country].filter(Boolean).join(', ')).filter(Boolean);
        const html = [j.description, j.requirements].filter(Boolean).join('\n');
        const s = j.salary || {};
        return finish({ ...b, jobId: String(j.id), title: j.title?.trim() ?? null, department: j.department ?? null, team: null,
            location: j.location || locs[0] || null, locations: locs, country: j.country_code ?? null,
            remote: typeof j.remote === 'boolean' ? j.remote : null, workplaceType: j.remote ? 'remote' : (j.hybrid ? 'hybrid' : (j.on_site ? 'onsite' : null)),
            employmentType: j.employment_type_code ?? null, postedAt: iso(j.published_at || j.created_at), updatedAt: iso(j.updated_at),
            jobUrl: j.careers_url ?? null, applyUrl: j.careers_apply_url ?? null, boardUrl: boardUrl(ats, slug),
            ...(s.min || s.max ? { salaryText: null, salaryMin: s.min ? Number(s.min) : null, salaryMax: s.max ? Number(s.max) : null, salaryCurrency: s.currency ?? null, salaryInterval: s.period ?? null } : {}),
            descriptionText: htmlToText(html), descriptionHtml: html || null }, includeHtml);
    }
    throw new FormatError(`unknown ats ${ats}`);
}

export function parseDateInput(v, now = Date.now()) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const s = String(v).trim();
    const rel = s.match(/^(\d+)\s*(hour|day|week|month)s?(\s+ago)?$/i);
    if (rel) { const n = Number(rel[1]); const ms = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[rel[2].toLowerCase()]; return new Date(now - n * ms); }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`"${s}" is not a valid date. Use e.g. 2026-10-01 or "7 days".`);
    return d;
}

/** Returns true if the job passes the filters. */
export function matches(job, f) {
    const lc = (x) => String(x ?? '').toLowerCase();
    if (f.titleKeywords?.length && !f.titleKeywords.some((k) => lc(job.title).includes(lc(k)))) return false;
    if (f.excludeTitleKeywords?.length && f.excludeTitleKeywords.some((k) => lc(job.title).includes(lc(k)))) return false;
    if (f.locationKeywords?.length) {
        const hay = lc([job.location, ...(job.locations || []), job.country].join(' | '));
        if (!f.locationKeywords.some((k) => hay.includes(lc(k)))) return false;
    }
    if (f.departmentKeywords?.length && !f.departmentKeywords.some((k) => lc(`${job.department} ${job.team}`).includes(lc(k)))) return false;
    if (f.remoteOnly && job.remote !== true) return false;
    if (f.since && job.postedAt && new Date(job.postedAt) < f.since) return false;
    if (f.since && !job.postedAt && f.strictDates) return false;
    return true;
}
