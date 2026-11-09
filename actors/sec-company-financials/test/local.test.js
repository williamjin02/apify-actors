import assert from 'node:assert/strict';
import { listOf, pad10, pickTaxonomy, reportPeriods, periodWindows, buildRow, addGrowth, metricValue, filingUrl, resolveCompany, METRIC_NAMES, days, addDays } from '../src/sec.js';
let pass = 0; let fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const F = (start, end, val, accn, fy, fp, form, filed) => ({ ...(start ? { start } : {}), end, val, accn, fy, fp, form, filed });
// Synthetic filer: FY ends Dec 31. 10-K FY2025 (with FY2024 comparatives), 10-Qs for 2026 Q1-Q3 with YTD cash flow.
const facts = { cik: 1, entityName: 'Example Corp', facts: { 'us-gaap': {
    Revenues: { units: { USD: [
        F('2024-01-01', '2024-12-31', 1000, 'k24', 2024, 'FY', '10-K', '2025-02-10'), F('2024-01-01', '2024-12-31', 1000, 'k25', 2025, 'FY', '10-K', '2026-02-10'),
        F('2025-01-01', '2025-12-31', 1200, 'k25', 2025, 'FY', '10-K', '2026-02-10'),
        F('2025-01-01', '2025-09-30', 870, 'q325', 2025, 'Q3', '10-Q', '2025-11-01'),
        F('2026-01-01', '2026-03-31', 330, 'q126', 2026, 'Q1', '10-Q', '2026-05-01'),
        F('2026-04-01', '2026-06-30', 340, 'q226', 2026, 'Q2', '10-Q', '2026-08-01'), F('2026-01-01', '2026-06-30', 670, 'q226', 2026, 'Q2', '10-Q', '2026-08-01'),
        F('2026-07-01', '2026-09-30', 360, 'q326', 2026, 'Q3', '10-Q', '2026-11-01'),
        F('2025-07-01', '2025-09-30', 300, 'q325', 2025, 'Q3', '10-Q', '2025-11-01')] } },
    CostOfRevenue: { units: { USD: [F('2025-01-01', '2025-12-31', 700, 'k25', 2025, 'FY', '10-K', '2026-02-10')] } },
    NetIncomeLoss: { units: { USD: [F('2025-01-01', '2025-12-31', 120, 'k25', 2025, 'FY', '10-K', '2026-02-10'), F('2024-01-01', '2024-12-31', 90, 'k24', 2024, 'FY', '10-K', '2025-02-10'), F('2024-01-01', '2024-12-31', 95, 'k25', 2025, 'FY', '10-K', '2026-02-10'),
        F('2026-01-01', '2026-03-31', 30, 'q126', 2026, 'Q1', '10-Q', '2026-05-01'), F('2026-04-01', '2026-06-30', 31, 'q226', 2026, 'Q2', '10-Q', '2026-08-01'), F('2026-07-01', '2026-09-30', 33, 'q326', 2026, 'Q3', '10-Q', '2026-11-01'),
        F('2025-07-01', '2025-09-30', 28, 'q325', 2025, 'Q3', '10-Q', '2025-11-01'), F('2025-01-01', '2025-09-30', 85, 'q325', 2025, 'Q3', '10-Q', '2025-11-01')] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [F('2026-01-01', '2026-03-31', 50, 'q126', 2026, 'Q1', '10-Q', '2026-05-01'), F('2026-01-01', '2026-06-30', 110, 'q226', 2026, 'Q2', '10-Q', '2026-08-01'), F('2026-01-01', '2026-09-30', 180, 'q326', 2026, 'Q3', '10-Q', '2026-11-01')] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [F('2025-01-01', '2025-12-31', 1.2, 'k25', 2025, 'FY', '10-K', '2026-02-10')] } },
    Assets: { units: { USD: [F(null, '2025-12-31', 5000, 'k25', 2025, 'FY', '10-K', '2026-02-10'), F(null, '2024-12-31', 4500, 'k25', 2025, 'FY', '10-K', '2026-02-10'), F(null, '2024-12-31', 4500, 'k24', 2024, 'FY', '10-K', '2025-02-10'), F(null, '2026-09-30', 5400, 'q326', 2026, 'Q3', '10-Q', '2026-11-01'), F(null, '2026-03-31', 5100, 'q126', 2026, 'Q1', '10-Q', '2026-05-01'), F(null, '2026-06-30', 5200, 'q226', 2026, 'Q2', '10-Q', '2026-08-01'), F(null, '2025-09-30', 4900, 'q325', 2025, 'Q3', '10-Q', '2025-11-01')] } },
    LiabilitiesAndStockholdersEquity: { units: { USD: [F(null, '2025-12-31', 5000, 'k25', 2025, 'FY', '10-K', '2026-02-10')] } },
    StockholdersEquity: { units: { USD: [F(null, '2025-12-31', 2000, 'k25', 2025, 'FY', '10-K', '2026-02-10')] } },
    NetIncomeLossAmended: { units: { USD: [F('2025-01-01', '2025-12-31', 1, 'a', 2025, 'FY', '10-K/A', '2026-03-01')] } },
} } };
const tx = pickTaxonomy(facts);
const per = reportPeriods(facts, tx);
const w = periodWindows(facts, tx, per);
await t('helpers', () => { assert.deepEqual(listOf('AAPL, msft\n320193'), ['AAPL', 'msft', '320193']); assert.equal(pad10(320193), '0000320193'); assert.equal(days('2026-01-01', '2026-03-31'), 89); assert.equal(addDays('2026-01-01', -1), '2025-12-31'); });
await t('taxonomy and currency', () => { assert.deepEqual(tx, { tax: 'us-gaap', key: 'gaap', currency: 'USD' }); assert.equal(pickTaxonomy({ facts: {} }), null);
    assert.deepEqual(pickTaxonomy({ facts: { 'ifrs-full': { Revenue: { units: { TWD: [{}, {}], USD: [{}] } } } } }), { tax: 'ifrs-full', key: 'ifrs', currency: 'TWD' }); });
await t('report periods use original filings', () => {
    assert.deepEqual(per.map((p) => `${p.end}:${p.form}:${p.accn}`), ['2024-12-31:10-K:k24', '2025-09-30:10-Q:q325', '2025-12-31:10-K:k25', '2026-03-31:10-Q:q126', '2026-06-30:10-Q:q226', '2026-09-30:10-Q:q326']);
});
await t('annual windows and fiscal year', () => { assert.deepEqual(w.annual.map((a) => [a.start, a.end, a.fiscalYear, a.fiscalPeriod]), [['2024-01-01', '2024-12-31', 2024, 'FY'], ['2025-01-01', '2025-12-31', 2025, 'FY']]); });
await t('quarter windows incl. Q4 from 10-K', () => {
    const q = w.quarterly.map((x) => `${x.fiscalYear}${x.fiscalPeriod}:${x.start}..${x.end}`);
    assert.ok(q.includes('2025Q4:2025-10-01..2025-12-31')); assert.ok(q.includes('2026Q2:2026-04-01..2026-06-30')); assert.ok(q.includes('2026Q1:2026-01-01..2026-03-31'));
});
await t('annual row values, restated latest value, derived liabilities and margins', () => {
    const rows = addGrowth(w.annual.map((x) => buildRow(facts, tx, x, { includeSources: true })));
    const r = rows.find((x) => x.fiscalYear === 2025); const p = rows.find((x) => x.fiscalYear === 2024);
    assert.equal(r.revenue, 1200); assert.equal(r.costOfRevenue, 700); assert.equal(r.grossProfit, 500); assert.ok(r.derivedMetrics.includes('grossProfit'));
    assert.equal(r.totalLiabilities, 3000); assert.ok(r.derivedMetrics.includes('totalLiabilities')); assert.equal(r.grossMargin, 0.4167); assert.equal(r.netMargin, 0.1); assert.equal(r.epsDiluted, 1.2);
    assert.equal(r.revenueGrowthYoY, 0.2); assert.equal(p.netIncome, 95); assert.equal(p.restated, true); assert.equal(r.sources.revenue, 'Revenues'); assert.equal(r.accessionNumber, 'k25'); assert.equal(r.currency, 'USD');
    for (const m of METRIC_NAMES) assert.ok(m in r, `missing ${m}`);
});
await t('Q4 derived = FY - 9M; quarterly cash flow from YTD', () => {
    const q4 = buildRow(facts, tx, w.quarterly.find((x) => x.fiscalPeriod === 'Q4' && x.fiscalYear === 2025));
    assert.equal(q4.revenue, 330); assert.equal(q4.netIncome, 35); assert.ok(q4.derivedMetrics.includes('revenue')); assert.equal(q4.epsDiluted, null);
    const q2 = buildRow(facts, tx, w.quarterly.find((x) => x.fiscalPeriod === 'Q2' && x.fiscalYear === 2026));
    assert.equal(q2.operatingCashFlow, 60); assert.ok(q2.derivedMetrics.includes('operatingCashFlow')); assert.equal(q2.revenue, 340); assert.ok(!q2.derivedMetrics.includes('revenue'));
    const q3 = buildRow(facts, tx, w.quarterly.find((x) => x.fiscalPeriod === 'Q3' && x.fiscalYear === 2026)); assert.equal(q3.operatingCashFlow, 70);
});
await t('quarterly YoY growth matches same quarter last year', () => {
    const rows = addGrowth(w.quarterly.map((x) => buildRow(facts, tx, x)));
    const q3 = rows.find((r) => r.fiscalYear === 2026 && r.fiscalPeriod === 'Q3'); assert.equal(q3.revenueGrowthYoY, 0.2);
});
await t('missing metric -> null, never throws', () => { assert.equal(metricValue(facts, tx, 'longTermDebt', w.annual[1]), null); });
await t('filing URL', () => { assert.equal(filingUrl(320193, '0000320193-26-000026'), 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/0000320193-26-000026-index.htm'); assert.equal(filingUrl(1, null), null); });
const rows = [{ cik: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, { cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' }, { cik: 1067983, ticker: 'BRK-B', title: 'BERKSHIRE HATHAWAY INC' }, { cik: 1067983, ticker: 'BRK-A', title: 'BERKSHIRE HATHAWAY INC' },
    { cik: 70858, ticker: 'BAC', title: 'BANK OF AMERICA CORP /DE/' }, { cik: 72971, ticker: 'WFC', title: 'WELLS FARGO & COMPANY/MN' }, { cik: 2, ticker: 'BK', title: 'Bank of New York Mellon Corp' }];
await t('resolve ticker, CIK, name, class shares, ambiguity', () => {
    assert.equal(resolveCompany('aapl', rows).match.cik, 320193); assert.equal(resolveCompany('$MSFT', rows).match.cik, 789019); assert.equal(resolveCompany('BRK.B', rows).match.cik, 1067983);
    assert.equal(resolveCompany('320193', rows).match.ticker, 'AAPL'); assert.equal(resolveCompany('0000789019', rows).how, 'cik');
    assert.equal(resolveCompany('Microsoft Corporation', rows).match.cik, 789019); assert.equal(resolveCompany('Apple', rows).match.cik, 320193); assert.equal(resolveCompany('Wells Fargo', rows).match.cik, 72971);
    const amb = resolveCompany('bank of', rows); assert.equal(amb.match, null); assert.equal(amb.candidates.length, 2);
    const nf = resolveCompany('zzzz nothing here', rows); assert.equal(nf.match, null); assert.equal(nf.candidates.length, 0);
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
