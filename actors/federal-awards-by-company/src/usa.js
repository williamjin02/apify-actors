// Pure helpers for Federal Awards by Company (USAspending.gov API v2). No network.
export const GROUPS = {
    contracts: { codes: ['A', 'B', 'C', 'D'], label: 'contract' },
    idvs: { codes: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'], label: 'idv' },
    grants: { codes: ['02', '03', '04', '05'], label: 'grant' },
    loans: { codes: ['07', '08'], label: 'loan' },
};
// Assistance types 06, 09, 10 and 11 (direct payments to individuals, insurance, other) are never requested: they can describe private persons.
export const FIELDS = {
    contracts: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Start Date', 'End Date', 'Award Amount', 'Total Outlays', 'Description', 'Awarding Agency', 'Awarding Sub Agency', 'Funding Agency', 'Contract Award Type', 'Place of Performance State Code', 'Place of Performance Country Code', 'NAICS', 'PSC', 'Last Modified Date', 'Base Obligation Date', 'recipient_id', 'generated_internal_id'],
    idvs: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Start Date', 'End Date', 'Award Amount', 'Total Outlays', 'Description', 'Awarding Agency', 'Awarding Sub Agency', 'Funding Agency', 'Contract Award Type', 'Place of Performance State Code', 'Place of Performance Country Code', 'NAICS', 'PSC', 'Last Modified Date', 'Base Obligation Date', 'recipient_id', 'generated_internal_id'],
    grants: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Start Date', 'End Date', 'Award Amount', 'Total Outlays', 'Description', 'Awarding Agency', 'Awarding Sub Agency', 'Funding Agency', 'Award Type', 'Place of Performance State Code', 'Place of Performance Country Code', 'Assistance Listings', 'Last Modified Date', 'Base Obligation Date', 'recipient_id', 'generated_internal_id'],
    loans: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Issued Date', 'Loan Value', 'Subsidy Cost', 'Description', 'Awarding Agency', 'Awarding Sub Agency', 'Funding Agency', 'Award Type', 'Place of Performance State Code', 'Place of Performance Country Code', 'Assistance Listings', 'Last Modified Date', 'recipient_id', 'generated_internal_id'],
};
export const SORT_FIELD = { amount: { contracts: 'Award Amount', idvs: 'Award Amount', grants: 'Award Amount', loans: 'Loan Value' }, newest: { contracts: 'Start Date', idvs: 'Start Date', grants: 'Start Date', loans: 'Issued Date' } };

const SUFFIX = new Set(['inc', 'incorporated', 'llc', 'l', 'c', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'lp', 'llp', 'plc', 'the', 'and', 'of', 'group', 'holdings', 'pllc', 'pc', 'na', 'sa', 'ag', 'gmbh', 'usa', 'us', 'america']);
export const normWords = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
export const coreWords = (s) => normWords(s).filter((w) => !SUFFIX.has(w));

export const isUei = (s) => /^[A-Z0-9]{12}$/.test(String(s ?? '').trim().toUpperCase()) && /[A-Z]/.test(String(s).toUpperCase()) && /\d/.test(String(s));
export const isDuns = (s) => /^\d{9}$/.test(String(s ?? '').trim());

/** Strict match: every core word of the query appears as a word (or word prefix for 4+ letters) in the recipient name. */
export function nameMatches(query, name) {
    const q = coreWords(query); if (!q.length) return false;
    const n = normWords(name);
    return q.every((w) => n.some((x) => x === w || (w.length >= 4 && x.startsWith(w))));
}

export function isoDate(d) { return d.toISOString().slice(0, 10); }
/** Resolve the time window. USAspending search starts at 2007-10-01. */
export function period({ startDate, endDate, lookbackDays } = {}, now = new Date()) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const end = re.test(String(endDate ?? '')) ? String(endDate) : isoDate(now);
    let start;
    if (re.test(String(startDate ?? ''))) start = String(startDate);
    else { const days = Math.max(1, Math.min(7000, Math.floor(Number(lookbackDays) || 365))); start = isoDate(new Date(new Date(`${end}T00:00:00Z`).getTime() - days * 864e5)); }
    if (start < '2007-10-01') start = '2007-10-01';
    if (start > end) return { error: `startDate ${start} is after endDate ${end}.` };
    return { start, end };
}

/** Build the shared filter object (without award_type_codes). */
export function baseFilters({ recipients, keywords, agencies, naicsCodes, pscCodes, states, minAmount, start, end }) {
    const f = { time_period: [{ start_date: start, end_date: end }] };
    if (recipients?.length) f.recipient_search_text = recipients;
    if (keywords?.length) f.keywords = keywords;
    if (agencies?.length) f.agencies = agencies.map((name) => ({ type: 'awarding', tier: 'toptier', name }));
    if (naicsCodes?.length) f.naics_codes = { require: naicsCodes.map(String) };
    if (pscCodes?.length) f.psc_codes = { require: pscCodes.map((c) => [String(c)]) };
    if (states?.length) f.place_of_performance_locations = states.map((s) => ({ country: 'USA', state: String(s).toUpperCase() }));
    if (Number(minAmount) > 0) f.award_amounts = [{ lower_bound: Number(minAmount) }];
    return f;
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const REDACTED = /redacted|multiple recipients|individual recipient|private individual/i;
export const isRedacted = (name) => !name || REDACTED.test(String(name));

/** Map one spending_by_award result to our output row. */
export function mapAward(r, group, query) {
    const list = Array.isArray(r['Assistance Listings']) ? r['Assistance Listings'] : [];
    return {
        type: 'award', query, awardCategory: GROUPS[group].label,
        awardId: r['Award ID'] ?? null, recipientName: r['Recipient Name'] ?? null, recipientUei: r['Recipient UEI'] ?? null,
        amount: num(r['Award Amount'] ?? r['Loan Value']), totalOutlays: num(r['Total Outlays']), subsidyCost: num(r['Subsidy Cost']),
        startDate: r['Start Date'] ?? r['Issued Date'] ?? null, endDate: r['End Date'] ?? null, baseObligationDate: r['Base Obligation Date'] ?? null,
        awardType: r['Contract Award Type'] ?? r['Award Type'] ?? null, description: r.Description ? String(r.Description).slice(0, 1000) : null,
        awardingAgency: r['Awarding Agency'] ?? null, awardingSubAgency: r['Awarding Sub Agency'] ?? null, fundingAgency: r['Funding Agency'] ?? null,
        naicsCode: r.NAICS?.code ?? null, naicsDescription: r.NAICS?.description ?? null, pscCode: r.PSC?.code ?? null, pscDescription: r.PSC?.description ?? null,
        assistanceListings: list.map((x) => `${x.cfda_number} ${x.cfda_program_title}`.trim()).slice(0, 5),
        placeOfPerformanceState: r['Place of Performance State Code'] ?? null, placeOfPerformanceCountry: r['Place of Performance Country Code'] ?? null,
        lastModified: r['Last Modified Date'] ?? null,
        usaspendingUrl: r.generated_internal_id ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}` : null,
        recipientProfileUrl: r.recipient_id ? `https://www.usaspending.gov/recipient/${encodeURIComponent(r.recipient_id)}/latest` : null,
    };
}

/** Split a raw input list into recipient queries. */
export function parseRecipients(raw) {
    const out = []; const seen = new Set();
    for (const v of Array.isArray(raw) ? raw : String(raw ?? '').split(/\n+/)) {
        const s = String(v ?? '').trim().replace(/\s+/g, ' ');
        if (!s || s.length > 200) continue;
        const key = s.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push(s);
    }
    return out;
}

/** Well-known acronyms and brand names whose legal names don't contain the short form. */
export const ALIASES = {
    saic: 'Science Applications International', gdit: 'General Dynamics Information Technology', ibm: 'International Business Machines',
    spacex: 'Space Exploration Technologies', 'booz allen': 'Booz Allen Hamilton', bah: 'Booz Allen Hamilton', ge: 'General Electric',
    hp: 'Hewlett Packard', hpe: 'Hewlett Packard Enterprise', jhu: 'Johns Hopkins University', mit: 'Massachusetts Institute of Technology',
    ucla: 'University of California Los Angeles', ucsd: 'University of California San Diego', aws: 'Amazon Web Services', 'l3harris': 'L3Harris Technologies',
    bae: 'BAE Systems', kbr: 'KBR', ngc: 'Northrop Grumman', 'northrop': 'Northrop Grumman', raytheon: 'Raytheon', rtx: 'Raytheon', pfizer: 'Pfizer',
};
