// Pure helpers (no network): domain parsing, ATS link detection, board corroboration and hiring-signal summaries.
import { parseCompany } from './ats.js';

const DOMAIN_RX = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
export const CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'web.de', 'mail.ru', 'yandex.ru', 'qq.com', '163.com']);
// Hosts that are platforms, not companies: a "careers" scan of them is meaningless.
const PLATFORM_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|google\.[a-z.]+|goo\.gl|wikipedia\.org|github\.com|medium\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|recruitee\.com|myworkdayjobs\.com|indeed\.com|glassdoor\.[a-z.]+)$/;

/** "Jane@Acme.com" | "https://www.acme.com/x" | "acme.com" -> { domain, inputType } or null. Email local parts are dropped. */
export function toDomain(raw) {
    let s = String(raw ?? '').trim().toLowerCase();
    if (!s) return null;
    let inputType = 'domain';
    s = s.replace(/^mailto:/, '');
    if (/^[^\s@/]+@[^\s@/]+$/.test(s)) { s = s.split('@').pop(); inputType = 'email'; } else if (/^[a-z][a-z0-9+.-]*:\/\//.test(s) || s.includes('/')) {
        try { s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`).hostname; inputType = 'url'; } catch { return null; }
    }
    s = s.replace(/\.$/, '').replace(/^www\d?\./, '');
    try { s = new URL(`https://${s}`).hostname; } catch { return null; }
    return DOMAIN_RX.test(s) ? { domain: s, inputType } : null;
}
export const isPlatformHost = (d) => PLATFORM_HOSTS.test(d);

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc']);
/** Main brand label of a domain: "acme.co.uk" -> "acme", "jobs.stripe.com" -> "stripe". */
export function brandLabel(domain) {
    const p = String(domain).split('.');
    if (p.length >= 3 && SECOND_LEVEL.has(p[p.length - 2]) && p[p.length - 1].length === 2) return p[p.length - 3];
    return p.length >= 2 ? p[p.length - 2] : p[0];
}
/** Board-name guesses for a domain, most likely first. */
export function slugCandidates(domain, companyName) {
    const b = brandLabel(domain); const out = [b];
    if (b.includes('-')) out.push(b.replace(/-/g, ''));
    // datadoghq.com -> datadog, getdbt.com -> dbt, joinhoney.com -> honey
    const stripped = b.replace(/-/g, '').replace(/(hq|app|labs|inc|group|software|tech|global|official)$/, '').replace(/^(get|try|use|join|go|hello|meet)(?=[a-z0-9]{3,})/, '');
    if (stripped.length >= 3) out.push(stripped);
    if (companyName) { const c = String(companyName).toLowerCase().replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|company|plc|sa|ag|bv)\b\.?/g, '').replace(/[^a-z0-9]+/g, ''); if (c && c.length >= 2) out.push(c); }
    return [...new Set(out)].filter((s) => /^[a-z0-9][a-z0-9._-]{1,99}$/.test(s));
}

// ATS link patterns. "supported" boards are read through their official public job-board APIs.
const ATS_PATTERNS = [
    { ats: 'greenhouse', rx: /https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?(?:[^"'\s<>]*&)?for=)?([a-z0-9_-]+)/gi },
    { ats: 'greenhouse', rx: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi },
    { ats: 'lever', rx: /https?:\/\/jobs\.(eu\.)?lever\.co\/([a-z0-9._-]+)/gi, region: true },
    { ats: 'ashby', rx: /https?:\/\/jobs\.ashbyhq\.com\/([a-z0-9._%-]+)/gi },
    { ats: 'ashby', rx: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9._-]+)/gi },
    { ats: 'workable', rx: /https?:\/\/apply\.workable\.com\/([a-z0-9_-]+)/gi },
    { ats: 'recruitee', rx: /https?:\/\/([a-z0-9-]+)\.recruitee\.com/gi },
];
const OTHER_ATS = [
    ['workday', /[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com/i], ['smartrecruiters', /(jobs|careers)\.smartrecruiters\.com\/[a-z0-9]/i], ['bamboohr', /[a-z0-9-]+\.bamboohr\.com\/(careers|jobs)/i],
    ['jobvite', /jobs\.jobvite\.com\//i], ['icims', /[a-z0-9-]+\.icims\.com/i], ['teamtailor', /[a-z0-9-]+\.teamtailor\.com/i], ['personio', /[a-z0-9-]+\.jobs\.personio\.(de|com)/i],
    ['breezy', /[a-z0-9-]+\.breezy\.hr/i], ['jazzhr', /[a-z0-9-]+\.applytojob\.com/i], ['rippling', /ats\.rippling\.com\//i], ['successfactors', /career[0-9]*\.successfactors\.(com|eu)/i],
    ['oracle', /\.oraclecloud\.com\/hcmUI\/CandidateExperience/i], ['pinpoint', /[a-z0-9-]+\.pinpointhq\.com/i], ['dover', /app\.dover\.(io|com)\/jobs\//i], ['gem', /jobs\.gem\.com\//i],
];
const BAD_SLUGS = new Set(['embed', 'api', 'j', 'jobs', 'www', 'app', 'careers', 'static', 'assets', 'cdn', 'widget', 'v1', 'boards', 'job-board', 'job_board']);
/** Finds job-board links in HTML. Returns { boards: [{ats, slug, region}], otherAts: [names] }. */
/** Company name from og:site_name or application-name meta tags (used as an extra board-name guess). */
export function siteName(html) {
    const m = String(html || '').match(/<meta[^>]+(?:property|name)=["'](?:og:site_name|application-name)["'][^>]*content=["']([^"']{2,60})["']/i)
        || String(html || '').match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]*(?:property|name)=["'](?:og:site_name|application-name)["']/i);
    return m ? m[1].trim() : null;
}

export function findAtsLinks(html) {
    const s = String(html ?? '').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const seen = new Set(); const boards = [];
    for (const p of ATS_PATTERNS) {
        p.rx.lastIndex = 0; let m;
        while ((m = p.rx.exec(s))) {
            const region = p.region && m[1] ? 'eu' : null;
            let slug = decodeURIComponent((p.region ? m[2] : m[1]) || '').toLowerCase().replace(/[.]+$/, '');
            if (!slug || BAD_SLUGS.has(slug)) continue;
            const k = `${p.ats}|${slug}`; if (seen.has(k)) continue; seen.add(k);
            boards.push({ ats: p.ats, slug, region });
        }
    }
    const otherAts = OTHER_ATS.filter(([, rx]) => rx.test(s)).map(([n]) => n);
    const wd = s.match(/https?:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^"'\s<>]*/i);
    return { boards, otherAts, workdayUrl: wd ? wd[0] : null };
}
const CAREERS_TEXT = /\b(careers?|jobs?|join (us|our team)|we('| a)re hiring|work (with|at) us|open (roles|positions)|vacancies|karriere|stellen|emplois?|carri[eè]res?|empleo|trabaja|lavora|vacatures)\b/i;
const CAREERS_HREF = /\/(careers?|jobs?|join(-us)?|work-with-us|vacancies|karriere|stellenangebote|jobs-and-careers|company\/careers|about\/careers|en\/careers)(\/|$|\?|#|\.html?)/i;
/** Candidate careers-page URLs linked from a page (same site or careers.* / jobs.* subdomains). */
export function careersLinks(html, pageUrl, domain) {
    const out = []; const rx = /<a\b[^>]*href\s*=\s*["']([^"'#]+)[^>]*>([\s\S]{0,300}?)<\/a>/gi; let m;
    while ((m = rx.exec(String(html ?? '')))) {
        let u; try { u = new URL(m[1], pageUrl); } catch { continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        const h = u.hostname.toLowerCase().replace(/^www\./, '');
        if (!(h === domain || h.endsWith(`.${domain}`))) continue;
        const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const score = (CAREERS_HREF.test(u.pathname) ? 2 : 0) + (CAREERS_TEXT.test(text) ? 2 : 0) + (/^(careers|jobs)\./.test(h) ? 3 : 0);
        if (score >= 2) out.push({ url: u.href.split('#')[0], score });
    }
    const best = new Map(); for (const o of out) if (!best.has(o.url) || best.get(o.url) < o.score) best.set(o.url, o.score);
    return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}
export { parseCompany };

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Does a board belong to this domain? Returns 'high' | 'medium' | 'low'. */
export function corroborate({ domain, slug, companyName, jobs = [], urls = [] }) {
    const label = norm(brandLabel(domain));
    const jobUrlHit = urls.some((u) => { try { const h = new URL(u).hostname.toLowerCase(); return h === domain || h.endsWith(`.${domain}`); } catch { return false; } });
    if (jobUrlHit) return 'high';
    const cn = norm(companyName);
    if (cn && label && (cn === label || (label.length >= 4 && cn.startsWith(label)) || (cn.length >= 4 && label.startsWith(cn)))) return 'high';
    // A board that names a different company (e.g. "Democorp" on greenhouse/example) is not this domain's board.
    if (cn && cn.length >= 3) return 'low';
    if (jobs.length && slugCandidates(domain).map(norm).includes(norm(slug))) return 'medium';
    return 'low';
}

// ---------- job classification ----------
const FUNCTIONS = [
    ['engineering', /\b(engineer|engineering|developer|devops|sre|site reliability|software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|firmware|embedded|qa|quality assurance|test automation|architect|infrastructure|platform|security engineer|programmer)\b/i],
    ['data_ai', /\b(data|machine learning|ml|ai|analytics|analyst|scientist|research scientist|bi|business intelligence|llm|nlp|computer vision)\b/i],
    ['product', /\b(product manager|product owner|product lead|head of product|vp,? product|product management|technical program|program manager)\b/i],
    ['design', /\b(designer|design|ux|ui|user research|researcher|creative|brand designer)\b/i],
    ['sales', /\b(sales|account executive|ae|sdr|bdr|business development|account manager|partnerships?|revenue|solutions? (engineer|consultant|architect)|pre-?sales|channel|inside sales|enterprise account)\b/i],
    ['marketing', /\b(marketing|growth|seo|content|communications|pr|social media|demand gen|brand|copywriter|community|events?|product marketing)\b/i],
    ['customer_success', /\b(customer success|customer support|support (engineer|specialist|agent)|customer service|customer experience|implementation|onboarding|technical support|help ?desk|client services)\b/i],
    ['operations', /\b(operations|ops|supply chain|logistics|procurement|facilities|workplace|office manager|project manager|business operations|strategy|chief of staff)\b/i],
    ['finance', /\b(finance|financial|accountant|accounting|controller|fp&a|tax|treasury|payroll|billing|audit)\b/i],
    ['people_hr', /\b(recruit(er|ing)|talent|people|hr|human resources|hrbp|people partner|l&d|learning)\b/i],
    ['legal', /\b(legal|counsel|attorney|lawyer|paralegal|compliance|privacy|regulatory|risk)\b/i],
];
export function classifyFunction(title, department) {
    const t = String(title ?? ''); const d = String(department ?? '');
    for (const [k, rx] of FUNCTIONS) if (rx.test(t)) return k;
    for (const [k, rx] of FUNCTIONS) if (rx.test(d)) return k;
    return 'other';
}
export function classifySeniority(title) {
    const t = String(title ?? '');
    if (/\b(chief|cto|ceo|cfo|coo|cmo|cro|cpo|ciso|president|founding|co-?founder)\b|\bvp\b|vice president|\bsvp\b|\bevp\b|general manager|\bhead of\b/i.test(t)) return 'executive';
    if (/\b(director|sr\.? director|senior director)\b/i.test(t)) return 'director';
    if (/\b(manager|lead|principal|staff|supervisor)\b/i.test(t)) return /\b(principal|staff)\b/i.test(t) ? 'senior' : 'manager';
    if (/\b(senior|sr\.?|iii|iv|expert)\b/i.test(t)) return 'senior';
    if (/\b(intern|internship|werkstudent|working student|apprentice|trainee|co-?op|graduate|new grad)\b/i.test(t)) return 'intern_entry';
    if (/\b(junior|jr\.?|associate|entry|i)\b/i.test(t)) return 'junior';
    return 'mid';
}
const countBy = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); if (k) m[k] = (m[k] ?? 0) + 1; } return m; };
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
export function intensity(n) { return n <= 0 ? 'none' : n < 5 ? 'low' : n < 20 ? 'moderate' : n < 100 ? 'high' : 'very_high'; }

/** Summarize mapped jobs ({title, department, location, locations, country, remote, postedAt, salaryMin, jobUrl}) into hiring signals. */
export function summarize(jobs, { now = Date.now(), sample = 5 } = {}) {
    const n = jobs.length;
    const fn = countBy(jobs, (j) => classifyFunction(j.title, j.department));
    const sen = countBy(jobs, (j) => classifySeniority(j.title));
    const dept = countBy(jobs, (j) => (j.department ? String(j.department).split(',')[0].trim() : null));
    const loc = countBy(jobs, (j) => (j.location ? String(j.location).trim().slice(0, 80) : null));
    const countries = countBy(jobs, (j) => j.country || null);
    const dates = jobs.map((j) => (j.postedAt ? Date.parse(j.postedAt) : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
    const ages = dates.map((d) => (now - d) / 86400e3).sort((a, b) => a - b);
    const within = (days) => (dates.length ? dates.filter((d) => now - d <= days * 86400e3).length : null);
    const remote = jobs.filter((j) => j.remote === true || /remote/i.test(j.workplaceType || '')).length;
    const salary = jobs.filter((j) => j.salaryMin != null || j.salaryMax != null).length;
    const leadership = jobs.filter((j) => ['executive', 'director'].includes(classifySeniority(j.title))).map((j) => j.title).slice(0, 10);
    const last30 = within(30);
    const signals = [];
    if ((fn.sales ?? 0) >= 2 || (fn.sales ?? 0) / Math.max(1, n) >= 0.2) signals.push('scaling_sales');
    if ((fn.engineering ?? 0) >= 5 || (n >= 3 && (fn.engineering ?? 0) / n >= 0.4)) signals.push('building_engineering');
    if ((fn.data_ai ?? 0) >= 2) signals.push('investing_in_data_ai');
    if ((fn.marketing ?? 0) >= 2) signals.push('growing_marketing');
    if ((fn.customer_success ?? 0) >= 2) signals.push('expanding_customer_success');
    if (leadership.length) signals.push('hiring_leadership');
    if (Object.keys(countries).length >= 3) signals.push('international_expansion');
    if (n >= 3 && remote / n >= 0.5) signals.push('remote_friendly');
    if (last30 != null && n >= 5 && last30 / n >= 0.5) signals.push('hiring_surge_last_30_days');
    if (n >= 100) signals.push('high_volume_hiring');
    return {
        isHiring: n > 0, openJobs: n, hiringIntensity: intensity(n),
        signals,
        jobsByFunction: fn, topFunction: top(fn, 1)[0]?.name ?? null,
        jobsBySeniority: sen, leadershipRoles: leadership,
        topDepartments: top(dept, 10), topLocations: top(loc, 10), countries: Object.keys(countries).sort(),
        remoteJobs: remote, remoteShare: n ? Math.round((100 * remote) / n) / 100 : null,
        salaryDisclosedShare: n ? Math.round((100 * salary) / n) / 100 : null,
        newestPostedAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
        oldestPostedAt: dates.length ? new Date(dates[0]).toISOString() : null,
        postedLast7Days: within(7), postedLast30Days: last30,
        medianJobAgeDays: ages.length ? Math.round(ages[Math.floor(ages.length / 2)]) : null,
        sampleJobs: jobs.slice().sort((a, b) => (Date.parse(b.postedAt || 0) || 0) - (Date.parse(a.postedAt || 0) || 0)).slice(0, sample)
            .map((j) => ({ title: j.title, department: j.department ?? null, location: j.location ?? null, postedAt: j.postedAt ?? null, url: j.jobUrl ?? null })),
    };
}
