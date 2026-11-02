import assert from 'node:assert/strict';
import { toCode, ELIGIBILITIES, CATEGORIES, INSTRUMENTS, isoDate, daysUntil, htmlToText, rangeBucket, searchBody, mapOpportunity, listOf } from '../src/grants.js';
let pass = 0; let fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const today = new Date('2026-11-02T12:00:00Z');
const hit = { id: '361206', number: 'FR-6900-N-12', title: 'ROSS Rapid Response', agencyCode: 'HUD', agency: 'Department of Housing and Urban Development', openDate: '01/26/2026', closeDate: '01/25/2027', oppStatus: 'posted', docType: 'synopsis', cfdaList: ['14.870'] };
const detail = { opportunityNumber: 'FR-6900-N-12', opportunityCategory: { description: 'Discretionary' }, cfdas: [{ cfdaNumber: '14.870', programTitle: 'Resident Opportunity and Supportive Services' }],
    synopsis: { agencyCode: 'HUD', agencyName: 'Department of Housing and Urban Development', topAgencyDetails: { agencyCode: 'HUD', agencyName: 'Department of Housing and Urban Development' }, applicantEligibilityDesc: '<p>Public housing authority&nbsp;(PHA)</p>', awardCeiling: '250000', awardFloor: '112500', estimatedFunding: '5000000', numberOfAwards: '20', costSharing: true,
        synopsisDesc: '<p>The ROSS <b>Rapid</b> Response Program &amp; more.</p><ul><li>One</li></ul>', responseDateStr: '2027-01-25-00-00-00', responseDateDesc: 'No Explanation', archiveDateStr: '2027-02-24-00-00-00', postingDateStr: '2026-01-26-00-00-00', lastUpdatedDate: 'Jan 26, 2026 03:29:58 PM EST',
        fundingDescLinkUrl: 'https://www.grantsolutions.gov/x', applicantTypes: [{ id: '08', description: 'Public housing authorities/Indian housing authorities' }], fundingInstruments: [{ id: 'G', description: 'Grant' }], fundingActivityCategories: [{ id: 'HO', description: 'Housing' }] } };
await t('codes accept code, label, prefix and 1-digit', () => {
    assert.equal(toCode('23', ELIGIBILITIES), '23'); assert.equal(toCode('Small businesses', ELIGIBILITIES), '23'); assert.equal(toCode('small bus', ELIGIBILITIES), '23');
    assert.equal(toCode('0', ELIGIBILITIES), '00'); assert.equal(toCode('st', CATEGORIES), 'ST'); assert.equal(toCode('Health', CATEGORIES), 'HL'); assert.equal(toCode('grant', INSTRUMENTS), 'G'); assert.equal(toCode('nonsense', INSTRUMENTS), null);
});
await t('dates', () => {
    assert.equal(isoDate('01/25/2027'), '2027-01-25'); assert.equal(isoDate('2027-02-24-00-00-00'), '2027-02-24'); assert.equal(isoDate('Jan 26, 2026 03:29:58 PM EST'), '2026-01-26'); assert.equal(isoDate(''), null);
    assert.equal(daysUntil('2026-11-12', today), 10); assert.equal(daysUntil(null, today), null);
});
await t('html to text', () => { assert.equal(htmlToText('<p>A &amp; B</p><ul><li>x</li></ul>'), 'A & B\n- x'); assert.equal(htmlToText('abcdef', 4), 'abc…'); assert.equal(htmlToText(null), null); });
await t('dateRange bucket and body', () => {
    assert.equal(rangeBucket(1), 3); assert.equal(rangeBucket(10), 14); assert.equal(rangeBucket(90), null); assert.equal(rangeBucket(0), null);
    const b = searchBody({ keyword: 'ai', statuses: ['posted', 'forecasted'], agencies: ['NSF', 'HHS-NIH11'], eligibilities: ['23'], categories: [], instruments: ['G'], sort: 'closeDate|asc', postedWithinDays: 5, rows: 50, start: 100 });
    assert.equal(b.oppStatuses, 'posted|forecasted'); assert.equal(b.agencies, 'NSF|HHS-NIH11'); assert.equal(b.dateRange, '7'); assert.equal(b.startRecordNum, 100); assert.equal(b.sortBy, 'closeDate|asc');
});
await t('listOf splits strings and arrays', () => { assert.deepEqual(listOf('a, b\nc'), ['a', 'b', 'c']); assert.deepEqual(listOf([' x ', '', null]), ['x']); assert.deepEqual(listOf(undefined), []); });
await t('map with details', () => {
    const r = mapOpportunity(hit, detail, { today });
    assert.equal(r.opportunityId, '361206'); assert.equal(r.closeDate, '2027-01-25'); assert.equal(r.daysUntilClose, 84); assert.equal(r.postedDate, '2026-01-26');
    assert.equal(r.awardCeiling, 250000); assert.equal(r.awardFloor, 112500); assert.equal(r.estimatedTotalFunding, 5000000); assert.equal(r.expectedAwards, 20); assert.equal(r.costSharingRequired, true);
    assert.deepEqual(r.assistanceListings, [{ number: '14.870', title: 'Resident Opportunity and Supportive Services' }]); assert.deepEqual(r.fundingCategories, ['Housing']);
    assert.equal(r.eligibilityText, 'Public housing authority (PHA)'); assert.match(r.descriptionText, /Rapid Response Program & more\.\n- One/); assert.equal(r.closeDateNote, null);
    assert.equal(r.grantsGovUrl, 'https://www.grants.gov/search-results-detail/361206'); assert.equal(r.detailsIncluded, true); assert.equal(r.topAgencyCode, 'HUD'); assert.equal(r.lastUpdated, '2026-01-26');
    assert.ok(!('agencyContactName' in r) && !('agencyContactEmail' in r)); // no personal contact data
});
await t('map without details keeps search fields, nulls the rest', () => {
    const r = mapOpportunity({ ...hit, closeDate: '', agencyCode: 'HHS-NIH11' }, null, { today });
    assert.equal(r.closeDate, null); assert.equal(r.daysUntilClose, null); assert.equal(r.awardCeiling, null); assert.equal(r.detailsIncluded, false); assert.equal(r.topAgencyCode, 'HHS');
    assert.deepEqual(r.assistanceListings, [{ number: '14.870', title: null }]);
});
await t('awardCeiling "none" -> null; description optional', () => {
    const r = mapOpportunity(hit, { synopsis: { ...detail.synopsis, awardCeiling: 'none' } }, { includeDescription: false, today });
    assert.equal(r.awardCeiling, null); assert.equal(r.descriptionText, null);
});
// Optional live check against the real API: LIVE=1 npm test
if (process.env.LIVE) await t('LIVE: search2 + fetchOpportunity', async () => {
    const p = (path, b) => fetch(`https://api.grants.gov/v1/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
    const s = await p('/search2', searchBody({ keyword: 'artificial intelligence', statuses: ['posted'], sort: 'closeDate|asc', rows: 3 }));
    assert.equal(s.errorcode, 0); assert.ok(s.data.oppHits.length > 0);
    const h = s.data.oppHits[0]; const d = await p('/fetchOpportunity', { opportunityId: Number(h.id) });
    const r = mapOpportunity(h, d.data); assert.equal(r.detailsIncluded, true); assert.ok(r.title); console.log('     sample', JSON.stringify(r).slice(0, 300));
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
