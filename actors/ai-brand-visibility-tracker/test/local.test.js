// Offline unit tests (no network, no API spend): node test/local.test.js
import assert from 'node:assert/strict';
import { parseEntity, cleanUrl, sanitizeText, analyzeAnswer, extractCitations, summarize, normDomain } from '../src/analyze.js';
import { askChatGPT, classify, costUsd, EngineError } from '../src/engine.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await t('parseEntity', () => {
    assert.deepEqual(parseEntity('Coda | https://www.coda.io/x', 'competitor'), { name: 'Coda', domain: 'coda.io', aliases: ['Coda'], role: 'competitor' });
    assert.equal(parseEntity({ name: 'Notion', domain: 'notion.com', aliases: ['Notion AI'] }, 'brand').aliases.length, 2);
    assert.equal(parseEntity('  ', 'competitor'), null);
    assert.equal(normDomain('not a domain'), null);
});

await t('privacy: query strings, emails, phones removed', () => {
    assert.equal(cleanUrl('https://www.hubspot.com/products/crm?pt_email=a%40b.com&pt_name=A+B#x'), 'https://www.hubspot.com/products/crm');
    assert.equal(cleanUrl('javascript:alert(1)'), null);
    const s = sanitizeText('See [HubSpot](https://hubspot.com/crm?pt_email=risa%40yahoo.com&utm_source=openai) or mail jane.doe@gmail.com, call +1 (415) 555-0134. Founded 2006.');
    assert.ok(!/pt_email|utm_source|jane\.doe|555-0134/.test(s), s);
    assert.ok(s.includes('Founded 2006') && s.includes('https://hubspot.com/crm'));
});

const ANSWER = `Here are good picks:

1. **Coda** - flexible docs ([coda.io](https://coda.io/?utm_source=openai))
2. **Notion** - great all-rounder; Notion AI helps writing.
3. Confluence - best if you use Jira.

Many teams start with Notion. Monday.com is another option.`;
const ENTS = [parseEntity({ name: 'Notion', domain: 'notion.com', aliases: ['Notion AI'] }, 'brand'), parseEntity('Coda | coda.io', 'competitor'),
    parseEntity('Confluence | atlassian.com', 'competitor'), parseEntity('ClickUp', 'competitor'), parseEntity('Monday.com', 'competitor')];

await t('analyzeAnswer: mentions, rank, list position, citations', () => {
    const cites = extractCitations([{ type: 'url_citation', url: 'https://coda.io/?utm_source=openai', title: 'Coda' }, { type: 'url_citation', url: 'https://coda.io/' }],
        [{ url: 'https://www.notion.com/blog?ref=x', title: 'Blog' }]);
    assert.equal(cites.length, 2); // deduped after cleaning
    const r = analyzeAnswer(ANSWER, cites, ENTS);
    const by = Object.fromEntries(r.map((x) => [x.name, x]));
    assert.equal(by.Coda.rank, 1); assert.equal(by.Coda.listPosition, 1); assert.equal(by.Coda.cited, true);
    assert.equal(by.Notion.rank, 2); assert.equal(by.Notion.listPosition, 2); assert.equal(by.Notion.mentionCount, 3); assert.equal(by.Notion.cited, true);
    assert.equal(by.Confluence.listPosition, 3); assert.equal(by.ClickUp.mentioned, false); assert.equal(by.ClickUp.rank, null);
    assert.equal(by['Monday.com'].mentioned, true); assert.equal(by['Monday.com'].listPosition, null); // in a paragraph after the list
});

await t('analyzeAnswer: no false match inside words or link URLs', () => {
    const r = analyzeAnswer('Codable apps and [docs](https://coda.io) are fine.', [], [parseEntity('Coda', 'competitor')]);
    assert.equal(r[0].mentioned, false);
});

const fakeFetch = (responses) => { const calls = []; const f = async (url, opts) => { calls.push(JSON.parse(opts.body)); const r = responses.shift(); return { ok: r.status === 200, status: r.status, text: async () => JSON.stringify(r.body) }; }; f.calls = calls; return f; };
const RESP = { model: 'gpt-6-luna', status: 'completed', usage: { input_tokens: 12000, output_tokens: 400 }, output: [
    { type: 'web_search_call', action: { type: 'search', query: 'best wiki tool startup', sources: [{ url: 'https://www.notion.com/x?y=1' }] } },
    { type: 'message', content: [{ type: 'output_text', text: ANSWER, annotations: [{ type: 'url_citation', url: 'https://coda.io/?utm_source=openai', title: 'Coda' }] }] }] };

await t('askChatGPT: request shape, parsing, cost', async () => {
    const f = fakeFetch([{ status: 200, body: RESP }]);
    const r = await askChatGPT({ apiKey: 'sk-test', prompt: 'best wiki?', country: 'US', fetchFn: f });
    const b = f.calls[0];
    assert.equal(b.tools[0].type, 'web_search'); assert.equal(b.tools[0].user_location.country, 'US'); assert.equal(b.tool_choice, 'required'); assert.equal(b.store, false);
    assert.equal(r.searches, 1); assert.equal(r.citations.length, 2); assert.deepEqual(r.searchQueries, ['best wiki tool startup']);
    assert.ok(Math.abs(r.costUsd - (12000 * 0.1 + 400 * 0.5) / 1e6 - 0.01) < 1e-9);
    assert.ok(!r.answer.includes('utm_source'));
});

await t('askChatGPT: error classes, key never echoed', async () => {
    await assert.rejects(askChatGPT({ apiKey: 'k', prompt: 'x', fetchFn: fakeFetch([{ status: 401, body: { error: { message: 'Incorrect API key provided: sk-abcdef123456' } } }]) }),
        (e) => e instanceof EngineError && e.fatal && !e.message.includes('abcdef123456'));
    await assert.rejects(askChatGPT({ apiKey: 'k', prompt: 'x', fetchFn: fakeFetch([{ status: 429, body: { error: { message: 'Rate limit' } } }]) }), (e) => e.retryable && !e.fatal);
    await assert.rejects(askChatGPT({ apiKey: 'k', prompt: 'x', fetchFn: fakeFetch([{ status: 429, body: { error: { message: 'You exceeded your current quota' } } }]) }), (e) => e.fatal);
    await assert.rejects(askChatGPT({ apiKey: 'k', prompt: 'x', fetchFn: fakeFetch([{ status: 200, body: { status: 'incomplete', output: [] } }]) }), (e) => e.retryable);
});

await t('classify: strict JSON schema request and parse', async () => {
    const out = { entities: [{ name: 'Notion', sentiment: 'positive', recommended: true }], otherBrands: ['Slab'] };
    const f = fakeFetch([{ status: 200, body: { model: 'gpt-6-luna', usage: { input_tokens: 900, output_tokens: 80 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }] } }]);
    const c = await classify({ apiKey: 'k', prompt: 'p', answer: ANSWER, names: ['Notion'], tracked: ['Notion'], fetchFn: f });
    assert.equal(f.calls[0].text.format.type, 'json_schema'); assert.equal(f.calls[0].tools, undefined);
    assert.equal(c.entities[0].sentiment, 'positive'); assert.deepEqual(c.otherBrands, ['Slab']); assert.ok(c.costUsd > 0 && c.costUsd < 0.001);
});

await t('summarize: share of voice and leaderboard', () => {
    const cites = extractCitations([{ type: 'url_citation', url: 'https://coda.io/' }]);
    const mk = (text, prompt) => ({ status: 'ok', prompt, citations: cites, otherBrandsMentioned: ['Slab'], entities: analyzeAnswer(text, cites, ENTS).map((e) => ({ ...e, sentiment: e.mentioned ? 'positive' : null })) });
    const rows = [mk(ANSWER, 'a'), mk('Try ClickUp or Notion.', 'b'), { status: 'error', prompt: 'c', entities: [], citations: [] }];
    const s = summarize(rows, ENTS);
    assert.equal(s.checks, 2); assert.equal(s.brandMentionRate, 1); assert.equal(s.leaderboard[0].name, 'Notion');
    const sum = s.leaderboard.reduce((a, b) => a + b.shareOfVoice, 0); assert.ok(Math.abs(sum - 1) < 0.01);
    assert.equal(s.prompts.find((p) => p.prompt === 'b').bestRank, 2); assert.equal(s.topCitedDomains[0].domain, 'coda.io'); assert.equal(s.otherBrandsMentioned[0].count, 2);
});

await t('costUsd sane for default model', () => { const c = costUsd('gpt-6-luna', 13000, 400, 1); assert.ok(c > 0.011 && c < 0.013); });
console.log(`${n} test groups passed`);
