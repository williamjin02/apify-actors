import assert from 'node:assert/strict';
import { parseSiteUrl, apiBase, siteUrl, parsePostedOn, maybeWithin, htmlToText, extractSalary, mapJob, pickSplitFacet, robotsAllows, FormatError } from '../src/workday.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };
t('urls', () => {
    const a = parseSiteUrl('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite');
    assert.equal(a.tenant, 'nvidia'); assert.equal(a.site, 'NVIDIAExternalCareerSite'); assert.equal(a.host, 'nvidia.wd5.myworkdayjobs.com');
    assert.equal(apiBase(a), 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite');
    assert.equal(siteUrl(a), 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite');
    assert.equal(parseSiteUrl('adobe.wd5.myworkdayjobs.com/en-US/external_experienced').site, 'external_experienced');
    const q = parseSiteUrl('https://intel.wd1.myworkdayjobs.com/External?q=engineer&locations=abc&locations=def&utm_source=x');
    assert.equal(q.searchText, 'engineer'); assert.deepEqual(q.facets, { locations: ['abc', 'def'] });
    const s = parseSiteUrl('https://wd3.myworkdaysite.com/recruiting/acme/Careers');
    assert.equal(s.tenant, 'acme'); assert.equal(s.site, 'Careers'); assert.equal(siteUrl(s), 'https://wd3.myworkdaysite.com/recruiting/acme/Careers');
    const c = parseSiteUrl('https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/jobs/jobs');
    assert.equal(c.tenant, 'redhat'); assert.equal(c.site, 'jobs');
    assert.throws(() => parseSiteUrl('https://example.com/careers'));
    assert.throws(() => parseSiteUrl('https://nvidia.wd5.myworkdayjobs.com/'));
    assert.throws(() => parseSiteUrl(''));
});
t('posted', () => {
    assert.deepEqual(parsePostedOn('Posted Today'), { days: 0 });
    assert.deepEqual(parsePostedOn('Posted Yesterday'), { days: 1 });
    assert.deepEqual(parsePostedOn('Posted 3 Days Ago'), { days: 3, plus: false });
    assert.deepEqual(parsePostedOn('Posted 30+ Days Ago'), { days: 30, plus: true });
    assert.equal(parsePostedOn(''), null);
    assert.equal(maybeWithin({ days: 3, plus: false }, 7), true);
    assert.equal(maybeWithin({ days: 10, plus: false }, 7), false);
    assert.equal(maybeWithin({ days: 30, plus: true }, 7), false);
    assert.equal(maybeWithin(null, 7), true);
    assert.equal(maybeWithin({ days: 99 }, undefined), true);
});
t('text+salary', () => {
    assert.equal(htmlToText('<p>Hi&nbsp;there</p><ul><li>One</li></ul>'), 'Hi there\n\n- One');
    const s = extractSalary('The base pay range is $120,000 - $180,000 per year.');
    assert.equal(s.salaryMin, 120000); assert.equal(s.salaryMax, 180000); assert.equal(s.salaryCurrency, 'USD'); assert.equal(s.salaryPeriod, 'year');
    assert.equal(extractSalary('Pay: $25.50 to $32.00 per hour').salaryPeriod, 'hour');
    assert.equal(extractSalary('CA$90,000 - CA$110,000').salaryCurrency, 'CAD');
    assert.equal(extractSalary('No pay info'), null);
});
t('mapJob', () => {
    const site = parseSiteUrl('https://adobe.wd5.myworkdayjobs.com/external_experienced');
    const li = { title: 'Engineer', externalPath: '/job/San-Jose/Engineer_R123', locationsText: '2 Locations', postedOn: 'Posted 2 Days Ago', bulletFields: ['R123'] };
    const fast = mapJob(site, li, null, { scrapedAt: 'x' });
    assert.equal(fast.title, 'Engineer'); assert.equal(fast.jobId, 'R123'); assert.equal(fast.locationCount, 2); assert.deepEqual(fast.allLocations, []);
    assert.equal(fast.jobUrl, 'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Engineer_R123'); assert.equal(fast.postedDaysAgo, 2);
    const det = { jobPostingInfo: { title: 'Engineer', jobDescription: '<p>Range $100,000 - $150,000</p>', location: 'San Jose', additionalLocations: ['Remote, US'], startDate: '2026-10-21', timeType: 'Full time', jobReqId: 'R123', country: { descriptor: 'United States of America' }, externalUrl: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Engineer_R123', canApply: true, postedOn: 'Posted 2 Days Ago' }, hiringOrganization: { name: 'Adobe Inc.' } };
    const full = mapJob(site, li, det, { scrapedAt: 'x', includeHtml: true });
    assert.equal(full.hiringEntity, 'Adobe Inc.'); assert.equal(full.locationCount, 2); assert.equal(full.remote, true);
    assert.equal(full.salaryMin, 100000); assert.ok(full.descriptionHtml); assert.ok(full.applyUrl.endsWith('/apply'));
    assert.equal(mapJob(site, li, det, { includeDescription: false }).descriptionText, undefined);
    assert.throws(() => mapJob(site, {}, null), FormatError);
    assert.throws(() => mapJob(site, li, { nope: 1 }), FormatError);
});
t('split', () => {
    const facets = [
        { facetParameter: 'timeType', values: [{ id: 'ft', count: 2600 }, { id: 'pt', count: 118 }] },
        { facetParameter: 'locations', values: [{ id: 'a', count: 900 }, { id: 'b', count: 1000 }, { id: 'c', count: 818 }] },
        { facetParameter: 'locationMainGroup', values: [{ facetParameter: 'locationRegion', values: [{ id: 'na', count: 2000 }, { id: 'eu', count: 718 }] }] },
    ];
    assert.equal(pickSplitFacet(facets, {}, 2718).param, 'locations');
    assert.equal(pickSplitFacet(facets, { locations: ['a'] }, 900).param, 'locationRegion');
    assert.equal(pickSplitFacet([], {}, 3000), null);
});
t('robots', () => {
    const r = 'User-agent: *\nDisallow: /Zoom/\nAllow: /Zoom/public\n\nUser-agent: bad\nDisallow: /';
    assert.equal(robotsAllows(r, '/Zoom/'), false); assert.equal(robotsAllows(r, '/Zoom/public/x'), true);
    assert.equal(robotsAllows(r, '/wday/cxs/zoom/Zoom/jobs'), true); assert.equal(robotsAllows('', '/x'), true);
});
console.log(`OK ${n} test groups passed`);
