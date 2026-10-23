import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseSiteUrl, apiBase, siteUrl, parsePostedOn, maybeWithin, mapJob, pickSplitFacet, robotsAllows, FormatError, PAGE_SIZE, OFFSET_CAP } from './workday.js';

const JOB_EVENT = 'job';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
const HOST_GAP = 120; // ms between requests to one Workday host (~8 req/s max), polite and well under rate limits

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        startUrls = [], searchText = '', titleKeywords = [], excludeTitleKeywords = [], locationKeywords = [],
        postedWithinDays = null, remoteOnly = false,
        includeDetails = true, includeDescription = true, includeDescriptionHtml = false,
        maxJobsPerSite = 0, maxJobs = 0, splitLargeSites = true,
        proxyConfiguration = { useApifyProxy: false }, maxRetries = 3, detailConcurrency = 4,
    } = input;

    const raw = (Array.isArray(startUrls) ? startUrls : String(startUrls).split(/[\n,]/))
        .map((c) => (typeof c === 'object' && c ? c.url : c)).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!raw.length) throw new InputError('Add at least one Workday career-site URL, e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite');
    const arr = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const inc = arr(titleKeywords); const exc = arr(excludeTitleKeywords); const locs = arr(locationKeywords);
    const maxDays = postedWithinDays === null || postedWithinDays === '' || postedWithinDays === undefined ? null : Number(postedWithinDays);
    if (maxDays !== null && (!Number.isFinite(maxDays) || maxDays < 0)) throw new InputError('"Posted within (days)" must be a number of days, e.g. 7');
    const perSite = Number(maxJobsPerSite) > 0 ? Math.floor(Number(maxJobsPerSite)) : Infinity;
    const totalCap = Number(maxJobs) > 0 ? Math.floor(Number(maxJobs)) : Infinity;
    const needDetails = !!includeDetails || locs.length > 0 || !!remoteOnly;

    const targets = []; const bad = []; const seen = new Set();
    for (const r of raw) {
        try { const t = parseSiteUrl(r); t.input = r; if (seen.has(t.key + JSON.stringify(t.facets) + t.searchText)) continue; seen.add(t.key + JSON.stringify(t.facets) + t.searchText); targets.push(t); }
        catch (e) { bad.push({ input: r, status: 'invalid_url', error: e.message }); log.warning(e.message); }
    }

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    const stats = { requests: 0, retries: 0, failedRequests: 0 };
    const nextSlot = new Map();

    async function http(url, { method = 'GET', json, accept = 'application/json' } = {}) {
        const host = new URL(url).hostname; let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const slot = Math.max(Date.now(), nextSlot.get(host) ?? 0); nextSlot.set(host, slot + HOST_GAP);
            if (slot > Date.now()) await sleep(slot - Date.now());
            stats.requests++;
            try {
                const res = await gotScraping({ url, method, json, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: 45000 }, throwHttpErrors: false, retry: { limit: 0 }, followRedirect: true,
                    headers: { accept, ...(json ? { 'content-type': 'application/json' } : {}) }, headerGeneratorOptions: { browsers: ['chrome'], devices: ['desktop'] } });
                const code = res.statusCode;
                if (code === 404 || code === 410 || code === 422) return { notFound: true, code };
                if (code === 429 || code >= 500 || code === 403) { lastErr = new Error(`HTTP ${code} from ${host}`); if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(2000 * 2 ** attempt, 20000) + Math.random() * 500); continue; } break; }
                if (code >= 400) return { notFound: true, code };
                if (accept !== 'application/json') return { text: res.body };
                if (!/^\s*[[{]/.test(res.body)) return { notFound: true, code, nonJson: true };
                try { return { body: JSON.parse(res.body) }; } catch { throw new FormatError(`Invalid JSON from ${host}`); }
            } catch (e) {
                if (e instanceof FormatError) throw e;
                lastErr = e; if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(2000 * 2 ** attempt, 20000) + Math.random() * 500); }
            }
        }
        stats.failedRequests++; throw lastErr;
    }

    const robotsCache = new Map();
    async function allowed(t, path) {
        if (!robotsCache.has(t.host)) {
            let txt = '';
            try { const r = await http(`https://${t.host}/robots.txt`, { accept: 'text/plain' }); txt = r.text ?? ''; } catch { txt = ''; }
            robotsCache.set(t.host, txt);
        }
        return robotsAllows(robotsCache.get(t.host), path);
    }

    let pushed = 0; let chargeLimitHit = false;
    const stop = () => chargeLimitHit || pushed >= totalCap;
    async function push(items) {
        if (!items.length || stop()) return 0;
        if (pushed + items.length > totalCap) items = items.slice(0, totalCap - pushed);
        if (charging) {
            const can = charging.calculateMaxEventChargeCountWithinLimit(JOB_EVENT);
            if (Number.isFinite(can) && can < items.length) { items = items.slice(0, Math.max(0, can)); chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); }
        }
        if (!items.length) return 0;
        const r = await Actor.pushData(items, JOB_EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        pushed += items.length; return items.length;
    }

    const scrapedAt = new Date().toISOString();
    const summaryRows = [...bad];
    let formatErrors = 0; let networkErrors = 0;

    for (const t of targets) {
        if (stop()) {
            summaryRows.push({ input: t.input, careerSiteUrl: siteUrl(t), status: chargeLimitHit ? 'skipped_charge_limit' : 'skipped_max_jobs', jobsReported: 0, jobsListed: 0, jobsMatched: 0, jobsSaved: 0, splitBy: [], error: null });
            continue;
        }
        const row = { input: t.input, careerSiteUrl: siteUrl(t), status: 'ok', jobsReported: 0, jobsListed: 0, jobsMatched: 0, jobsSaved: 0, splitBy: [], error: null };
        try {
            const base = apiBase(t); const apiPath = new URL(base).pathname;
            if (!(await allowed(t, `${apiPath}/jobs`)) || !(await allowed(t, `/${t.site}/`))) { row.status = 'robots_disallowed'; row.error = `${t.host} robots.txt disallows this career site; skipped.`; log.warning(row.error); summaryRows.push(row); continue; }
            const text = [t.searchText, searchText].filter(Boolean).join(' ').trim();
            const postings = new Map();
            const listPage = async (facets, offset) => {
                const r = await http(`${base}/jobs`, { method: 'POST', json: { appliedFacets: facets, limit: PAGE_SIZE, offset, searchText: text } });
                if (r.notFound) return null;
                const b = r.body; if (!b || !Array.isArray(b.jobPostings)) throw new FormatError('Unexpected job list format');
                return b;
            };
            const enough = () => postings.size >= perSite * 3 && maxDays === null && !inc.length && !exc.length && !locs.length && !remoteOnly;
            const crawl = async (facets, depth) => {
                const first = await listPage(facets, 0);
                if (!first) return false;
                const total = Number(first.total) || 0;
                if (depth === 0) row.jobsReported = total;
                if (total >= OFFSET_CAP && splitLargeSites && depth < 3) {
                    const f = pickSplitFacet(first.facets, facets, total);
                    if (f) {
                        row.splitBy.push(f.param); log.info(`${t.tenant}/${t.site}: ${total}+ jobs, over Workday's 2,000 page limit; splitting by "${f.param}" (${f.values.length} groups)`);
                        for (const v of f.values) { if (enough()) break; await crawl({ ...facets, [f.param]: [v.id] }, depth + 1); }
                        return true;
                    }
                }
                const add = (list) => { for (const p of list) if (p?.externalPath && !postings.has(p.externalPath)) postings.set(p.externalPath, p); };
                add(first.jobPostings);
                const last = Math.min(total, OFFSET_CAP);
                for (let off = PAGE_SIZE; off < last; off += PAGE_SIZE) {
                    if (enough()) break;
                    const b = await listPage(facets, off); if (!b || !b.jobPostings.length) break;
                    add(b.jobPostings);
                }
                return true;
            };
            const found = await crawl({ ...t.facets }, 0);
            if (!found) { row.status = 'not_found'; row.error = `No Workday career site at ${siteUrl(t)}. Copy the URL from the company's jobs page address bar.`; log.warning(row.error); summaryRows.push(row); continue; }
            row.jobsListed = postings.size;
            if (row.jobsReported >= OFFSET_CAP && !row.splitBy.length) log.warning(`${t.tenant}/${t.site}: Workday only pages through 2,000 jobs and no filter was available to split by; saved the first 2,000. Add filters (e.g. a location) to get the rest.`);

            // List-level filters first (cheap), then details.
            const cands = [];
            for (const p of postings.values()) {
                const title = String(p.title ?? '').toLowerCase();
                if (inc.length && !inc.some((k) => title.includes(k))) continue;
                if (exc.some((k) => title.includes(k))) continue;
                if (!maybeWithin(parsePostedOn(p.postedOn), maxDays)) continue;
                cands.push(p);
            }
            const out = []; let idx = 0;
            const worker = async () => {
                while (idx < cands.length && out.length < perSite && !stop()) {
                    const p = cands[idx++]; let detail = null;
                    if (needDetails) {
                        const r = await http(`${base}${p.externalPath}`).catch((e) => { networkErrors++; log.debug(e.message); return null; });
                        if (!r || r.notFound) continue; // posting closed between list and detail, or failed after retries
                        detail = r.body;
                    }
                    let job; try { job = mapJob(t, p, detail, { includeHtml: includeDescriptionHtml, includeDescription: includeDescription && needDetails, scrapedAt }); } catch (e) { formatErrors++; continue; }
                    if (maxDays !== null) {
                        if (job.postedDate) { const age = (Date.now() - Date.parse(job.postedDate + 'T00:00:00Z')) / 864e5; if (age > maxDays + 1) continue; }
                        else if (job.postedDaysAgo !== null && (job.postedDaysAgo > maxDays || (job.postedDaysAgoIsMinimum && maxDays < 30))) continue;
                    }
                    if (remoteOnly && !job.remote) continue;
                    if (locs.length) { const hay = [...job.allLocations, job.location, job.country].filter(Boolean).join(' | ').toLowerCase(); if (!locs.some((k) => hay.includes(k))) continue; }
                    if (out.length < perSite) out.push(job);
                }
            };
            await Promise.all(Array.from({ length: Math.max(1, Math.min(8, Number(detailConcurrency) || 4)) }, worker));
            row.jobsMatched = out.length;
            for (let i = 0; i < out.length && !stop(); i += 200) row.jobsSaved += await push(out.slice(i, i + 200));
            log.info(`${t.tenant}/${t.site}: ${row.jobsReported} jobs reported, ${row.jobsListed} listed, ${row.jobsSaved} saved`);
        } catch (e) {
            if (e instanceof FormatError) { formatErrors++; row.status = 'format_error'; } else { networkErrors++; row.status = 'error'; }
            row.error = e.message; log.warning(`${t.input}: ${e.message}`);
        }
        summaryRows.push(row);
    }

    const okSites = summaryRows.filter((r) => r.status === 'ok').length;
    const summary = { sitesRequested: raw.length, sitesOk: okSites, jobsSaved: pushed, chargeLimitReached: chargeLimitHit, formatErrors, networkErrors, stats, sites: summaryRows, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    if (!okSites && summaryRows.some((r) => r.status === 'format_error')) throw new Error('Workday response format changed; no jobs could be parsed. The actor needs an update.');
    if (!okSites && targets.length && summaryRows.filter((r) => r.status === 'error').length === targets.length) throw new Error(`All ${targets.length} career sites failed to load (network errors). Try again or enable a proxy.`);
    if (!okSites) await Actor.exit('No Workday career sites found for the URLs you entered. See the README: "How to find a company\'s Workday URL".');
    else await Actor.exit(`Saved ${pushed} jobs from ${okSites} of ${raw.length} career sites.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Input error: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
