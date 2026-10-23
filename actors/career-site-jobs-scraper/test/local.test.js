import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCompany, pickBoard, resolveBoard, endpoint, extractRaw, mapJob, extractSalary, htmlToText, matches, parseDateInput } from '../src/ats.js';
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

// Board-name collisions: a bare name can exist on several ATSs as different organisations.
t('pickBoard', () => {
    const gh = { ats: 'greenhouse', jobs: [1] }; const ab = { ats: 'ashby', jobs: new Array(171).fill(0) }; const wk = { ats: 'workable', jobs: [] };
    const p = pickBoard([gh, null, ab, wk, null]);
    assert.equal(p.best.ats, 'ashby'); assert.deepEqual(p.others.map((o) => o.ats), ['greenhouse']);
    assert.equal(pickBoard([null, wk, null]).best.ats, 'workable'); // only empty boards: still "found", with 0 jobs
    assert.equal(pickBoard([{ ats: 'greenhouse', jobs: [1] }, { ats: 'lever', jobs: [1] }]).best.ats, 'greenhouse'); // tie keeps ATS_LIST order
    assert.equal(pickBoard([null, null]), null);
});
// Mock of the live responses seen 2026-10-23 for "ramp": Greenhouse = other org with 1 job, Ashby = Ramp with 171, Workable = empty board.
const rampFetch = (calls) => async (url) => {
    calls?.push(url);
    if (url.startsWith(endpoint('greenhouse', 'ramp'))) return { body: { jobs: [{ id: 1, title: 'Copy of Chief Legal Officer', company_name: 'RAMP' }] } };
    if (url.startsWith(endpoint('ashby', 'ramp'))) return { body: { jobs: Array.from({ length: 171 }, (_, i) => ({ id: String(i), title: 'Job', isListed: true })) } };
    if (url.startsWith(endpoint('workable', 'ramp'))) return { body: { name: 'RAMP', jobs: [] } };
    return { notFound: true };
};
const asyncTests = [];
const ta = (name, fn) => asyncTests.push([name, fn]);
ta('bare "ramp" resolves to ashby', async () => {
    const r = await resolveBoard(parseCompany('ramp'), rampFetch());
    assert.equal(r.ats, 'ashby'); assert.equal(r.jobs.length, 171);
    assert.deepEqual(r.alsoFoundOn, [{ ats: 'greenhouse', jobs: 1 }]); // empty Workable board isn't reported as a collision
});
ta('pinned "greenhouse:ramp" and URLs query one ATS only', async () => {
    const calls = [];
    const r = await resolveBoard(parseCompany('greenhouse:ramp'), rampFetch(calls));
    assert.equal(r.ats, 'greenhouse'); assert.equal(r.jobs.length, 1); assert.equal(calls.length, 1);
    assert.equal((await resolveBoard(parseCompany('ashby:ramp'), rampFetch())).ats, 'ashby');
    assert.equal((await resolveBoard(parseCompany('https://jobs.ashbyhq.com/ramp'), rampFetch())).jobs.length, 171);
    assert.equal(await resolveBoard(parseCompany('lever:ramp'), rampFetch()), null);
});
ta('one failing ATS does not hide a real board; all failing throws', async () => {
    const flaky = async (url) => { if (url.includes('lever')) throw new Error('ECONNRESET'); return rampFetch()(url); };
    assert.equal((await resolveBoard(parseCompany('ramp'), flaky)).ats, 'ashby');
    await assert.rejects(() => resolveBoard(parseCompany('ramp'), async () => { throw new Error('down'); }), /down/);
    assert.equal(await resolveBoard(parseCompany('nonexistentxyz'), async () => ({ notFound: true })), null);
});
// Optional live check against the real APIs: LIVE=1 npm test
if (process.env.LIVE) ta('LIVE: bare "ramp" resolves to ashby', async () => {
    const live = async (url) => { const r = await fetch(url, { headers: { accept: 'application/json' } }); return r.status === 404 || !r.ok ? { notFound: true } : { body: await r.json() }; };
    const r = await resolveBoard(parseCompany('ramp'), live);
    console.log('live ramp ->', r.ats, r.jobs.length, 'jobs; also on', JSON.stringify(r.alsoFoundOn));
    assert.equal(r.ats, 'ashby'); assert.ok(r.jobs.length > 20);
});
for (const [name, fn] of asyncTests) { await fn(); n++; console.log('ok', name); }
console.log(`${n} tests passed`);
