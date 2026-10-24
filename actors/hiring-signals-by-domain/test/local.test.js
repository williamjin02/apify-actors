import assert from 'node:assert/strict';
import { siteName, toDomain, brandLabel, slugCandidates, findAtsLinks, careersLinks, corroborate, classifyFunction, classifySeniority, summarize, intensity, isPlatformHost } from '../src/signals.js';

let pass = 0; let fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };

t('toDomain: email drops local part', () => assert.deepEqual(toDomain('Jane@Ramp.com'), { domain: 'ramp.com', inputType: 'email' }));
t('toDomain: url', () => assert.equal(toDomain('https://www.notion.so/product').domain, 'notion.so'));
t('toDomain: invalid', () => { assert.equal(toDomain('not a domain'), null); assert.equal(toDomain(''), null); });
t('brandLabel: co.uk and subdomain', () => { assert.equal(brandLabel('acme.co.uk'), 'acme'); assert.equal(brandLabel('jobs.stripe.com'), 'stripe'); });
t('slugCandidates: hyphen variant', () => assert.deepEqual(slugCandidates('open-ai.com'), ['open-ai', 'openai']));
t('slugCandidates: strip hq/get', () => { assert.ok(slugCandidates('datadoghq.com').includes('datadog')); assert.ok(slugCandidates('getdbt.com').includes('dbt')); assert.ok(slugCandidates('x.com', 'Acme Inc').includes('acme')); });
t('corroborate: stripped slug = medium', () => assert.equal(corroborate({ domain: 'datadoghq.com', slug: 'datadog', companyName: null, jobs: [1] }), 'medium'));
t('siteName: og:site_name', () => { assert.equal(siteName('<meta property="og:site_name" content="Acme Corp">'), 'Acme Corp'); assert.equal(siteName('<meta content="Beta" property="og:site_name" />'), 'Beta'); assert.equal(siteName('<p>x</p>'), null); });
t('platform host', () => { assert.ok(isPlatformHost('linkedin.com')); assert.ok(!isPlatformHost('stripe.com')); });
t('findAtsLinks: greenhouse embed + lever eu + ashby', () => {
    const f = findAtsLinks('<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script><a href="https://jobs.eu.lever.co/beta">x</a><a href="https://jobs.ashbyhq.com/Gamma/123">y</a>');
    assert.deepEqual(f.boards, [{ ats: 'greenhouse', slug: 'acme', region: null }, { ats: 'lever', slug: 'beta', region: 'eu' }, { ats: 'ashby', slug: 'gamma', region: null }]);
});
t('findAtsLinks: job-boards.greenhouse.io + workable + recruitee', () => {
    const f = findAtsLinks('href="https://job-boards.greenhouse.io/stripe/jobs/1" https://apply.workable.com/delta/ https://epsilon.recruitee.com/o/x');
    assert.deepEqual(f.boards.map((b) => `${b.ats}:${b.slug}`), ['greenhouse:stripe', 'workable:delta', 'recruitee:epsilon']);
});
t('findAtsLinks: ignores embed/api path words', () => assert.equal(findAtsLinks('https://boards.greenhouse.io/embed/').boards.length, 0));
t('findAtsLinks: escaped JSON slashes', () => assert.equal(findAtsLinks('"https:\\/\\/jobs.lever.co\\/zeta"').boards[0].slug, 'zeta'));
t('findAtsLinks: workday detected as other', () => { const f = findAtsLinks('<a href="https://acme.wd5.myworkdayjobs.com/External">'); assert.deepEqual(f.otherAts, ['workday']); assert.ok(f.workdayUrl.includes('myworkdayjobs')); });
t('careersLinks: same-site careers links ranked', () => {
    const l = careersLinks('<a href="/careers">Careers</a><a href="/blog">Blog</a><a href="https://other.com/jobs">Jobs</a><a href="https://careers.acme.com/">Join us</a>', 'https://acme.com/', 'acme.com');
    assert.deepEqual(l, ['https://careers.acme.com/', 'https://acme.com/careers']);
});
t('corroborate: job URL on domain = high', () => assert.equal(corroborate({ domain: 'stripe.com', slug: 'stripe', companyName: null, jobs: [1], urls: ['https://stripe.com/jobs/listing/x'] }), 'high'));
t('corroborate: company name = high', () => assert.equal(corroborate({ domain: 'ramp.com', slug: 'ramp', companyName: 'Ramp', jobs: [1] }), 'high'));
t('corroborate: company name with suffix = high', () => assert.equal(corroborate({ domain: 'ramp.com', slug: 'ramp', companyName: 'Ramp Health Partners LLC', jobs: [1] }), 'high'));
t('corroborate: mismatched name = low', () => assert.equal(corroborate({ domain: 'ramp.com', slug: 'xyz', companyName: 'Totally Different', jobs: [1] }), 'low'));
t('corroborate: different company on same slug = low', () => assert.equal(corroborate({ domain: 'example.com', slug: 'example', companyName: 'Democorp', jobs: [1] }), 'low'));
t('corroborate: slug only = medium', () => assert.equal(corroborate({ domain: 'linear.app', slug: 'linear', companyName: null, jobs: [1] }), 'medium'));
t('classifyFunction', () => {
    assert.equal(classifyFunction('Senior Software Engineer, Payments'), 'engineering');
    assert.equal(classifyFunction('Enterprise Account Executive'), 'sales');
    assert.equal(classifyFunction('Product Marketing Manager'), 'marketing');
    assert.equal(classifyFunction('Machine Learning Scientist'), 'data_ai');
    assert.equal(classifyFunction('Customer Success Manager'), 'customer_success');
    assert.equal(classifyFunction('Recruiter'), 'people_hr');
    assert.equal(classifyFunction('Something', 'Finance'), 'finance');
});
t('classifySeniority', () => {
    assert.equal(classifySeniority('VP of Sales'), 'executive');
    assert.equal(classifySeniority('Head of Growth'), 'executive');
    assert.equal(classifySeniority('Director, Engineering'), 'director');
    assert.equal(classifySeniority('Staff Engineer'), 'senior');
    assert.equal(classifySeniority('Engineering Manager'), 'manager');
    assert.equal(classifySeniority('Software Engineering Intern'), 'intern_entry');
    assert.equal(classifySeniority('Software Engineer'), 'mid');
});
t('intensity buckets', () => assert.deepEqual([0, 3, 10, 50, 150].map(intensity), ['none', 'low', 'moderate', 'high', 'very_high']));
t('summarize: counts and signals', () => {
    const now = Date.parse('2026-10-24T00:00:00Z'); const d = (n) => new Date(now - n * 86400e3).toISOString();
    const jobs = [
        { title: 'Account Executive', department: 'Sales', location: 'London', country: 'GB', remote: false, postedAt: d(2) },
        { title: 'SDR', department: 'Sales', location: 'New York', country: 'US', remote: false, postedAt: d(5) },
        { title: 'VP Engineering', department: 'Engineering', location: 'Remote', country: 'DE', remote: true, postedAt: d(10), salaryMin: 200000 },
        { title: 'Backend Engineer', department: 'Engineering', location: 'Remote', country: 'US', remote: true, postedAt: d(40) },
        { title: 'Designer', department: 'Design', location: 'Remote', remote: true, postedAt: d(80) },
    ];
    const s = summarize(jobs, { now, sample: 2 });
    assert.equal(s.openJobs, 5); assert.equal(s.isHiring, true); assert.equal(s.hiringIntensity, 'moderate');
    assert.equal(s.jobsByFunction.sales, 2); assert.equal(s.postedLast7Days, 2); assert.equal(s.postedLast30Days, 3);
    assert.equal(s.remoteShare, 0.6); assert.equal(s.salaryDisclosedShare, 0.2);
    assert.deepEqual(s.countries, ['DE', 'GB', 'US']);
    for (const x of ['scaling_sales', 'hiring_leadership', 'international_expansion', 'remote_friendly', 'hiring_surge_last_30_days']) assert.ok(s.signals.includes(x), x);
    assert.equal(s.sampleJobs.length, 2); assert.equal(s.sampleJobs[0].title, 'Account Executive');
});
t('summarize: empty', () => { const s = summarize([]); assert.equal(s.isHiring, false); assert.equal(s.hiringIntensity, 'none'); assert.equal(s.postedLast7Days, null); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
