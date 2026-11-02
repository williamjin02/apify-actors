import { Actor, log } from 'apify';
import { domainsFromDataset, DOMAIN_FIELDS } from './dataset.js';
import {
    BOTS, BOT_INDEX, MAX_ROBOTS_BYTES, parseRobots, isAllowed, botAccess, verdict, looksLikeHtml, parseLlmsTxt, metaRobots, directives, toTarget,
} from './robots.js';

const EVENT = 'domain-checked';
const UA = 'Mozilla/5.0 (compatible; AICrawlerAccessChecker/1.0; +https://apify.com/swillz/ai-crawler-access-checker)';
const OWN_TOKEN = 'AICrawlerAccessChecker';
class InputError extends Error {}
class NetError extends Error {}


async function readCapped(res, max) {
    if (!res.body) return { text: '', bytes: 0, truncated: false };
    const reader = res.body.getReader(); const chunks = []; let bytes = 0; let truncated = false;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); bytes += value.length;
            if (bytes >= max) { truncated = true; break; }
        }
    } finally { try { await reader.cancel(); } catch { /* ignore */ } }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { text: buf.subarray(0, max).toString('utf8'), bytes, truncated };
}

async function get(url, timeoutMs, max) {
    let res;
    try {
        res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA, accept: 'text/plain,text/markdown,text/html;q=0.9,*/*;q=0.5', 'accept-language': 'en' } });
    } catch (e) {
        const c = e?.cause?.code || e?.name || '';
        throw new NetError(/ENOTFOUND|EAI_AGAIN/.test(c) ? 'DNS lookup failed (domain does not resolve)' : /Timeout|Abort/i.test(c) ? `no response within ${Math.round(timeoutMs / 1000)} s` : /CERT|TLS|SSL/i.test(c) ? 'TLS/certificate error' : `connection failed (${c || e.message})`);
    }
    const body = await readCapped(res, max);
    return { status: res.status, url: res.url || url, headers: res.headers, ...body };
}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        domains = [], bots = [], customUserAgents = [], testPath = '/', checkLlmsTxt = true, checkHomepage = true, includeBotDetails = true,
        concurrency = 10, timeoutSecs = 15,
    } = input;
    const raw = (Array.isArray(domains) ? domains : String(domains).split(/[\n,;\s]+/))
        .map((w) => (typeof w === 'object' && w ? (w.url ?? w.domain ?? w.website) : w)).map((w) => String(w ?? '').trim()).filter(Boolean);
    const capRaw = input.maxDomains ?? input.maxItems ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 1000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const fromDs = await domainsFromDataset(Actor.newClient(), dsId, String(input.domainField || '').trim(), Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000)));
        raw.push(...fromDs.values.filter((v) => !v.includes('@')));
        log.info(`Read ${fromDs.values.length} values from dataset ${dsId} (field "${fromDs.field ?? 'none found'}", ${fromDs.itemsScanned} items scanned).`);
        if (!raw.length) throw new InputError(`Dataset ${dsId} has no domain or website values${fromDs.field ? ` in field "${fromDs.field}"` : ''}. Set "domainField" (tried: ${DOMAIN_FIELDS.filter((f) => !/mail/i.test(f)).join(', ')}).`);
    }
    if (!raw.length) throw new InputError('Add at least one domain or website URL, e.g. "nytimes.com", or pass a datasetId from another Actor run.');

    // Bots to check
    const wanted = (Array.isArray(bots) ? bots : String(bots).split(',')).map((b) => String(b).trim()).filter(Boolean);
    const unknownBots = wanted.filter((b) => !BOT_INDEX.has(b.toLowerCase()));
    if (unknownBots.length) throw new InputError(`Unknown bot(s) ${unknownBots.map((b) => `"${b}"`).join(', ')} in "bots". Use names from the list (e.g. "GPTBot", "ClaudeBot") or put other user-agent tokens in "customUserAgents".`);
    const botList = wanted.length ? wanted.map((b) => BOT_INDEX.get(b.toLowerCase())) : BOTS;
    const custom = (Array.isArray(customUserAgents) ? customUserAgents : String(customUserAgents).split(','))
        .map((c) => String(c).trim().split('/')[0]).filter((c) => /^[A-Za-z0-9._-]{2,60}$/.test(c) && !BOT_INDEX.has(c.toLowerCase()));
    const checkList = [...botList, ...[...new Set(custom)].slice(0, 20).map((c) => ({ bot: c, operator: null, purpose: 'custom', product: null }))];
    let path = String(testPath || '/').trim();
    if (/^https?:\/\//i.test(path)) { try { const u = new URL(path); path = u.pathname + u.search; } catch { path = '/'; } }
    if (!path.startsWith('/')) path = `/${path}`;
    const timeoutMs = Math.max(3, Math.min(60, Number(timeoutSecs) || 15)) * 1000;

    const seen = new Set(); const targets = []; const invalid = [];
    for (const r of raw) {
        const t = toTarget(r);
        if (!t) { invalid.push(r.includes('@') ? '(email address)' : r.slice(0, 200)); continue; }
        const key = `${t.host}:${t.port}`;
        if (seen.has(key)) continue; seen.add(key); targets.push({ ...t, input: r.slice(0, 300) });
    }
    const overCap = targets.length > cap ? targets.splice(cap) : [];
    if (overCap.length) log.warning(`maxDomains is ${cap}: ${overCap.length} extra domains were not checked.`);

    const charging = Actor.getChargingManager();
    const counts = {}; const verdicts = {}; const blockedTally = {}; let llmsFound = 0; let chargeLimitHit = false; const skipped = [];

    async function fetchRobots(t) {
        const port = t.port ? `:${t.port}` : '';
        const origins = t.scheme ? [`${t.scheme}://${t.host}${port}`]
            : [`https://${t.host}${port}`, ...(!t.host.startsWith('www.') && t.host.split('.').length === 2 ? [`https://www.${t.host}${port}`] : []), `http://${t.host}${port}`];
        let lastErr = null;
        for (const origin of origins) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const r = await get(`${origin}/robots.txt`, timeoutMs, MAX_ROBOTS_BYTES);
                    if (r.status >= 500 && attempt === 0) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
                    return { ...r, origin };
                } catch (e) {
                    lastErr = e;
                    if (/DNS/.test(e.message)) break; // try next origin
                    if (attempt === 0) continue;
                }
            }
        }
        throw lastErr ?? new NetError('connection failed');
    }

    async function check(t) {
        const base = { domain: t.host, input: t.input };
        const now = () => new Date().toISOString();
        let rb;
        try { rb = await fetchRobots(t); } catch (e) {
            return { ...base, status: 'unreachable', error: `Could not reach the site: ${e.message}. Not charged.`, checkedAt: now() };
        }
        const finalOrigin = new URL(rb.url).origin;
        const robotsTxtUrl = rb.url;
        let note = null; let parsed = { groups: [], sitemaps: [], lines: 0, unknownLines: 0 }; let found = false;
        if (rb.status === 401 || rb.status === 403 || rb.status === 429) {
            return { ...base, status: 'robots_inaccessible', robotsTxtUrl, robotsTxtStatus: rb.status,
                error: `robots.txt answered HTTP ${rb.status} to our checker (usually a firewall or bot protection such as Cloudflare). Its rules could not be read, and the firewall may also block AI crawlers directly. Not charged.`, checkedAt: now() };
        }
        if (rb.status >= 500) {
            return { ...base, status: 'unreachable', robotsTxtUrl, robotsTxtStatus: rb.status, error: `robots.txt answered HTTP ${rb.status} twice (server error). Under RFC 9309 crawlers treat this as "disallow everything" until it recovers. Not charged; try again later.`, checkedAt: now() };
        }
        if (rb.status >= 200 && rb.status < 300) {
            if (looksLikeHtml(rb.text, rb.headers.get('content-type') || '')) note = 'robots.txt returned an HTML page instead of a robots file, so no rules apply (every crawler is allowed).';
            else { parsed = parseRobots(rb.text); found = true; if (!parsed.groups.length) note = 'robots.txt has no user-agent groups, so every crawler is allowed.'; }
            if (rb.truncated) note = `robots.txt is larger than ${MAX_ROBOTS_BYTES / 1000} KB; only the first part was read (as Google does).`;
        } else note = `No robots.txt (HTTP ${rb.status}), so every crawler is allowed.`;

        const botRows = checkList.map((b) => {
            const a = botAccess(parsed, b.bot, path);
            return { bot: b.bot, operator: b.operator, purpose: b.purpose, access: a.access, allowed: a.allowed, matchedUserAgent: a.matchedUserAgent, matchedRule: a.matchedRule };
        });
        const star = isAllowed(parsed, '*', '/');
        const v = verdict(botRows);
        const ai = botRows.filter((r) => r.purpose !== 'search_engine' && r.purpose !== 'custom');
        const row = {
            ...base, status: 'checked', robotsTxtUrl, robotsTxtStatus: rb.status, robotsTxtFound: found, robotsTxtNote: note,
            checkedPath: path, aiAccessVerdict: v, botsChecked: botRows.length,
            blockedBots: botRows.filter((r) => r.access === 'blocked').map((r) => r.bot),
            partiallyBlockedBots: botRows.filter((r) => r.access === 'partial').map((r) => r.bot),
            allowedBots: botRows.filter((r) => r.access === 'allowed').map((r) => r.bot),
            trainingBotsBlocked: ai.filter((r) => r.purpose === 'training' && !r.allowed).length,
            answerBotsBlocked: ai.filter((r) => (r.purpose === 'search' || r.purpose === 'user') && !r.allowed).length,
            aiSearchAllowed: ai.filter((r) => r.purpose === 'search' || r.purpose === 'user').every((r) => r.allowed),
            googlebotAllowed: botAccess(parsed, 'Googlebot', path).allowed,
            bingbotAllowed: botAccess(parsed, 'Bingbot', path).allowed,
            contentSignal: star.contentSignal,
            crawlDelaySecs: star.crawlDelay,
            sitemaps: parsed.sitemaps,
            bots: includeBotDetails ? botRows : null,
        };
        for (const b of row.blockedBots) blockedTally[b] = (blockedTally[b] ?? 0) + 1;

        const ownOk = (p) => isAllowed(parsed, OWN_TOKEN, p).allowed;
        if (checkLlmsTxt) {
            const one = async (file, max) => {
                const url = `${finalOrigin}/${file}`;
                if (!ownOk(`/${file}`)) return { found: null, url, httpStatus: null, note: `robots.txt disallows /${file} for generic crawlers, so it was not fetched.` };
                try {
                    const r = await get(url, timeoutMs, max);
                    const ok = r.status === 200 && r.text.trim().length > 0 && !looksLikeHtml(r.text, r.headers.get('content-type') || '');
                    const len = Number(r.headers.get('content-length'));
                    return { found: ok, url: ok ? r.url : url, httpStatus: r.status, sizeBytes: ok ? (r.truncated ? (Number.isFinite(len) && len > 0 ? len : null) : r.bytes) : null, text: ok ? r.text : null,
                        note: ok ? null : r.status === 200 ? 'Returned an HTML page (soft 404), not a text file.' : null };
                } catch (e) { return { found: null, url, httpStatus: null, note: `Could not fetch: ${e.message}.` }; }
            };
            const [l, lf] = await Promise.all([one('llms.txt', 200000), one('llms-full.txt', 65536)]);
            const meta = l.found ? parseLlmsTxt(l.text) : {};
            row.llmsTxt = { found: l.found, url: l.url, httpStatus: l.httpStatus, sizeBytes: l.sizeBytes ?? null, title: meta.title ?? null, summary: meta.summary ?? null,
                sections: meta.sections ?? null, linkCount: meta.linkCount ?? null, followsSpec: l.found ? meta.validFormat : null, note: l.note ?? null };
            row.llmsFullTxt = { found: lf.found, url: lf.url, httpStatus: lf.httpStatus, sizeBytes: lf.sizeBytes ?? null, note: lf.note ?? null };
            if (l.found) llmsFound++;
        } else { row.llmsTxt = null; row.llmsFullTxt = null; }

        if (checkHomepage) {
            if (!ownOk(path)) row.homepage = { fetched: false, note: `robots.txt disallows ${path} for generic crawlers, so the page was not fetched.` };
            else {
                try {
                    const r = await get(`${finalOrigin}${path}`, timeoutMs, 1000000);
                    const html = looksLikeHtml(r.text, r.headers.get('content-type') || '');
                    const metas = html ? metaRobots(r.text) : [];
                    const xr = r.headers.get('x-robots-tag');
                    const d = directives(metas, xr);
                    row.homepage = { fetched: true, url: r.url, httpStatus: r.status, metaRobots: metas, xRobotsTag: xr ? xr.slice(0, 300) : null, noindex: d.noindex, noai: d.noai, noimageai: d.noimageai,
                        note: r.status === 403 || r.status === 429 ? `The page answered HTTP ${r.status} to our checker; a firewall or bot protection may also block AI crawlers here even though robots.txt allows them.` : null };
                } catch (e) { row.homepage = { fetched: false, note: `Could not fetch the page: ${e.message}.` }; }
            }
        } else row.homepage = null;
        row.checkedAt = now();
        return row;
    }

    async function save(row) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.status !== 'checked') { await Actor.pushData(row); return; }
        if (chargeLimitHit) { counts.checked--; skipped.push(row.domain); return; }
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; counts.checked--; skipped.push(row.domain); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        verdicts[row.aiAccessVerdict ?? 'custom_only'] = (verdicts[row.aiAccessVerdict ?? 'custom_only'] ?? 0) + 1;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    const conc = Math.max(1, Math.min(30, Math.floor(Number(concurrency) || 10)));
    let idx = 0; let done = 0;
    const worker = async () => {
        while (idx < targets.length && !chargeLimitHit) {
            const t = targets[idx++];
            let row;
            try { row = await check(t); } catch (e) { row = { domain: t.host, input: t.input, status: 'unreachable', error: `${e.message}. Not charged.`, checkedAt: new Date().toISOString() }; }
            await save(row);
            if (++done % 50 === 0) log.info(`Checked ${done}/${targets.length} domains`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, worker));

    for (const t of targets.slice(idx)) skipped.push(t.host);
    for (const d of skipped) await Actor.pushData({ domain: d, status: 'skipped_charge_limit', error: 'Not checked: the run reached the maximum cost you set. Raise the limit and run these again. Not charged.', checkedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    for (const v of invalid) await Actor.pushData({ domain: null, input: v, status: 'invalid_input', error: 'Not a valid domain or http(s) website URL. Not charged.', checkedAt: new Date().toISOString() });
    if (invalid.length) counts.invalid_input = invalid.length;

    const checked = counts.checked ?? 0;
    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        domainsRequested: targets.length + overCap.length + invalid.length, domainsChecked: checked, byStatus: counts, byVerdict: verdicts,
        mostBlockedBots: Object.entries(blockedTally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([bot, n]) => ({ bot, domains: n })),
        llmsTxtFound: checkLlmsTxt ? llmsFound : null, botsChecked: checkList.map((b) => b.bot), checkedPath: path,
        notCheckedOverMaxDomains: overCap.length, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null,
        zeroResultsReason: checked ? null : `No domain could be checked: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'no valid input'}. See the error field of each row.`,
        finishedAt: new Date().toISOString(),
    };
    if (checked) summary.nextSteps = [
        'See whether ChatGPT actually mentions and cites these brands: run swillz/ai-brand-visibility-tracker with {"brand": "<brand>", "domain": "<domain>"}.',
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}.`,
        'List every page an AI crawler can reach: run swillz/sitemap-url-extractor with {"startUrls": [{"url": "https://<domain>"}]}.',
    ];
    await Actor.setValue('OUTPUT', summary);
    if (targets.length >= 3 && !checked && (counts.unreachable ?? 0) === targets.length) throw new Error(`Could not reach any of the ${targets.length} sites. This looks like a network problem; try again.`);
    const freeParts = Object.entries(counts).filter(([k, n]) => k !== 'checked' && n).map(([k, n]) => `${n} ${k}`);
    await Actor.exit(`${checked ? '' : '0 results: '}Checked ${checked} of ${targets.length} ${targets.length === 1 ? 'site' : 'sites'} (${Object.entries(verdicts).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'})${freeParts.length ? `; ${freeParts.join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError || e?.isInputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
