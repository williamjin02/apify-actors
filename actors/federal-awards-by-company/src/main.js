import { Actor, log } from 'apify';
import { ALIASES, GROUPS, FIELDS, SORT_FIELD, parseRecipients, isUei, nameMatches, period, baseFilters, mapAward, isRedacted } from './usa.js';

const EVENT = 'award-record';
const API = 'https://api.usaspending.gov/api/v2';
const NAME_FIELDS = ['companyName', 'company', 'organization', 'organizationName', 'legalName', 'name', 'uei', 'recipient'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}
class ServiceError extends Error {}

async function post(path, body, { tries = 4 } = {}) {
    let last;
    for (let a = 0; a < tries; a++) {
        try {
            const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'apify-actor swillz/federal-awards-by-company (+https://apify.com/swillz/federal-awards-by-company)' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
            if (res.ok) return await res.json();
            const txt = (await res.text()).slice(0, 300);
            if (res.status === 400 || res.status === 422) throw new InputError(`USAspending rejected the filters: ${txt}`);
            last = `HTTP ${res.status}`;
        } catch (e) { if (e instanceof InputError) throw e; last = e.name === 'TimeoutError' ? 'timeout' : e.message; }
        if (a < tries - 1) await sleep(1500 * 2 ** a);
    }
    throw new ServiceError(`USAspending.gov did not answer (${last}).`);
}
const listOf = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]+/)).map((s) => String(s ?? '').trim()).filter(Boolean);

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const recipients = parseRecipients(input.companies ?? input.recipients ?? input.company ?? []);
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 100));
        let f = String(input.companyField || '').trim() || null; let got = 0;
        let page;
        try { page = await Actor.newClient().dataset(dsId).listItems({ limit: Math.min(max * 3, 5000), clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}`); }
        const items = page.items ?? [];
        f ||= NAME_FIELDS.find((k) => items.some((it) => String(getPath(it, k) ?? '').trim())) ?? null;
        if (f) for (const it of items) { const v = String(getPath(it, f) ?? '').trim(); if (v && !recipients.some((r) => r.toLowerCase() === v.toLowerCase())) { recipients.push(v.slice(0, 200)); if (++got >= max) break; } }
        log.info(`Read ${got} companies from dataset ${dsId} (field "${f ?? 'none found'}").`);
    }
    const keywords = listOf(input.keywords).filter((k) => k.length >= 3).slice(0, 20);
    const agencies = listOf(input.agencies).slice(0, 10);
    const naicsCodes = listOf(input.naicsCodes).filter((c) => /^\d{2,6}$/.test(c)).slice(0, 50);
    const pscCodes = listOf(input.pscCodes).filter((c) => /^[A-Z0-9]{1,4}$/i.test(c)).map((c) => c.toUpperCase()).slice(0, 50);
    const states = listOf(input.states).filter((s) => /^[A-Za-z]{2}$/.test(s)).slice(0, 60);
    const minAmount = Number(input.minAmount) || 0;
    const groups = listOf(input.awardTypes?.length ? input.awardTypes : ['contracts']).map((g) => g.toLowerCase()).filter((g) => GROUPS[g]);
    if (!groups.length) throw new InputError('awardTypes must include at least one of: contracts, idvs, grants, loans.');
    const per = period(input);
    if (per.error) throw new InputError(per.error);
    const maxPer = Math.max(1, Math.min(5000, Math.floor(Number(input.maxAwardsPerCompany ?? 100)) || 100));
    const sortBy = input.sortBy === 'newest' ? 'newest' : 'amount';
    const strict = input.strictNameMatch !== false;
    const wantSummary = input.includeSummary !== false;
    const hasFilters = keywords.length || agencies.length || naicsCodes.length || pscCodes.length || states.length;
    if (!recipients.length && !hasFilters) throw new InputError('Add at least one company name or UEI in "companies" (e.g. "Booz Allen Hamilton" or "JCBMLGPE6Z71"), or search by keywords, agencies, NAICS, PSC or states.');
    const maxCompanies = Math.max(1, Math.floor(Number(input.maxCompanies) || 200));
    const overCap = recipients.length > maxCompanies ? recipients.splice(maxCompanies).length : 0;

    const charging = Actor.getChargingManager();
    const counts = {}; let charged = 0; let chargeLimitHit = false; let skipped = 0;
    const now = () => new Date().toISOString();
    async function free(row) { counts[row.status] = (counts[row.status] ?? 0) + 1; await Actor.pushData({ ...row, checkedAt: now() }); }
    async function paid(row) {
        if (chargeLimitHit) return false;
        const allowed = charging?.calculateMaxEventChargeCountWithinLimit(EVENT);
        if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return false; }
        counts[row.status] = (counts[row.status] ?? 0) + 1; charged++;
        const r = await Actor.pushData({ ...row, checkedAt: now() }, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        return true;
    }
    const filt = (extra) => baseFilters({ keywords, agencies, naicsCodes, pscCodes, states, minAmount, start: per.start, end: per.end, ...extra });

    /** Fetch award rows for one search across the chosen groups, newest/largest first, up to maxPer. */
    async function fetchAwards(searchText, query, acceptName) {
        const out = []; const counts2 = {};
        for (const g of groups) {
            if (out.length >= maxPer) break;
            let page = 1;
            while (out.length < maxPer && page <= 50) {
                const body = { filters: { ...filt({ recipients: searchText }), award_type_codes: GROUPS[g].codes }, fields: FIELDS[g], limit: 100, page, sort: SORT_FIELD[sortBy][g], order: 'desc' };
                const j = await post('/search/spending_by_award/', body);
                for (const r of j.results ?? []) {
                    if (isRedacted(r['Recipient Name'])) continue;
                    if (acceptName && !acceptName(r)) continue;
                    out.push(mapAward(r, g, query)); counts2[g] = (counts2[g] ?? 0) + 1;
                    if (out.length >= maxPer) break;
                }
                if (!j.page_metadata?.hasNext) break;
                page++;
            }
        }
        return out;
    }
    async function topCategory(cat, searchText, limit = 5) {
        const res = [];
        for (const g of groups) {
            try { const j = await post(`/search/spending_by_category/${cat}/`, { filters: { ...filt({ recipients: searchText }), award_type_codes: GROUPS[g].codes }, limit }); res.push(...(j.results ?? [])); } catch (e) { if (e instanceof InputError) throw e; log.warning(`${cat} breakdown failed: ${e.message}`); }
        }
        const m = new Map();
        for (const r of res) { const k = r.code ?? r.name; const prev = m.get(k); m.set(k, { code: r.code ?? null, uei: r.uei ?? prev?.uei ?? null, name: r.name, amount: Math.round(((prev?.amount ?? 0) + (r.amount ?? 0)) * 100) / 100 }); }
        return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
    }

    const t0 = Date.now();
    let unavailable = false;
    for (const q of recipients) {
        if (chargeLimitHit) { skipped++; await free({ type: 'status', query: q, status: 'skipped_charge_limit', error: 'Not searched: the run reached the maximum cost you set. Raise the limit and run this company again.' }); continue; }
        if (unavailable) { await free({ type: 'status', query: q, status: 'service_unavailable', error: 'USAspending.gov was not answering. Not charged; run again later.' }); continue; }
        try {
            const uei = isUei(q) ? q.toUpperCase() : null;
            const qs = ALIASES[q.toLowerCase()] ?? q; // well-known acronyms -> legal name words
            let ueis = [];
            if (uei) ueis = [uei];
            else {
                // Resolve the company to recipient UEIs via the recipient breakdown, then keep only strict name matches.
                const raw = [];
                for (const g of groups) {
                    const j = await post('/search/spending_by_category/recipient/', { filters: { ...filt({ recipients: [qs] }), award_type_codes: GROUPS[g].codes }, limit: 50 });
                    raw.push(...(j.results ?? []));
                }
                const seenU = new Set();
                for (const r of raw) if (r.uei && !isRedacted(r.name) && (!strict || nameMatches(qs, r.name)) && !seenU.has(r.uei)) { seenU.add(r.uei); ueis.push(r.uei); }
                ueis = ueis.slice(0, 20);
            }
            let rows;
            if (ueis.length) rows = await fetchAwards(ueis, q, null);
            else rows = await fetchAwards([qs], q, (r) => !strict || nameMatches(qs, r['Recipient Name']));
            if (!rows.length) {
                await free({ type: 'status', query: q, status: 'not_found', error: `No ${groups.join('/')} awards for "${q}" between ${per.start} and ${per.end}${hasFilters ? ' with these filters' : ''}. Try the legal name (e.g. "Lockheed Martin Corporation"), the 12-character UEI, a longer date range (startDate), more awardTypes${strict ? ', or strictNameMatch: false' : ''}. Not charged.` });
                continue;
            }
            if (wantSummary) {
                const sText = ueis.length ? ueis : [qs];
                const [aggs, agenciesTop, naicsTop] = await Promise.all([topCategory('recipient', sText, 20), topCategory('awarding_agency', sText, 5), topCategory('naics', sText, 5)]);
                const keep = aggs.filter((a) => !isRedacted(a.name) && (ueis.length ? true : !strict || nameMatches(qs, a.name)));
                const total = keep.reduce((s, a) => s + (a.amount ?? 0), 0);
                const ok = await paid({ type: 'company_summary', query: q, status: 'found', recipientName: rows[0].recipientName, recipientUei: rows[0].recipientUei,
                    matchedRecipients: keep.map((a) => ({ name: a.name, uei: a.uei, amount: a.amount })), recipientUeis: ueis,
                    periodStart: per.start, periodEnd: per.end, awardTypes: groups, obligatedInPeriod: Math.round(total * 100) / 100,
                    awardsReturned: rows.length, topAwardingAgencies: agenciesTop.map((a) => ({ name: a.name, amount: a.amount })), topNaics: naicsTop.map((a) => ({ code: a.code, name: a.name, amount: a.amount })),
                    recipientProfileUrl: rows.find((r) => r.recipientProfileUrl)?.recipientProfileUrl ?? null });
                if (!ok) { skipped++; continue; }
            }
            let rank = 0;
            for (const r of rows) { rank++; if (!(await paid({ ...r, rank, status: 'found' }))) break; }
        } catch (e) {
            if (e instanceof InputError) await free({ type: 'status', query: q, status: 'invalid_input', error: `${e.message} Not charged.` });
            else if (e instanceof ServiceError) { unavailable = true; await free({ type: 'status', query: q, status: 'service_unavailable', error: `${e.message} Not charged; run again later.` }); }
            else throw e;
        }
    }
    if (!recipients.length) {
        try {
            const rows = await fetchAwards(undefined, '(filters only)', null);
            if (!rows.length) await free({ type: 'status', query: '(filters only)', status: 'not_found', error: `No awards match these filters between ${per.start} and ${per.end}. Loosen the filters or widen the dates. Not charged.` });
            let rank = 0;
            for (const r of rows) { rank++; if (!(await paid({ ...r, rank, status: 'found' }))) break; }
        } catch (e) {
            if (e instanceof InputError) await free({ type: 'status', query: '(filters only)', status: 'invalid_input', error: `${e.message} Not charged.` });
            else if (e instanceof ServiceError) await free({ type: 'status', query: '(filters only)', status: 'service_unavailable', error: `${e.message} Not charged; run again later.` });
            else throw e;
        }
    }

    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        companies: recipients.length, recordsReturned: charged, byStatus: counts, period: per, awardTypes: groups, notRunOverMaxCompanies: overCap, chargeLimitReached: chargeLimitHit, skippedCompanies: skipped,
        seconds: Math.round((Date.now() - t0) / 1000), sourceDatasetId: dsId || null,
        zeroResultsReason: charged ? null : `No records returned: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing matched'}. See each row's error.`,
        nextSteps: [
            'Amounts are federal obligations reported to USAspending.gov (FPDS for contracts, FABS for assistance). Recent months can be incomplete and DoD contracts are published with a 90-day delay.',
            'Use recipientUei from the company_summary row as a "companies" entry for an exact, faster rerun.',
            'Add "idvs" to awardTypes to include GSA schedules, GWACs and other indefinite-delivery vehicles.',
            `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
        ],
        finishedAt: now(),
    };
    await Actor.setValue('OUTPUT', summary);
    const freeN = Object.entries(counts).filter(([k]) => k !== 'found');
    await Actor.exit(`${charged ? '' : '0 records: '}Returned ${charged} federal award records for ${recipients.length ? `${recipients.length} ${recipients.length === 1 ? 'company' : 'companies'}` : 'a filter search'} (${per.start} to ${per.end})${freeN.length ? `; ${freeN.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
