// Local tests with mocked websites and mocked AI providers. No network, no real keys.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { htmlToMarkdown, truncateToTokens } from '../src/markdown.js';
import { normalizeSchema, toStrict, validate, stripNulls } from '../src/schema.js';
import { extract, LlmError } from '../src/llm.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FAKE_KEY = 'sk-test-DO-NOT-LEAK-123';
let n = 0; const t = async (name, fn) => { try { await fn(); n++; console.log(`ok  ${name}`); } catch (e) { console.error(`FAIL ${name}`); throw e; } };
const listen = (handler) => new Promise((r) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });

// ---------- unit ----------
await t('markdown strips chrome, keeps main, absolutizes links', () => {
    const md = htmlToMarkdown(`<html lang="en"><head><title>Shop | Widget</title><meta name="description" content="A widget"><script>evil()</script></head>
<body><nav><a href="/x">Menu</a></nav><div class="cookie-banner">Accept cookies</div><main><h1>Blue Widget</h1><p>Price: <b>$19.99</b></p>
<img src="a.png" alt="blue widget photo"><table><tr><th>Size</th><th>Weight</th></tr><tr><td>M</td><td>1kg</td></tr></table><a href="/w/2">Next</a></main><footer>© 2026</footer></body></html>`, 'https://s.test/w/1');
    assert.equal(md.title, 'Shop | Widget'); assert.equal(md.lang, 'en');
    assert.match(md.markdown, /# Blue Widget/); assert.match(md.markdown, /\$19\.99/); assert.match(md.markdown, /\| Size \| Weight \|/);
    assert.match(md.markdown, /https:\/\/s\.test\/w\/2/); assert.match(md.markdown, /blue widget photo/);
    assert.doesNotMatch(md.markdown, /evil|Menu|cookies|© 2026/);
    assert.ok(md.links.includes('https://s.test/w/2'));
});
await t('truncate', () => { const r = truncateToTokens('word '.repeat(5000), 100); assert.ok(r.truncated); assert.ok(r.text.length <= 440 && r.text.endsWith("truncated ...]")); });
await t('schema shorthand + strict conversion', () => {
    const s = normalizeSchema({ title: 'string', price: 'number', tags: 'string[]', inStock: 'boolean' });
    assert.equal(s.properties.tags.type, 'array');
    const st = toStrict({ type: 'object', properties: { a: { type: 'string', format: 'uri' }, b: { type: 'object', properties: { c: { type: 'integer', minimum: 1 } } } }, required: ['a'] });
    assert.equal(st.additionalProperties, false); assert.deepEqual(st.required, ['a', 'b']);
    assert.deepEqual(st.properties.b.type, ['object', 'null']); assert.equal(st.properties.b.additionalProperties, false);
    const w = normalizeSchema({ type: 'array', items: { type: 'object', properties: { n: { type: 'string' } } } });
    assert.ok(w['x-wrapped']); assert.equal(w.properties.items.type, 'array');
    assert.ok(validate(s, stripNulls({ title: 'x', price: 1, tags: [], inStock: null }, s)).ok);
    assert.equal(validate(s, { title: 'x', price: 'cheap' }).ok, false);
    assert.throws(() => normalizeSchema('{not json'), /schema/i);
});

// ---------- provider adapters against mock servers ----------
const seenReq = [];
const ai = await listen(async (req, res) => {
    const b = JSON.parse(await body(req) || '{}'); seenReq.push({ url: req.url, headers: req.headers, body: b });
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization === 'Bearer bad' || req.headers['x-api-key'] === 'bad') return send(401, { error: { message: 'Incorrect API key provided' } });
    if (req.url.endsWith('/messages')) return send(200, { model: b.model, stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 }, content: [{ type: 'tool_use', name: 'save_extraction', input: { title: 'From Claude', price: 5 } }] });
    if (req.url.includes(':generateContent')) return send(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"title":"From Gemini","price":7}' }] } }], usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 8 } });
    if (req.url.endsWith('/chat/completions')) {
        const user = b.messages[1].content;
        const page = /PAGE MARKDOWN[^\n]*\n([\s\S]*)/.exec(user)?.[1] ?? user;
        const h1 = /^# (.+)$/m.exec(page)?.[1] ?? null; const price = /\$(\d+(?:\.\d+)?)/.exec(page)?.[1];
        let data = { title: h1, price: price ? Number(price) : null, currency: price ? 'USD' : null, inStock: /In stock/i.test(page) };
        if (/ALWAYS-BAD/.test(page)) data = { title: 42 };
        else if (/TRICKY/.test(page) && !/previous answer was rejected/.test(user)) data = { title: h1, price: 'nineteen' };
        return send(200, { model: b.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: Math.ceil(user.length / 4), completion_tokens: 30 } });
    }
    send(404, { error: { message: 'model not found' } });
});
const AI = `http://127.0.0.1:${ai.address().port}`;
const schema = normalizeSchema({ title: 'string', price: 'number' });
const page = { url: 'https://x.test/', title: 'X', markdown: '# X\n$5' };
await t('anthropic adapter (forced tool)', async () => {
    const r = await extract({ provider: 'anthropic', apiKey: 'k', baseUrl: AI, model: 'claude-haiku-5-5' }, { instructions: 'get', schema, page });
    assert.deepEqual(r.data, { title: 'From Claude', price: 5 }); assert.equal(r.inputTokens, 100);
    const q = seenReq.at(-1); assert.equal(q.body.tool_choice.name, 'save_extraction'); assert.equal(q.headers['x-api-key'], 'k');
});
await t('gemini adapter (json schema)', async () => {
    const r = await extract({ provider: 'gemini', apiKey: 'g', baseUrl: AI, model: 'gemini-3.1-flash-lite' }, { instructions: 'get', schema, page });
    assert.equal(r.data.title, 'From Gemini'); const q = seenReq.at(-1);
    assert.equal(q.headers['x-goog-api-key'], 'g'); assert.equal(q.body.generationConfig.responseMimeType, 'application/json');
});
await t('openai adapter strict + reasoning none; bad key is fatal', async () => {
    await extract({ provider: 'openai', apiKey: 'k', baseUrl: AI, model: 'gpt-6-luna' }, { instructions: 'get', schema, page });
    const q = seenReq.at(-1); assert.equal(q.body.response_format.type, 'json_schema'); assert.equal(q.body.response_format.json_schema.strict, true);
    assert.equal(q.body.reasoning_effort, 'none'); assert.equal(q.headers.authorization, 'Bearer k');
    await assert.rejects(extract({ provider: 'openai', apiKey: 'bad', baseUrl: AI, model: 'gpt-6-luna' }, { instructions: 'get', schema, page }), (e) => e instanceof LlmError && e.fatal);
});

// ---------- end-to-end actor runs against a mock website ----------
const P = (title, extra = '') => `<html><head><title>${title}</title></head><body><nav>Home</nav><main><h1>${title}</h1>${extra}</main></body></html>`;
const site = await listen((req, res) => {
    const html = (s, code = 200) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(s); };
    switch (req.url) {
        case '/robots.txt': res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /private\n');
        case '/': return html(P('Catalog', '<a href="/p/1">One</a> <a href="/p/2">Two</a> <a href="/private/x">Secret</a> <a href="/gone">Gone</a> <a href="/tricky">T</a> <a href="/bad">B</a> <a href="/file.pdf">PDF</a> <a href="https://other.test/">Other</a>'));
        case '/p/1': return html(P('Red Shoe', '<p>$49.50 In stock</p><a href="/p/1/deeper">deeper</a>'));
        case '/p/2': return html(P('Blue Hat', '<p>$12</p>'));
        case '/tricky': return html(P('Green Bag', '<p>$19 TRICKY</p>'));
        case '/bad': return html(P('Broken', '<p>ALWAYS-BAD</p>'));
        case '/data.json': res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"a":1}');
        default: return html('nope', 404);
    }
});
const SITE = `http://127.0.0.1:${site.address().port}`;

function runActor(input, env = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-'));
    fs.mkdirSync(path.join(dir, 'key_value_stores/default'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'key_value_stores/default/INPUT.json'), JSON.stringify(input));
    return new Promise((resolve) => {
        const p = spawn(process.execPath, ['src/main.js'], { cwd: ROOT, env: { PATH: process.env.PATH, CRAWLEE_STORAGE_DIR: dir, APIFY_LOCAL_STORAGE_DIR: dir, ACTOR_TEST_PAY_PER_EVENT: '1', ACTOR_USE_CHARGING_LOG_DATASET: '1', ...env } });
        let out = ''; p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { out += c; });
        p.on('close', (code) => {
            const ds = (name) => { const d = path.join(dir, 'datasets', name); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(d, f)))) : []; };
            const o = path.join(dir, 'key_value_stores/default/OUTPUT.json');
            resolve({ code, out, rows: ds('default'), charges: ds('charging_log'), summary: fs.existsSync(o) ? JSON.parse(fs.readFileSync(o)) : null, dir });
        });
    });
}
const BUILTIN_ENV = { LLM_API_KEY: FAKE_KEY, LLM_BASE_URL: `${AI}/v1`, LLM_MODEL: 'gpt-6-luna' };
const baseInput = { startUrls: [{ url: `${SITE}/` }], maxCrawlDepth: 1, maxPages: 20, instructions: 'Product title, price, currency, stock', jsonSchema: { title: 'string', price: 'number', currency: 'string', inStock: 'boolean' }, maxConcurrency: 3, maxRetries: 1 };

await t('e2e built-in key: crawl, robots, retries, validation, charging only ok rows', async () => {
    const r = await runActor(baseInput, BUILTIN_ENV);
    assert.equal(r.code, 0, r.out);
    if (process.env.DBG) console.log(JSON.stringify(r.rows.map(x=>[x.url,x.status,x.error,x.data]),null,1));
    const by = Object.fromEntries(r.rows.map((x) => [new URL(x.url).pathname, x]));
    assert.equal(by['/p/1'].status, 'ok'); assert.deepEqual(by['/p/1'].data, { title: 'Red Shoe', price: 49.5, currency: 'USD', inStock: true }); assert.equal(by['/p/1'].depth, 1);
    assert.equal(by['/p/2'].data.price, 12);
    assert.equal(by['/tricky'].status, 'ok', 'schema-feedback retry should fix it'); assert.equal(by['/tricky'].data.price, 19);
    assert.equal(by['/bad'].status, 'invalid_output');
    assert.equal(by['/private/x'].status, 'blocked_by_robots_txt');
    assert.equal(by['/gone'].status, 'http_error');
    assert.ok(!by['/file.pdf'] && !by['/p/1/deeper'] && !r.rows.some((x) => x.url.includes('other.test')), 'pdf, depth-2 and off-site links skipped');
    const ok = r.rows.filter((x) => x.status === 'ok').length;
    assert.equal(ok, 4); // root catalog, p1, p2, tricky assert.equal(r.summary.charged, ok); assert.equal(r.summary.aiKey, 'built-in');
    assert.equal(r.charges.filter((c) => c.eventName === 'page-extracted').reduce((a, c) => a + (c.chargedCount ?? 1), 0), ok);
    assert.ok(!r.charges.some((c) => c.eventName === 'page-extracted-own-key'));
    const blob = r.out + JSON.stringify(r.rows) + JSON.stringify(r.summary);
    assert.ok(!blob.includes(FAKE_KEY), 'API key must never appear in logs or output');
});
await t('e2e no key at all -> clear failure, nothing charged', async () => {
    const r = await runActor(baseInput, {});
    assert.notEqual(r.code, 0); assert.match(r.out, /own AI API key/); assert.equal(r.charges.length, 0);
});
await t('e2e own key (anthropic via mock) -> own-key event, includeMarkdown', async () => {
    const r = await runActor({ ...baseInput, startUrls: [`${SITE}/p/2`], maxCrawlDepth: 0, llmApiKey: 'user-key', llmProvider: 'anthropic', llmBaseUrl: AI, includeMarkdown: true, jsonSchema: { title: 'string', price: 'number' } }, BUILTIN_ENV);
    assert.equal(r.code, 0, r.out); assert.equal(r.rows[0].status, 'ok'); assert.equal(r.rows[0].aiKey, 'own-key'); assert.match(r.rows[0].markdown, /Blue Hat/);
    assert.equal(r.charges[0].eventName, 'page-extracted-own-key');
    assert.equal(seenReq.at(-1).headers['x-api-key'], 'user-key', 'user key used, not ours');
});
await t('e2e invalid own key -> fails fast with clear message, nothing charged', async () => {
    const r = await runActor({ ...baseInput, llmApiKey: 'bad', llmProvider: 'openai-compatible', llmBaseUrl: `${AI}/v1`, llmModel: 'x' }, BUILTIN_ENV);
    assert.notEqual(r.code, 0); assert.match(r.out, /key/i); assert.equal(r.charges.length, 0);
    assert.ok(r.rows.filter((x) => x.status === 'ai_error').length >= 1);
});
await t('e2e input errors', async () => {
    let r = await runActor({ startUrls: [] }, BUILTIN_ENV); assert.notEqual(r.code, 0); assert.match(r.out, /at least one URL/);
    r = await runActor({ startUrls: [`${SITE}/p/2`] }, BUILTIN_ENV); assert.notEqual(r.code, 0); assert.match(r.out, /Instructions/);
});
await t('e2e not_html + cost cap', async () => {
    const r = await runActor({ ...baseInput, startUrls: [`${SITE}/data.json`, `${SITE}/p/1`, `${SITE}/p/2`], maxCrawlDepth: 0, maxConcurrency: 1, llmApiKey: 'k', llmProvider: 'openai', llmBaseUrl: AI, maxAiCostUsd: 0.0000001 }, BUILTIN_ENV);
    assert.equal(r.code, 0, r.out);
    const st = r.rows.map((x) => x.status).sort();
    assert.ok(st.includes('not_html')); assert.equal(st.filter((s) => s === 'ok').length, 1); assert.match(r.summary.stoppedBecause, /cost cap/);
});
ai.close(); site.close();
console.log(`${n} tests passed`);
