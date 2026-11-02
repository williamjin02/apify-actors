import { Actor, log } from 'apify';
import { STATUSES, ELIGIBILITIES, CATEGORIES, INSTRUMENTS, SORTS, listOf, toCode, searchBody, mapOpportunity, daysUntil } from './grants.js';

const EVENT = 'opportunity';
const API = 'https://api.grants.gov/v1/api';
const UA = 'apify-actor swillz/grants-gov-opportunity-search (+https://apify.com/swillz/grants-gov-opportunity-search)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
class ServiceError extends Error {}

async function post(path, body, { tries = 4 } = {}) {
    let last;
    for (let a = 0; a < tries; a++) {
        try {
            const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
            if (res.ok) {
                const j = await res.json();
                if (j.errorcode && j.errorcode !== 0) { if (/invalid|not found/i.test(j.msg ?? '')) throw new InputError(`Grants.gov: ${j.msg}`); last = `error ${j.errorcode}: ${j.msg}`; } else return j.data ?? {};
            } else last = `HTTP ${res.status}`;
            if (res.status === 400) throw new InputError(`Grants.gov rejected the search: ${(await res.text()).slice(0, 200)}`);
        } catch (e) { if (e instanceof InputError) throw e; last = e.name === 'TimeoutError' ? 'timeout' : e.message; }
        if (a < tries - 1) await sleep(1500 * 2 ** a);
    }
    throw new ServiceError(`Grants.gov did not answer (${last}).`);
}

/** Map codes or labels to Grants.gov codes; unknown values are reported, not silently dropped. */
function codes(values, map, field, bad) {
    const out = [];
    for (const v of listOf(values)) { const c = toCode(v, map); if (c) { if (!out.includes(c)) out.push(c); } else bad.push(`${field}: "${v}"`); }
    return out;
}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const keywords = listOf(input.keywords ?? input.keyword ?? input.query ?? input.queries).map((k) => k.slice(0, 200)).slice(0, 50);
    const oppNums = listOf(input.opportunityNumbers).map((k) => k.slice(0, 60)).slice(0, 200);
    const statuses = listOf(input.statuses?.length ? input.statuses : ['posted', 'forecasted']).map((s) => s.toLowerCase());
    const badStatus = statuses.filter((s) => !STATUSES.includes(s));
    if (badStatus.length) throw new InputError(`Unknown statuses ${badStatus.map((s) => `"${s}"`).join(', ')}. Use any of: ${STATUSES.join(', ')}.`);
    const bad = [];
    const eligibilities = codes(input.eligibilities, ELIGIBILITIES, 'eligibilities', bad);
    const categories = codes(input.fundingCategories, CATEGORIES, 'fundingCategories', bad);
    const instruments = codes(input.fundingInstruments, INSTRUMENTS, 'fundingInstruments', bad);
    if (bad.length) throw new InputError(`Unknown filter values: ${bad.join('; ')}. Use the codes or labels listed in the input form (e.g. eligibilities "23" or "Small businesses").`);
    let agencies = listOf(input.agencies).map((a) => a.toUpperCase()).slice(0, 50);
    const cfdas = listOf(input.assistanceListings ?? input.cfda).filter((c) => /^\d{2}\.\d{3,4}[A-Z]?$/i.test(c)).slice(0, 20);
    const badCfda = listOf(input.assistanceListings ?? input.cfda).filter((c) => !/^\d{2}\.\d{3,4}[A-Z]?$/i.test(c));
    if (badCfda.length) throw new InputError(`assistanceListings must look like "47.075" or "93.866" (ALN/CFDA numbers); got ${badCfda.map((c) => `"${c}"`).join(', ')}.`);
    const postedWithinDays = Math.max(0, Math.floor(Number(input.postedWithinDays) || 0));
    const closingWithinDays = Math.max(0, Math.floor(Number(input.closingWithinDays) || 0));
    const minAwardCeiling = Math.max(0, Number(input.minAwardCeiling) || 0);
    const sortKey = Object.hasOwn(SORTS, input.sortBy) ? input.sortBy : 'closingSoonest';
    const maxResults = Math.max(1, Math.min(5000, Math.floor(Number(input.maxResults ?? 100)) || 100));
    const wantDetails = input.includeDetails !== false || minAwardCeiling > 0;
    const includeDescription = input.includeDescription !== false;
    const maxDescriptionChars = Math.max(200, Math.min(20000, Math.floor(Number(input.maxDescriptionChars) || 4000)));
    const statusRows = input.includeStatusRows !== false;
    const dedupe = input.dedupe !== false;
    const hasFilters = agencies.length || eligibilities.length || categories.length || instruments.length || cfdas.length || postedWithinDays || closingWithinDays || minAwardCeiling;
    if (!keywords.length && !oppNums.length && !hasFilters) throw new InputError('Add at least one keyword (e.g. "artificial intelligence"), an opportunityNumber (e.g. "PD-19-127Y"), or a filter such as agencies ["NSF"], eligibilities ["Small businesses"] or postedWithinDays 7.');

    // Top-level agency codes (e.g. "HHS") return nothing on Grants.gov; expand them to their sub-agencies.
    if (agencies.length) {
        const facets = await post('/search2', { rows: 0, oppStatuses: STATUSES.join('|') });
        const exp = [];
        for (const a of agencies) {
            const top = (facets.agencies ?? []).find((o) => String(o.value).toUpperCase() === a);
            exp.push(a, ...(top?.subAgencyOptions ?? []).map((s) => String(s.value).toUpperCase()));
        }
        agencies = [...new Set(exp)];
    }

    const charging = Actor.getChargingManager();
    const counts = {}; let charged = 0; let chargeLimitHit = false; let unavailable = false;
    const seen = new Set();
    const now = () => new Date().toISOString();
    async function free(row) { counts[row.status] = (counts[row.status] ?? 0) + 1; if (statusRows) await Actor.pushData({ ...row, checkedAt: now() }); }
    async function paid(row) {
        if (chargeLimitHit) return false;
        const allowed = charging?.calculateMaxEventChargeCountWithinLimit(EVENT);
        if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return false; }
        counts.found = (counts.found ?? 0) + 1; charged++;
        const r = await Actor.pushData({ ...row, status: 'found', checkedAt: now() }, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        return true;
    }
    const detailCache = new Map();
    async function details(id) {
        if (!detailCache.has(id)) detailCache.set(id, post('/fetchOpportunity', { opportunityId: Number(id) }, { tries: 3 }).catch((e) => { log.warning(`Details for ${id} failed: ${e.message}`); return null; }));
        return detailCache.get(id);
    }
    const passes = (row) => (!closingWithinDays || (row.daysUntilClose != null && row.daysUntilClose >= 0 && row.daysUntilClose <= closingWithinDays))
        && (!postedWithinDays || (row.postedDate && -daysUntil(row.postedDate) <= postedWithinDays))
        && (!minAwardCeiling || (row.awardCeiling != null && row.awardCeiling >= minAwardCeiling));

    /** Run one search and push matching opportunities until maxResults; returns { matched, hitCount }. */
    async function runSearch(label, base) {
        let start = 0; let matched = 0; let hitCount = 0; let dup = 0; let filtered = 0;
        const pageRows = wantDetails ? 50 : 250;
        while (matched < maxResults && !chargeLimitHit) {
            const data = await post('/search2', searchBody({ ...base, statuses, agencies, eligibilities, categories, instruments, cfda: cfdas.join('|'), sort: SORTS[sortKey], postedWithinDays, rows: pageRows, start }));
            hitCount = data.hitCount ?? 0;
            const hits = data.oppHits ?? [];
            if (!hits.length) break;
            // Cheap filters on search fields first, so we only fetch details for rows we may keep.
            const pre = hits.map((h) => mapOpportunity(h, null)).map((r, i) => ({ r, h: hits[i] })).filter(({ r }) => (!closingWithinDays || (r.daysUntilClose != null && r.daysUntilClose >= 0 && r.daysUntilClose <= closingWithinDays)) && (!postedWithinDays || (r.postedDate && -daysUntil(r.postedDate) <= postedWithinDays)));
            filtered += hits.length - pre.length;
            const todo = [];
            for (const p of pre) { if (dedupe && seen.has(p.r.opportunityId)) { dup++; continue; } todo.push(p); }
            for (let i = 0; i < todo.length && matched < maxResults && !chargeLimitHit; i += 4) {
                const batch = todo.slice(i, i + 4);
                const ds = wantDetails ? await Promise.all(batch.map((p) => details(p.h.id))) : batch.map(() => null);
                for (let k = 0; k < batch.length && matched < maxResults; k++) {
                    const row = mapOpportunity(batch[k].h, ds[k], { includeDescription, maxDescriptionChars });
                    if (!passes(row)) { filtered++; continue; }
                    if (dedupe) { if (seen.has(row.opportunityId)) { dup++; continue; } seen.add(row.opportunityId); }
                    if (!(await paid({ query: label, rank: matched + 1, ...row }))) break;
                    matched++;
                }
            }
            start += hits.length;
            if (start >= hitCount) break;
            // Closing-soonest order: once past the window, later pages can't match.
            if (closingWithinDays && sortKey === 'closingSoonest' && pre.length === 0 && hits.every((h) => { const d = mapOpportunity(h, null).daysUntilClose; return d != null && d > closingWithinDays; })) break;
        }
        return { matched, hitCount, dup, filtered };
    }

    const searches = [
        ...oppNums.map((n) => ({ label: n, base: { oppNum: n }, kind: 'number' })),
        ...keywords.map((k) => ({ label: k, base: { keyword: k }, kind: 'keyword' })),
    ];
    if (!searches.length) searches.push({ label: '(filters only)', base: {}, kind: 'filters' });
    const t0 = Date.now();
    const perSearch = [];
    for (const s of searches) {
        if (chargeLimitHit) { await free({ type: 'status', query: s.label, status: 'skipped_charge_limit', error: 'Not searched: the run reached the maximum cost you set. Raise the limit and run again.' }); continue; }
        if (unavailable) { await free({ type: 'status', query: s.label, status: 'service_unavailable', error: 'Grants.gov was not answering. Not charged; run again later.' }); continue; }
        try {
            const r = await runSearch(s.label, s.base);
            perSearch.push({ query: s.label, ...r });
            if (!r.matched) {
                const why = r.dup ? `all ${r.dup} matches were already returned for an earlier search in this run` : r.hitCount ? `${r.hitCount} Grants.gov results, 0 passed your filters (closingWithinDays/postedWithinDays/minAwardCeiling)` : s.kind === 'number' ? `opportunity number "${s.label}" not found with statuses ${statuses.join('/')}${hasFilters ? ' and these filters (agencies/eligibilities/categories/instruments/assistance listings also apply to opportunity numbers)' : ''}` : `no Grants.gov opportunities match with statuses ${statuses.join('/')}${hasFilters ? ' and these filters' : ''}`;
                await free({ type: 'status', query: s.label, status: s.kind === 'number' && !r.hitCount ? 'not_found' : 'no_results', error: `${why[0].toUpperCase()}${why.slice(1)}. Try fewer filters, add "closed" or "archived" to statuses, or a broader keyword. Not charged.` });
            }
        } catch (e) {
            if (e instanceof InputError) await free({ type: 'status', query: s.label, status: 'invalid_input', error: `${e.message} Not charged.` });
            else if (e instanceof ServiceError) { unavailable = true; await free({ type: 'status', query: s.label, status: 'service_unavailable', error: `${e.message} Not charged; run again later.` }); }
            else throw e;
        }
    }

    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        searches: searches.length, opportunitiesReturned: charged, byStatus: counts, perSearch, statuses, sortBy: sortKey, agencies, chargeLimitReached: chargeLimitHit,
        seconds: Math.round((Date.now() - t0) / 1000),
        zeroResultsReason: charged ? null : `No opportunities returned: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing matched'}. See each status row's error.`,
        nextSteps: [
            'Data comes live from the official Grants.gov API (api.grants.gov). Always confirm deadlines and eligibility on grantsGovUrl before applying.',
            'Schedule this actor daily with postedWithinDays: 1 or 3 to get only new opportunities.',
            'Check past federal awards to a company or university with swillz/federal-awards-by-company.',
            `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
        ],
        finishedAt: now(),
    };
    await Actor.setValue('OUTPUT', summary);
    const freeN = Object.entries(counts).filter(([k]) => k !== 'found');
    await Actor.exit(`${charged ? '' : '0 opportunities: '}Returned ${charged} Grants.gov ${charged === 1 ? "opportunity" : "opportunities"} for ${searches.length} ${searches.length === 1 ? 'search' : 'searches'}${freeN.length ? `; ${freeN.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
