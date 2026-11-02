// robots.txt parsing and matching per RFC 9309 (longest match wins, Allow wins ties, * and $ wildcards),
// plus the AI crawler catalog, Cloudflare-style Content-Signal parsing and llms.txt / meta robots helpers.

// purpose: training = collects data to train models; search = indexes pages for AI search answers;
// user = fetches a page when a user asks the assistant; search_engine = classic search crawler (also feeds AI Overviews / Copilot).
export const BOTS = [
    { bot: 'GPTBot', operator: 'OpenAI', purpose: 'training', product: 'ChatGPT / OpenAI models' },
    { bot: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', product: 'ChatGPT search' },
    { bot: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user', product: 'ChatGPT browsing / actions' },
    { bot: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', product: 'Claude models' },
    { bot: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', product: 'Claude search' },
    { bot: 'Claude-User', operator: 'Anthropic', purpose: 'user', product: 'Claude web fetch' },
    { bot: 'anthropic-ai', operator: 'Anthropic', purpose: 'training', product: 'Anthropic (legacy token)' },
    { bot: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', product: 'Perplexity search index' },
    { bot: 'Perplexity-User', operator: 'Perplexity', purpose: 'user', product: 'Perplexity answers' },
    { bot: 'Google-Extended', operator: 'Google', purpose: 'training', product: 'Gemini training and grounding' },
    { bot: 'Googlebot', operator: 'Google', purpose: 'search_engine', product: 'Google Search incl. AI Overviews' },
    { bot: 'Bingbot', operator: 'Microsoft', purpose: 'search_engine', product: 'Bing incl. Copilot answers' },
    { bot: 'Applebot', operator: 'Apple', purpose: 'search', product: 'Siri / Spotlight / Safari suggestions' },
    { bot: 'Applebot-Extended', operator: 'Apple', purpose: 'training', product: 'Apple Intelligence training' },
    { bot: 'Meta-ExternalAgent', operator: 'Meta', purpose: 'training', product: 'Meta AI models' },
    { bot: 'Meta-ExternalFetcher', operator: 'Meta', purpose: 'user', product: 'Meta AI link fetches' },
    { bot: 'Amazonbot', operator: 'Amazon', purpose: 'search', product: 'Alexa / Amazon AI answers' },
    { bot: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'search', product: 'DuckDuckGo AI answers' },
    { bot: 'MistralAI-User', operator: 'Mistral', purpose: 'user', product: 'Le Chat web fetch' },
    { bot: 'CCBot', operator: 'Common Crawl', purpose: 'training', product: 'Common Crawl dataset (used by many LLMs)' },
    { bot: 'Bytespider', operator: 'ByteDance', purpose: 'training', product: 'ByteDance / Doubao models' },
    { bot: 'cohere-ai', operator: 'Cohere', purpose: 'training', product: 'Cohere models' },
    { bot: 'Diffbot', operator: 'Diffbot', purpose: 'training', product: 'Diffbot knowledge graph' },
];
export const BOT_INDEX = new Map(BOTS.map((b) => [b.bot.toLowerCase(), b]));
export const MAX_ROBOTS_BYTES = 512000; // Google parses the first 500 KiB

export function parseRobots(text) {
    const groups = []; const sitemaps = []; let cur = null; let lastWasAgent = false; let lines = 0; let unknown = 0;
    const src = String(text ?? '').replace(/^\uFEFF/, '');
    for (let raw of src.split(/\r\n|\r|\n/)) {
        lines++;
        const hash = raw.indexOf('#'); if (hash >= 0) raw = raw.slice(0, hash);
        const m = raw.match(/^\s*([A-Za-z][A-Za-z-]*)\s*:\s*(.*?)\s*$/);
        if (!m) { if (raw.trim()) unknown++; continue; }
        const key = m[1].toLowerCase(); const val = m[2];
        if (key === 'user-agent' || key === 'useragent') {
            if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], contentSignal: null, crawlDelay: null }; groups.push(cur); }
            cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
        }
        if (key === 'sitemap') { if (val) sitemaps.push(val); continue; }
        lastWasAgent = false;
        if (!cur) continue; // rules before any user-agent line are ignored
        if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val });
        else if (key === 'content-signal') cur.contentSignal = parseContentSignal(val, cur.contentSignal);
        else if (key === 'crawl-delay') { const n = Number(val); if (Number.isFinite(n)) cur.crawlDelay = n; }
        else unknown++;
    }
    return { groups, sitemaps: [...new Set(sitemaps)].slice(0, 50), lines, unknownLines: unknown };
}

export function parseContentSignal(val, prev = null) {
    const out = { ...(prev ?? {}) };
    for (const part of String(val).split(',')) {
        const [k, v] = part.split('=').map((x) => x?.trim().toLowerCase());
        if (k && (v === 'yes' || v === 'no')) out[k] = v === 'yes';
    }
    return Object.keys(out).length ? out : prev;
}

const agentToken = (a) => a.split('/')[0].trim();
// Groups that apply to a product token: exact (case-insensitive) token match; otherwise the * groups (RFC 9309 2.2.1).
export function groupsFor(parsed, token) {
    const t = token.toLowerCase();
    const own = parsed.groups.filter((g) => g.agents.some((a) => agentToken(a) === t));
    if (own.length) return { groups: own, matchedUserAgent: token };
    const star = parsed.groups.filter((g) => g.agents.includes('*'));
    return { groups: star, matchedUserAgent: star.length ? '*' : null };
}

function normPath(p) {
    let s = String(p || '/');
    try { s = encodeURI(decodeURI(s)); } catch { /* keep as is */ }
    return s.replace(/%[0-9a-f]{2}/gi, (x) => x.toUpperCase());
}
export function ruleMatches(pattern, path) {
    if (!pattern) return false;
    const anchored = pattern.endsWith('$');
    const body = normPath(anchored ? pattern.slice(0, -1) : pattern);
    const rx = new RegExp(`^${body.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`);
    return rx.test(normPath(path));
}

export function isAllowed(parsed, token, path = '/') {
    const { groups, matchedUserAgent } = groupsFor(parsed, token);
    let best = null;
    for (const g of groups) {
        for (const r of g.rules) {
            if (!r.path) continue; // empty Disallow = allow everything
            if (!ruleMatches(r.path, path)) continue;
            const len = r.path.length;
            if (!best || len > best.len || (len === best.len && r.allow && !best.rule.allow)) best = { len, rule: r };
        }
    }
    const crawlDelay = groups.map((g) => g.crawlDelay).find((x) => x != null) ?? null;
    const contentSignal = groups.map((g) => g.contentSignal).find(Boolean) ?? null;
    return {
        allowed: best ? best.rule.allow : true,
        matchedUserAgent,
        matchedRule: best ? `${best.rule.allow ? 'Allow' : 'Disallow'}: ${best.rule.path}` : null,
        crawlDelay, contentSignal,
    };
}

// Whole-site verdict for one bot: blocked when the path is disallowed; partial when the bot has its OWN group that allows "/"
// but disallows other paths (generic * path rules such as /search apply to every crawler and are not counted as AI blocking).
export function botAccess(parsed, token, path = '/') {
    const r = isAllowed(parsed, token, path);
    let access = r.allowed ? 'allowed' : 'blocked';
    if (r.allowed && path === '/' && r.matchedUserAgent && r.matchedUserAgent !== '*') {
        const { groups } = groupsFor(parsed, token);
        const dis = groups.flatMap((g) => g.rules.filter((x) => !x.allow && x.path && x.path !== '/'));
        if (dis.length) access = 'partial';
    }
    return { ...r, access };
}

export function verdict(rows) {
    const ai = rows.filter((r) => r.purpose !== 'search_engine' && r.purpose !== 'custom');
    if (!ai.length) return null;
    const blocked = ai.filter((r) => !r.allowed);
    if (!blocked.length) return 'allows_all_ai';
    if (blocked.length === ai.length) return 'blocks_all_ai';
    const answerBlocked = blocked.filter((r) => r.purpose === 'search' || r.purpose === 'user');
    if (!answerBlocked.length) return 'blocks_ai_training_only';
    return 'blocks_some_ai_search';
}

// ---- llms.txt ----
export function looksLikeHtml(text, contentType = '') {
    return /text\/html|application\/xhtml/i.test(contentType) || /^\s*(<!doctype html|<html|<head|<body|<\?xml)/i.test(String(text).slice(0, 500));
}
export function parseLlmsTxt(text) {
    const s = String(text ?? '');
    const title = (s.match(/^#\s+(.+)$/m) || [])[1]?.trim() ?? null;
    const summary = (s.match(/^>\s*(.+)$/m) || [])[1]?.trim() ?? null;
    const sections = (s.match(/^##\s+.+$/gm) || []).map((x) => x.replace(/^##\s+/, '').trim()).slice(0, 30);
    const linkCount = (s.match(/\[[^\]]*\]\((https?:\/\/|\/)[^)\s]+\)/g) || []).length;
    return { title: title?.slice(0, 200) ?? null, summary: summary?.slice(0, 400) ?? null, sections, linkCount, validFormat: !!title };
}

// ---- homepage meta robots ----
export function metaRobots(html) {
    const out = [];
    const rx = /<meta\b[^>]*>/gi; let m;
    const h = String(html ?? '').slice(0, 400000);
    while ((m = rx.exec(h))) {
        const tag = m[0];
        const name = (tag.match(/\bname\s*=\s*["']?([^"'\s>]+)/i) || [])[1]?.toLowerCase();
        if (!name || !/^(robots|googlebot|bingbot|gptbot|claudebot|perplexitybot|google-extended|ccbot|ai|noai)$/.test(name)) continue;
        const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || tag.match(/\bcontent\s*=\s*([^\s>]+)/i) || [])[1] ?? '';
        out.push({ name, content: content.trim().slice(0, 300) });
    }
    return out.slice(0, 20);
}
export function directives(metaList, xRobotsTag) {
    const all = [...metaList.map((m) => m.content), xRobotsTag || ''].join(',').toLowerCase();
    const has = (d) => new RegExp(`(^|[\\s,:])${d}([\\s,]|$)`).test(all);
    return { noindex: has('noindex') || has('none'), noai: has('noai'), noimageai: has('noimageai') };
}

// ---- input ----
const HOST_RX = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
export function toTarget(raw) {
    let s = String(raw ?? '').trim();
    if (!s) return null;
    if (/^[^\s@/]+@[^\s@/]+$/.test(s)) return null; // emails are not websites; never stored
    let scheme = null;
    const m = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (m) { scheme = m[1].toLowerCase(); if (scheme !== 'http' && scheme !== 'https') return null; }
    let u;
    try { u = new URL(m ? s : `https://${s}`); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!HOST_RX.test(host)) return null;
    return { host, scheme, port: u.port || '' };
}
