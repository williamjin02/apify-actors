import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseVat, nameMatch, cleanField, COUNTRY_NAMES } from './vat.js';

const EVENT = 'vat-checked';
const API = 'https://ec.europa.eu/taxation_customs/vies/rest-api';
const CHARGED = new Set(['valid', 'invalid']);
const RETRYABLE = new Set(['MS_UNAVAILABLE', 'MS_MAX_CONCURRENT_REQ', 'MS_MAX_CONCURRENT_REQ_TIME', 'GLOBAL_MAX_CONCURRENT_REQ', 'GLOBAL_MAX_CONCURRENT_REQ_TIME', 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'SERVER_BUSY']);
const VAT_FIELDS = ['vatNumber', 'vat', 'vatId', 'vat_number', 'vatID', 'taxId', 'tax_id', 'euVat', 'VAT'];
const NAME_FIELDS = ['companyName', 'name', 'company', 'title', 'legalName', 'businessName'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const { vatNumbers = [], defaultCountry = '', requesterVatNumber = '', concurrency = 4, perCountryConcurrency = 2, maxRetries = 3, requestTimeoutSecs = 30 } = input;
    const entries = [];
    const list = Array.isArray(vatNumbers) ? vatNumbers : String(vatNumbers).split(/[\n;]+/);
    for (const v of list) {
        if (v && typeof v === 'object') { entries.push({ raw: String(v.vatNumber ?? v.vat ?? v.vatId ?? ''), expectedName: v.companyName ?? v.name ?? null }); continue; }
        const str = String(v ?? '').trim(); if (!str) continue;
        const [num, ...name] = str.split('|');
        entries.push({ raw: num.trim(), expectedName: name.join('|').trim() || null });
    }
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000));
        let vf = String(input.vatField || '').trim() || null; let nf = String(input.nameField || '').trim() || null; let offset = 0; let got = 0;
        while (got < max) {
            let page;
            try { page = await Actor.newClient().dataset(dsId).listItems({ offset, limit: 1000, clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}. Use the dataset ID of a run you can access.`); }
            const items = page.items ?? []; if (!items.length) break;
            vf ||= VAT_FIELDS.find((f) => items.some((it) => String(getPath(it, f) ?? '').trim())) ?? null;
            nf ||= NAME_FIELDS.find((f) => items.some((it) => typeof getPath(it, f) === 'string')) ?? null;
            if (!vf) break;
            for (const it of items) { const val = String(getPath(it, vf) ?? '').trim(); if (val) { entries.push({ raw: val, expectedName: nf ? String(getPath(it, nf) ?? '').trim() || null : null }); got++; } if (got >= max) break; }
            offset += items.length; if (items.length < 1000) break;
        }
        log.info(`Read ${got} VAT numbers from dataset ${dsId} (field "${vf ?? 'none found'}"${nf ? `, names from "${nf}"` : ''}).`);
        if (!got && !entries.length) throw new InputError(`Dataset ${dsId} has no VAT number values. Set "vatField" (tried: ${VAT_FIELDS.join(', ')}).`);
    }
    if (!entries.length) throw new InputError('Add at least one EU VAT number, e.g. "IE6388047V" or "DE 123 456 789", or pass a datasetId from another Actor run.');

    let requester = null;
    if (String(requesterVatNumber).trim()) {
        const r = parseVat(requesterVatNumber);
        if (!r.vatId || r.status) throw new InputError(`requesterVatNumber "${String(requesterVatNumber).slice(0, 30)}" is not a valid EU VAT number format (${r.error}). Leave it empty if you don't need consultation numbers.`);
        requester = r;
    }
    const capRaw = input.maxNumbers ?? input.maxItems ?? input.limit ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 5000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    const seen = new Set(); const targets = []; const localRows = []; let duplicates = 0;
    for (const e of entries) {
        const p = parseVat(e.raw, defaultCountry);
        const base = { input: e.raw.slice(0, 100), vatId: p.vatId ?? null, countryCode: p.country ?? null, countryName: COUNTRY_NAMES[p.country] ?? null, vatNumber: p.number ?? null, expectedName: e.expectedName };
        if (p.status) { localRows.push({ ...base, status: p.status, valid: p.status === 'invalid_format' ? false : null, error: p.error }); continue; }
        if (seen.has(p.vatId)) { duplicates++; continue; }
        seen.add(p.vatId); targets.push({ ...base, ...p });
    }
    const overCap = targets.length > cap ? targets.splice(cap) : [];
    if (overCap.length) log.warning(`maxNumbers is ${cap}: ${overCap.length} extra numbers were not checked.`);

    // Which member-state services are up right now (VIES relays to each country's own database).
    const down = new Set();
    try {
        const st = await gotScraping({ url: `${API}/check-status`, responseType: 'json', timeout: { request: 15000 }, throwHttpErrors: false, headers: { accept: 'application/json' } });
        for (const c of st.body?.countries ?? []) if (c.availability && c.availability !== 'Available') down.add(c.countryCode);
        if (down.size) log.warning(`VIES reports these member states unavailable now: ${[...down].join(', ')}. They will be retried once.`);
    } catch { /* status endpoint is advisory only */ }

    const charging = Actor.getChargingManager();
    const counts = {}; const skipped = []; let chargeLimitHit = false; const stats = { requests: 0, retries: 0 };
    const timeout = Math.max(5, Math.min(90, Number(requestTimeoutSecs) || 30)) * 1000;
    const perCountry = new Map(); const pc = Math.max(1, Math.min(5, Math.floor(Number(perCountryConcurrency) || 2)));
    async function withCountry(cc, fn) {
        while ((perCountry.get(cc) ?? 0) >= pc) await sleep(100);
        perCountry.set(cc, (perCountry.get(cc) ?? 0) + 1);
        try { return await fn(); } finally { perCountry.set(cc, perCountry.get(cc) - 1); }
    }
    async function vies(t, useRequester) {
        const body = { countryCode: t.country, vatNumber: t.number };
        if (useRequester && requester) Object.assign(body, { requesterMemberStateCode: requester.country, requesterNumber: requester.number });
        stats.requests++;
        const res = await gotScraping({ url: `${API}/check-vat-number`, method: 'POST', json: body, responseType: 'json', timeout: { request: timeout }, throwHttpErrors: false, retry: { limit: 0 }, headers: { accept: 'application/json' } });
        const b = res.body && typeof res.body === 'object' ? res.body : {};
        const code = b.errorWrappers?.[0]?.error ?? (res.statusCode >= 500 ? 'SERVICE_UNAVAILABLE' : res.statusCode >= 400 ? `HTTP_${res.statusCode}` : null);
        return { code, b };
    }
    async function check(t) {
        const tries = Math.max(0, Math.min(6, Number.isFinite(Number(maxRetries)) ? Math.floor(Number(maxRetries)) : 3));
        const attempts = down.has(t.country) ? 1 : tries + 1;
        let useReq = !!requester; let lastCode = null; let requesterNote = null;
        for (let a = 0; a < attempts; a++) {
            let r;
            try { r = await withCountry(t.country, () => vies(t, useReq)); } catch (e) { lastCode = 'TIMEOUT'; r = null; }
            if (r && !r.code && typeof r.b.valid === 'boolean') {
                const name = cleanField(r.b.name); const address = cleanField(r.b.address);
                return {
                    input: t.input, vatId: t.vatId, countryCode: t.country, countryName: t.countryName, vatNumber: t.number,
                    status: r.b.valid ? 'valid' : 'invalid', valid: r.b.valid, name, address,
                    addressLines: address ? address.split(/\n+/).map((x) => x.trim()).filter(Boolean) : [],
                    expectedName: t.expectedName, nameMatch: r.b.valid ? nameMatch(t.expectedName, name) : null,
                    consultationNumber: cleanField(r.b.requestIdentifier), requestDate: r.b.requestDate ?? null,
                    requesterNote, source: 'EU VIES', error: null, checkedAt: new Date().toISOString(),
                };
            }
            if (r) lastCode = r.code ?? 'UNEXPECTED_RESPONSE';
            if (lastCode === 'INVALID_INPUT') return { ...pub(t), status: 'invalid_format', valid: false, error: 'VIES rejected the number format for this country.' };
            if (lastCode === 'INVALID_REQUESTER_INFO' && useReq) { useReq = false; requesterNote = 'VIES rejected requesterVatNumber, so no consultation number was issued.'; a--; continue; }
            if (!RETRYABLE.has(lastCode) && !/^TIMEOUT|^HTTP_429/.test(lastCode)) break;
            if (a < attempts - 1) { stats.retries++; await sleep(Math.min(20000, 2000 * 2 ** a) + Math.random() * 1000); }
        }
        if (RETRYABLE.has(lastCode) || lastCode === 'HTTP_429') return { ...pub(t), status: 'service_unavailable', valid: null, error: `${t.countryName} VAT service did not answer (${lastCode}). Not charged. Run this number again later.` };
        return { ...pub(t), status: 'error', valid: null, error: `VIES error ${lastCode}.` };
    }
    const pub = (t) => ({ input: t.input, vatId: t.vatId, countryCode: t.country, countryName: t.countryName, vatNumber: t.number, expectedName: t.expectedName, checkedAt: new Date().toISOString() });

    async function save(row) {
        if (!CHARGED.has(row.status)) { counts[row.status] = (counts[row.status] ?? 0) + 1; await Actor.pushData(row); return; }
        if (chargeLimitHit) { skipped.push(row); return; }
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; skipped.push(row); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    let idx = 0; let done = 0;
    const conc = Math.max(1, Math.min(10, Math.floor(Number(concurrency) || 4)));
    const worker = async () => {
        while (idx < targets.length && !chargeLimitHit) {
            const t = targets[idx++];
            let row; try { row = await check(t); } catch (e) { row = { ...pub(t), status: 'error', valid: null, error: String(e.message).slice(0, 300) }; }
            await save(row);
            if (++done % 50 === 0) log.info(`Checked ${done}/${targets.length} VAT numbers`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, worker));
    const notChecked = [...skipped.map((r) => r.vatId), ...targets.slice(idx).map((t) => t.vatId)];
    for (const v of notChecked) await Actor.pushData({ vatId: v, status: 'skipped_charge_limit', valid: null, error: 'Not checked: the run reached the maximum cost you set. Raise the limit and run these again.', checkedAt: new Date().toISOString() });
    if (notChecked.length) counts.skipped_charge_limit = notChecked.length;
    for (const r of localRows) { counts[r.status] = (counts[r.status] ?? 0) + 1; await Actor.pushData({ ...r, checkedAt: new Date().toISOString() }); }

    const checked = (counts.valid ?? 0) + (counts.invalid ?? 0);
    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        numbersRequested: entries.length, uniqueChecked: checked, valid: counts.valid ?? 0, invalid: counts.invalid ?? 0, byStatus: counts, duplicatesSkipped: duplicates,
        notCheckedOverMaxNumbers: overCap.length, memberStatesUnavailable: [...down], consultationNumbers: !!requester, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null, requests: stats,
        zeroResultsReason: checked ? null : `No number got an answer from VIES: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See each row's status and error.`,
        finishedAt: new Date().toISOString(),
    };
    summary.nextSteps = [
        'Filter the dataset by status: "valid" numbers are registered for intra-EU trade today; "invalid" are not.',
        ...(counts.service_unavailable ? ['Re-run the service_unavailable numbers in a few minutes; member-state databases go offline for maintenance (not charged).'] : []),
        ...(requester ? [] : ['Need audit proof? Add requesterVatNumber (your own EU VAT number) to get a VIES consultation number per check.']),
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    const free = Object.entries(counts).filter(([k]) => !CHARGED.has(k));
    await Actor.exit(`${checked ? '' : '0 checked: '}Checked ${checked} VAT numbers in VIES (${counts.valid ?? 0} valid, ${counts.invalid ?? 0} invalid)${free.length ? `; ${free.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}${duplicates ? `; ${duplicates} duplicates skipped` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
