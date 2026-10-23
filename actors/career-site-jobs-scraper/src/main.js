import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { ATS_LIST, parseCompany, endpoint, boardUrl, extractRaw, mapJob, parseDateInput, matches, FormatError } from './ats.js';

const JOB_EVENT = 'job';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
// Polite per-host pacing. Lever's robots.txt asks for Crawl-delay: 1.
const HOST_GAP = { 'api.lever.co': 1000, 'api.eu.lever.co': 1000 };
const DEFAULT_GAP = 250;

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        companies = [],
        titleKeywords = [], excludeTitleKeywords = [], locationKeywords = [], departmentKeywords = [],
        remoteOnly = false, postedSince = null,
        includeDescription = true, includeDescriptionHtml = false,
        maxJobsPerCompany = 0, maxJobs = 0,
        proxyConfiguration = { useApifyProxy: false }, maxRetries = 3,
    } = input;

    const list = (Array.isArray(companies) ? companies : String(companies).split(/[\n,]/))
        .map((c) => (typeof c === 'object' && c ? c.url ?? c.slug : c)).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!list.length) throw new InputError('Add at least one company: a job-board URL (e.g. https://jobs.lever.co/spotify) or a board name (e.g. stripe).');
    const parsed = [];
    for (const c of list) { try { parsed.push({ input: c, ...parseCompany(c) }); } catch (e) { throw new InputError(e.message); } }
    const seen = new Set();
    const targets = parsed.filter((p) => { const k = `${p.ats}|${p.slug.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
    let since; try { since = parseDateInput(postedSince); } catch (e) { throw new InputError(e.message); }
    const arr = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
    const filters = { titleKeywords: arr(titleKeywords), excludeTitleKeywords: arr(excludeTitleKeywords), locationKeywords: arr(locationKeywords), departmentKeywords: arr(departmentKeywords), remoteOnly: !!remoteOnly, since };
    const perCompany = Number(maxJobsPerCompany) > 0 ? Math.floor(Number(maxJobsPerCompany)) : Infinity;
    const totalCap = Number(maxJobs) > 0 ? Math.floor(Number(maxJobs)) : Infinity;

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    const stats = { requests: 0, retries: 0, failedRequests: 0 };
    const lastHit = new Map();

    async function fetchJson(url) {
        const host = new URL(url).hostname;
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const gap = HOST_GAP[host] ?? DEFAULT_GAP;
            const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
            lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) ?? 0) + gap));
            if (wait > 0) await sleep(wait);
            stats.requests++;
            try {
                const res = await gotScraping({ url, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: 45000 }, throwHttpErrors: false, retry: { limit: 0 },
                    headers: { accept: 'application/json' }, headerGeneratorOptions: { browsers: ['chrome'], devices: ['desktop'] } });
                const code = res.statusCode;
                if (code === 404 || code === 410) return { notFound: true };
                if (code === 429 || code >= 500 || code === 403) { lastErr = new Error(`HTTP ${code}`); if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(2000 * 2 ** attempt, 20000) + Math.random() * 500); continue; } break; }
                if (code >= 400) return { notFound: true, code };
                const ct = String(res.headers['content-type'] || '');
                if (!/json/i.test(ct) && !/^\s*[[{]/.test(res.body)) return { notFound: true, code, nonJson: true };
                try { return { body: JSON.parse(res.body) }; } catch { throw new FormatError(`Invalid JSON from ${host}`); }
            } catch (e) {
                if (e instanceof FormatError) throw e;
                lastErr = e; if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(2000 * 2 ** attempt, 20000) + Math.random() * 500); }
            }
        }
        stats.failedRequests++;
        throw lastErr;
    }

    let pushed = 0; let chargeLimitHit = false;
    const stop = () => chargeLimitHit || pushed >= totalCap;
    async function push(items) {
        if (!items.length || stop()) return 0;
        if (pushed + items.length > totalCap) items = items.slice(0, totalCap - pushed);
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(JOB_EVENT);
            if (Number.isFinite(allowed) && allowed < items.length) { items = items.slice(0, Math.max(0, allowed)); chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); }
        }
        if (!items.length) return 0;
        for (let i = 0; i < items.length; i += 500) {
            const r = await Actor.pushData(items.slice(i, i + 500), JOB_EVENT);
            if (r?.eventChargeLimitReached) chargeLimitHit = true;
        }
        pushed += items.length; return items.length;
    }

    const perCompanySummary = [];
    const scrapedAt = new Date().toISOString();
    let formatErrors = 0; let networkErrors = 0;

    async function resolveAndFetch(t) {
        const tryList = t.ats ? [t.ats] : ATS_LIST;
        let firstEmpty = null;
        for (const ats of tryList) {
            const r = await fetchJson(endpoint(ats, t.slug, t.region));
            if (r.notFound) continue;
            const raw = extractRaw(ats, r.body);
            if (raw.jobs.length || t.ats) return { ats, ...raw };
            firstEmpty ??= { ats, ...raw };
        }
        return firstEmpty;
    }

    for (const t of targets) {
        if (stop()) break;
        const row = { input: t.input, slug: t.slug, ats: t.ats, status: 'ok', jobsFound: 0, jobsMatched: 0, jobsSaved: 0, error: null };
        try {
            const res = await resolveAndFetch(t);
            if (!res) { row.status = 'not_found'; row.error = t.ats ? `No ${t.ats} job board named "${t.slug}"` : `No public job board named "${t.slug}" on ${ATS_LIST.join(', ')}`; log.warning(row.error); perCompanySummary.push(row); continue; }
            row.ats = res.ats; row.jobsFound = res.jobs.length; row.boardUrl = boardUrl(res.ats, t.slug, t.region);
            const companyName = res.companyName || t.slug;
            const out = [];
            for (const j of res.jobs) {
                let job;
                try { job = mapJob(res.ats, t.slug, companyName, j, { includeHtml: includeDescriptionHtml, region: t.region }); } catch (e) { formatErrors++; continue; }
                if (!job.jobId || !job.title) { formatErrors++; continue; }
                if (!matches(job, filters)) continue;
                if (!includeDescription) delete job.descriptionText;
                job.scrapedAt = scrapedAt;
                out.push(job);
                if (out.length >= perCompany) break;
            }
            row.jobsMatched = out.length;
            row.jobsSaved = await push(out);
            log.info(`${companyName} (${res.ats}): ${row.jobsFound} open jobs, ${row.jobsSaved} saved`);
        } catch (e) {
            if (e instanceof FormatError) { formatErrors++; row.status = 'format_error'; } else { networkErrors++; row.status = 'error'; }
            row.error = e.message; log.warning(`${t.input}: ${e.message}`);
        }
        perCompanySummary.push(row);
    }

    const summary = { companiesRequested: targets.length, companiesWithBoards: perCompanySummary.filter((r) => r.status === 'ok').length,
        jobsSaved: pushed, chargeLimitReached: chargeLimitHit, formatErrors, networkErrors, stats, companies: perCompanySummary, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    // Silent-failure guard: if the ATS APIs changed shape, fail loudly instead of returning an empty dataset.
    const okBoards = summary.companiesWithBoards;
    if (!okBoards && perCompanySummary.some((r) => r.status === 'format_error')) throw new Error('Job-board response format changed; no jobs could be parsed. The actor needs an update.');
    if (!okBoards && networkErrors && networkErrors === targets.length) throw new Error(`All ${targets.length} job boards failed to load (network errors). Try again or enable a proxy.`);
    if (!okBoards) await Actor.exit(`No public job boards found for the companies you entered. Check the board names (see README: "How to find a company's board name").`);
    else await Actor.exit(`Saved ${pushed} jobs from ${okBoards} of ${targets.length} companies.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Input error: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
