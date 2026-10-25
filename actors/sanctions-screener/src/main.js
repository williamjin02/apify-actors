import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseOfac, parseUn, parseEu, parseUk } from './lists.js';
import { NameIndex, countryToIso } from './match.js';

const EVENT = 'name-screened';
const CHARGED = new Set(['clear', 'potential_match']);
const OFAC = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/';
export const SOURCES = {
    ofac_sdn: { label: 'OFAC SDN List (US Treasury)', urls: ['SDN.CSV', 'ALT.CSV', 'ADD.CSV'].map((f) => OFAC + f) },
    ofac_consolidated: { label: 'OFAC Consolidated Non-SDN List (US Treasury)', urls: ['CONS_PRIM.CSV', 'CONS_ALT.CSV', 'CONS_ADD.CSV'].map((f) => OFAC + f) },
    un: { label: 'UN Security Council Consolidated List', urls: ['https://scsanctions.un.org/resources/xml/en/consolidated.xml'] },
    eu: { label: 'EU Consolidated Financial Sanctions List', urls: ['https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw'] },
    uk: { label: 'UK Sanctions List (FCDO)', urls: ['https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv'] },
};
const SNAPSHOT_URL = 'https://api.apify.com/v2/key-value-stores/M258nvMTE4yWUjoVd/records/SNAPSHOT';
const NAME_FIELDS = ['name', 'fullName', 'companyName', 'company', 'legalName', 'title', 'personName', 'beneficiary', 'counterparty'];
const COUNTRY_FIELDS = ['country', 'countryCode', 'nationality', 'location'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}

async function fetchText(url, timeoutMs) {
    let last;
    for (let a = 0; a < 3; a++) {
        try {
            const res = await gotScraping({ url, timeout: { request: timeoutMs }, throwHttpErrors: false, retry: { limit: 0 }, headerGeneratorOptions: { browsers: ['chrome'] }, decompress: true });
            if (res.statusCode === 200 && res.body?.length > 200) return String(res.body);
            last = `HTTP ${res.statusCode}`;
        } catch (e) { last = e.code ?? e.message; }
        await sleep(2000 * (a + 1));
    }
    throw new Error(`${url.split('?')[0]}: ${last}`);
}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const lists = (Array.isArray(input.lists) && input.lists.length ? input.lists : Object.keys(SOURCES)).map(String);
    const bad = lists.filter((l) => !SOURCES[l]);
    if (bad.length) throw new InputError(`Unknown list(s): ${bad.join(', ')}. Use any of: ${Object.keys(SOURCES).join(', ')}.`);
    const minScore = Math.max(70, Math.min(100, Number(input.minScore) || 85));
    const maxMatches = Math.max(1, Math.min(25, Math.floor(Number(input.maxMatchesPerName) || 5)));
    const entityType = ['any', 'individual', 'entity'].includes(input.entityType) ? input.entityType : 'any';
    const defaultCountry = countryToIso(input.defaultCountry) ?? null;

    const entries = [];
    const raw = input.names ?? input.queries ?? [];
    for (const v of Array.isArray(raw) ? raw : String(raw).split(/[\n;]+/)) {
        if (v && typeof v === 'object') { entries.push({ name: String(v.name ?? v.fullName ?? v.companyName ?? '').trim(), country: countryToIso(v.country ?? v.countryCode) ?? defaultCountry, type: v.type ?? null }); continue; }
        const s = String(v ?? '').trim(); if (!s) continue;
        const [n, ...c] = s.split('|');
        entries.push({ name: n.trim(), country: countryToIso(c.join('|').trim()) ?? defaultCountry, type: null });
    }
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000));
        let nf = String(input.nameField || '').trim() || null; let cf = String(input.countryField || '').trim() || null; let offset = 0; let got = 0;
        while (got < max) {
            let page;
            try { page = await Actor.newClient().dataset(dsId).listItems({ offset, limit: 1000, clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}. Use the dataset ID of a run you can access.`); }
            const items = page.items ?? []; if (!items.length) break;
            nf ||= NAME_FIELDS.find((f) => items.some((it) => typeof getPath(it, f) === 'string' && getPath(it, f).trim())) ?? null;
            cf ||= COUNTRY_FIELDS.find((f) => items.some((it) => countryToIso(getPath(it, f)))) ?? null;
            if (!nf) break;
            for (const it of items) { const n = String(getPath(it, nf) ?? '').trim(); if (n) { entries.push({ name: n, country: (cf && countryToIso(getPath(it, cf))) || defaultCountry, type: null }); got++; } if (got >= max) break; }
            offset += items.length; if (items.length < 1000) break;
        }
        log.info(`Read ${got} names from dataset ${dsId} (field "${nf ?? 'none found'}").`);
        if (!got && !entries.length) throw new InputError(`Dataset ${dsId} has no name values. Set "nameField" (tried: ${NAME_FIELDS.join(', ')}).`);
    }
    if (!entries.length) throw new InputError('Add at least one name to screen, e.g. "Acme Trading LLC" or "John Doe | RU", or pass a datasetId from another Actor run.');

    const capRaw = input.maxNames ?? input.maxItems ?? input.limit;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 10000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    // Load the official lists: a snapshot refreshed from the official sources every 6 hours, or a live download.
    const t0 = Date.now(); const listInfo = {}; const records = []; const unavailable = [];
    const timeout = Math.max(30, Math.min(300, Number(input.downloadTimeoutSecs) || 150)) * 1000;
    const maxAgeH = Math.max(1, Math.min(168, Number(input.maxListAgeHours) || 24));
    let snap = null;
    if (!input.alwaysDownloadFresh) {
        try {
            const res = await gotScraping({ url: SNAPSHOT_URL, responseType: 'json', timeout: { request: 60000 }, throwHttpErrors: false, retry: { limit: 1 } });
            if (res.statusCode === 200 && res.body?.lists) snap = res.body; else log.warning(`List snapshot unavailable (HTTP ${res.statusCode}); downloading the lists directly.`);
        } catch (e) { log.warning(`List snapshot unavailable (${e.code ?? e.message}); downloading the lists directly.`); }
    }
    const live = [];
    for (const l of lists) {
        const s = snap?.lists?.[l];
        if (s?.records?.length && Date.now() - Date.parse(s.fetchedAt) < maxAgeH * 3600e3) {
            records.push(...s.records); listInfo[l] = { label: SOURCES[l].label, available: true, records: s.records.length, listDate: s.listDate ?? null, fetchedAt: s.fetchedAt, via: 'snapshot' };
        } else live.push(l);
    }
    const texts = await Promise.all(live.map(async (l) => { try { return [l, await Promise.all(SOURCES[l].urls.map((u) => fetchText(u, timeout)))]; } catch (e) { return [l, null, e.message]; } }));
    const fetchedAt = new Date().toISOString();
    for (let ti = 0; ti < texts.length; ti++) {
        const [l, t, err] = texts[ti];
        if (!t) { unavailable.push(l); listInfo[l] = { label: SOURCES[l].label, available: false, error: String(err).slice(0, 200) }; log.warning(`${SOURCES[l].label} unavailable: ${err}`); continue; }
        try {
            let recs; let generated = null;
            if (l.startsWith('ofac')) recs = parseOfac(l, ...t);
            else if (l === 'un') ({ records: recs, generated } = parseUn(t[0]));
            else if (l === 'eu') ({ records: recs, generated } = parseEu(t[0]));
            else ({ records: recs, generated } = parseUk(t[0]));
            if (!recs.length) throw new Error('file parsed to 0 records');
            records.push(...recs); listInfo[l] = { label: SOURCES[l].label, available: true, records: recs.length, listDate: generated, fetchedAt, via: 'official source' };
        } catch (e) { unavailable.push(l); listInfo[l] = { label: SOURCES[l].label, available: false, error: `Parse failed: ${e.message}`.slice(0, 200) }; }
        texts[ti] = [l];
    }
    const index = new NameIndex();
    records.forEach((r, i) => { if (entityType === 'any' || (entityType === 'individual') === (r.type === 'individual')) for (const n of r.names) index.add(i, n); });
    log.info(`Loaded ${records.length} listed records (${index.names.length} names) from ${lists.length - unavailable.length}/${lists.length} lists in ${Math.round((Date.now() - t0) / 1000)}s.`);
    const listsChecked = lists.filter((l) => !unavailable.includes(l));

    const charging = Actor.getChargingManager();
    const counts = {}; const skipped = []; let chargeLimitHit = false; const seen = new Set(); let duplicates = 0; let overCap = 0; let n = 0;
    async function save(row) {
        if (!CHARGED.has(row.status)) { counts[row.status] = (counts[row.status] ?? 0) + 1; await Actor.pushData(row); return; }
        if (chargeLimitHit) { skipped.push(row.name); return; }
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; skipped.push(row.name); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }
    for (const e of entries) {
        const base = { name: e.name.slice(0, 300), countryHint: e.country, screenedAt: new Date().toISOString() };
        const key = `${e.name.toLowerCase()}|${e.country ?? ''}`;
        if (seen.has(key)) { duplicates++; continue; } seen.add(key);
        if (n >= cap) { overCap++; continue; }
        if (e.name.replace(/[^\p{L}\p{N}]/gu, '').length < 2) { await save({ ...base, status: 'invalid_input', topScore: null, matchCount: 0, matches: [], error: 'Name is empty or too short to screen. Not charged.' }); continue; }
        if (!listsChecked.length) { await save({ ...base, status: 'service_unavailable', topScore: null, matchCount: 0, matches: [], listsChecked, listsNotChecked: unavailable, error: 'None of the selected sanctions lists could be downloaded. Not charged. Run again later.' }); continue; }
        n++;
        const typeWanted = e.type && /indiv|person/i.test(e.type) ? 'individual' : e.type && /entit|company|org/i.test(e.type) ? 'entity' : null;
        const byRec = new Map();
        for (const h of index.search(e.name, minScore)) {
            const rec = records[h.r];
            if (typeWanted && (typeWanted === 'individual') !== (rec.type === 'individual')) continue;
            if (!byRec.has(h.r)) byRec.set(h.r, { h, rec });
        }
        const ms = [...byRec.values()].map(({ h, rec }) => ({
            score: h.score, list: rec.list, listName: SOURCES[rec.list].label, listId: rec.listId, listedName: rec.primaryName, matchedName: h.name, type: rec.type,
            programs: rec.programs.slice(0, 10), countries: rec.countries.slice(0, 10), countryMatch: e.country && rec.countries.length ? rec.countries.includes(e.country) : null,
            datesOfBirth: rec.datesOfBirth.slice(0, 5), listedOn: rec.listedOn, aliasCount: rec.names.length, remarks: rec.remarks,
        })).sort((a, b) => b.score - a.score || (b.countryMatch === true) - (a.countryMatch === true));
        const row = { ...base, status: ms.length ? 'potential_match' : 'clear', topScore: ms[0]?.score ?? null, matchCount: ms.length, matches: ms.slice(0, maxMatches), listsChecked, listsNotChecked: unavailable, error: null };
        if (unavailable.length) { row.status = ms.length ? 'potential_match_incomplete' : 'clear_incomplete'; row.error = `Not charged: ${unavailable.join(', ')} could not be downloaded, so this result does not cover those lists. Run again later.`; }
        await save(row);
        if (n % 500 === 0) log.info(`Screened ${n} names`);
    }
    for (const s of skipped) await Actor.pushData({ name: s, status: 'skipped_charge_limit', topScore: null, matchCount: 0, matches: [], error: 'Not screened: the run reached the maximum cost you set. Raise the limit and run these again.', screenedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;

    const screened = (counts.clear ?? 0) + (counts.potential_match ?? 0) + (counts.clear_incomplete ?? 0) + (counts.potential_match_incomplete ?? 0);
    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        namesRequested: entries.length, screened, clear: (counts.clear ?? 0) + (counts.clear_incomplete ?? 0), potentialMatches: (counts.potential_match ?? 0) + (counts.potential_match_incomplete ?? 0), byStatus: counts,
        duplicatesSkipped: duplicates, notScreenedOverMaxNames: overCap, chargeLimitReached: chargeLimitHit, minScore, entityType, lists: listInfo, listsNotChecked: unavailable, sourceDatasetId: dsId || null,
        zeroResultsReason: screened ? null : `No name was screened: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See each row's status and error.`,
        disclaimer: 'Screening aid based on the official public lists; not legal advice. Review every potential_match manually (compare dates of birth, countries and programs) before acting.',
        finishedAt: new Date().toISOString(),
    };
    summary.nextSteps = [
        'Filter by status: "clear" names had no listed name at or above minScore; "potential_match" rows need a manual review of matches[].',
        'Too many weak matches? Raise minScore (e.g. 92) or set entityType. Worried about misses? Lower it to 80.',
        ...(unavailable.length ? [`Re-run later: ${unavailable.join(', ')} could not be downloaded (rows were not charged).`] : []),
        'Need the legal entity behind a company? Run swillz/lei-lookup with the same names.',
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    log.info(`Done: ${screened} screened, ${summary.potentialMatches} potential matches, ${summary.clear} clear.`);
    await Actor.exit();
} catch (e) {
    if (e instanceof InputError) { await Actor.setValue('OUTPUT', { error: e.message, zeroResultsReason: e.message, nextSteps: ['Fix the input and run again.'] }); await Actor.fail(e.message); }
    else { log.exception(e, 'Run failed'); await Actor.fail(`Unexpected error: ${e.message}`); }
}
