import { Actor, log } from 'apify';
import { listOf, pad10, pickTaxonomy, reportPeriods, periodWindows, buildRow, addGrowth, filingUrl, resolveCompany, METRIC_NAMES } from './sec.js';

const EVENT = 'financial-period';
// SEC fair-access policy: declare who you are, stay well under 10 requests/second.
const UA = 'SwillzDataTools/0.1 (Apify actor swillz/sec-company-financials; +https://apify.com/swillz/sec-company-financials)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}
class ServiceError extends Error {}
class NotFound extends Error {}

let lastCall = 0;
async function getJson(url, { tries = 4 } = {}) {
    let last;
    for (let a = 0; a < tries; a++) {
        const wait = lastCall + 150 - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now();
        try {
            const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', 'accept-encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) });
            if (res.ok) return await res.json();
            if (res.status === 404) throw new NotFound(url);
            last = `HTTP ${res.status}`;
        } catch (e) { if (e instanceof NotFound) throw e; last = e.name === 'TimeoutError' ? 'timeout' : e.message; }
        if (a < tries - 1) await sleep(2000 * 2 ** a);
    }
    throw new ServiceError(`SEC EDGAR did not answer (${last}).`);
}

await Actor.init();
try {
    const t0 = Date.now();
    const input = (await Actor.getInput()) ?? {};
    const companies = [...new Set(listOf(input.companies ?? input.tickers ?? input.company ?? input.ticker ?? input.query))].slice(0, 500);
    if (!companies.length) throw new InputError('Add at least one company in "companies": a ticker ("AAPL"), a CIK ("320193") or a company name ("Microsoft").');
    const period = ['annual', 'quarterly', 'both'].includes(input.period) ? input.period : 'annual';
    const years = Math.max(1, Math.min(30, Math.floor(Number(input.years ?? 5)) || 5));
    const fyFrom = Number(input.fiscalYearFrom) || null; const fyTo = Number(input.fiscalYearTo) || null;
    if (fyFrom && fyTo && fyFrom > fyTo) throw new InputError(`fiscalYearFrom (${fyFrom}) is after fiscalYearTo (${fyTo}).`);
    const includeSources = input.includeSources === true;
    const statusRows = input.includeStatusRows !== false;

    const tickers = await getJson('https://www.sec.gov/files/company_tickers.json');
    const rows = Object.values(tickers).map((r) => ({ cik: Number(r.cik_str), ticker: r.ticker, title: r.title }));

    const charging = Actor.getChargingManager();
    const counts = {}; let charged = 0; let chargeLimitHit = false;
    const perCompany = []; const seenCik = new Map();
    const now = () => new Date().toISOString();
    async function free(row) { counts[row.status] = (counts[row.status] ?? 0) + 1; if (statusRows) await Actor.pushData({ type: 'status', ...row, checkedAt: now() }); }
    async function paid(row) {
        if (chargeLimitHit) return false;
        const allowed = charging?.calculateMaxEventChargeCountWithinLimit(EVENT);
        if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return false; }
        counts.found = (counts.found ?? 0) + 1; charged++;
        const r = await Actor.pushData({ type: 'financials', ...row, status: 'found', checkedAt: now() }, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        return true;
    }

    for (const q of companies) {
        if (chargeLimitHit) { await free({ query: q, status: 'skipped_charge_limit', error: 'Skipped: the run reached the maximum cost you set (maxTotalChargeUsd). Not charged.' }); continue; }
        const res = resolveCompany(q, rows);
        if (!res.match) {
            if (res.candidates?.length) await free({ query: q, status: 'ambiguous', candidates: res.candidates, error: `"${q}" matches several SEC filers. Re-run with one of the tickers or CIKs in candidates. Not charged.` });
            else await free({ query: q, status: 'not_found', error: `No SEC filer matches "${q}". Use a US-listed ticker (e.g. "AAPL"), a CIK, or the legal name as filed with the SEC. Private companies do not file financials. Not charged.` });
            perCompany.push({ query: q, status: res.candidates?.length ? 'ambiguous' : 'not_found', rows: 0 });
            continue;
        }
        const cik = res.match.cik;
        if (seenCik.has(cik)) { await free({ query: q, cik, ticker: res.match.ticker, companyName: res.match.title, status: 'duplicate', error: `Same company as "${seenCik.get(cik)}" earlier in this run; returned once. Not charged.` }); perCompany.push({ query: q, cik, status: 'duplicate', rows: 0 }); continue; }
        seenCik.set(cik, q);
        let facts; let sub = null;
        try {
            facts = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`);
            sub = await getJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`).catch(() => null);
        } catch (e) {
            if (e instanceof NotFound) { await free({ query: q, cik, ticker: res.match.ticker, companyName: res.match.title, status: 'no_xbrl_data', error: 'This filer has no XBRL financial data on SEC EDGAR (e.g. funds, trusts, very new or non-reporting filers). Not charged.' }); perCompany.push({ query: q, cik, status: 'no_xbrl_data', rows: 0 }); continue; }
            await free({ query: q, cik, status: 'service_unavailable', error: `${e.message} Try again later. Not charged.` }); perCompany.push({ query: q, cik, status: 'service_unavailable', rows: 0 }); continue;
        }
        const tx = pickTaxonomy(facts);
        const company = { query: q, cik, ticker: res.match.ticker ?? sub?.tickers?.[0] ?? null, companyName: facts.entityName ?? sub?.name ?? res.match.title,
            exchange: sub?.exchanges?.[0] ?? null, sic: sub?.sic ?? null, sicDescription: sub?.sicDescription ?? null, fiscalYearEnd: sub?.fiscalYearEnd ?? null, stateOfIncorporation: sub?.stateOfIncorporation ?? null, filerCategory: sub?.category ?? null };
        if (!tx) { await free({ ...company, status: 'no_xbrl_data', error: 'No us-gaap or IFRS financial statement data in this filer\'s XBRL. Not charged.' }); perCompany.push({ query: q, cik, status: 'no_xbrl_data', rows: 0 }); continue; }
        const periods = reportPeriods(facts, tx);
        const w = periodWindows(facts, tx, periods);
        const pick = (list, n) => {
            let l = list;
            if (fyFrom || fyTo) l = l.filter((x) => (!fyFrom || x.fiscalYear >= fyFrom) && (!fyTo || x.fiscalYear <= fyTo));
            else l = l.slice(-n);
            return l;
        };
        // Build all rows of each type first (growth needs the prior year), then keep the requested window.
        let out = [];
        if (period !== 'quarterly') { const all = addGrowth(w.annual.map((x) => buildRow(facts, tx, x, { includeSources }))); const keep = new Set(pick(w.annual, years).map((x) => x.end)); out.push(...all.filter((r) => keep.has(r.periodEnd))); }
        if (period !== 'annual') { const all = addGrowth(w.quarterly.map((x) => buildRow(facts, tx, x, { includeSources }))); const keep = new Set(pick(w.quarterly, years * 4).map((x) => x.end)); out.push(...all.filter((r) => keep.has(r.periodEnd))); }
        out = out.filter((r) => r.metricsFound > 0).sort((a, b) => (a.periodEnd === b.periodEnd ? (a.periodType < b.periodType ? -1 : 1) : (a.periodEnd < b.periodEnd ? 1 : -1)));
        if (!out.length) {
            const why = period === 'quarterly' && !w.quarterly.length && w.annual.length ? 'This filer reports annually only (e.g. 20-F/40-F foreign issuers). Use period "annual".' : `No ${period === 'both' ? '' : `${period} `}periods in the requested range${fyFrom || fyTo ? ` (fiscal years ${fyFrom ?? '…'}–${fyTo ?? '…'})` : ''}.`;
            await free({ ...company, status: 'no_periods', error: `${why} Not charged.` }); perCompany.push({ query: q, cik, status: 'no_periods', rows: 0 }); continue;
        }
        let n = 0;
        for (const r of out) {
            const ok = await paid({ ...company, ...r, filingUrl: filingUrl(cik, r.accessionNumber), secFactsUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json` });
            if (!ok) break; n++;
        }
        if (n < out.length) await free({ ...company, status: 'skipped_charge_limit', error: `Returned ${n} of ${out.length} periods before reaching your maximum cost (maxTotalChargeUsd). Not charged.` });
        perCompany.push({ query: q, cik, ticker: company.ticker, companyName: company.companyName, taxonomy: tx.tax, currency: tx.currency, rows: n, latestPeriodEnd: out[0]?.periodEnd ?? null });
        log.info(`${q}: ${n} ${period} period(s) for ${company.companyName} (CIK ${cik}).`);
    }

    const ds = await Actor.openDataset(); const dsOut = ds.id ?? 'default';
    const summary = {
        companies: companies.length, periodsReturned: charged, period, years, fiscalYearFrom: fyFrom, fiscalYearTo: fyTo, byStatus: counts, perCompany, metrics: METRIC_NAMES, chargeLimitReached: chargeLimitHit,
        seconds: Math.round((Date.now() - t0) / 1000),
        zeroResultsReason: charged ? null : `No periods returned: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing matched'}. See each status row's error.`,
        nextSteps: [
            'Data comes from SEC EDGAR XBRL (data.sec.gov companyfacts). Values are as tagged by the company; check filingUrl for the full statements.',
            'derivedMetrics lists values computed by subtraction (e.g. Q4 = full year minus nine months, or quarterly cash flow from year-to-date figures).',
            'Check public-sector revenue with swillz/federal-awards-by-company and the legal entity with swillz/lei-lookup.',
            `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsOut}"}`,
        ],
        finishedAt: now(),
    };
    await Actor.setValue('OUTPUT', summary);
    const freeN = Object.entries(counts).filter(([k]) => k !== 'found');
    await Actor.exit(`${charged ? '' : '0 periods: '}Returned ${charged} financial ${charged === 1 ? 'period' : 'periods'} for ${companies.length} ${companies.length === 1 ? 'company' : 'companies'}${freeN.length ? `; ${freeN.map(([k, v]) => `${v} ${k}`).join(', ')} not charged` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); } else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
