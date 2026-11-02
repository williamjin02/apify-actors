import assert from 'node:assert/strict';
import { parseRobots, isAllowed, botAccess, verdict, ruleMatches, parseLlmsTxt, looksLikeHtml, metaRobots, directives, toTarget, parseContentSignal, BOTS } from '../src/robots.js';

let pass = 0; let fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };

const NYT = `User-agent: *
Disallow: /search
Allow: /ads/public/

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

Sitemap: https://www.example.com/sitemap.xml
`;
const p = parseRobots(NYT);
await t('groups and sitemaps parsed', () => { assert.equal(p.groups.length, 4); assert.deepEqual(p.sitemaps, ['https://www.example.com/sitemap.xml']); });
await t('GPTBot blocked by own group', () => { const r = isAllowed(p, 'GPTBot'); assert.equal(r.allowed, false); assert.equal(r.matchedUserAgent, 'GPTBot'); assert.equal(r.matchedRule, 'Disallow: /'); });
await t('case-insensitive token, shared group', () => { assert.equal(isAllowed(p, 'claudebot').allowed, false); assert.equal(isAllowed(p, 'anthropic-ai').allowed, false); });
await t('unlisted bot falls back to * (generic path rules are not partial)', () => { const r = botAccess(p, 'PerplexityBot'); assert.equal(r.allowed, true); assert.equal(r.matchedUserAgent, '*'); assert.equal(r.access, 'allowed'); });
await t('own group with path blocks = partial', () => assert.equal(botAccess(parseRobots('User-agent: GPTBot\nDisallow: /private/\n'), 'GPTBot').access, 'partial'));
await t('* path rules: /search blocked, longest match allow', () => { assert.equal(isAllowed(p, 'PerplexityBot', '/search?q=x').allowed, false); assert.equal(isAllowed(p, 'x', '/ads/public/a').allowed, true); });
await t('own group overrides * entirely (RFC 9309)', () => { const q = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n'); assert.equal(isAllowed(q, 'GPTBot').allowed, true); assert.equal(isAllowed(q, 'CCBot').allowed, false); });
await t('Allow wins ties; empty Disallow = allow', () => { const q = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n'); assert.equal(isAllowed(q, 'x', '/a').allowed, true); assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), 'x').allowed, true); });
await t('wildcards and $', () => { assert.ok(ruleMatches('/*.pdf$', '/files/a.pdf')); assert.ok(!ruleMatches('/*.pdf$', '/files/a.pdf?x=1')); assert.ok(ruleMatches('/private*/', '/private-x/y')); });
await t('version suffix in user-agent line', () => assert.equal(isAllowed(parseRobots('User-agent: GPTBot/1.1\nDisallow: /\n'), 'GPTBot').allowed, false));
await t('Googlebot-News group does not apply to Googlebot', () => assert.equal(isAllowed(parseRobots('User-agent: Googlebot-News\nDisallow: /\n'), 'Googlebot').allowed, true));
await t('no robots rules -> allowed, no matched agent', () => { const r = isAllowed(parseRobots(''), 'GPTBot'); assert.equal(r.allowed, true); assert.equal(r.matchedUserAgent, null); });
await t('comments, BOM, CRLF', () => { const q = parseRobots('\uFEFFUser-agent: CCBot # cc\r\nDisallow: / # all\r\n'); assert.equal(isAllowed(q, 'CCBot').allowed, false); });
await t('Content-Signal (Cloudflare) parsed for *', () => {
    const q = parseRobots('User-Agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n');
    assert.deepEqual(isAllowed(q, 'GPTBot').contentSignal, { search: true, 'ai-train': false });
    assert.deepEqual(parseContentSignal('ai-input=yes', { search: true }), { search: true, 'ai-input': true });
});
await t('verdicts', () => {
    const rows = (blocked) => BOTS.map((b) => ({ ...b, allowed: !blocked.includes(b.bot) }));
    assert.equal(verdict(rows([])), 'allows_all_ai');
    assert.equal(verdict(rows(['GPTBot', 'CCBot'])), 'blocks_ai_training_only');
    assert.equal(verdict(rows(['GPTBot', 'OAI-SearchBot'])), 'blocks_some_ai_search');
    assert.equal(verdict(rows(BOTS.filter((b) => b.purpose !== 'search_engine').map((b) => b.bot))), 'blocks_all_ai');
    assert.equal(verdict(BOTS.filter((b) => b.purpose === 'search_engine').map((b) => ({ ...b, allowed: false }))), null);
});
await t('llms.txt parse', () => {
    const r = parseLlmsTxt('# Acme\n\n> Acme makes rockets.\n\n## Docs\n- [Guide](https://acme.com/guide.md): x\n- [API](/api.md)\n\n## Optional\n');
    assert.equal(r.title, 'Acme'); assert.equal(r.summary, 'Acme makes rockets.'); assert.deepEqual(r.sections, ['Docs', 'Optional']); assert.equal(r.linkCount, 2); assert.equal(r.validFormat, true);
});
await t('html soft 404 detection', () => { assert.ok(looksLikeHtml('<!DOCTYPE html><html>', '')); assert.ok(looksLikeHtml('x', 'text/html; charset=utf-8')); assert.ok(!looksLikeHtml('User-agent: *', 'text/plain')); });
await t('meta robots + X-Robots-Tag directives', () => {
    const m = metaRobots('<head><meta name="robots" content="index, follow, noai, noimageai"><meta content="noindex" name="GPTBot"><meta name="viewport" content="x"></head>');
    assert.deepEqual(m, [{ name: 'robots', content: 'index, follow, noai, noimageai' }, { name: 'gptbot', content: 'noindex' }]);
    assert.deepEqual(directives(m, null), { noindex: true, noai: true, noimageai: true });
    assert.deepEqual(directives([], 'googlebot: noindex'), { noindex: true, noai: false, noimageai: false });
    assert.deepEqual(directives([{ name: 'robots', content: 'index,follow' }], null), { noindex: false, noai: false, noimageai: false });
});
await t('toTarget', () => {
    assert.deepEqual(toTarget('https://www.NYTimes.com/section/x?y=1'), { host: 'www.nytimes.com', scheme: 'https', port: '' });
    assert.deepEqual(toTarget('stripe.com'), { host: 'stripe.com', scheme: null, port: '' });
    assert.equal(toTarget('jane@acme.com'), null); assert.equal(toTarget('ftp://x.com'), null); assert.equal(toTarget('localhost'), null); assert.equal(toTarget('not a domain'), null);
    assert.equal(toTarget('münchen.de').host, 'xn--mnchen-3ya.de');
});
if (process.env.LIVE) await t('LIVE: nytimes.com blocks GPTBot', async () => {
    const r = await fetch('https://www.nytimes.com/robots.txt', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; AICrawlerAccessChecker/1.0)' } });
    assert.equal(isAllowed(parseRobots(await r.text()), 'GPTBot').allowed, false);
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
