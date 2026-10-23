import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { ATS_LIST, parseCompany, boardUrl, resolveBoard, mapJob, parseDateInput, matches, FormatError } from './ats.js';

const JOB_EVENT = 'job';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
// Polite per-host pacing. Lever's robots.txt asks for Crawl-delay: 1.
const HOST_GAP = { 'api.lever.co': 1000, 'api.eu.lever.co': 1000 };
const DEFAULT_GAP = 250;

/** Overall job cap: maxJobs, or common aliases agents send (maxItems, limit, maxResults), and the run's max paid items option. */
function resolveCap(maxJobs, input) {
    const caps = [maxJobs, input.maxItems, input.limit, input.maxResults, process.env.ACTOR_MAX_PAID_DATASET_ITEMS]
        .map(Number).filter((n) => Number.isFinite(n) && n > 0).map(Math.floor);
    return caps.length ? Math.min(...caps) : Infinity;
}
const describeFilters = (f) => [
    f.titleKeywords.length && `titleKeywords=${JSON.stringify(f.titleKeywords)}`, f.excludeTitleKeywords.length && `excludeTitleKeywords=${JSON.stringify(f.excludeTitleKeywords)}`,
    f.locationKeywords.length && `locationKeywords=${JSON.stringify(f.locationKeywords)}`, f.departmentKeywords.length && `departmentKeywords=${JSON.stringify(f.departmentKeywords)}`,
    f.remoteOnly && 'remoteOnly=true', f.since && `postedSince=${new Date(f.since).toISOString().slice(0, 10)}`].filter(Boolean).join(', ') || 'none';

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        companies = [],
        titleKeywords = [], excludeTitleKeywords = [], locationKeywords = [], departmentKeywords = [],
        remoteOnly = false, postedSince = null,
        includeDescription = true, includeDescriptionHtml = false,
        maxJobsPerCompany = 0, maxJobs = 0, emitStatusRows = true,
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
    const totalCap = resolveCap(maxJobs, input);
    if (Number.isFinite(totalCap)) log.info(`Saving at most ${totalCap} jobs in this run.`);

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

    // Pinned targets (URL or "ats:slug") query one ATS; bare names query all and keep the biggest board.
    const resolveAndFetch = (t) => resolveBoard(t, fetchJson);
    const resolvedBoards = new Map(); // "ats|region|slug" -> first input, so "ramp" + "ashby:ramp" isn't scraped twice

    for (const t of targets) {
        if (stop()) { perCompanySummary.push({ input: t.input, slug: t.slug, ats: t.ats, status: chargeLimitHit ? 'skipped_charge_limit' : 'skipped_max_jobs', jobsFound: 0, jobsMatched: 0, jobsSaved: 0, error: null }); continue; }
        const row = { input: t.input, slug: t.slug, ats: t.ats, status: 'ok', jobsFound: 0, jobsMatched: 0, jobsSaved: 0, error: null };
        try {
            const res = await resolveAndFetch(t);
            if (!res) { row.status = 'not_found'; row.error = t.ats ? `No ${t.ats} job board named "${t.slug}"` : `No public job board named "${t.slug}" on ${ATS_LIST.join(', ')}`; log.warning(row.error); perCompanySummary.push(row); continue; }
            const resolvedKey = `${res.ats}|${t.region ?? ''}|${t.slug.toLowerCase()}`;
            if (resolvedBoards.has(resolvedKey)) { row.ats = res.ats; row.status = 'duplicate'; row.error = `Same board as "${resolvedBoards.get(resolvedKey)}"; skipped so jobs aren't saved (or charged) twice`; log.info(`${t.input}: ${row.error}`); perCompanySummary.push(row); continue; }
            resolvedBoards.set(resolvedKey, t.input);
            row.ats = res.ats; row.jobsFound = res.jobs.length; row.boardUrl = boardUrl(res.ats, t.slug, t.region);
            if (res.alsoFoundOn.length) {
                row.alsoFoundOn = res.alsoFoundOn;
                log.warning(`"${t.slug}" matches boards on several ATSs: ${res.ats} (${res.jobs.length} jobs), ${res.alsoFoundOn.map((o) => `${o.ats} (${o.jobs} job${o.jobs === 1 ? '' : 's'})`).join(', ')}. Using ${res.ats}, the one with the most jobs. To pick another, enter e.g. "${res.alsoFoundOn[0].ats}:${t.slug}" or the board URL.`);
            }
            const companyName = res.companyName || t.slug.split(/[-_]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
            if (!out.length) row.reason = row.jobsFound ? `${row.jobsFound} open jobs found, 0 matched your filters (${describeFilters(filters)}). Loosen or remove filters.` : 'The board exists but has no open jobs right now.';
            row.jobsSaved = await push(out);
            log.info(`${companyName} (${res.ats}): ${row.jobsFound} open jobs, ${row.jobsSaved} saved`);
        } catch (e) {
            if (e instanceof FormatError) { formatErrors++; row.status = 'format_error'; } else { networkErrors++; row.status = 'error'; }
            row.error = e.message; log.warning(`${t.input}: ${e.message}`);
        }
        perCompanySummary.push(row);
    }

    // Never silent: one free (unbilled) status row per company that produced no jobs.
    const empty = perCompanySummary.filter((r) => !r.jobsSaved && !String(r.status).startsWith('skipped') && r.status !== 'duplicate');
    if (emitStatusRows !== false) {
        for (const r of empty) {
            await Actor.pushData({ status: r.status === 'ok' ? 'no_results' : r.status, input: r.input, companySlug: r.slug, ats: r.ats ?? null,
                jobsFound: r.jobsFound, jobsMatched: r.jobsMatched, reason: r.reason ?? r.error ?? null, scrapedAt }); // no event name = not charged
        }
    }
    const stoppedReason = chargeLimitHit ? 'Reached the maximum cost you set for this run.' : pushed >= totalCap ? `Reached the job limit (${totalCap}). Raise maxJobs (0 = no limit) for more.` : null;
    const summary = { companiesRequested: targets.length, companiesWithBoards: perCompanySummary.filter((r) => r.status === 'ok').length,
        jobsSaved: pushed, maxJobs: Number.isFinite(totalCap) ? totalCap : 0, stoppedReason, zeroResultsReason: pushed ? null : (empty.map((r) => `${r.input}: ${r.reason ?? r.error ?? r.status}`).join(' | ') || null), chargeLimitReached: chargeLimitHit, formatErrors, networkErrors, stats, companies: perCompanySummary, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    // Silent-failure guard: if the ATS APIs changed shape, fail loudly instead of returning an empty dataset.
    const okBoards = summary.companiesWithBoards;
    if (!okBoards && perCompanySummary.some((r) => r.status === 'format_error')) throw new Error('Job-board response format changed; no jobs could be parsed. The actor needs an update.');
    if (!okBoards && networkErrors && networkErrors === targets.length) throw new Error(`All ${targets.length} job boards failed to load (network errors). Try again or enable a proxy.`);
    if (!okBoards) await Actor.exit(`0 results: no public job boards found for the companies you entered. Check the board names (see README: "How to find a company's board name"), or pass a board URL.`);
    else if (!pushed) await Actor.exit(`0 results: ${summary.zeroResultsReason}`);
    else await Actor.exit(`Saved ${pushed} jobs from ${okBoards} of ${targets.length} companies.${stoppedReason ? ` Stopped: ${stoppedReason}` : ''}${empty.length ? ` ${empty.length} compan${empty.length === 1 ? 'y' : 'ies'} returned no jobs (see the status rows).` : ''}`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Input error: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
