import { Actor, log } from 'apify';
import { buildIndex, parseQuery, lookupCode, searchText, toRow, closestCode, formatHts, levelOf } from './hts.js';

const EVENT = 'hts-line';
const EXPORT_URL = 'https://hts.usitc.gov/reststop/exportList?from=0101&to=9999&format=JSON&styles=false';
const RELEASE_URL = 'https://hts.usitc.gov/reststop/releaseList';
const QUERY_FIELDS = ['htsCode', 'hsCode', 'hts', 'hs_code', 'tariffCode', 'productDescription', 'description', 'title', 'productName', 'name', 'query'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}

async function fetchJson(url, { tries = 4, timeoutMs = 90000 } = {}) {
    let last;
    for (let a = 0; a < tries; a++) {
        try {
            const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'apify-actor swillz/hts-code-lookup (+https://apify.com/swillz/hts-code-lookup)' }, signal: AbortSignal.timeout(timeoutMs) });
            if (res.ok) return await res.json();
            last = `HTTP ${res.status}`;
        } catch (e) { last = e.name === 'TimeoutError' ? 'timeout' : e.message; }
        if (a < tries - 1) await sleep(2000 * 2 ** a);
    }
    throw new Error(`USITC HTS service did not answer (${last}).`);
}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const maxPer = Math.max(1, Math.min(200, Math.floor(Number(input.maxResultsPerQuery ?? 10)) || 10));
    const includeChildren = input.includeChildren !== false;
    const includeChapter99 = input.includeChapter99 === true;
    const statisticalOnly = input.statisticalOnly === true;
    const resolveRefs = input.resolveAdditionalDuties !== false;

    const raw = input.queries ?? input.query ?? input.htsCodes ?? input.products ?? [];
    const queries = [];
    for (const v of Array.isArray(raw) ? raw : String(raw).split(/\n+/)) { const s = String(v ?? '').trim(); if (s) queries.push(s); }
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 500));
        let qf = String(input.queryField || '').trim() || null; let offset = 0; let got = 0;
        while (got < max) {
            let page;
            try { page = await Actor.newClient().dataset(dsId).listItems({ offset, limit: 1000, clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}. Use the dataset ID of a run you can access.`); }
            const items = page.items ?? []; if (!items.length) break;
            qf ||= QUERY_FIELDS.find((f) => items.some((it) => String(getPath(it, f) ?? '').trim())) ?? null;
            if (!qf) break;
            for (const it of items) { const val = String(getPath(it, qf) ?? '').trim().slice(0, 300); if (val) { queries.push(val); got++; } if (got >= max) break; }
            offset += items.length; if (items.length < 1000) break;
        }
        log.info(`Read ${got} queries from dataset ${dsId} (field "${qf ?? 'none found'}").`);
        if (!got && !queries.length) throw new InputError(`Dataset ${dsId} has no usable values. Set "queryField" (tried: ${QUERY_FIELDS.join(', ')}).`);
    }
    if (!queries.length) throw new InputError('Add at least one query: an HTS code like "8507.60.00" or "6109.10", or a product description like "cotton t-shirts". Or pass a datasetId.');
    const maxQueries = Math.max(1, Math.floor(Number(input.maxQueries) || 1000));
    const overCap = queries.length > maxQueries ? queries.splice(maxQueries).length : 0;

    log.info('Downloading the current Harmonized Tariff Schedule from USITC (one request, about 12 MB)...');
    const t0 = Date.now();
    let release = null;
    try {
        const rel = await fetchJson(RELEASE_URL, { tries: 2, timeoutMs: 20000 });
        const cur = (Array.isArray(rel) ? rel : []).find((r) => r.status === 'current') ?? null;
        if (cur) release = { name: cur.name, title: cur.title ?? cur.description, start: cur.releaseStartDate ?? null };
    } catch (e) { log.warning(`Could not read the HTS release list: ${e.message}`); }
    let index;
    try {
        const rows = await fetchJson(EXPORT_URL);
        if (!Array.isArray(rows) || rows.length < 1000) throw new Error(`unexpected export size ${Array.isArray(rows) ? rows.length : typeof rows}`);
        index = buildIndex(rows);
    } catch (e) {
        log.error(e.message);
        for (const q of queries) await Actor.pushData({ query: q.slice(0, 300), status: 'service_unavailable', error: `${e.message} Not charged. Run again in a few minutes.`, checkedAt: new Date().toISOString() });
        await Actor.setValue('OUTPUT', { queries: queries.length, rowsReturned: 0, byStatus: { service_unavailable: queries.length }, zeroResultsReason: 'The official USITC HTS service was unavailable. Nothing was charged.', finishedAt: new Date().toISOString() });
        await Actor.exit('0 lines: the USITC HTS service was unavailable. Nothing charged; run again later.');
    }
    log.info(`Loaded ${index.items.length} HTS lines (${release?.name ?? 'release unknown'}) in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

    const charging = Actor.getChargingManager();
    const counts = {}; let charged = 0; let chargeLimitHit = false; let skippedQueries = 0;
    const now = () => new Date().toISOString();
    async function free(row) { counts[row.status] = (counts[row.status] ?? 0) + 1; await Actor.pushData({ ...row, checkedAt: now() }); }
    async function paid(row) {
        if (chargeLimitHit) return false;
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return false; }
        }
        counts.found = (counts.found ?? 0) + 1; charged++;
        const r = await Actor.pushData({ ...row, checkedAt: now() }, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        return true;
    }

    const seen = new Set();
    for (const q of queries) {
        const key = q.toLowerCase();
        if (seen.has(key)) continue; seen.add(key);
        if (chargeLimitHit) { skippedQueries++; await free({ query: q.slice(0, 300), status: 'skipped_charge_limit', error: 'Not looked up: the run reached the maximum cost you set. Raise the limit and run this query again.' }); continue; }
        const p = parseQuery(q);
        if (p.kind === 'invalid' || p.kind === 'empty') { await free({ query: q.slice(0, 300), status: 'invalid_input', error: p.error ?? 'Empty query.' }); continue; }
        if (p.kind === 'code') {
            const { exact, items } = lookupCode(index, p.digits, { includeChildren, max: maxPer });
            if (!items.length) {
                const near = closestCode(index, p.digits);
                await free({ query: q, matchType: 'code', status: 'not_found', htsNumber: formatHts(p.digits), closestHtsNumber: near?.code ?? null, closestDescription: near ? near.path.join(' > ').slice(0, 400) : null,
                    error: `${formatHts(p.digits)} is not in the current HTS${near ? `. Closest existing code: ${near.code}. Run that code to see its valid ${levelOf(p.digits)} lines` : ''}. Not charged.`, htsRelease: release?.name ?? null });
                continue;
            }
            let rank = 0;
            for (const it of items) { rank++; if (!(await paid({ query: q, matchType: it === exact ? 'code' : 'code_child', rank, status: 'found', score: null, ...toRow(it, index, { release, resolveRefs }) }))) break; }
            continue;
        }
        const hits = searchText(index, p.tokens, { max: maxPer, includeChapter99, statisticalOnly });
        if (!hits.length) { await free({ query: q, matchType: 'keyword', status: 'not_found', error: 'No HTS line matches these words. Try the material and the product type in HTS terms, e.g. "cotton knitted shirts", "lithium-ion batteries", or give an HTS code. Not charged.', htsRelease: release?.name ?? null }); continue; }
        let rank = 0;
        for (const h of hits) { rank++; if (!(await paid({ query: q, matchType: h.relaxed ? 'keyword_partial' : 'keyword', rank, status: 'found', score: h.score, ...toRow(h.it, index, { release, resolveRefs }) }))) break; }
    }

    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        queries: seen.size, rowsReturned: charged, byStatus: counts, notRunOverMaxQueries: overCap, chargeLimitReached: chargeLimitHit, skippedQueries,
        htsRelease: release, htsLinesLoaded: index.items.length, sourceDatasetId: dsId || null,
        zeroResultsReason: charged ? null : `No HTS lines returned: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}. See each row's error.`,
        nextSteps: [
            'Keyword matches are ranked candidates, not a binding classification. Read fullDescription and confirm with CBP (binding rulings at rulings.cbp.gov) or a licensed customs broker.',
            'Run a 10-digit htsNumber from the results as a code query to see the exact line and its inherited rates.',
            'additionalDutyRefs lists Chapter 99 provisions the line itself points to. Section 301, 232 and IEEPA duties can also apply by country of origin through Chapter 99 notes.',
            `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
        ],
        finishedAt: now(),
    };
    await Actor.setValue('OUTPUT', summary);
    const freeN = Object.entries(counts).filter(([k]) => k !== 'found');
    await Actor.exit(`${charged ? '' : '0 lines: '}Returned ${charged} HTS lines for ${seen.size} queries (${release?.name ?? 'current HTS'})${freeN.length ? `; ${freeN.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
