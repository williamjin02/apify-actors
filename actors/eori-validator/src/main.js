import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseEori, soapRequest, parseSoap, parseHmrc, nameMatch, COUNTRY_NAMES } from './eori.js';

const EVENT = 'eori-checked';
const EU_API = 'https://ec.europa.eu/taxation_customs/dds2/eos/validation/services/validation';
const HMRC_API = 'https://api.service.hmrc.gov.uk/customs/eori/lookup/check-multiple-eori';
const CHARGED = new Set(['valid', 'invalid']);
const EORI_FIELDS = ['eori', 'eoriNumber', 'EORI', 'eori_number', 'eoriNo', 'customsId'];
const NAME_FIELDS = ['companyName', 'name', 'company', 'legalName', 'traderName', 'businessName'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
class InputError extends Error {}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const { defaultCountry = '', maxRetries = 3, requestTimeoutSecs = 30 } = input;
    const raw = input.eoriNumbers ?? input.eoris ?? input.numbers ?? [];
    const entries = [];
    for (const v of Array.isArray(raw) ? raw : String(raw).split(/[\n;]+/)) {
        if (v && typeof v === 'object') { entries.push({ raw: String(v.eori ?? v.eoriNumber ?? ''), expectedName: v.companyName ?? v.name ?? null }); continue; }
        const str = String(v ?? '').trim(); if (!str) continue;
        const [num, ...name] = str.split('|');
        entries.push({ raw: num.trim(), expectedName: name.join('|').trim() || null });
    }
    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const max = Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000));
        let ef = String(input.eoriField || '').trim() || null; let nf = String(input.nameField || '').trim() || null; let offset = 0; let got = 0;
        while (got < max) {
            let page;
            try { page = await Actor.newClient().dataset(dsId).listItems({ offset, limit: 1000, clean: true }); } catch (e) { throw new InputError(`Could not read dataset ${dsId}: ${e.message}. Use the dataset ID of a run you can access.`); }
            const items = page.items ?? []; if (!items.length) break;
            ef ||= EORI_FIELDS.find((f) => items.some((it) => String(getPath(it, f) ?? '').trim())) ?? null;
            nf ||= NAME_FIELDS.find((f) => items.some((it) => typeof getPath(it, f) === 'string')) ?? null;
            if (!ef) break;
            for (const it of items) { const val = String(getPath(it, ef) ?? '').trim(); if (val) { entries.push({ raw: val, expectedName: nf ? String(getPath(it, nf) ?? '').trim() || null : null }); got++; } if (got >= max) break; }
            offset += items.length; if (items.length < 1000) break;
        }
        log.info(`Read ${got} EORI numbers from dataset ${dsId} (field "${ef ?? 'none found'}").`);
        if (!got && !entries.length) throw new InputError(`Dataset ${dsId} has no EORI values. Set "eoriField" (tried: ${EORI_FIELDS.join(', ')}).`);
    }
    if (!entries.length) throw new InputError('Add at least one EORI number, e.g. "DE1234567" or "GB123456789000", or pass a datasetId from another Actor run.');

    const capRaw = input.maxNumbers ?? input.maxItems ?? input.limit ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 5000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    const seen = new Set(); const targets = []; const localRows = []; let duplicates = 0;
    for (const e of entries) {
        const p = parseEori(e.raw, defaultCountry);
        const base = { input: e.raw.slice(0, 100), eori: p.eori ?? null, countryCode: p.country ?? null, countryName: COUNTRY_NAMES[p.country] ?? null, expectedName: e.expectedName };
        if (p.status) { localRows.push({ ...base, status: p.status, valid: p.status === 'invalid_format' ? false : null, error: p.error }); continue; }
        if (seen.has(p.eori)) { duplicates++; continue; }
        seen.add(p.eori); targets.push({ ...base, source: p.source });
    }
    const overCap = targets.length > cap ? targets.splice(cap) : [];
    if (overCap.length) log.warning(`maxNumbers is ${cap}: ${overCap.length} extra numbers were not checked.`);

    const timeout = Math.max(5, Math.min(90, Number(requestTimeoutSecs) || 30)) * 1000;
    const tries = Math.max(0, Math.min(6, Number.isFinite(Number(maxRetries)) ? Math.floor(Number(maxRetries)) : 3)) + 1;
    const stats = { requests: 0, retries: 0 };
    async function callEu(batch) {
        let last = null;
        for (let a = 0; a < tries; a++) {
            try {
                stats.requests++;
                const res = await gotScraping({ url: EU_API, method: 'POST', body: soapRequest(batch.map((t) => t.eori)), headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: '""' }, timeout: { request: timeout }, throwHttpErrors: false, retry: { limit: 0 } });
                const parsed = parseSoap(String(res.body ?? ''));
                if (res.statusCode < 500 && Object.keys(parsed.results).length) return { results: parsed.results, requestDate: parsed.requestDate };
                last = parsed.error || `HTTP ${res.statusCode}`;
            } catch (e) { last = `TIMEOUT/${e.code ?? e.message}`; }
            if (a < tries - 1) { stats.retries++; await sleep(Math.min(20000, 1500 * 2 ** a) + Math.random() * 500); }
        }
        return { error: last };
    }
    async function callHmrc(batch) {
        let last = null;
        for (let a = 0; a < tries; a++) {
            try {
                stats.requests++;
                const res = await gotScraping({ url: HMRC_API, method: 'POST', json: { eoris: batch.map((t) => t.eori) }, responseType: 'json', headers: { accept: 'application/vnd.hmrc.1.0+json' }, timeout: { request: timeout }, throwHttpErrors: false, retry: { limit: 0 } });
                if (res.statusCode === 200 && Array.isArray(res.body)) return { results: parseHmrc(res.body) };
                last = `HTTP ${res.statusCode}${res.body?.message ? ` ${String(res.body.message).slice(0, 120)}` : ''}`;
                if (res.statusCode === 400) break;
            } catch (e) { last = `TIMEOUT/${e.code ?? e.message}`; }
            if (a < tries - 1) { stats.retries++; await sleep(Math.min(20000, 1500 * 2 ** a) + Math.random() * 500); }
        }
        return { error: last };
    }

    const charging = Actor.getChargingManager();
    const counts = {}; const skipped = []; let chargeLimitHit = false;
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
    const batches = [];
    for (const src of ['eu', 'hmrc']) { const list = targets.filter((t) => t.source === src); for (let i = 0; i < list.length; i += 10) batches.push({ src, items: list.slice(i, i + 10) }); }
    let processed = 0;
    for (const b of batches) {
        if (chargeLimitHit) { skipped.push(...b.items); continue; }
        const r = b.src === 'eu' ? await callEu(b.items) : await callHmrc(b.items);
        for (const t of b.items) {
            const hit = r.results?.[t.eori];
            const common = { input: t.input, eori: t.eori, countryCode: t.countryCode, countryName: t.countryName, expectedName: t.expectedName, source: b.src === 'eu' ? 'EU EOS (European Commission)' : 'HMRC (UK)', checkedAt: new Date().toISOString() };
            let row;
            if (hit && typeof hit.valid === 'boolean') {
                const address = hit.address ?? ([hit.street, hit.postalCode, hit.city, hit.country].filter(Boolean).join(', ') || null);
                row = { ...common, status: hit.valid ? 'valid' : 'invalid', valid: hit.valid, name: hit.name, address, street: hit.street, postalCode: hit.postalCode, city: hit.city,
                    nameMatch: hit.valid ? nameMatch(t.expectedName, hit.name) : null, namePublished: !!hit.name, requestDate: r.requestDate ?? hit.processingDate ?? null, error: hit.valid ? null : (hit.errorReason || hit.statusDescr || null) };
            } else if (r.error) {
                row = { ...common, status: 'service_unavailable', valid: null, error: `${common.source} did not answer (${String(r.error).slice(0, 160)}). Not charged. Run this number again later.` };
            } else {
                row = { ...common, status: 'error', valid: null, error: 'The service answered but did not return this number. Not charged.' };
            }
            await save(row);
        }
        processed += b.items.length;
        if (processed % 100 < 10) log.info(`Checked ${processed}/${targets.length} EORI numbers`);
        await sleep(250);
    }
    for (const t of skipped) await Actor.pushData({ eori: t.eori, status: 'skipped_charge_limit', valid: null, error: 'Not checked: the run reached the maximum cost you set. Raise the limit and run these again.', checkedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    for (const r of localRows) { counts[r.status] = (counts[r.status] ?? 0) + 1; await Actor.pushData({ ...r, checkedAt: new Date().toISOString() }); }

    const checked = (counts.valid ?? 0) + (counts.invalid ?? 0);
    const dsOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        numbersRequested: entries.length, uniqueChecked: checked, valid: counts.valid ?? 0, invalid: counts.invalid ?? 0, byStatus: counts, duplicatesSkipped: duplicates,
        notCheckedOverMaxNumbers: overCap.length, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null, requests: stats,
        zeroResultsReason: checked ? null : `No number got an answer: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See each row's status and error.`,
        finishedAt: new Date().toISOString(),
    };
    summary.nextSteps = [
        'Filter by status: "valid" EORI numbers are registered for customs today; "invalid" are not (or have expired).',
        'Names and addresses appear only when the trader agreed to publish them; otherwise namePublished is false.',
        ...(counts.service_unavailable ? ['Re-run the service_unavailable numbers later (not charged).'] : []),
        'Also need VAT checks? Run swillz/eu-vat-validator with the same companies.',
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    const free = Object.entries(counts).filter(([k]) => !CHARGED.has(k));
    await Actor.exit(`${checked ? '' : '0 checked: '}Checked ${checked} EORI numbers (${counts.valid ?? 0} valid, ${counts.invalid ?? 0} invalid)${free.length ? `; ${free.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}${duplicates ? `; ${duplicates} duplicates skipped` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
