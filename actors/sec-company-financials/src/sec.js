// Pure helpers for SEC EDGAR XBRL "companyfacts" JSON (data.sec.gov, public domain, no key).
export const listOf = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]+/)).map((s) => String(s ?? '').trim()).filter(Boolean);
export const pad10 = (cik) => String(cik).replace(/\D/g, '').padStart(10, '0');

// metric -> { kind: 'flow' (duration) | 'instant' | 'perShare', gaap: [...concepts], ifrs: [...concepts] }. First concept with a value for the period wins.
export const METRICS = {
    revenue: { kind: 'flow', gaap: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'OperatingLeasesIncomeStatementLeaseRevenue'], ifrs: ['Revenue', 'RevenueFromContractsWithCustomers'] },
    costOfRevenue: { kind: 'flow', gaap: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices'], ifrs: ['CostOfSales'] },
    grossProfit: { kind: 'flow', gaap: ['GrossProfit'], ifrs: ['GrossProfit'] },
    researchAndDevelopment: { kind: 'flow', gaap: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], ifrs: ['ResearchAndDevelopmentExpense'] },
    sellingGeneralAdmin: { kind: 'flow', gaap: ['SellingGeneralAndAdministrativeExpense'], ifrs: ['SellingGeneralAndAdministrativeExpense'] },
    operatingIncome: { kind: 'flow', gaap: ['OperatingIncomeLoss'], ifrs: ['ProfitLossFromOperatingActivities'] },
    netIncome: { kind: 'flow', gaap: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'], ifrs: ['ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'] },
    epsBasic: { kind: 'perShare', gaap: ['EarningsPerShareBasic', 'EarningsPerShareBasicAndDiluted'], ifrs: ['BasicEarningsLossPerShare'] },
    epsDiluted: { kind: 'perShare', gaap: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], ifrs: ['DilutedEarningsLossPerShare'] },
    dilutedSharesWeighted: { kind: 'shares', gaap: ['WeightedAverageNumberOfDilutedSharesOutstanding'], ifrs: ['AdjustedWeightedAverageShares'] },
    operatingCashFlow: { kind: 'flow', gaap: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], ifrs: ['CashFlowsFromUsedInOperatingActivities'] },
    capitalExpenditure: { kind: 'flow', gaap: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], ifrs: ['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PurchaseOfPropertyPlantAndEquipment'] },
    cashAndEquivalents: { kind: 'instant', gaap: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'], ifrs: ['CashAndCashEquivalents'] },
    totalAssets: { kind: 'instant', gaap: ['Assets'], ifrs: ['Assets'] },
    totalLiabilities: { kind: 'instant', gaap: ['Liabilities'], ifrs: ['Liabilities'] },
    stockholdersEquity: { kind: 'instant', gaap: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], ifrs: ['EquityAttributableToOwnersOfParent', 'Equity'] },
    longTermDebt: { kind: 'instant', gaap: ['LongTermDebtNoncurrent', 'LongTermDebt'], ifrs: ['NoncurrentPortionOfNoncurrentBorrowings', 'NoncurrentBorrowings'] },
};
export const METRIC_NAMES = Object.keys(METRICS);
const ANNUAL_FORMS = new Set(['10-K', '10-KT', '20-F', '40-F', '10-K405']);
const QUARTER_FORMS = new Set(['10-Q', '10-QT']);
const base = (f) => String(f ?? '').replace(/\/A$/, '');
const DAY = 86400000;
export const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

/** Pick the taxonomy (us-gaap, else ifrs-full) and the reporting currency. */
export function pickTaxonomy(facts) {
    const f = facts?.facts ?? {};
    const gaapN = Object.keys(f['us-gaap'] ?? {}).length; const ifrsN = Object.keys(f['ifrs-full'] ?? {}).length;
    if (!gaapN && !ifrsN) return null;
    const tax = gaapN >= ifrsN ? 'us-gaap' : 'ifrs-full';
    const counts = {};
    for (const c of Object.values(f[tax])) for (const [u, arr] of Object.entries(c.units ?? {})) if (/^[A-Z]{3}$/.test(u)) counts[u] = (counts[u] ?? 0) + arr.length;
    const currency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
    return { tax, key: tax === 'us-gaap' ? 'gaap' : 'ifrs', currency };
}

function unitsFor(kind, currency) { return kind === 'perShare' ? [`${currency}/shares`] : kind === 'shares' ? ['shares'] : [currency]; }

/** All facts for a concept in the right unit, each tagged with the concept name. */
function factsOf(facts, tax, concept, kind, currency) {
    const c = facts.facts?.[tax]?.[concept]; if (!c) return [];
    for (const u of unitsFor(kind, currency)) if (c.units?.[u]) return c.units[u].map((x) => ({ ...x, concept }));
    return [];
}

/** Reporting periods (one per original 10-K/10-Q/20-F/40-F filing): end date, fy, fp, form, accn, filed. */
export function reportPeriods(facts, tx) {
    const probe = ['netIncome', 'revenue', 'totalAssets', 'operatingIncome', 'stockholdersEquity'];
    const byAccn = new Map();
    for (const m of probe) for (const concept of METRICS[m][tx.key]) for (const x of factsOf(facts, tx.tax, concept, METRICS[m].kind, tx.currency)) {
        const form = base(x.form); if (!ANNUAL_FORMS.has(form) && !QUARTER_FORMS.has(form)) continue;
        if (String(x.form).endsWith('/A')) continue;
        const p = byAccn.get(x.accn);
        if (!p || x.end > p.end) byAccn.set(x.accn, { end: x.end, fy: x.fy ?? null, fp: x.fp ?? null, form: x.form, accn: x.accn, filed: x.filed });
    }
    // One period per end date (earliest filing wins = the original report for that period).
    const byEnd = new Map();
    for (const p of byAccn.values()) { const q = byEnd.get(p.end); if (!q || p.filed < q.filed) byEnd.set(p.end, p); }
    return [...byEnd.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
}

/** Build annual and quarterly windows [start, end] from report periods + duration facts. */
export function periodWindows(facts, tx, periods) {
    const flows = [];
    for (const m of ['revenue', 'netIncome', 'operatingIncome', 'operatingCashFlow']) for (const concept of METRICS[m][tx.key]) flows.push(...factsOf(facts, tx.tax, concept, 'flow', tx.currency));
    const startsFor = (end, lo, hi) => flows.filter((x) => x.start && x.end === end && days(x.start, x.end) >= lo && days(x.start, x.end) <= hi).map((x) => x.start);
    const annual = []; const quarterly = [];
    const annualP = periods.filter((p) => ANNUAL_FORMS.has(base(p.form)));
    for (const p of annualP) {
        const s = startsFor(p.end, 340, 390)[0];
        annual.push({ ...p, periodType: 'annual', fiscalPeriod: 'FY', start: s ?? addDays(p.end, -364) });
    }
    const all = periods; // quarters: 10-Q periods + Q4 from 10-K
    for (let i = 0; i < all.length; i++) {
        const p = all[i]; const isAnnual = ANNUAL_FORMS.has(base(p.form));
        if (isAnnual && base(p.form) !== '10-K' && base(p.form) !== '10-KT') continue; // 20-F/40-F filers have no quarters in XBRL
        let s = startsFor(p.end, 80, 100)[0];
        const prev = all[i - 1];
        if (!s && prev && days(prev.end, p.end) >= 80 && days(prev.end, p.end) <= 100) s = addDays(prev.end, 1);
        if (!s) continue;
        quarterly.push({ ...p, periodType: 'quarterly', fiscalPeriod: isAnnual ? 'Q4' : (p.fp && /^Q[1-3]$/.test(p.fp) ? p.fp : null), start: s });
    }
    // Fiscal year for quarters: the fiscal year whose annual window contains the quarter end.
    for (const a of annual) a.fiscalYear = a.fy ?? (Number(a.end.slice(0, 4)) - (Number(a.end.slice(5, 7)) <= 1 ? 1 : 0));
    for (const q of quarterly) {
        const fyw = annual.find((a) => q.end > a.start && q.end <= a.end) ?? annual.find((a) => q.end > addDays(a.end, -1) && q.end <= addDays(a.end, 366));
        q.fiscalYear = q.fy ?? (fyw && q.end <= fyw.end ? fyw.fiscalYear : null);
        if (!q.fiscalPeriod && fyw) { const k = Math.round(days(fyw.start, q.end) / 91.3); q.fiscalPeriod = `Q${Math.min(4, Math.max(1, k))}`; }
    }
    for (const q of quarterly) if (q.fiscalYear == null) q.fiscalYear = q.fy ?? Number(q.end.slice(0, 4));
    return { annual, quarterly };
}

const latest = (arr) => arr.reduce((a, b) => (!a || b.filed > a.filed ? b : a), null);
const earliest = (arr) => arr.reduce((a, b) => (!a || b.filed < a.filed ? b : a), null);
const near = (a, b, tol = 4) => Math.abs(days(a, b)) <= tol;

/** Value of one metric over [start, end]: { value, concept, derived, restated } or null. */
export function metricValue(facts, tx, metric, w) {
    const def = METRICS[metric];
    for (const concept of def[tx.key]) {
        const fs = factsOf(facts, tx.tax, concept, def.kind, tx.currency);
        if (!fs.length) continue;
        if (def.kind === 'instant') {
            const hit = fs.filter((x) => !x.start && x.end === w.end);
            if (hit.length) { const l = latest(hit); const o = earliest(hit); return { value: l.val, concept, derived: false, restated: l.val !== o.val }; }
            continue;
        }
        const exact = fs.filter((x) => x.start && x.end === w.end && near(x.start, w.start));
        if (exact.length) { const l = latest(exact); const o = earliest(exact); return { value: l.val, concept, derived: false, restated: l.val !== o.val }; }
        if (def.kind !== 'flow') continue; // per-share and share counts are not additive
        // Year-to-date difference: [S, end] minus [S, start-1].
        const ytd = fs.filter((x) => x.start && x.end === w.end && days(x.start, w.start) > 20);
        for (const a of ytd.sort((p, q) => (p.start < q.start ? 1 : -1))) {
            const b = fs.filter((x) => x.start && near(x.start, a.start) && near(x.end, addDays(w.start, -1)));
            if (b.length) return { value: latest([a]).val - latest(b).val, concept, derived: true, restated: false };
        }
    }
    return null;
}

function instantOf(facts, tx, concepts, end) {
    for (const c of concepts) { const hit = factsOf(facts, tx.tax, c, 'instant', tx.currency).filter((x) => !x.start && x.end === end); if (hit.length) return latest(hit).val; }
    return null;
}
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
/** Build one output row for a period window. */
export function buildRow(facts, tx, w, { includeSources = false } = {}) {
    const row = {}; const sources = {}; const derived = []; let restated = false;
    for (const m of METRIC_NAMES) {
        const v = metricValue(facts, tx, m, w);
        row[m] = v ? v.value : null;
        if (v) { sources[m] = v.concept; if (v.derived) derived.push(m); if (v.restated) restated = true; }
    }
    if (row.grossProfit == null && row.revenue != null && row.costOfRevenue != null) { row.grossProfit = row.revenue - row.costOfRevenue; derived.push('grossProfit'); sources.grossProfit = 'revenue - costOfRevenue'; }
    if (row.totalLiabilities == null) {
        const le = instantOf(facts, tx, tx.key === 'gaap' ? ['LiabilitiesAndStockholdersEquity'] : ['EquityAndLiabilities'], w.end);
        const eq = instantOf(facts, tx, tx.key === 'gaap' ? ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'] : ['Equity'], w.end);
        if (le != null && eq != null) { row.totalLiabilities = le - eq; derived.push('totalLiabilities'); sources.totalLiabilities = 'LiabilitiesAndStockholdersEquity - equity'; }
    }
    row.freeCashFlow = row.operatingCashFlow != null && row.capitalExpenditure != null ? row.operatingCashFlow - row.capitalExpenditure : null;
    const div = (a, b) => (a != null && b ? r4(a / b) : null);
    row.grossMargin = div(row.grossProfit, row.revenue); row.operatingMargin = div(row.operatingIncome, row.revenue); row.netMargin = div(row.netIncome, row.revenue);
    const out = { periodType: w.periodType, fiscalYear: w.fiscalYear ?? null, fiscalPeriod: w.fiscalPeriod ?? null, periodStart: w.start, periodEnd: w.end, form: w.form, filed: w.filed, accessionNumber: w.accn, currency: tx.currency, taxonomy: tx.tax, ...row, revenueGrowthYoY: null, derivedMetrics: derived, restated };
    if (includeSources) out.sources = sources;
    out.metricsFound = METRIC_NAMES.filter((m) => row[m] != null).length;
    return out;
}

/** Add year-over-year revenue growth by matching the same fiscal period one year earlier. */
export function addGrowth(rows) {
    for (const r of rows) {
        const prev = rows.find((p) => p.periodType === r.periodType && p.fiscalPeriod === r.fiscalPeriod && Math.abs(days(p.periodEnd, addDays(r.periodEnd, -365))) <= 10);
        r.revenueGrowthYoY = prev && prev.revenue && r.revenue != null ? r4(r.revenue / prev.revenue - 1) : null;
    }
    return rows;
}

/** EDGAR filing index URL for an accession number. */
export function filingUrl(cik, accn) { return accn ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, '')}/${accn}-index.htm` : null; }

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[.,'’()]/g, '').replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|sa|nv|ag|the|class [a-z])\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** Resolve a ticker, CIK or company name against SEC company_tickers.json rows [{cik, ticker, title}]. */
export function resolveCompany(q, rows) {
    const s = String(q).trim();
    if (/^\d{1,10}$/.test(s)) { const cik = Number(s); const hit = rows.find((r) => r.cik === cik); return { match: hit ?? { cik, ticker: null, title: null }, how: 'cik' }; }
    const t = s.toUpperCase().replace(/^\$/, '').replace(/\./g, '-');
    const byTicker = rows.find((r) => r.ticker === t);
    if (byTicker && /^[A-Z0-9-]{1,10}$/.test(t)) return { match: byTicker, how: 'ticker' };
    const n = norm(s); if (!n) return { match: null, how: 'name', candidates: [] };
    const seen = new Set(); const uniq = rows.filter((r) => (seen.has(r.cik) ? false : seen.add(r.cik)));
    const exact = uniq.filter((r) => norm(r.title) === n);
    if (exact.length === 1) return { match: exact[0], how: 'name' };
    const pre = (exact.length ? exact : uniq.filter((r) => norm(r.title).startsWith(`${n} `) || norm(r.title) === n));
    if (pre.length === 1) return { match: pre[0], how: 'name' };
    const cands = (pre.length ? pre : uniq.filter((r) => norm(r.title).includes(n))).slice(0, 5);
    if (cands.length === 1) return { match: cands[0], how: 'name' };
    return { match: null, how: 'name', candidates: cands.map((r) => ({ cik: r.cik, ticker: r.ticker, name: r.title })) };
}
