// Pure helpers for the Grants.gov public Search2 / fetchOpportunity API (no key needed).
export const STATUSES = ['posted', 'forecasted', 'closed', 'archived'];
export const ELIGIBILITIES = { '00': 'State governments', '01': 'County governments', '02': 'City or township governments', '04': 'Special district governments', '05': 'Independent school districts', '06': 'Public and State controlled institutions of higher education', '07': 'Native American tribal governments (Federally recognized)', '08': 'Public housing authorities/Indian housing authorities', '11': 'Native American tribal organizations (other than Federally recognized tribal governments)', '12': 'Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education', '13': 'Nonprofits that do not have a 501(c)(3) status with the IRS, other than institutions of higher education', '20': 'Private institutions of higher education', '21': 'Individuals', '22': 'For profit organizations other than small businesses', '23': 'Small businesses', '25': 'Others (see eligibility text)', '99': 'Unrestricted (open to any type of entity, see eligibility text)' };
export const CATEGORIES = { ACA: 'Affordable Care Act', AG: 'Agriculture', AR: 'Arts', BC: 'Business and Commerce', CD: 'Community Development', CP: 'Consumer Protection', DPR: 'Disaster Prevention and Relief', ED: 'Education', ELT: 'Employment, Labor and Training', EN: 'Energy', EIC: 'Energy Infrastructure and Critical Mineral and Materials', ENV: 'Environment', FN: 'Food and Nutrition', HL: 'Health', HO: 'Housing', HU: 'Humanities', ISS: 'Income Security and Social Services', IS: 'Information and Statistics', IIJ: 'Infrastructure Investment and Jobs Act', LJL: 'Law, Justice and Legal Services', NR: 'Natural Resources', OZ: 'Opportunity Zone Benefits', O: 'Other', RA: 'Recovery Act', RT: 'Recreation and Tourism', RD: 'Regional Development', ST: 'Science and Technology and other Research and Development', T: 'Transportation' };
export const INSTRUMENTS = { G: 'Grant', CA: 'Cooperative Agreement', PC: 'Procurement Contract', O: 'Other' };
export const SORTS = { closingSoonest: 'closeDate|asc', newest: 'openDate|desc', relevance: '' };
const RANGES = [3, 7, 14, 21, 28, 35, 42, 49, 56];

export const listOf = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]+/)).map((s) => String(s ?? '').trim()).filter(Boolean);

/** Accepts a code or a label (case-insensitive) and returns the code, or null. */
export function toCode(v, map) {
    const s = String(v).trim();
    const up = s.toUpperCase();
    if (map[s]) return s;
    if (map[up]) return up;
    if (/^\d$/.test(s) && map[`0${s}`]) return `0${s}`;
    const hit = Object.entries(map).find(([, label]) => label.toLowerCase() === s.toLowerCase() || label.toLowerCase().startsWith(s.toLowerCase()));
    return hit ? hit[0] : null;
}

/** "MM/DD/YYYY" -> "YYYY-MM-DD"; "2027-02-24-00-00-00" -> "2027-02-24"; anything else -> null. */
export function isoDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1]}-${m[2]}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s.replace(/ (EST|EDT|CST|CDT|PST|PDT)$/, ''));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function daysUntil(iso, today = new Date()) {
    if (!iso) return null;
    const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - t0) / 86400000);
}

export function htmlToText(h, max = 4000) {
    if (!h) return null;
    const t = String(h).replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, '-')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/[ \t\r\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const num = (v) => { if (v == null || v === '' || /^none$/i.test(String(v))) return null; const n = Number(String(v).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };

/** Smallest Grants.gov dateRange bucket that covers N days (server-side prefilter); null when N > 56. */
export function rangeBucket(days) { return days ? (RANGES.find((r) => r >= days) ?? null) : null; }

export function searchBody({ keyword = '', oppNum = '', statuses, agencies = [], eligibilities = [], categories = [], instruments = [], cfda = '', sort = '', postedWithinDays = 0, rows = 100, start = 0 }) {
    const b = { keyword, oppNum, rows, startRecordNum: start, oppStatuses: statuses.join('|'), agencies: agencies.join('|'), eligibilities: eligibilities.join('|'), fundingCategories: categories.join('|'), fundingInstruments: instruments.join('|'), cfda, sortBy: sort };
    const r = rangeBucket(postedWithinDays); if (r) b.dateRange = String(r);
    return b;
}

/** Map a Search2 hit (and optional fetchOpportunity detail) to one output row. */
export function mapOpportunity(hit, detail, { includeDescription = true, maxDescriptionChars = 4000, today = new Date() } = {}) {
    const s = detail?.synopsis ?? detail?.forecast ?? null;
    const closeDate = isoDate(hit.closeDate) ?? isoDate(s?.responseDateStr);
    const row = {
        type: 'opportunity',
        opportunityId: String(hit.id),
        opportunityNumber: hit.number ?? detail?.opportunityNumber ?? null,
        title: hit.title ?? detail?.opportunityTitle ?? null,
        agencyCode: hit.agencyCode ?? s?.agencyCode ?? null,
        agencyName: hit.agency ?? s?.agencyName ?? null,
        topAgencyCode: s?.topAgencyDetails?.agencyCode ?? detail?.topAgencyDetails?.agencyCode ?? (hit.agencyCode ? String(hit.agencyCode).split('-')[0] : null),
        topAgencyName: s?.topAgencyDetails?.agencyName ?? detail?.topAgencyDetails?.agencyName ?? null,
        opportunityStatus: hit.oppStatus ?? null,
        docType: hit.docType ?? detail?.docType ?? null,
        postedDate: isoDate(hit.openDate) ?? isoDate(s?.postingDateStr),
        closeDate,
        daysUntilClose: daysUntil(closeDate, today),
        closeDateNote: s?.responseDateDesc && !/^no explanation$/i.test(s.responseDateDesc) ? htmlToText(s.responseDateDesc, 400) : null,
        archiveDate: isoDate(s?.archiveDateStr),
        assistanceListings: detail?.cfdas?.length ? detail.cfdas.map((c) => ({ number: c.cfdaNumber, title: c.programTitle ?? null })) : (hit.cfdaList ?? []).map((n) => ({ number: n, title: null })),
        fundingInstruments: s?.fundingInstruments?.map((x) => x.description) ?? null,
        fundingCategories: s?.fundingActivityCategories?.map((x) => x.description) ?? null,
        eligibleApplicants: s?.applicantTypes?.map((x) => x.description) ?? null,
        eligibilityText: (s && htmlToText(s.applicantEligibilityDesc, 1500)) || null,
        awardFloor: s ? num(s.awardFloor) : null,
        awardCeiling: s ? num(s.awardCeiling) : null,
        estimatedTotalFunding: s ? num(s.estimatedFunding) : null,
        expectedAwards: s ? num(s.numberOfAwards) : null,
        costSharingRequired: s ? (s.costSharing === true || s.costSharing === 'True' || s.costSharing === 'Y') : null,
        opportunityCategory: detail?.opportunityCategory?.description ?? null,
        fiscalYear: detail?.forecast ? num(detail.forecast.fiscalYear) : null,
        estimatedPostDate: detail?.forecast ? isoDate(detail.forecast.estSynopsisPostingDateStr) : null,
        estimatedCloseDate: detail?.forecast ? isoDate(detail.forecast.estApplicationResponseDateStr) : null,
        estimatedAwardDate: detail?.forecast ? isoDate(detail.forecast.estAwardDateStr) : null,
        descriptionText: s && includeDescription ? htmlToText(s.synopsisDesc ?? s.forecastDesc, maxDescriptionChars) : null,
        additionalInfoUrl: /^https?:\/\/\S+$/i.test(String(s?.fundingDescLinkUrl || '').trim()) ? String(s.fundingDescLinkUrl).trim() : null,
        lastUpdated: isoDate(s?.lastUpdatedDate ?? s?.createTimeStampStr),
        grantsGovUrl: `https://www.grants.gov/search-results-detail/${hit.id}`,
        detailsIncluded: Boolean(s),
    };
    return row;
}
