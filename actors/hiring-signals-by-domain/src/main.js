import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import robotsParser from 'robots-parser';
import { ATS_LIST, endpoint, boardUrl, extractRaw, mapJob, pickBoard, FormatError } from './ats.js';
import { domainsFromDataset, DOMAIN_FIELDS } from './dataset.js';
import { toDomain, isPlatformHost, CONSUMER_DOMAINS, slugCandidates, siteName, findAtsLinks, careersLinks, corroborate, summarize } from './signals.js';

const EVENT = 'domain-checked';
const UA_TOKEN = 'HiringSignalsByDomain';
const MAX_BODY = 3 * 1024 * 1024;
const HOST_GAP = { 'api.lever.co': 1000, 'api.eu.lever.co': 1000 }; // Lever robots.txt: Crawl-delay 1
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
const CHARGED = new Set(['ok', 'not_hiring']);

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        domains = [], scanWebsite = true, probeBoardNames = true, includeLowConfidence = false,
        sampleJobsPerDomain = 5, maxPagesPerSite = 3, concurrency = 8, requestTimeoutSecs = 20,
        proxyConfiguration = { useApifyProxy: false },
    } = input;
    const raw = (Array.isArray(domains) ? domains : String(domains).split(/[\n,;\s]+/))
        .map((w) => (typeof w === 'object' && w ? (w.url ?? w.domain ?? w.website ?? w.email) : w)).map((w) => String(w ?? '').trim()).filter(Boolean);
    const capRaw = input.maxDomains ?? input.maxItems ?? input.limit ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 1000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const fromDs = await domainsFromDataset(Actor.newClient(), dsId, String(input.domainField || '').trim(), Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000)));
        raw.push(...fromDs.values);
        log.info(`Read ${fromDs.values.length} values from dataset ${dsId} (field "${fromDs.field ?? 'none found'}", ${fromDs.itemsScanned} items scanned).`);
        if (!raw.length) throw new InputError(`Dataset ${dsId} has no domain, website or email values${fromDs.field ? ` in field "${fromDs.field}"` : ''}. Set "domainField" (tried: ${DOMAIN_FIELDS.join(', ')}).`);
    }
    if (!raw.length) throw new InputError('Add at least one company domain or website, e.g. "stripe.com", or pass a datasetId from another Actor run.');

    const seen = new Set(); const targets = []; const invalid = [];
    for (const r of raw) {
        const n = toDomain(r);
        if (!n) { invalid.push(r.includes('@') ? '(invalid email)' : r.slice(0, 200)); continue; }
        if (seen.has(n.domain)) continue; seen.add(n.domain); targets.push(n);
    }
    const overCap = targets.length > cap ? targets.splice(cap) : [];
    if (overCap.length) log.warning(`maxDomains is ${cap}: ${overCap.length} extra domains were not checked.`);

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    const stats = { requests: 0, retries: 0, robotsBlocked: 0 };
    const counts = {}; const sigCounts = {}; const skipped = []; let chargeLimitHit = false;
    const lastHit = new Map(); const robotsCache = new Map();
    const timeout = Math.max(5, Math.min(60, Number(requestTimeoutSecs) || 20)) * 1000;

    async function get(url, accept) {
        const host = new URL(url).hostname; let lastErr;
        for (let a = 0; a <= 2; a++) {
            const gap = HOST_GAP[host] ?? 200;
            const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
            lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) ?? 0) + gap));
            if (wait > 0) await sleep(wait);
            stats.requests++;
            try {
                const res = await gotScraping({ url, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: timeout }, throwHttpErrors: false, retry: { limit: 0 },
                    followRedirect: true, maxRedirects: 8, headers: { accept }, headerGeneratorOptions: { browsers: ['chrome'], devices: ['desktop'] }, https: { rejectUnauthorized: false } });
                if ((res.statusCode === 429 || res.statusCode >= 500) && a < 2) { stats.retries++; await sleep(1500 * (a + 1) + Math.random() * 500); continue; }
                return res;
            } catch (e) { lastErr = e; if (a < 2) { stats.retries++; await sleep(1000 * (a + 1)); } }
        }
        throw lastErr;
    }
    async function fetchJson(url) {
        const res = await get(url, 'application/json');
        const code = res.statusCode;
        if (code === 404 || code === 410 || (code >= 400 && code < 500 && code !== 429)) return { notFound: true, code };
        if (code >= 400) throw new Error(`HTTP ${code} from ${new URL(url).hostname}`);
        const ct = String(res.headers['content-type'] || '');
        if (!/json/i.test(ct) && !/^\s*[[{]/.test(res.body)) return { notFound: true, nonJson: true };
        try { return { body: JSON.parse(res.body) }; } catch { throw new FormatError(`Invalid JSON from ${new URL(url).hostname}`); }
    }
    async function robotsFor(origin) {
        if (robotsCache.has(origin)) return robotsCache.get(origin);
        const p = (async () => {
            try {
                const res = await get(`${origin}/robots.txt`, 'text/plain,*/*;q=0.8');
                if (res.statusCode >= 500) return { blockAll: true };
                if (res.statusCode >= 400) return { robots: robotsParser(`${origin}/robots.txt`, '') };
                const body = /<html/i.test(String(res.body).slice(0, 500)) ? '' : String(res.body).slice(0, 500000);
                return { robots: robotsParser(`${origin}/robots.txt`, body) };
            } catch { return { unreachable: true }; }
        })();
        robotsCache.set(origin, p); return p;
    }
    async function fetchPage(url) {
        const r = await robotsFor(new URL(url).origin);
        if (r.unreachable) return { error: 'unreachable' };
        if (r.blockAll || r.robots.isAllowed(url, UA_TOKEN) === false) { stats.robotsBlocked++; return { robotsBlocked: true }; }
        let res; try { res = await get(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'); } catch (e) { return { error: e.message }; }
        let body = typeof res.body === 'string' ? res.body : String(res.body ?? '');
        if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
        return { status: res.statusCode, finalUrl: res.url || url, html: res.statusCode < 400 ? body : null };
    }
    async function loadBoard(ats, slug, region) {
        const r = await fetchJson(endpoint(ats, slug, region));
        if (r.notFound) return null;
        const ex = extractRaw(ats, r.body);
        return { ats, slug, region, ...ex };
    }

    async function check(t) {
        const { domain } = t;
        const base = { domain, inputType: t.inputType };
        const now = new Date().toISOString();
        if (CONSUMER_DOMAINS.has(domain) || isPlatformHost(domain)) return { ...base, status: 'not_a_company_domain', isHiring: null, error: `${domain} is a consumer email or platform domain, not a company website.`, checkedAt: now };
        let careersPageUrl = null; let detectedVia = null; const otherAts = new Set(); let workdayUrl = null; let siteReachable = null; let robotsBlocked = false;
        let linked = []; let homeName = null; let homeStatus = null;
        if (scanWebsite) {
            const home = await fetchPage(`https://${domain}/`);
            if (home.error && !home.robotsBlocked) { const h2 = await fetchPage(`http://${domain}/`); if (h2.html) Object.assign(home, h2, { error: null }); }
            siteReachable = !!home.html; robotsBlocked = !!home.robotsBlocked; homeStatus = home.status ?? null;
            if (home.html) homeName = siteName(home.html);
            const pages = [];
            if (home.html) {
                const f = findAtsLinks(home.html); linked.push(...f.boards.map((b) => ({ ...b, via: 'homepage_link' }))); f.otherAts.forEach((x) => otherAts.add(x)); workdayUrl ||= f.workdayUrl;
                pages.push(...careersLinks(home.html, home.finalUrl || `https://${domain}/`, domain));
            }
            if (!linked.length) {
                const guesses = [`https://${domain}/careers`, `https://${domain}/jobs`];
                const list = [...new Set([...pages, ...guesses])].slice(0, Math.max(1, Math.min(6, Math.floor(Number(maxPagesPerSite) || 3))));
                for (const u of list) {
                    const p = await fetchPage(u);
                    if (!p.html || p.status >= 400) continue;
                    careersPageUrl ||= p.finalUrl || u;
                    const f = findAtsLinks(p.html); f.otherAts.forEach((x) => otherAts.add(x)); workdayUrl ||= f.workdayUrl;
                    if (f.boards.length) { careersPageUrl = p.finalUrl || u; linked.push(...f.boards.map((b) => ({ ...b, via: 'careers_page_link' }))); break; }
                }
            }
        }
        // 1) Boards linked from the company's own site: strongest evidence.
        let found = null;
        if (linked.length) {
            const loaded = (await Promise.all(linked.slice(0, 4).map(async (b) => { try { const x = await loadBoard(b.ats, b.slug, b.region); return x && { ...x, via: b.via }; } catch (e) { return null; } }))).filter(Boolean);
            const pick = pickBoard(loaded);
            if (pick) { found = { ...pick.best, confidence: 'high' }; detectedVia = pick.best.via; }
        }
        // 2) Guess board names on each ATS; keep the corroborated board with the most jobs.
        let lowConfidence = null;
        if (!found && probeBoardNames) {
            const cands = [];
            for (const slug of slugCandidates(domain, homeName)) {
                const rs = await Promise.all(ATS_LIST.map(async (ats) => { try { return await loadBoard(ats, slug, null); } catch { return null; } }));
                for (const r of rs) if (r && r.jobs.length) cands.push(r);
            }
            const scored = cands.map((c) => {
                const mapped = c.jobs.slice(0, 50).map((j) => { try { return mapJob(c.ats, c.slug, c.companyName, j, { region: c.region }); } catch { return {}; } });
                return { ...c, confidence: corroborate({ domain, slug: c.slug, companyName: c.companyName || mapped[0]?.companyName, jobs: c.jobs, urls: mapped.flatMap((m) => [m.jobUrl, m.applyUrl]).filter(Boolean) }) };
            });
            const rank = { high: 3, medium: 2, low: 1 };
            // Among corroborated boards keep the busiest one: companies often leave an old, near-empty board on a previous ATS.
            scored.sort((a, b) => Math.min(rank[b.confidence], 2) - Math.min(rank[a.confidence], 2) || b.jobs.length - a.jobs.length || rank[b.confidence] - rank[a.confidence]);
            if (scored[0] && scored[0].confidence !== 'low') { found = scored[0]; detectedVia = 'board_name_match'; }
            else if (scored[0]) { lowConfidence = scored[0]; if (includeLowConfidence) { found = scored[0]; detectedVia = 'board_name_match'; } }
        }
        if (!found) {
            const other = [...otherAts];
            if (other.length) return { ...base, status: 'unsupported_ats', isHiring: null, atsDetected: other, careersPageUrl, workdayUrl,
                error: `Careers site uses ${other.join(', ')}, which this Actor does not read yet.${workdayUrl ? ' For Workday, run swillz/workday-jobs-scraper with this workdayUrl.' : ''}`, checkedAt: now };
            if (scanWebsite && siteReachable === false && !robotsBlocked) return { ...base, status: 'site_unreachable', isHiring: null, error: homeStatus ? `Website returned HTTP ${homeStatus} (it may block automated requests; try Apify Proxy) and no job board was found by name.` : 'Website did not respond and no job board was found by name.', checkedAt: now };
            return { ...base, status: 'no_public_board_found', isHiring: null, careersPageUrl, robotsBlocked,
                possibleBoard: lowConfidence ? { ats: lowConfidence.ats, boardUrl: boardUrl(lowConfidence.ats, lowConfidence.slug, lowConfidence.region), openJobs: lowConfidence.jobs.length, note: 'Same board name, but nothing ties it to this domain. Set includeLowConfidence=true to use it.' } : null,
                error: 'No Greenhouse, Lever, Ashby, Workable or Recruitee board was found for this domain. The company may not be hiring, or uses an ATS this Actor cannot read.', checkedAt: now };
        }
        const jobs = found.jobs.map((j) => { try { return mapJob(found.ats, found.slug, found.companyName, j, { region: found.region }); } catch { return null; } }).filter(Boolean);
        const sum = summarize(jobs, { sample: Math.max(0, Math.min(25, Number.isFinite(Number(sampleJobsPerDomain)) ? Math.floor(Number(sampleJobsPerDomain)) : 5)) });
        return {
            ...base, status: jobs.length ? 'ok' : 'not_hiring',
            companyName: found.companyName || jobs.find((j) => j.companyName)?.companyName || null,
            ats: found.ats, boardSlug: found.slug, boardUrl: boardUrl(found.ats, found.slug, found.region), careersPageUrl,
            detectedVia, matchConfidence: found.confidence, otherAtsDetected: [...otherAts],
            ...sum, checkedAt: now,
        };
    }

    async function save(row) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (!CHARGED.has(row.status)) { await Actor.pushData(row); return; }
        if (chargeLimitHit) { counts[row.status]--; skipped.push(row.domain); return; }
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; counts[row.status]--; skipped.push(row.domain); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        for (const s of row.signals || []) sigCounts[s] = (sigCounts[s] ?? 0) + 1;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    const conc = Math.max(1, Math.min(25, Math.floor(Number(concurrency) || 8)));
    let idx = 0; let done = 0;
    const worker = async () => {
        while (idx < targets.length && !chargeLimitHit) {
            const t = targets[idx++];
            let row;
            try { row = await check(t); } catch (e) { row = { domain: t.domain, inputType: t.inputType, status: 'error', isHiring: null, error: String(e.message).slice(0, 300), checkedAt: new Date().toISOString() }; }
            await save(row);
            if (++done % 25 === 0) log.info(`Checked ${done}/${targets.length} domains`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, worker));
    for (const t of targets.slice(idx)) skipped.push(t.domain);
    for (const d of skipped) await Actor.pushData({ domain: d, status: 'skipped_charge_limit', isHiring: null, error: 'Not checked: the run reached the maximum cost you set. Raise the limit and run these again.', checkedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    for (const v of invalid) await Actor.pushData({ domain: null, input: v, inputType: 'invalid', status: 'invalid_input', isHiring: null, error: 'Not a valid domain, URL or email address.', checkedAt: new Date().toISOString() });
    if (invalid.length) counts.invalid_input = invalid.length;

    const found = (counts.ok ?? 0) + (counts.not_hiring ?? 0);
    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        domainsRequested: targets.length + overCap.length, boardsFound: found, hiring: counts.ok ?? 0, byStatus: counts, bySignal: sigCounts,
        notCheckedOverMaxDomains: overCap.length, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null, requests: stats,
        zeroResultsReason: found ? null : `No job board found for any domain: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See each row's status and error.`,
        finishedAt: new Date().toISOString(),
    };
    if (found) summary.nextSteps = [
        'Filter the dataset by isHiring=true or by a signal, e.g. "scaling_sales" or "hiring_leadership".',
        `Get every open role: run swillz/career-site-jobs-scraper with companies set to the boardUrl values from this dataset (${dsOut}).`,
        `Check their email setup: run swillz/email-provider-detector with {"datasetId": "${dsOut}"}`,
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    await Actor.exit(`${found ? '' : '0 boards found: '}Found job boards for ${found} of ${targets.length} domains (${counts.ok ?? 0} hiring)${found === targets.length && !invalid.length ? '' : `; ${Object.entries(counts).filter(([k]) => !CHARGED.has(k)).map(([k, v]) => `${v} ${k}`).join(', ')} not charged`}.`);
} catch (e) {
    if (e instanceof InputError || e?.isInputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
