import assert from 'node:assert/strict';
import { isDkimRecord, toDomain, classifyMx, pickSpf, parseSpf, spfServices, parseDmarc, dmarcVendors, txtVerifications, inferUnderlying, scoreEmailSecurity } from '../src/classify.js';

let pass = 0; let fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };

t('toDomain: email drops local part', () => assert.deepEqual(toDomain('Jane.Doe@Acme.COM'), { domain: 'acme.com', inputType: 'email' }));
t('toDomain: url', () => assert.deepEqual(toDomain('https://www.hubspot.com/pricing?x=1'), { domain: 'hubspot.com', inputType: 'url' }));
t('toDomain: bare host with path', () => assert.equal(toDomain('stripe.com/docs').domain, 'stripe.com'));
t('toDomain: mailto', () => assert.equal(toDomain('mailto:sales@apify.com').domain, 'apify.com'));
t('toDomain: invalid', () => { assert.equal(toDomain('not a domain'), null); assert.equal(toDomain(''), null); assert.equal(toDomain('localhost'), null); });
t('toDomain: IDN to punycode', () => assert.equal(toDomain('münchen.de').domain, 'xn--mnchen-3ya.de'));

t('mx: google', () => { const r = classifyMx([{ exchange: 'aspmx.l.google.com', priority: 1 }, { exchange: 'alt1.aspmx.l.google.com', priority: 5 }]); assert.equal(r.provider.id, 'google_workspace'); assert.equal(r.gateway, null); });
t('mx: google new smtp.google.com', () => assert.equal(classifyMx([{ exchange: 'smtp.google.com', priority: 1 }]).provider.id, 'google_workspace'));
t('mx: microsoft', () => assert.equal(classifyMx([{ exchange: 'acme-com.mail.protection.outlook.com', priority: 0 }]).provider.espMatch, 'microsoft'));
t('mx: proofpoint gateway', () => { const r = classifyMx([{ exchange: 'mx0a-00123.pphosted.com', priority: 10 }]); assert.equal(r.gateway.id, 'proofpoint'); assert.equal(r.provider, null); });
t('mx: mimecast gateway', () => assert.equal(classifyMx([{ exchange: 'us-smtp-inbound-1.mimecast.com', priority: 10 }]).gateway.id, 'mimecast'));
t('mx: cisco iphmx', () => assert.equal(classifyMx([{ exchange: 'esa1.acme.iphmx.com', priority: 10 }]).gateway.id, 'cisco'));
t('mx: null MX', () => { const r = classifyMx([{ exchange: '', priority: 0 }]); assert.equal(r.nullMx, true); assert.deepEqual(r.hosts, []); });
t('mx: self hosted', () => assert.equal(classifyMx([{ exchange: 'mail.example.org', priority: 10 }], 'example.org').provider.id, 'self_hosted'));
t('mx: priority order picks lowest first', () => assert.equal(classifyMx([{ exchange: 'b.zoho.com', priority: 20 }, { exchange: 'x.pphosted.com', priority: 5 }]).hosts[0], 'x.pphosted.com'));
t('mx: cloudflare routing is forwarding', () => assert.equal(classifyMx([{ exchange: 'route1.mx.cloudflare.net', priority: 1 }]).provider.type, 'forwarding'));

t('spf: pick + multiple', () => { const r = pickSpf(['v=spf1 -all', 'google-site-verification=x', ['v=spf1 ', 'include:a.com ~all']]); assert.equal(r.count, 2); });
t('spf: parse', () => { const p = parseSpf('v=spf1 ip4:1.2.3.4 include:_spf.google.com include:sendgrid.net a mx ~all'); assert.deepEqual(p.includes, ['_spf.google.com', 'sendgrid.net']); assert.equal(p.lookupMechanisms, 4); assert.equal(p.all, '~all'); assert.equal(p.ip4, 1); });
t('spf: redirect', () => { const p = parseSpf('v=spf1 redirect=_spf.example.com'); assert.equal(p.redirect, '_spf.example.com'); assert.equal(p.all, null); });
t('spf: services', () => assert.deepEqual(spfServices(['_spf.google.com', 'u123.wl.sendgrid.net', 'servers.mcsv.net', 'unknown.io']), ['Google Workspace', 'SendGrid', 'Mailchimp']));

t('dmarc: parse reject + vendor, no local parts', () => {
    const d = parseDmarc(['v=DMARC1; p=reject; sp=quarantine; pct=50; rua=mailto:abc123@rua.dmarcian.com,mailto:dmarc@acme.com; ruf=mailto:x@ruf.agari.com']);
    assert.equal(d.policy, 'reject'); assert.equal(d.subdomainPolicy, 'quarantine'); assert.equal(d.pct, 50); assert.ok(d.hasRua);
    assert.deepEqual(d.reportingDomains, ['rua.dmarcian.com', 'acme.com', 'ruf.agari.com']);
    assert.ok(!JSON.stringify(d).includes('abc123'));
    assert.deepEqual(dmarcVendors(d.reportingDomains), ['dmarcian', 'Agari']);
});
t('dmarc: absent', () => assert.equal(parseDmarc(['v=spf1 -all']).present, false));
t('dmarc: default pct 100', () => assert.equal(parseDmarc(['v=DMARC1; p=none']).pct, 100));

t('txt verifications', () => assert.deepEqual(txtVerifications(['MS=ms12345678', 'openai-domain-verification=dv-x', 'google-site-verification=abc', 'v=spf1 -all']), ['Microsoft 365', 'OpenAI (ChatGPT Enterprise/Team)', 'Google Search Console']));
t('underlying: google behind proofpoint via SPF', () => assert.equal(inferUnderlying({ spfIncludes: ['_spf.google.com', 'pphosted.com'] }).id, 'google_workspace'));
t('underlying: microsoft via DKIM selector1', () => assert.equal(inferUnderlying({ spfIncludes: [], dkimSelectors: ['selector1'] }).id, 'microsoft_365'));
t('underlying: ambiguous both', () => assert.equal(inferUnderlying({ spfIncludes: ['_spf.google.com', 'spf.protection.outlook.com'] }), null));
t('underlying: MS= token fallback', () => assert.equal(inferUnderlying({ verifications: ['Microsoft 365'] }).id, 'microsoft_365'));

t('score: strong setup is A', () => { const s = scoreEmailSecurity({ acceptsMail: true, spfCount: 1, spf: { all: '-all' }, spfLookups: 4, dmarc: { present: true, policy: 'reject', pct: 100, hasRua: true }, dkimSelectors: ['google'], mtaSts: { present: true }, bimi: { present: false } }); assert.equal(s.grade, 'A'); assert.equal(s.issues.length, 0); });
t('score: nothing is F with issues', () => { const s = scoreEmailSecurity({ acceptsMail: true, spfCount: 0, spf: {}, dmarc: { present: false }, dkimSelectors: [] }); assert.equal(s.grade, 'F'); assert.ok(s.issues.length >= 2); });
t('score: too many lookups flagged', () => { const s = scoreEmailSecurity({ acceptsMail: true, spfCount: 1, spf: { all: '~all' }, spfLookups: 14, dmarc: { present: true, policy: 'none', pct: 100, hasRua: true }, dkimSelectors: [] }); assert.ok(s.issues.some((i) => i.includes('14 DNS lookups'))); });
t('score: bounded 0..100', () => { const s = scoreEmailSecurity({ acceptsMail: true, spfCount: 1, spf: { all: '-all' }, spfLookups: 1, dmarc: { present: true, policy: 'reject', pct: 100, hasRua: true }, dkimSelectors: ['a'], mtaSts: { present: true }, bimi: { present: true } }); assert.equal(s.score, 100); });

t('dkim: empty key is revoked, real key ok', () => { assert.equal(isDkimRecord('v=DKIM1; p='), false); assert.equal(isDkimRecord('v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'), true); assert.equal(isDkimRecord('v=DMARC1; p=reject'), false); });
t('mx: cloudflare email security gateway', () => assert.equal(classifyMx([{ exchange: 'mxa.global.inbound.cf-emailsecurity.net', priority: 5 }]).gateway.id, 'cloudflare_email_security'));
t('score: redirect without all is not flagged', () => { const s = scoreEmailSecurity({ acceptsMail: true, spfCount: 1, spf: { all: null, redirect: '_spf.google.com' }, spfLookups: 4, dmarc: { present: true, policy: 'reject', pct: 100, hasRua: true }, dkimSelectors: [] }); assert.ok(!s.issues.some((i) => i.includes('SPF ends'))); });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
