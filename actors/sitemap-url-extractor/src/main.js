import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
    COMMON_SITEMAP_PATHS, parseSitemap, parseRobotsSitemaps, maybeGunzip, looksLikeSitemapUrl,
    parseDateInput, compilePatterns, absolutize,
} from './sitemap.js';

const URL_EVENT = 'url';
const STATUS_EVENT = 'url-status-check';
const MAX_BODY_BYTES = 60 * 1024 * 1024; // sitemap spec max is 50 MB uncompressed
const BATCH = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await Actor.init();

class InputError extends Error {}

try {
    const input = (await Actor.getInput()) ?? {};
    const {
        startUrls = [],
        discoverFromRobotsTxt = true,
        tryCommonSitemapPaths = true,
        maxSitemapDepth = 5,
        maxSitemaps = 1000,
        maxUrls: maxUrlsIn = 1000, // default 1000 also for API/agent calls that omit it; 0 = no limit
        maxUrlsPerSite = 0,
        includeUrlPatterns = [],
        excludeUrlPatterns = [],
        lastmodFrom = null,
        lastmodTo = null,
        onlyNewUrls = false,
        stateKey = '',
        includeImages = false,
        includeAlternates = false,
        checkUrlStatus = false,
        statusCheckConcurrency = 10,
        requestTimeoutSecs = 30,
        maxRetries = 3,
        sitemapConcurrency = 5,
        restrictToStartPath = true,
        proxyConfiguration = { useApifyProxy: false },
        emitStatusRows = true,
    } = input;
    // Effective cap: maxUrls, or aliases agents often send (maxItems, limit, maxResults), and the run's max paid items option.
    const capList = [maxUrlsIn, input.maxItems, input.limit, input.maxResults, process.env.ACTOR_MAX_PAID_DATASET_ITEMS]
        .map(Number).filter((n) => Number.isFinite(n) && n > 0).map(Math.floor);
    const maxUrls = capList.length ? Math.min(...capList) : 0;
    if (maxUrls > 0) log.info(`Output is capped at ${maxUrls} URLs (maxUrls). Set maxUrls to 0 for no limit.`);

    // ---------- Input validation ----------
    const rawStarts = (Array.isArray(startUrls) ? startUrls : [startUrls])
        .map((s) => (typeof s === 'string' ? s : s?.url)).filter(Boolean).map((s) => s.trim());
    if (!rawStarts.length) throw new InputError('Input "startUrls" is empty. Add at least one website (https://example.com) or sitemap URL.');
    const starts = [];
    for (const s of rawStarts) {
        const u = absolutize(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        if (!u) throw new InputError(`Invalid start URL: "${s}"`);
        starts.push(u);
    }
    let includeRe, excludeRe;
    try { includeRe = compilePatterns(includeUrlPatterns, 'includeUrlPatterns'); excludeRe = compilePatterns(excludeUrlPatterns, 'excludeUrlPatterns'); } catch (e) { throw new InputError(e.message); }
    let fromDate; let toDate;
    try { fromDate = parseDateInput(lastmodFrom); toDate = parseDateInput(lastmodTo); } catch (e) { throw new InputError(e.message); }

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length
        ? await Actor.createProxyConfiguration(proxyConfiguration) : null;

    const charging = Actor.getChargingManager();
    let chargeLimitHit = false;

    // ---------- HTTP with retries ----------
    const stats = { requests: 0, retries: 0, failedRequests: 0 };
    async function fetchWithRetry(url, { method = 'GET', optional = false, session = 'main' } = {}) {
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            stats.requests++;
            try {
                const res = await gotScraping({
                    url, method,
                    proxyUrl: proxy ? await proxy.newUrl(`s${session}${attempt}`.replace(/[^\w]/g, '').slice(0, 50)) : undefined,
                    timeout: { request: requestTimeoutSecs * 1000 },
                    responseType: 'buffer',
                    throwHttpErrors: false,
                    followRedirect: true,
                    maxRedirects: 10,
                    retry: { limit: 0 },
                    decompress: true,
                    headerGeneratorOptions: { browsers: ['chrome'], operatingSystems: ['windows', 'macos'], devices: ['desktop'] },
                });
                const code = res.statusCode;
                if (code === 429 || code >= 500 || code === 403) {
                    const ra = Number(res.headers['retry-after']);
                    lastErr = new Error(`HTTP ${code}`);
                    lastErr.statusCode = code;
                    if (attempt < maxRetries) {
                        stats.retries++;
                        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : Math.min(1000 * 2 ** attempt, 15000) + Math.random() * 500);
                        continue;
                    }
                    break;
                }
                if (res.rawBody?.length > MAX_BODY_BYTES) throw new Error(`Response too large (${res.rawBody.length} bytes)`);
                return res;
            } catch (e) {
                lastErr = e;
                if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(1000 * 2 ** attempt, 15000) + Math.random() * 500); }
            }
        }
        if (!optional) stats.failedRequests++;
        throw lastErr;
    }

    // ---------- State for new-URL detection ----------
    const stateStore = onlyNewUrls ? await Actor.openKeyValueStore('sitemap-url-extractor-state') : null;
    const key = (stateKey && String(stateKey).replace(/[^\w.-]/g, '-').slice(0, 200))
        || `state-${createHash('sha1').update(starts.slice().sort().join('|')).digest('hex').slice(0, 16)}`;
    let previouslySeen = null;
    if (stateStore) {
        try {
            const meta = await stateStore.getValue(`${key}-meta`);
            if (meta?.chunks) {
                const parts = [];
                for (let i = 0; i < meta.chunks; i++) parts.push(...JSON.parse(gunzipSync(Buffer.from(await stateStore.getValue(`${key}-${i}`))).toString('utf8')));
                previouslySeen = new Set(parts);
            }
        } catch (e) { log.warning(`Could not read previous state "${key}", treating all URLs as new: ${e.message}`); }
        log.info(previouslySeen ? `Loaded ${previouslySeen.size} previously seen URLs (state key "${key}").` : `No previous state for key "${key}" — first run: every URL counts as new and becomes the baseline.`);
    }

    // ---------- Output buffering & charging ----------
    const seen = new Set();
    const eligible = new Set(); // URLs that passed all filters (saved as monitoring state)
    let pushed = 0;
    let accepted = 0; // URLs accepted for output (incl. in-flight batches) - used for maxUrls
    let buffer = [];
    async function flush(batch) {
        let items = batch || buffer;
        if (!batch) buffer = [];
        if (!items.length || chargeLimitHit) return;
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(URL_EVENT);
            if (Number.isFinite(allowed) && allowed < items.length) {
                items = items.slice(0, Math.max(0, allowed));
                chargeLimitHit = true;
                log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.');
            }
        }
        if (!items.length) return;
        const r = await Actor.pushData(items, URL_EVENT);
        pushed += items.length;
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    const limitReached = () => chargeLimitHit || (maxUrls > 0 && accepted >= maxUrls);

    // ---------- Status checks ----------
    // Status check = GET that is aborted as soon as headers arrive (HEAD is unreliable on many servers/libraries).
    async function statusRequest(url, attempt) {
        const proxyUrl = proxy ? await proxy.newUrl(`st${attempt}${Math.floor(Math.random() * 1e6)}`) : undefined;
        return new Promise((resolve, reject) => {
            const st = gotScraping.stream({
                url, proxyUrl, throwHttpErrors: false, followRedirect: true, maxRedirects: 10, retry: { limit: 0 },
                timeout: { request: requestTimeoutSecs * 1000 },
                headerGeneratorOptions: { browsers: ['chrome'], operatingSystems: ['windows', 'macos'], devices: ['desktop'] },
            });
            st.once('response', (res) => { resolve({ statusCode: res.statusCode, url: res.url }); st.destroy(); });
            st.once('error', reject);
        });
    }
    async function checkStatuses(items) {
        let idx = 0;
        const worker = async () => {
            while (idx < items.length) {
                const it = items[idx++];
                const tries = Math.min(maxRetries, 2);
                for (let attempt = 0; attempt <= tries; attempt++) {
                    stats.statusRequests = (stats.statusRequests || 0) + 1;
                    try {
                        const res = await statusRequest(it.url, attempt);
                        if ((res.statusCode === 429 || res.statusCode >= 500) && attempt < tries) { await sleep(1000 * 2 ** attempt); continue; }
                        it.httpStatus = res.statusCode;
                        it.finalUrl = res.url && res.url !== it.url ? res.url : null;
                        it.statusError = null;
                        break;
                    } catch (e) {
                        if (attempt < tries) { await sleep(1000 * 2 ** attempt); continue; }
                        it.httpStatus = null; it.finalUrl = null; it.statusError = String(e.code || e.message).slice(0, 200);
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(50, statusCheckConcurrency)) }, worker));
        if (charging) {
            try { await Actor.charge({ eventName: STATUS_EVENT, count: items.length }); } catch (e) { log.debug(`charge: ${e.message}`); }
        }
    }

    async function emit(item) {
        if (limitReached()) return;
        accepted++;
        buffer.push(item);
        if (buffer.length >= BATCH) {
            const batch = buffer; buffer = [];
            if (checkUrlStatus) await checkStatuses(batch);
            await flush(batch);
        }
    }

    // ---------- Crawl ----------
    const summary = { startedAt: new Date().toISOString(), sites: [], totals: {} };
    let sitemapsProcessed = 0;
    const processedSitemaps = new Set();

    for (const start of starts) {
        if (limitReached()) break;
        const origin = new URL(start).origin;
        const site = { input: start, origin, discoveredVia: null, sitemapsFound: [], sitemapsFailed: [], urlsOutput: 0, urlsFiltered: 0, duplicates: 0 };
        summary.sites.push(site);
        const before = pushed + buffer.length;

        const startPath = new URL(start).pathname;
        const scopePrefix = restrictToStartPath && startPath !== '/' && !looksLikeSitemapUrl(start) ? start.replace(/[?#].*$/, '') : null;
        site.scope = scopePrefix;
        let queue = [];
        if (looksLikeSitemapUrl(start) && startPath !== '/') {
            queue.push({ url: start, depth: 0, parent: null });
            site.discoveredVia = 'input';
        } else {
            // 1) Sub-path sites (e.g. https://example.com/blog/) often have their own sitemap.
            if (scopePrefix && tryCommonSitemapPaths) {
                const base = scopePrefix.endsWith('/') ? scopePrefix : `${scopePrefix}/`;
                for (const p of ['sitemap.xml', 'sitemap_index.xml', 'wp-sitemap.xml']) {
                    try {
                        const r = await fetchWithRetry(base + p, { optional: true });
                        if (r.statusCode < 400 && ['sitemapindex', 'urlset'].includes(parseSitemap(maybeGunzip(r.rawBody), r.url).type)) {
                            queue.push({ url: base + p, depth: 0, parent: 'sub-path' }); site.discoveredVia = 'sub-path'; break;
                        }
                    } catch { /* optional probe */ }
                }
            }
            if (!queue.length && discoverFromRobotsTxt) {
                try {
                    const r = await fetchWithRetry(`${origin}/robots.txt`, { optional: true });
                    if (r.statusCode < 400) {
                        const sm = parseRobotsSitemaps(r.body.toString('utf8'), origin);
                        if (sm.length) { queue.push(...sm.map((u) => ({ url: u, depth: 0, parent: 'robots.txt' }))); site.discoveredVia = 'robots.txt'; }
                    }
                } catch (e) { log.info(`${origin}: robots.txt not reachable (${e.message}).`); }
            }
            if (!queue.length && tryCommonSitemapPaths) {
                queue.push(...COMMON_SITEMAP_PATHS.map((p) => ({ url: origin + p, depth: 0, parent: 'common-path', probe: true })));
                site.discoveredVia = 'common-paths';
            }
        }

        let siteCount = 0;
        let active = 0;
        const siteDone = () => limitReached() || sitemapsProcessed >= maxSitemaps || (maxUrlsPerSite > 0 && siteCount >= maxUrlsPerSite);
        const worker = async () => {
        while (!siteDone()) {
            if (!queue.length) { if (active === 0) break; await sleep(50); continue; }
            const job = queue.shift();
            active++;
            try {
            if (processedSitemaps.has(job.url)) continue;
            processedSitemaps.add(job.url);
            sitemapsProcessed++;
            let res;
            try {
                res = await fetchWithRetry(job.url, { optional: !!job.probe });
            } catch (e) {
                if (!job.probe) { site.sitemapsFailed.push({ url: job.url, error: String(e.message).slice(0, 200) }); log.warning(`Failed to fetch sitemap ${job.url}: ${e.message}`); }
                continue;
            }
            if (res.statusCode >= 400) {
                if (!job.probe) site.sitemapsFailed.push({ url: job.url, error: `HTTP ${res.statusCode}` });
                continue;
            }
            let parsed;
            try {
                parsed = parseSitemap(maybeGunzip(res.rawBody), res.url || job.url, { includeImages, includeAlternates });
            } catch (e) {
                site.sitemapsFailed.push({ url: job.url, error: `Parse error: ${e.message}` });
                continue;
            }
            if (parsed.type === 'html' || parsed.type === 'unknown') {
                if (!job.probe) site.sitemapsFailed.push({ url: job.url, error: `Not a sitemap (looks like ${parsed.type})` });
                continue;
            }
            site.sitemapsFound.push({ url: job.url, type: parsed.type, entries: parsed.type === 'sitemapindex' ? parsed.sitemaps.length : parsed.urls.length });
            log.info(`${job.url}: ${parsed.type}, ${parsed.type === 'sitemapindex' ? `${parsed.sitemaps.length} child sitemaps` : `${parsed.urls.length} URLs`}`);

            if (parsed.type === 'sitemapindex') {
                if (job.depth >= maxSitemapDepth) { log.warning(`Max sitemap depth ${maxSitemapDepth} reached at ${job.url}`); continue; }
                // Skip child sitemaps whose lastmod is older than lastmodFrom (they can't contain newer URLs... usually).
                for (const c of parsed.sitemaps) {
                    if (fromDate && c.lastmod && new Date(c.lastmod) < fromDate) { site.sitemapsSkippedByLastmod = (site.sitemapsSkippedByLastmod || 0) + 1; continue; }
                    queue.push({ url: c.url, depth: job.depth + 1, parent: job.url });
                }
                continue;
            }
            for (const u of parsed.urls) {
                if (limitReached() || (maxUrlsPerSite > 0 && siteCount >= maxUrlsPerSite)) break;
                if (seen.has(u.url)) { site.duplicates++; continue; }
                seen.add(u.url);
                if (scopePrefix && !u.url.startsWith(scopePrefix)) { site.urlsFiltered++; continue; }
                if (includeRe.length && !includeRe.some((r) => r.test(u.url))) { site.urlsFiltered++; continue; }
                if (excludeRe.some((r) => r.test(u.url))) { site.urlsFiltered++; continue; }
                if ((fromDate || toDate)) {
                    const lm = u.lastmod ? new Date(u.lastmod) : null;
                    if (!lm || (fromDate && lm < fromDate) || (toDate && lm > toDate)) { site.urlsFiltered++; continue; }
                }
                eligible.add(u.url);
                const isNew = previouslySeen ? !previouslySeen.has(u.url) : (stateStore ? true : null);
                if (onlyNewUrls && previouslySeen && !isNew) { site.urlsFiltered++; continue; }
                siteCount++;
                await emit({
                    url: u.url,
                    lastmod: u.lastmod,
                    changefreq: u.changefreq,
                    priority: u.priority,
                    imageCount: u.imageCount,
                    ...(includeImages ? { images: u.images || [] } : {}),
                    ...(includeAlternates ? { alternates: u.alternates || [] } : {}),
                    ...(u.newsPublicationDate ? { newsPublicationDate: u.newsPublicationDate } : {}),
                    isNew,
                    ...(checkUrlStatus ? { httpStatus: null, finalUrl: null, statusError: null } : {}),
                    sitemapUrl: job.url,
                    site: origin,
                    extractedAt: new Date().toISOString(),
                });
            }
            } finally { active--; }
        }
        };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(20, sitemapConcurrency)) }, worker));
        { const batch = buffer; buffer = []; if (checkUrlStatus && batch.length) await checkStatuses(batch); await flush(batch); }
        site.urlsOutput = pushed - before;
        if (!site.sitemapsFound.length) log.warning(`${origin}: no sitemap found${site.sitemapsFailed.length ? ` (${site.sitemapsFailed.length} failed)` : ''}. Tip: pass the sitemap URL directly.`);
        if (!site.urlsOutput && !chargeLimitHit && !(maxUrls > 0 && accepted >= maxUrls)) {
            if (!site.sitemapsFound.length) site.reason = `No sitemap found for ${origin}${site.discoveredVia === 'common-paths' || !site.discoveredVia ? ' in robots.txt or at /sitemap.xml, /sitemap_index.xml, /wp-sitemap.xml and similar paths' : ''}${site.sitemapsFailed.length ? `; failed: ${site.sitemapsFailed.slice(0, 3).map((f) => `${f.url} (${f.error})`).join(', ')}` : ''}. Pass the sitemap URL directly if you know it.`;
            else if (onlyNewUrls && previouslySeen) site.reason = null; // monitoring: "no new URLs" is a normal result, reported in the status message only
            else site.reason = `${site.sitemapsFound.length} sitemap(s) read, but all ${site.urlsFiltered + site.duplicates} URLs were removed by your filters (scope, include/exclude patterns, lastmod dates) or were duplicates.`;
            if (site.reason && emitStatusRows !== false) {
                await Actor.pushData({ status: 'no_results', url: null, site: origin, sitemapUrl: null, input: start, reason: site.reason, extractedAt: new Date().toISOString() }); // no event name = not charged
            }
        }
        await Actor.setStatusMessage(`${summary.sites.length}/${starts.length} sites, ${pushed} URLs so far`);
    }
    { const batch = buffer; buffer = []; if (checkUrlStatus && batch.length) await checkStatuses(batch); await flush(batch); }

    // Save state: union of previous + all URLs seen this run (so filters don't drop the baseline).
    if (stateStore && !chargeLimitHit) {
        const all = [...new Set([...(previouslySeen || []), ...eligible])];
        const CHUNK = 100000; let chunks = 0;
        for (let i = 0; i < all.length || i === 0; i += CHUNK) {
            await stateStore.setValue(`${key}-${chunks++}`, gzipSync(Buffer.from(JSON.stringify(all.slice(i, i + CHUNK)))), { contentType: 'application/gzip' });
            if (all.length === 0) break;
        }
        await stateStore.setValue(`${key}-meta`, { chunks, urlCount: all.length, updatedAt: new Date().toISOString(), startUrls: starts });
        summary.stateKey = key; summary.stateUrlCount = all.length;
    }

    const sitesWithSitemaps = summary.sites.filter((s) => s.sitemapsFound.length).length;
    summary.finishedAt = new Date().toISOString();
    summary.totals = { sites: starts.length, sitesWithSitemaps, sitemapsProcessed, urlsOutput: pushed, ...stats, chargeLimitHit };
    summary.maxUrls = maxUrls;
    summary.stoppedReason = chargeLimitHit ? 'Reached the maximum cost you set for this run.' : (maxUrls > 0 && accepted >= maxUrls ? `Reached maxUrls (${maxUrls}). Set maxUrls higher, or 0 for no limit.` : null);
    summary.zeroResultsReason = pushed ? null : (summary.sites.map((s) => s.reason).filter(Boolean).join(' | ') || (onlyNewUrls && previouslySeen ? 'No new URLs since the last run.' : null));
    await Actor.setValue('OUTPUT', summary);
    const msg = !pushed && summary.zeroResultsReason ? `0 results: ${summary.zeroResultsReason}` : `Done: ${pushed} URLs from ${sitesWithSitemaps}/${starts.length} sites (${summary.sites.reduce((a, s) => a + s.sitemapsFound.length, 0)} sitemaps).`
        + (maxUrls > 0 && accepted >= maxUrls ? ` Stopped at maxUrls (${maxUrls}); set it higher or 0 for all URLs.` : '')
        + (chargeLimitHit ? ' Stopped at your maximum cost per run.' : '')
        + (sitesWithSitemaps < summary.sites.length ? ' Some sites had no discoverable sitemap — see OUTPUT in the key-value store.' : '');
    log.info(msg);
    await Actor.exit(msg);
} catch (e) {
    if (e instanceof InputError) {
        log.error(e.message);
        await Actor.fail(`Invalid input: ${e.message}`);
    } else {
        log.exception(e, 'Unexpected error');
        await Actor.fail(`Unexpected error: ${e.message}`);
    }
}
