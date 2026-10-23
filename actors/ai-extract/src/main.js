import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import robotsParser from 'robots-parser';
import { htmlToMarkdown, truncateToTokens, estTokens, isProbablyHtmlUrl } from './markdown.js';
import { normalizeSchema, validate, stripNulls, InputError } from './schema.js';
import { extract, PRESETS, priceOf, costUsd, LlmError } from './llm.js';
import { freeTrialCap } from './plan.js';
const FREE_TRIAL_PAGES = 25;

const EVENT_BUILTIN = 'page-extracted';
const EVENT_BYOK = 'page-extracted-own-key';
const PRICE_BUILTIN = 0.008; // keep in sync with the Store pricing (used only by the cost guard)
const UA_TOKEN = 'AIExtract';
const MAX_BODY = 5 * 1024 * 1024;
// Built-in key limits: caps keep worst-case AI cost per page far below the per-page price.
const BUILTIN = { maxIn: 16000, maxOut: 4000, maxPriceIn: 0.30, maxPriceOut: 2.50 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d)));
const normUrl = (u) => { const x = new URL(u); x.hash = ''; return x.href; };

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        startUrls = [], urls, instructions = '', jsonSchema, maxCrawlDepth = 0, maxPages = 20, sameDomainOnly = true,
        includeUrlPatterns = [], excludeUrlPatterns = [], contentSelector, removeSelectors, keepHeaderFooter = false,
        includeMarkdown = false, maxInputTokensPerPage = 8000, maxOutputTokensPerPage = 1500, maxConcurrency = 5, maxRetries = 2,
        requestTimeoutSecs = 30, llmApiKey, llmProvider = 'openai', llmModel, llmBaseUrl, maxAiCostUsd,
        proxyConfiguration = { useApifyProxy: false },
    } = input;

    // ---------- input validation ----------
    const rawUrls = [...(Array.isArray(startUrls) ? startUrls : [startUrls]), ...(Array.isArray(urls) ? urls : urls ? String(urls).split(/[\n,\s]+/) : [])]
        .map((x) => (typeof x === 'object' && x ? x.url : x)).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (!rawUrls.length) throw new InputError('Add at least one URL to "Start URLs", e.g. https://books.toscrape.com/');
    const schema = normalizeSchema(jsonSchema);
    const prompt = String(instructions || '').trim();
    if (!prompt && !schema) throw new InputError('Describe what to extract in "Instructions" and/or give a "JSON schema".');
    if (prompt.length > 8000) throw new InputError('"Instructions" is too long (max 8,000 characters).');
    const toRegex = (arr, name) => (Array.isArray(arr) ? arr : [arr]).filter(Boolean).map((p) => {
        try { return new RegExp(typeof p === 'object' ? p.regex ?? p.glob ?? p.url : p, 'i'); } catch (e) { throw new InputError(`Invalid pattern in "${name}": ${e.message}`); }
    });
    const inc = toRegex(includeUrlPatterns, 'Include URL patterns'); const exc = toRegex(excludeUrlPatterns, 'Exclude URL patterns');

    // ---------- AI key mode ----------
    const byok = Boolean(llmApiKey && String(llmApiKey).trim());
    let ai;
    if (byok) {
        if (!PRESETS[llmProvider]) throw new InputError(`Unknown "AI provider" ${llmProvider}. Use one of: ${Object.keys(PRESETS).join(', ')}`);
        if (llmProvider === 'openai-compatible' && !llmBaseUrl) throw new InputError('Set "AI API base URL" when the provider is "openai-compatible".');
        const model = llmModel || PRESETS[llmProvider].model;
        if (!model) throw new InputError('Set "AI model" for an OpenAI-compatible provider.');
        ai = { provider: llmProvider, apiKey: String(llmApiKey).trim(), baseUrl: llmBaseUrl || null, model, mode: 'own-key',
            maxIn: clampInt(maxInputTokensPerPage, 8000, 500, 400000), maxOut: clampInt(maxOutputTokensPerPage, 1500, 64, 64000) };
    } else {
        const key = process.env.LLM_API_KEY;
        if (!key) throw new InputError('The built-in AI is not available on this deployment right now. Add your own AI API key in "Your AI API key (optional)" to run.');
        const provider = process.env.LLM_PROVIDER || 'openai';
        let model = process.env.LLM_MODEL || PRESETS[provider]?.model;
        if (llmModel && llmModel !== model) {
            const [pi, po] = priceOf(llmModel);
            if (pi <= BUILTIN.maxPriceIn && po <= BUILTIN.maxPriceOut && PRESETS[provider]?.kind === 'openai' && /^gpt-/.test(llmModel)) model = llmModel;
            else log.warning(`"AI model" ${llmModel} is only available with your own API key; using ${model}.`);
        }
        ai = { provider, apiKey: key, baseUrl: process.env.LLM_BASE_URL || null, model, mode: 'built-in',
            maxIn: clampInt(maxInputTokensPerPage, 8000, 500, BUILTIN.maxIn), maxOut: clampInt(maxOutputTokensPerPage, 1500, 64, BUILTIN.maxOut) };
    }
    const aiCfg = { provider: ai.provider, apiKey: ai.apiKey, baseUrl: ai.baseUrl, model: ai.model, maxOutputTokens: ai.maxOut, timeoutMs: 120000 }; // shared so a strict-mode fallback sticks
    const EVENT = byok ? EVENT_BYOK : EVENT_BUILTIN;
    const requestedPages = clampInt(maxPages, 20, 1, 100000);
    const trial = freeTrialCap({ requested: requestedPages, byok, limit: FREE_TRIAL_PAGES });
    const pageCap = trial.cap;
    if (trial.limited) log.warning(`Apify free plan: the built-in AI processes at most ${FREE_TRIAL_PAGES} pages per run. Add your own AI API key, or use any paid Apify plan, to process up to ${requestedPages}.`);
    const depthCap = clampInt(maxCrawlDepth, 0, 0, 10);
    const conc = clampInt(maxConcurrency, 5, 1, 25);
    const retries = clampInt(maxRetries, 2, 0, 5);
    const aiCap = byok && Number(maxAiCostUsd) > 0 ? Number(maxAiCostUsd) : null;
    log.info(`AI: ${ai.mode} key, ${ai.provider}/${ai.model}; up to ${pageCap} pages, depth ${depthCap}, ${ai.maxIn} input tokens/page.`);

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    const stats = { requests: 0, httpRetries: 0, aiCalls: 0, aiRetries: 0, inputTokens: 0, outputTokens: 0, aiCostUsd: 0, robotsBlocked: 0, truncatedPages: 0 };
    const counts = {}; let charged = 0; let stop = null; let fatal = null;

    // ---------- HTTP + robots ----------
    async function get(url, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5') {
        let lastErr;
        for (let a = 0; a <= retries; a++) {
            stats.requests++;
            try {
                const res = await gotScraping({ url, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: clampInt(requestTimeoutSecs, 30, 5, 120) * 1000 },
                    throwHttpErrors: false, retry: { limit: 0 }, followRedirect: true, maxRedirects: 8, headers: { accept },
                    headerGeneratorOptions: { browsers: ['chrome'], devices: ['desktop'] } });
                if ((res.statusCode === 429 || res.statusCode >= 500) && a < retries) { stats.httpRetries++; await sleep(1500 * 2 ** a); continue; }
                return res;
            } catch (e) { lastErr = e; if (a < retries) { stats.httpRetries++; await sleep(1000 * 2 ** a); } }
        }
        throw lastErr;
    }
    const robotsCache = new Map();
    function robotsFor(origin) {
        if (!robotsCache.has(origin)) {
            robotsCache.set(origin, (async () => {
                try {
                    const res = await get(`${origin}/robots.txt`, 'text/plain,*/*;q=0.5');
                    if (res.statusCode >= 500) return { blockAll: true };
                    const body = res.statusCode >= 400 || /<html/i.test(String(res.body).slice(0, 500)) ? '' : String(res.body).slice(0, 500000);
                    return { robots: robotsParser(`${origin}/robots.txt`, body) };
                } catch { return { unreachable: true }; }
            })());
        }
        return robotsCache.get(origin);
    }
    async function robotsCheck(url) {
        const r = await robotsFor(new URL(url).origin);
        if (r.unreachable) return 'unreachable';
        if (r.blockAll) return false;
        return r.robots.isAllowed(url, UA_TOKEN) !== false;
    }
    const hostNext = new Map();
    async function polite(url) {
        const { host, origin } = new URL(url);
        const r = await robotsFor(origin);
        const delay = Math.max(250, Math.min(10, Number(r.robots?.getCrawlDelay(UA_TOKEN)) || 0) * 1000);
        for (;;) {
            const now = Date.now(); const t = hostNext.get(host) || 0;
            if (now >= t) { hostNext.set(host, now + delay); return; }
            await sleep(t - now);
        }
    }

    // ---------- queue ----------
    const seen = new Set(); const queue = []; let enqueued = 0;
    const startHosts = new Set();
    const invalid = [];
    for (const r of rawUrls) {
        let u; try { u = new URL(/^https?:\/\//i.test(r) ? r : `https://${r}`); } catch { invalid.push(r); continue; }
        if (!/^https?:$/.test(u.protocol)) { invalid.push(r); continue; }
        const n = normUrl(u.href); if (seen.has(n)) continue;
        seen.add(n); startHosts.add(u.hostname.replace(/^www\./, '')); queue.push({ url: n, depth: 0 }); enqueued++;
    }
    for (const r of invalid) { counts.invalid_url = (counts.invalid_url ?? 0) + 1; await Actor.pushData({ url: r, status: 'invalid_url', error: 'Not a valid http(s) URL', data: null, extractedAt: new Date().toISOString() }); }
    const wanted = (u, depth) => {
        if (depth > depthCap || enqueued >= pageCap) return false;
        let x; try { x = new URL(u); } catch { return false; }
        if (!/^https?:$/.test(x.protocol) || !isProbablyHtmlUrl(x.pathname)) return false;
        if (sameDomainOnly && !startHosts.has(x.hostname.replace(/^www\./, ''))) return false;
        if (inc.length && !inc.some((re) => re.test(u))) return false;
        if (exc.some((re) => re.test(u))) return false;
        return true;
    };

    // ---------- per page ----------
    async function processPage({ url, depth }) {
        const row = { url, loadedUrl: null, depth, status: 'ok', title: null, data: null, error: null, truncated: false,
            inputTokens: 0, outputTokens: 0, model: ai.model, aiKey: ai.mode, extractedAt: null };
        const ok = await robotsCheck(url);
        if (ok === 'unreachable') return { ...row, status: 'fetch_error', error: 'Website could not be reached' };
        if (!ok) { stats.robotsBlocked++; return { ...row, status: 'blocked_by_robots_txt', error: 'The site\'s robots.txt does not allow automated access to this page' }; }
        await polite(url);
        let res;
        try { res = await get(url); } catch (e) { return { ...row, status: 'fetch_error', error: `Could not load page: ${e.code || e.message}` }; }
        const finalUrl = res.url || url; row.loadedUrl = finalUrl;
        if (new URL(finalUrl).origin !== new URL(url).origin && (await robotsCheck(finalUrl)) !== true) { stats.robotsBlocked++; return { ...row, status: 'blocked_by_robots_txt', error: 'Redirect target is disallowed by robots.txt' }; }
        if (res.statusCode >= 400) return { ...row, status: 'http_error', error: `Page returned HTTP ${res.statusCode}${res.statusCode === 403 ? ' (bot protection; try enabling a proxy)' : ''}` };
        const ct = String(res.headers['content-type'] || ''); let html = String(res.body ?? '');
        if (!/html|xml/i.test(ct) && !/<html|<body|<div/i.test(html.slice(0, 3000))) return { ...row, status: 'not_html', error: `Not an HTML page (${ct || 'unknown type'})` };
        if (html.length > MAX_BODY) html = html.slice(0, MAX_BODY);
        let page;
        try { page = htmlToMarkdown(html, finalUrl, { contentSelector, removeSelectors, keepHeaderFooter }); } catch (e) { return { ...row, status: 'parse_error', error: `Could not parse HTML: ${e.message}` }; }
        html = null;
        row.title = page.title;
        // Enqueue links before the AI call so crawling proceeds in parallel.
        if (depth < depthCap) for (const l of page.links) { const n = normUrl(l); if (!seen.has(n) && wanted(n, depth + 1)) { seen.add(n); queue.push({ url: n, depth: depth + 1 }); enqueued++; } }
        if (!page.markdown || page.markdown.replace(/[\s#*_|>-]+/g, '').length < 5) return { ...row, status: 'empty_page', error: 'Page has no readable text (it may need JavaScript to render)' };
        const overhead = 600 + estTokens(prompt) + (schema ? estTokens(JSON.stringify(schema)) : 0);
        const budget = ai.maxIn - overhead;
        if (budget < 200) return { ...row, status: 'input_too_large', error: 'Instructions + schema use the whole input token budget; raise "Max input tokens per page" or shorten them' };
        const t = truncateToTokens(page.markdown, budget); row.truncated = t.truncated; if (t.truncated) stats.truncatedPages++;
        if (includeMarkdown) row.markdown = t.text;
        // Cost guards
        if (aiCap && stats.aiCostUsd >= aiCap) { stop ??= `Reached your AI cost cap of $${aiCap}`; return { ...row, status: 'skipped_cost_cap', error: stop }; }
        if (!byok && stats.aiCostUsd > 0.05 + 0.5 * PRICE_BUILTIN * Math.max(1, charged)) { stop ??= 'Built-in AI cost guard tripped (unusually large pages); stopping'; return { ...row, status: 'skipped_cost_cap', error: stop }; }
        let feedback = null;
        for (let a = 0; a <= retries; a++) {
            if (fatal) return { ...row, status: 'ai_error', error: fatal };
            try {
                stats.aiCalls++;
                const r = await extract(aiCfg,
                    { instructions: prompt, schema, page: { url: finalUrl, title: page.title, markdown: t.text }, feedback });
                row.inputTokens += r.inputTokens; row.outputTokens += r.outputTokens; row.model = r.model;
                stats.inputTokens += r.inputTokens; stats.outputTokens += r.outputTokens; stats.aiCostUsd += costUsd(ai.model, r.inputTokens, r.outputTokens);
                let data = schema ? stripNulls(r.data, schema) : r.data;
                const v = validate(schema, data);
                if (!v.ok) { feedback = `it did not match the schema (${v.errors})`; if (a < retries) { stats.aiRetries++; continue; } return { ...row, status: 'invalid_output', error: `AI output did not match the schema: ${v.errors}` }; }
                if (schema?.['x-wrapped']) data = data.items;
                return { ...row, data, extractedAt: new Date().toISOString() };
            } catch (e) {
                if (!(e instanceof LlmError)) throw e;
                if (e.fatal) { fatal ??= byok ? e.message : `Built-in AI is temporarily unavailable (${e.status ?? 'error'}). Try again later or add your own AI API key.`; return { ...row, status: 'ai_error', error: fatal }; }
                if (a < retries) { stats.aiRetries++; if (/not valid JSON|max output/i.test(e.message)) feedback = e.message; await sleep(e.retryable ? 2000 * 2 ** a : 500); continue; }
                return { ...row, status: 'ai_error', error: e.message };
            }
        }
        return { ...row, status: 'ai_error', error: 'AI extraction failed' };
    }

    async function save(row) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        row.extractedAt ??= new Date().toISOString();
        if (row.status !== 'ok') { await Actor.pushData(row); return; } // only successful extractions are charged
        if (charging) {
            const left = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(left) && left < 1) { stop ??= 'Reached the maximum cost you set for this run'; counts.ok--; counts.skipped_max_cost = (counts.skipped_max_cost ?? 0) + 1; return; }
        }
        const r = await Actor.pushData(row, EVENT); charged++;
        if (r?.eventChargeLimitReached) stop ??= 'Reached the maximum cost you set for this run';
    }

    let active = 0; let done = 0;
    const worker = async () => {
        for (;;) {
            if (stop || fatal) return;
            const job = queue.shift();
            if (!job) { if (active === 0) return; await sleep(200); continue; }
            active++;
            let row;
            try { row = await processPage(job); } catch (e) { row = { url: job.url, depth: job.depth, status: 'error', error: e.message, data: null }; }
            await save(row); active--;
            if (++done % 10 === 0) log.info(`Processed ${done} pages (${counts.ok ?? 0} extracted, ${queue.length} queued)`);
        }
    };
    await Promise.all(Array.from({ length: conc }, worker));

    const summary = { pagesProcessed: done, extracted: counts.ok ?? 0, charged, byStatus: counts, aiKey: ai.mode, provider: ai.provider, model: ai.model,
        stoppedBecause: fatal || stop || null, stats: { ...stats, aiCostUsd: Number(stats.aiCostUsd.toFixed(6)) }, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    log.info(`Summary: ${JSON.stringify(summary)}`);
    if (fatal && !(counts.ok)) throw new Error(fatal);
    const fetchFails = (counts.fetch_error ?? 0);
    if (done >= 3 && !(counts.ok) && fetchFails === done) throw new Error(`None of the ${done} pages could be reached. This looks like a network problem; try again or enable a proxy.`);
    const other = Object.entries(counts).filter(([k]) => k !== 'ok').map(([k, v]) => `${v} ${k}`).join(', ');
    await Actor.exit(`Extracted ${counts.ok ?? 0} of ${done + invalid.length} pages${other ? ` (${other}; not charged)` : ''}${fatal || stop ? `. Stopped: ${fatal || stop}` : ''}.`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Input error: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
