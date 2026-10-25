import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseQuery, flatten, parentSummary, nameScore, nameVariants } from './lei.js';

const EVENT = 'lei-record';
const API = 'https://api.gleif.org/api/v1';
const Q_FIELDS = ['lei', 'LEI', 'isin', 'bic', 'companyName', 'name', 'company', 'legalName'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const { defaultCountry = '', includeParents = true, includeLegalFormName = true, onlyActive = false } = input;
    const maxMatches = Math.max(1, Math.min(10, Math.floor(Number(input.maxMatchesPerName) || 1)));
    const minScore = Math.max(0, Math.min(100, Number.isFinite(Number(input.minNameScore)) ? Number(input.minNameScore) : 80));
    const raw = input.queries ?? input.leis ?? input.companies ?? [];
    const entries = [];
    for (const v of Array.isArray(raw) ? raw : String(raw).split(/\n+/)) { const s = typeof v === 'string' ? v.trim() : String(v?.lei ?? v?.name ?? '').trim(); if (s) entries.push(s); }
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000));
        let qf = String(input.queryField || '').trim() || null; let cf = String(input.countryField || '').trim() || null; let offset = 0; let got = 0;
        while (got < max) {
            let page;
            try { page = await Actor.newClient().dataset(dsId).listItems({ offset, limit: 1000, clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}. Use the dataset ID of a run you can access.`); }
            const items = page.items ?? []; if (!items.length) break;
            qf ||= Q_FIELDS.find((f) => items.some((it) => typeof getPath(it, f) === 'string' && getPath(it, f).trim())) ?? null;
            if (!qf) break;
            for (const it of items) {
                const val = String(getPath(it, qf) ?? '').trim(); if (!val) continue;
                const c = cf ? String(getPath(it, cf) ?? '').trim() : '';
                entries.push(c && /^[A-Za-z]{2}$/.test(c) ? `${val} | ${c}` : val); got++; if (got >= max) break;
            }
            offset += items.length; if (items.length < 1000) break;
        }
        log.info(`Read ${got} values from dataset ${dsId} (field "${qf ?? 'none found'}").`);
        if (!got && !entries.length) throw new InputError(`Dataset ${dsId} has no usable values. Set "queryField" (tried: ${Q_FIELDS.join(', ')}).`);
    }
    if (!entries.length) throw new InputError('Add at least one LEI, company name, ISIN or BIC, e.g. "HWUPKR0MPOU8FGXBT394" or "Siemens Aktiengesellschaft | DE", or pass a datasetId.');

    const capRaw = input.maxQueries ?? input.maxItems ?? input.limit ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 2000;
    let paidCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS); if (!Number.isFinite(paidCap) || paidCap <= 0) paidCap = Infinity;

    // HTTP with a global throttle (GLEIF allows ~60 requests/minute).
    let lastAt = 0; const stats = { requests: 0, retries: 0, throttled: 0 };
    async function get(path, { allow404 = false } = {}) {
        let last = null;
        for (let a = 0; a < 4; a++) {
            const wait = lastAt + 1050 - Date.now(); if (wait > 0) await sleep(wait); lastAt = Date.now();
            try {
                stats.requests++;
                const res = await gotScraping({ url: API + path, responseType: 'json', headers: { accept: 'application/vnd.api+json' }, timeout: { request: 30000 }, throwHttpErrors: false, retry: { limit: 0 } });
                if (res.statusCode === 200) return { body: res.body };
                if (res.statusCode === 404 && allow404) return { body: null };
                if (res.statusCode === 400 || res.statusCode === 422) return { error: `HTTP ${res.statusCode}`, fatal: true };
                if (res.statusCode === 429) { stats.throttled++; await sleep(15000 * (a + 1)); }
                last = `HTTP ${res.statusCode}`;
            } catch (e) { last = `TIMEOUT/${e.code ?? e.message}`; }
            stats.retries++; await sleep(Math.min(20000, 2000 * 2 ** a));
        }
        return { error: last };
    }
    const enc = encodeURIComponent;

    const seen = new Set(); const queries = []; const localRows = []; let duplicates = 0;
    for (const e of entries) {
        const p = parseQuery(e, defaultCountry);
        if (p.status) { localRows.push({ input: e.slice(0, 200), queryType: p.type ?? null, query: p.value ?? null, status: p.status, error: p.error }); continue; }
        const key = `${p.type}:${p.value.toLowerCase()}:${p.country ?? ''}`;
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key); queries.push({ input: e.slice(0, 200), ...p });
    }
    const overCap = queries.length > cap ? queries.splice(cap) : [];
    if (overCap.length) log.warning(`maxQueries is ${cap}: ${overCap.length} extra queries were not run.`);

    const charging = Actor.getChargingManager();
    const counts = {}; let chargeLimitHit = false; let charged = 0; const skipped = [];
    const canCharge = () => {
        if (chargeLimitHit || charged >= paidCap) { chargeLimitHit = true; return false; }
        if (charging) { const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT); if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return false; } }
        return true;
    };
    const formCache = new Map(); const parentCache = new Map();
    async function legalFormName(code) {
        if (!code || !includeLegalFormName) return null;
        if (!formCache.has(code)) {
            const r = await get(`/entity-legal-forms/${enc(code)}`, { allow404: true });
            const names = r.body?.data?.attributes?.names ?? [];
            formCache.set(code, (names.find((n) => n.languageCode === 'en') ?? names[0])?.localName ?? null);
        }
        return formCache.get(code);
    }
    async function parent(lei, kind) {
        const k = `${kind}:${lei}`;
        if (!parentCache.has(k)) { const r = await get(`/lei-records/${lei}/${kind}`, { allow404: true }); parentCache.set(k, r.error ? { error: r.error } : parentSummary(r.body?.data)); }
        return parentCache.get(k);
    }
    async function emit(q, rec, extra = {}) {
        if (!canCharge()) { skipped.push(q); return false; }
        const f = flatten(rec);
        const row = { input: q.input, queryType: q.type, query: q.value, status: 'found', ...extra, ...f };
        row.legalForm = f.legalForm ?? await legalFormName(f.legalFormCode);
        if (includeParents) {
            row.directParent = f.hasDirectParent ? await parent(f.lei, 'direct-parent') : null;
            row.ultimateParent = f.hasUltimateParent ? await parent(f.lei, 'ultimate-parent') : null;
        }
        row.checkedAt = new Date().toISOString();
        counts.found = (counts.found ?? 0) + 1; charged++;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        return true;
    }
    async function free(q, status, error) { counts[status] = (counts[status] ?? 0) + 1; await Actor.pushData({ input: q.input, queryType: q.type, query: q.value, status, error, checkedAt: new Date().toISOString() }); }
    const statusOk = (rec) => !onlyActive || (rec?.attributes?.entity?.status === 'ACTIVE');

    // 1) LEIs in batches of 100
    const leis = queries.filter((q) => q.type === 'lei');
    for (let i = 0; i < leis.length; i += 100) {
        const batch = leis.slice(i, i + 100);
        if (chargeLimitHit) { skipped.push(...batch); continue; }
        const r = await get(`/lei-records?filter[lei]=${batch.map((b) => b.value).join(',')}&page[size]=100`);
        const byId = new Map((r.body?.data ?? []).map((d) => [d.id, d]));
        for (const q of batch) {
            if (chargeLimitHit) { skipped.push(q); continue; }
            const rec = byId.get(q.value);
            if (rec && statusOk(rec)) await emit(q, rec);
            else if (rec) await free(q, 'not_found', 'LEI exists but the entity is not ACTIVE (onlyActive is on).');
            else if (r.error) await free(q, 'service_unavailable', `GLEIF did not answer (${r.error}). Not charged. Run again later.`);
            else await free(q, 'not_found', 'No LEI record with this code in GLEIF. Not charged.');
        }
        log.info(`Looked up ${Math.min(i + 100, leis.length)}/${leis.length} LEIs`);
    }
    // 2) ISIN, BIC and names, one request each
    let done = 0; const others = queries.filter((q) => q.type !== 'lei');
    for (const q of others) {
        if (chargeLimitHit) { skipped.push(q); continue; }
        if (q.type === 'isin' || q.type === 'bic') {
            const r = await get(`/lei-records?filter[${q.type}]=${enc(q.value)}&page[size]=5`);
            const recs = (r.body?.data ?? []).filter(statusOk);
            if (recs.length) { for (const rec of recs.slice(0, maxMatches)) await emit(q, rec); } else if (r.error && !r.fatal) await free(q, 'service_unavailable', `GLEIF did not answer (${r.error}). Not charged.`); else await free(q, 'not_found', `No LEI record linked to this ${q.type.toUpperCase()}. Not charged.`);
        } else {
            const cf = q.country ? `&filter[entity.legalAddress.country]=${q.country}` : '';
            let r = await get(`/lei-records?filter[entity.legalName]=${enc(q.value)}${cf}&page[size]=25`);
            let recs = r.body?.data ?? [];
            const score = (list) => list.filter(statusOk).map((rec) => {
                const e = rec.attributes?.entity ?? {};
                const s = nameScore(q.value, [e.legalName?.name, ...(e.otherNames ?? []).map((n) => n.name), ...(e.transliteratedOtherNames ?? []).map((n) => n.name)]);
                return { rec, s: s + (e.status === 'ACTIVE' ? 0.5 : 0) + (rec.attributes?.registration?.status === 'ISSUED' ? 0.3 : 0) };
            }).filter((x) => x.s >= minScore).sort((a, b) => b.s - a.s);
            let scored = score(recs);
            if (!r.error && (!scored.length || scored[0].s < 95)) {
                for (const v of nameVariants(q.value)) {
                    const r2 = await get(`/lei-records?filter[entity.legalName]=${enc(v)}${cf}&page[size]=25`);
                    if (r2.body?.data?.length) { recs = [...recs, ...r2.body.data]; const ids = new Set(); scored = score(recs).filter((x) => !ids.has(x.rec.id) && ids.add(x.rec.id)); }
                }
            }
            if (!r.error && (!scored.length || scored[0].s < 95)) {
                const r3 = await get(`/lei-records?filter[fulltext]=${enc(q.value)}${cf}&page[size]=25`);
                if (r3.body?.data?.length) { recs = [...recs, ...r3.body.data]; const ids = new Set(); scored = score(recs).filter((x) => !ids.has(x.rec.id) && ids.add(x.rec.id)); }
            }
            scored = scored.slice(0, maxMatches);
            if (scored.length) { let rank = 0; for (const x of scored) { rank++; if (!(await emit(q, x.rec, { matchScore: Math.floor(x.s), matchRank: rank }))) break; } } else if (r.error && !r.fatal) await free(q, 'service_unavailable', `GLEIF did not answer (${r.error}). Not charged.`);
            else await free(q, 'not_found', recs.length ? `GLEIF returned ${recs.length} candidates but none scored >= minNameScore ${minScore}. Try the full legal name, add a country ("| DE"), or lower minNameScore. Not charged.` : 'No LEI record matches this name. Try the full legal name or add a country, e.g. "Siemens Aktiengesellschaft | DE". Not charged.');
        }
        done++; if (done % 25 === 0) log.info(`Searched ${done}/${others.length} names/ISINs/BICs`);
    }
    for (const q of skipped) await Actor.pushData({ input: q.input, queryType: q.type, query: q.value, status: 'skipped_charge_limit', error: 'Not run: the run reached the maximum cost you set. Raise the limit and run these again.', checkedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    for (const r of localRows) { counts[r.status] = (counts[r.status] ?? 0) + 1; await Actor.pushData({ ...r, checkedAt: new Date().toISOString() }); }

    const found = counts.found ?? 0; const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        queriesRequested: entries.length, uniqueQueries: queries.length, recordsFound: found, byStatus: counts, duplicatesSkipped: duplicates,
        notRunOverMaxQueries: overCap.length, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null, requests: stats,
        zeroResultsReason: found ? null : `No LEI record found: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See each row's error.`,
        finishedAt: new Date().toISOString(),
    };
    summary.nextSteps = [
        'Filter by entityStatus (ACTIVE/INACTIVE) and registrationStatus (ISSUED is current; LAPSED means the LEI was not renewed).',
        'Name searches return matchScore (0-100); review rows below 90 before relying on them.',
        ...(counts.not_found ? ['For not_found names, try the full legal name with a country hint, e.g. "Siemens Aktiengesellschaft | DE".'] : []),
        'Need VAT or EORI checks for EU companies? Use swillz/eu-vat-validator or swillz/eori-validator.',
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    const freeC = Object.entries(counts).filter(([k]) => k !== 'found');
    await Actor.exit(`${found ? '' : '0 records: '}Found ${found} LEI records for ${queries.length} queries${freeC.length ? `; ${freeC.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
