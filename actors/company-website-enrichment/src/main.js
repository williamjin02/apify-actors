import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import robotsParser from 'robots-parser';
import { extractPage, companyNameFrom, normalizeWebsite, domainOf } from './extract.js';
import { detectTech } from './tech.js';

const EVENT = 'website';
const UA_TOKEN = 'CompanyWebsiteEnrichment';
const MAX_BODY = 2 * 1024 * 1024;
// Shrink HTML before DOM parsing: drop inline script/style/svg bodies (keeps JSON-LD and script src attributes). Big DOMs x concurrency caused OOM at 512 MB.
const slim = (html) => html.replace(/<script\b(?![^>]*ld\+json)([^>]*)>[\s\S]*?<\/script>/gi, '<script$1></script>').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<svg\b[\s\S]*?<\/svg>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        websites = [], maxPagesPerSite = 4, includeTechStack = true,
        maxConcurrency = 10, requestTimeoutSecs = 20, maxRetries = 1,
        proxyConfiguration = { useApifyProxy: false },
    } = input;
    const raw = (Array.isArray(websites) ? websites : String(websites).split(/[\n,]/))
        .map((w) => (typeof w === 'object' && w ? w.url : w)).map((w) => String(w ?? '').trim()).filter(Boolean);
    if (!raw.length) throw new InputError('Add at least one website or domain, e.g. "stripe.com" or "https://www.hubspot.com".');
    const seen = new Set(); const targets = [];
    for (const r of raw) {
        const n = normalizeWebsite(r);
        const key = n ? n.host.replace(/^www\./, '') : `invalid:${r}`;
        if (seen.has(key)) continue; seen.add(key); targets.push({ input: r, n });
    }
    const pagesCap = Math.max(1, Math.min(10, Math.floor(Number(maxPagesPerSite) || 4)));
    const memMb = Number(process.env.ACTOR_MEMORY_MBYTES || process.env.APIFY_MEMORY_MBYTES) || 512;
    const conc = Math.max(1, Math.min(50, Math.floor(memMb / 64), Math.floor(Number(maxConcurrency) || 10)));
    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    const stats = { requests: 0, retries: 0, robotsBlocked: 0 };
    const robotsCache = new Map();
    let charged = 0; let chargeLimitHit = false;
    const counts = {};

    async function get(url, { accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' } = {}) {
        let lastErr;
        for (let a = 0; a <= maxRetries; a++) {
            stats.requests++;
            try {
                const res = await gotScraping({ url, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: Number(requestTimeoutSecs) * 1000 || 20000 },
                    throwHttpErrors: false, retry: { limit: 0 }, followRedirect: true, maxRedirects: 8, headers: { accept },
                    headerGeneratorOptions: { browsers: ['chrome'], devices: ['desktop'] }, https: { rejectUnauthorized: false } });
                if ((res.statusCode === 429 || res.statusCode >= 500) && a < maxRetries) { stats.retries++; await sleep(1500 * (a + 1)); continue; }
                return res;
            } catch (e) { lastErr = e; if (a < maxRetries) { stats.retries++; await sleep(1000 * (a + 1)); } }
        }
        throw lastErr;
    }

    // robots.txt per origin. 4xx = no rules (allow); 5xx/unreachable = treat as disallow (Google's convention).
    async function robotsFor(origin) {
        if (robotsCache.has(origin)) return robotsCache.get(origin);
        const p = (async () => {
            try {
                const res = await get(`${origin}/robots.txt`, { accept: 'text/plain,*/*;q=0.8' });
                if (res.statusCode >= 500) return { blockAll: true };
                if (res.statusCode >= 400) return { robots: robotsParser(`${origin}/robots.txt`, '') };
                const body = /html/i.test(String(res.headers['content-type'])) && /<html/i.test(res.body.slice(0, 500)) ? '' : res.body.slice(0, 500000);
                return { robots: robotsParser(`${origin}/robots.txt`, body) };
            } catch { return { unreachable: true }; }
        })();
        robotsCache.set(origin, p); return p;
    }
    async function allowed(url) {
        const r = await robotsFor(new URL(url).origin);
        if (r.unreachable) return 'unreachable';
        if (r.blockAll) return false;
        return r.robots.isAllowed(url, UA_TOKEN) !== false;
    }
    async function crawlDelay(url) { const r = await robotsFor(new URL(url).origin); return Math.min(10, Number(r.robots?.getCrawlDelay(UA_TOKEN)) || 0) * 1000; }

    async function fetchPage(url) {
        const ok = await allowed(url);
        if (ok === 'unreachable') return { error: 'unreachable' };
        if (!ok) { stats.robotsBlocked++; return { robotsBlocked: true }; }
        const res = await get(url);
        const finalUrl = res.url || url;
        if (finalUrl !== url && new URL(finalUrl).origin !== new URL(url).origin) {
            const ok2 = await allowed(finalUrl);
            if (ok2 !== true) { stats.robotsBlocked++; return { robotsBlocked: true, finalUrl }; }
        }
        const ct = String(res.headers['content-type'] || '');
        let body = typeof res.body === 'string' ? res.body : String(res.body ?? '');
        if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
        const headerText = Object.entries(res.headers).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('\n');
        return { status: res.statusCode, finalUrl, html: /html|xml/i.test(ct) || /<html/i.test(body.slice(0, 2000)) ? body : null, headerText };
    }

    async function enrich(t) {
        const now = new Date().toISOString();
        const row = { input: t.input, domain: t.n?.domain ?? null, url: null, status: 'ok', httpStatus: null, companyName: null, legalName: null, description: null,
            language: null, logoUrl: null, emails: [], phones: [], address: null, socials: {}, contactPageUrl: null, aboutPageUrl: null, careersPageUrl: null, legalPageUrl: null,
            jobBoard: null, technologies: includeTechStack ? [] : undefined, foundingDate: null, numberOfEmployees: null, pagesFetched: [], error: null, scrapedAt: now };
        if (!t.n) { row.status = 'invalid_input'; row.error = 'Not a valid website or domain'; return row; }
        let home;
        const tries = [t.n.url];
        if (!/^www\./.test(t.n.host)) tries.push(`https://www.${t.n.host}/`);
        tries.push(t.n.url.replace(/^https:/, 'http:'));
        for (const u of tries) {
            try {
                home = await fetchPage(u);
                if (home.error === 'unreachable') { home = null; continue; }
                break;
            } catch (e) { row.error = e.code || e.message; home = null; }
        }
        if (!home) { row.status = 'unreachable'; row.error ??= 'Website could not be reached'; return row; }
        if (home.robotsBlocked) { row.status = 'blocked_by_robots_txt'; row.error = 'The site\'s robots.txt does not allow automated access to the homepage'; return row; }
        row.httpStatus = home.status; row.url = home.finalUrl;
        if (home.status >= 400) { row.status = 'http_error'; row.error = `Homepage returned HTTP ${home.status}${home.status === 403 ? ' (bot protection; try enabling a proxy)' : ''}`; return row; }
        if (!home.html) { row.status = 'not_html'; row.error = 'Homepage is not an HTML page'; return row; }

        const finalHost = new URL(home.finalUrl).hostname.toLowerCase();
        const siteDomains = new Set([t.n.domain, domainOf(finalHost)]);
        row.domain = domainOf(finalHost);
        const tech = includeTechStack ? detectTech(home.html, home.headerText) : null;
        const h = extractPage(slim(home.html), home.finalUrl, siteDomains);
        home.html = null;
        row.pagesFetched.push(home.finalUrl);
        const emails = new Set(h.emails); const phones = new Map(h.phones.map((p) => [p.replace(/\D/g, ''), p])); const socials = { ...h.socials };
        let jobBoard = h.jobBoard; let ld = h.ld;
        const pages = { ...h.pages };
        const queue = ['contact', 'about', 'legal', 'careers'].filter((k) => pages[k]).map((k) => [k, pages[k]]);
        const delay = Math.max(300, await crawlDelay(home.finalUrl));
        for (const [kind, url] of queue) {
            if (row.pagesFetched.length >= pagesCap) break;
            if (kind === 'careers' && jobBoard) continue;
            await sleep(delay);
            try {
                const p = await fetchPage(url);
                if (!p.html || p.status >= 400) continue;
                row.pagesFetched.push(p.finalUrl);
                const x = extractPage(slim(p.html), p.finalUrl, siteDomains);
                x.emails.forEach((e) => emails.add(e)); x.phones.forEach((ph) => { const k = ph.replace(/\D/g, ''); if (!phones.has(k)) phones.set(k, ph); });
                for (const [k, v] of Object.entries(x.socials)) socials[k] ??= v;
                jobBoard ??= x.jobBoard; ld ??= x.ld;
                for (const [k, v] of Object.entries(x.pages)) pages[k] ??= v;
            } catch { /* subpage failures are non-fatal */ }
        }
        row.companyName = companyNameFrom({ ...h, ld }, row.domain);
        row.legalName = ld?.legalName ?? null;
        row.description = h.description ?? ld?.description ?? null;
        row.language = h.language; row.logoUrl = ld?.logo ? new URL(ld.logo, home.finalUrl).href : (h.icon ?? h.ogImage);
        row.emails = [...emails].slice(0, 25); row.phones = [...phones.values()].slice(0, 10);
        row.address = ld?.address && Object.values(ld.address).some(Boolean) ? ld.address : null;
        row.socials = socials; row.contactPageUrl = pages.contact ?? null; row.aboutPageUrl = pages.about ?? null;
        row.careersPageUrl = pages.careers ?? null; row.legalPageUrl = pages.legal ?? null; row.jobBoard = jobBoard ?? null;
        row.foundingDate = ld?.foundingDate ?? null; row.numberOfEmployees = ld?.numberOfEmployees ?? null;
        if (includeTechStack) row.technologies = tech;
        return row;
    }

    async function save(row) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.status !== 'ok') { await Actor.pushData(row); return; } // failed sites are free
        if (chargeLimitHit) { counts.ok--; skipped.push(row.input); return; }
        if (charging) {
            const allowedCount = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowedCount) && allowedCount < 1) { chargeLimitHit = true; counts.ok--; skipped.push(row.input); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        const r = await Actor.pushData(row, EVENT); charged++;
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    let idx = 0; let done = 0; const skipped = [];
    const worker = async () => {
        while (idx < targets.length && !chargeLimitHit) {
            const t = targets[idx++];
            let row;
            try { row = await enrich(t); } catch (e) { row = { input: t.input, domain: t.n?.domain ?? null, status: 'error', error: e.message, scrapedAt: new Date().toISOString() }; }
            await save(row);
            if (++done % 25 === 0) log.info(`Processed ${done}/${targets.length} websites`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, worker));

    // Never silent: websites left out because the run hit your maximum cost get a free status row each.
    for (const t of targets.slice(idx)) skipped.push(t.input);
    for (const inp of skipped) await Actor.pushData({ input: inp, domain: null, status: 'skipped_charge_limit', error: 'Not processed: the run reached the maximum cost you set. Raise the limit and run these again.', scrapedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    const summary = { websitesRequested: targets.length, enriched: counts.ok ?? 0, byStatus: counts, chargeLimitReached: chargeLimitHit,
        zeroResultsReason: counts.ok ? null : `No website could be enriched: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}. See the error field of each row.`, stats, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    const valid = targets.filter((t) => t.n).length;
    // Silent-failure guard: many valid sites and none reachable means our network is broken, not the sites.
    if (valid >= 3 && !(counts.ok) && (counts.unreachable ?? 0) === valid) throw new Error(`None of the ${valid} websites could be reached. This looks like a network problem; try again or enable a proxy.`);
    await Actor.exit(`${counts.ok ? '' : '0 results: '}Enriched ${counts.ok ?? 0} of ${targets.length} websites${counts.ok === targets.length ? '' : ` (${Object.entries(counts).filter(([k]) => k !== 'ok').map(([k, v]) => `${v} ${k}`).join(', ')}; not charged)`}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Input error: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
