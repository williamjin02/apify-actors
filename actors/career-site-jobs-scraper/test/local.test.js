import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCompany, extractRaw, mapJob, extractSalary, htmlToText, matches, parseDateInput } from '../src/ats.js';
let n = 0; const t = (name, fn) => { fn(); n++; };
t('urls', () => {
    assert.deepEqual(parseCompany('https://boards.greenhouse.io/stripe'), { ats: 'greenhouse', slug: 'stripe', region: null });
    assert.equal(parseCompany('https://job-boards.greenhouse.io/airbnb/jobs/123').slug, 'airbnb');
    assert.equal(parseCompany('https://boards.greenhouse.io/embed/job_board?for=figma').slug, 'figma');
    assert.deepEqual(parseCompany('https://jobs.eu.lever.co/foo'), { ats: 'lever', slug: 'foo', region: 'eu' });
    assert.equal(parseCompany('jobs.ashbyhq.com/ramp').ats, 'ashby');
    assert.equal(parseCompany('https://apply.workable.com/huggingface/').slug, 'huggingface');
    assert.deepEqual(parseCompany('bunq.recruitee.com'), { ats: 'recruitee', slug: 'bunq', region: null });
    assert.deepEqual(parseCompany('lever:spotify'), { ats: 'lever', slug: 'spotify', region: null });
    assert.deepEqual(parseCompany('stripe'), { ats: null, slug: 'stripe', region: null });
    assert.throws(() => parseCompany('https://example.com/careers'));
    assert.throws(() => parseCompany('not a slug!'));
});
t('salary', () => {
    assert.deepEqual(extractSalary('pay range $120,000 - $150,000 per year'), { salaryText: '$120,000 - $150,000', salaryMin: 120000, salaryMax: 150000, salaryCurrency: 'USD', salaryInterval: 'year' });
    assert.equal(extractSalary('£45k–£55k').salaryMax, 55000);
    assert.equal(extractSalary('no pay info'), null);
});
t('html', () => { assert.equal(htmlToText('&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;'), 'Hi & bye'); });
t('dates', () => { assert.ok(parseDateInput('7 days') instanceof Date); assert.equal(parseDateInput(''), null); assert.throws(() => parseDateInput('soon')); });
for (const [ats, f] of [['greenhouse', '/tmp/gh.json'], ['lever', '/tmp/lv.json'], ['ashby', '/tmp/ab.json'], ['workable', '/tmp/wk_huggingface.json'], ['recruitee', '/tmp/rc_bunq.json']]) {
    if (!fs.existsSync(f)) continue;
    t(ats, () => {
        const raw = extractRaw(ats, JSON.parse(fs.readFileSync(f, 'utf8')));
        assert.ok(raw.jobs.length > 0);
        const jobs = raw.jobs.map((j) => mapJob(ats, 'x', raw.companyName || 'X', j));
        for (const j of jobs) { assert.ok(j.jobId && j.title && j.jobUrl, `${ats} missing core fields`); assert.ok(!('descriptionHtml' in j)); assert.ok(!JSON.stringify(j).includes('mailbox_email')); }
        const withDate = jobs.filter((j) => j.postedAt).length / jobs.length; assert.ok(withDate > 0.9, `${ats} postedAt ${withDate}`);
        const withDesc = jobs.filter((j) => j.descriptionText && j.descriptionText.length > 50).length / jobs.length; assert.ok(withDesc > 0.9, `${ats} desc ${withDesc}`);
        console.log(ats, jobs.length, 'jobs; salary on', jobs.filter((j) => j.salaryMin).length, '; sample', JSON.stringify({ ...jobs[0], descriptionText: jobs[0].descriptionText.slice(0, 80) }));
        assert.ok(matches(jobs[0], {}));
        assert.ok(!matches(jobs[0], { titleKeywords: ['zzzqqq'] }));
    });
}
console.log(`${n} tests passed`);
