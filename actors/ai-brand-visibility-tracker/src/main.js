import { Actor, log } from 'apify';
import { parseEntity, analyzeAnswer, summarize, sanitizeText } from './analyze.js';
import { askChatGPT, classify, DEFAULT_MODEL, EngineError } from './engine.js';

const EVENT_BUILTIN = 'brand-check';
const EVENT_BYOK = 'brand-check-own-key';
const PRICE_BUILTIN = 0.04; // keep in sync with Store pricing (used by the cost guard only)
const BUILTIN_MODELS = ['gpt-6-luna', 'gpt-5-nano', 'gpt-4o-mini', 'gpt-5.6-luna'];
const BUDGET_STORE = 'brand-tracker-owner-spend';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d)));
class InputError extends Error {}
const list = (v) => (Array.isArray(v) ? v : v ? String(v).split('\n') : []);

await Actor.init();
let exitMsg;
try {
    const input = (await Actor.getInput()) ?? {};
    const { brand, brandDomain, brandAliases = [], competitors = [], prompts = [], samplesPerPrompt = 1, country = 'US',
        analyzeSentiment = true, includeAnswerText = true, maxChecks = 50, openaiApiKey, model, maxConcurrency = 3 } = input;

    // ---------- input ----------
    const main = parseEntity(typeof brand === 'object' && brand ? brand : { name: brand, domain: brandDomain, aliases: list(brandAliases) }, 'brand');
    if (!main) throw new InputError('Set "Your brand", e.g. Notion.');
    const comps = list(competitors).map((c) => parseEntity(c, 'competitor')).filter(Boolean);
    if (comps.length > 20) throw new InputError('Track at most 20 competitors per run.');
    const entities = [main, ...comps.filter((c) => c.name.toLowerCase() !== main.name.toLowerCase())];
    const ps = [...new Set(list(prompts).map((p) => String(p ?? '').trim()).filter(Boolean))];
    if (!ps.length) throw new InputError('Add at least one prompt, e.g. "What is the best note-taking app for teams?"');
    if (ps.length > 100) throw new InputError('Use at most 100 prompts per run.');
    const tooLong = ps.find((p) => p.length > 1000); if (tooLong) throw new InputError(`Prompts must be under 1,000 characters (got one with ${tooLong.length}).`);
    const samples = clampInt(samplesPerPrompt, 1, 1, 5);
    const cc = String(country || '').trim().toUpperCase();
    if (cc && !/^[A-Z]{2}$/.test(cc)) throw new InputError('"Country" must be a 2-letter code like US, GB or DE.');
    const cap = clampInt(maxChecks, 50, 1, 1000);
    const conc = clampInt(maxConcurrency, 3, 1, 10);

    // ---------- key mode ----------
    const byok = Boolean(openaiApiKey && String(openaiApiKey).trim());
    let apiKey; let mdl;
    if (byok) { apiKey = String(openaiApiKey).trim(); mdl = String(model || DEFAULT_MODEL).trim(); }
    else {
        apiKey = process.env.LLM_API_KEY;
        if (!apiKey) throw new InputError('The built-in AI is not available on this deployment right now. Add your own OpenAI API key to run.');
        mdl = process.env.LLM_MODEL || DEFAULT_MODEL;
        if (model && model !== mdl) { if (BUILTIN_MODELS.includes(model)) mdl = model; else log.warning(`Model ${model} needs your own OpenAI key; using ${mdl}.`); }
    }
    const EVENT = byok ? EVENT_BYOK : EVENT_BUILTIN;

    // Owner test budget: hard stop on the operator's own runs (customers pay per check, so they are not limited by it).
    const env = Actor.getEnv();
    const ownerBudget = !byok && process.env.OWNER_USER_ID && env.userId === process.env.OWNER_USER_ID && Number(process.env.OWNER_BUDGET_USD) > 0 ? Number(process.env.OWNER_BUDGET_USD) : null;
    let budgetKv = null; let ownerSpent = 0;
    if (ownerBudget) {
        // The store is created by the Actor itself (limited permissions); OWNER_SEED_USD carries spend made outside Apify.
        try { budgetKv = await Actor.openKeyValueStore(BUDGET_STORE); } catch (e) { throw new EngineError(`Owner test budget store unavailable (${e.message}); not spending.`); }
        const rec = await budgetKv.getValue('SPEND');
        ownerSpent = Number(rec?.usd ?? process.env.OWNER_SEED_USD ?? 0);
        log.info(`Owner test budget: $${ownerSpent.toFixed(4)} of $${ownerBudget} used.`);
    }

    const jobs = []; for (const p of ps) for (let s = 1; s <= samples; s++) jobs.push({ prompt: p, sample: s });
    if (jobs.length > cap) log.warning(`${jobs.length} checks requested; "Max checks" is ${cap}, so only the first ${cap} run.`);
    const todo = jobs.slice(0, cap);
    log.info(`${main.name} vs ${entities.length - 1} competitors; ${ps.length} prompts x ${samples} sample(s) = ${todo.length} checks on ChatGPT (${mdl}, ${byok ? 'your key' : 'built-in key'}${cc ? `, ${cc}` : ''}).`);

    const charging = Actor.getChargingManager();
    const rows = []; const counts = {}; let charged = 0; let aiCost = 0; let stop = null; let fatal = null;
    const names = entities.map((e) => e.name);

    const one = async (job) => {
        const row = { engine: 'chatgpt', model: mdl, prompt: job.prompt, sample: job.sample, country: cc || null, brand: main.name, status: 'ok',
            brandMentioned: false, brandRank: null, brandListPosition: null, brandCited: false, brandSentiment: null, brandRecommended: null,
            competitorsMentioned: [], mentionedOrder: [], entities: [], citations: [], citedDomains: [], otherBrandsMentioned: [], searchQueries: [],
            answer: null, answerLength: 0, aiCostUsd: 0, aiKey: byok ? 'own-key' : 'built-in', checkedAt: null, error: null };
        if (stop || fatal) return null;
        if (ownerBudget && ownerSpent + aiCost + 0.03 > ownerBudget) { stop ??= `Owner test budget of $${ownerBudget} reached`; return null; }
        if (!byok && aiCost > 0.05 + 0.6 * PRICE_BUILTIN * Math.max(1, charged)) { stop ??= 'Built-in AI cost guard tripped; stopping'; return null; }
        const left = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
        if (left !== Infinity && left - (inflight - 1) <= 0) { stop ??= 'Reached your maximum cost per run'; return null; }
        let r; let err;
        for (let a = 0; a <= 2; a++) {
            try { r = await askChatGPT({ apiKey, model: mdl, prompt: job.prompt, country: cc || undefined }); break; } catch (e) {
                err = e; if (e.fatal) { fatal = e.message; break; }
                if (!e.retryable || a === 2) break; await sleep(2000 * (a + 1) + Math.random() * 1000);
            }
        }
        if (!r) { row.status = 'error'; row.error = sanitizeText(err?.message || 'unknown error'); row.checkedAt = new Date().toISOString(); return row; }
        aiCost += r.costUsd; row.aiCostUsd += r.costUsd;
        const ents = analyzeAnswer(r.answer, r.citations, entities);
        if (analyzeSentiment) {
            const mentioned = ents.filter((e) => e.mentioned).map((e) => e.name);
            try {
                const c = await classify({ apiKey, model: mdl, prompt: job.prompt, answer: r.answer, names: mentioned, tracked: names });
                aiCost += c.costUsd; row.aiCostUsd += c.costUsd;
                for (const e of ents) { const j = e.mentioned ? c.entities.find((x) => x.name.toLowerCase() === e.name.toLowerCase()) : null; e.sentiment = j?.sentiment ?? null; e.recommended = j?.recommended ?? null; }
                const lower = new Set(entities.flatMap((e) => e.aliases.map((a) => a.toLowerCase())));
                row.otherBrandsMentioned = [...new Set(c.otherBrands.map((x) => sanitizeText(String(x)).trim()).filter((x) => x && x.length < 80 && !lower.has(x.toLowerCase())))].slice(0, 15);
            } catch (e) { log.warning(`Sentiment pass failed for one check (${e.message}); mentions and citations are still returned.`); }
        }
        const b = ents.find((e) => e.role === 'brand');
        Object.assign(row, { entities: ents, brandMentioned: b.mentioned, brandRank: b.rank, brandListPosition: b.listPosition, brandCited: b.cited,
            brandSentiment: b.sentiment ?? null, brandRecommended: b.recommended ?? null,
            competitorsMentioned: ents.filter((e) => e.role === 'competitor' && e.mentioned).map((e) => e.name),
            mentionedOrder: ents.filter((e) => e.mentioned).sort((x, y) => x.rank - y.rank).map((e) => e.name),
            citations: r.citations, citedDomains: [...new Set(r.citations.filter((c) => c.kind === 'cited').map((c) => c.domain).filter(Boolean))],
            searchQueries: r.searchQueries, answer: includeAnswerText ? r.answer : null, answerLength: r.answer.length, model: r.model,
            aiCostUsd: +row.aiCostUsd.toFixed(5), checkedAt: new Date().toISOString() });
        return row;
    };

    let next = 0; let inflight = 0; let recorded = 0;
    const worker = async () => {
        while (next < todo.length && !stop && !fatal) {
            const job = todo[next++]; inflight++;
            const row = await one(job); inflight--;
            if (!row) continue;
            counts[row.status] = (counts[row.status] ?? 0) + 1; rows.push(row);
            if (row.status === 'ok') { await Actor.pushData(row, EVENT); charged++; } else await Actor.pushData(row); // failed checks are free
            if (budgetKv) { // additive: re-read so overlapping runs never overwrite each other's spend
                const delta = aiCost - recorded; recorded = aiCost;
                const cur = await budgetKv.getValue('SPEND');
                const base = Number(cur?.usd ?? process.env.OWNER_SEED_USD ?? 0);
                ownerSpent = base + delta - aiCost; // keeps the guard (ownerSpent + aiCost) equal to the shared total
                await budgetKv.setValue('SPEND', { usd: +(base + delta).toFixed(5), updatedAt: new Date().toISOString() });
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, worker));

    const summary = { ...summarize(rows, entities), engine: 'chatgpt', model: mdl, country: cc || null, aiKey: byok ? 'own-key' : 'built-in',
        checksRequested: jobs.length, checksRun: rows.length, charged, byStatus: counts, aiCostUsd: +aiCost.toFixed(5),
        stoppedReason: fatal || stop || null, finishedAt: new Date().toISOString() };
    await Actor.setValue('OUTPUT', summary);
    if (fatal && !charged) throw new EngineError(fatal);
    const pct = Math.round(100 * (summary.brandMentionRate || 0));
    exitMsg = `${main.name} was mentioned in ${summary.leaderboard.find((l) => l.role === 'brand')?.mentions ?? 0} of ${counts.ok ?? 0} ChatGPT answers (${pct}%)` +
        `${counts.error ? `; ${counts.error} checks failed (not charged)` : ''}${fatal || stop ? `. Stopped: ${fatal || stop}` : ''}.`;
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.setValue('OUTPUT', { error: e.message }); await Actor.fail(`Input error: ${e.message}`); }
    else if (e instanceof EngineError) { log.error(e.message); await Actor.fail(e.message); }
    else throw e;
}
await Actor.exit(exitMsg);
