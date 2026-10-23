// Pure helpers: entity parsing, privacy sanitising, mention/rank/citation analysis and share-of-voice summary.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normDomain(d) {
    if (!d) return null;
    let s = String(d).trim().toLowerCase();
    if (!s) return null;
    try { if (/^https?:\/\//.test(s)) s = new URL(s).hostname; } catch { return null; }
    s = s.replace(/^www\./, '').replace(/\/.*$/, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

/** Accepts "Name", "Name | domain.com", or { name, domain, aliases }. */
export function parseEntity(x, role) {
    let name; let domain = null; let aliases = [];
    if (x && typeof x === 'object') { name = x.name; domain = x.domain; aliases = Array.isArray(x.aliases) ? x.aliases : []; }
    else { const [n, d] = String(x ?? '').split('|'); name = n; domain = d; }
    name = String(name ?? '').trim();
    if (!name) return null;
    const all = [name, ...aliases.map((a) => String(a).trim()).filter(Boolean)];
    return { name, domain: normDomain(domain), aliases: [...new Set(all)], role };
}

// Query strings and fragments are dropped from every URL: they can carry tracking IDs or personal data
// (we have seen cited links with someone's e-mail and name in the query string).
export function cleanUrl(u) {
    try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return null; x.search = ''; x.hash = ''; return x.href; } catch { return null; }
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w/])\+?\d[\d\s().-]{8,}\d(?![\w/])/g;
export function sanitizeText(t) {
    if (!t) return '';
    return String(t)
        .replace(/https?:\/\/[^\s)\]>"']+/g, (u) => cleanUrl(u) ?? '')
        .replace(EMAIL, '[email removed]')
        .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[phone removed]' : m));
}

/** Text used for mention matching: markdown link targets and bare URLs removed, link labels kept. */
export function proseOf(text) {
    return String(text || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ');
}

function aliasRegex(alias) {
    // word-ish boundaries that also work for names like "Monday.com" or "C++"
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc(alias)}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Position of the top-level list item ("1.", "2)", "-", "*") that contains a character offset, or null if it is not in a list. */
function listPositionAt(prose, idx) {
    const lines = prose.split('\n'); let off = 0; let n = 0;
    for (const line of lines) {
        const m = /^ {0,1}(?:(\d{1,2})[.)]|[-*•])\s+/.exec(line);
        if (m) n = m[1] ? Number(m[1]) : n + 1;
        else if (line.trim() && !/^\s/.test(line)) n = 0; // a paragraph ends the list
        if (idx >= off && idx < off + line.length + 1) return n || null;
        off += line.length + 1;
    }
    return null;
}

export function analyzeAnswer(text, citations, entities) {
    const prose = proseOf(text);
    const found = entities.map((e) => {
        const spans = [];
        for (const a of e.aliases) for (const m of prose.matchAll(aliasRegex(a))) spans.push([m.index, m.index + m[0].length]);
        spans.sort((x, y) => x[0] - y[0]);
        let count = 0; let end = -1; // overlapping alias hits ("Notion" inside "Notion AI") count once
        for (const [s0, s1] of spans) { if (s0 >= end) count++; end = Math.max(end, s1); }
        const first = spans.length ? spans[0][0] : -1;
        const citedUrls = e.domain ? citations.filter((c) => c.domain && (c.domain === e.domain || c.domain.endsWith(`.${e.domain}`))).map((c) => c.url) : [];
        return { name: e.name, role: e.role, domain: e.domain, mentioned: count > 0, mentionCount: count, firstIndex: first,
            listPosition: first >= 0 ? listPositionAt(prose, first) : null, cited: citedUrls.length > 0, citedUrls: [...new Set(citedUrls)] };
    });
    const order = found.filter((f) => f.mentioned).sort((a, b) => a.firstIndex - b.firstIndex);
    order.forEach((f, i) => { f.rank = i + 1; });
    for (const f of found) { if (!f.mentioned) f.rank = null; delete f.firstIndex; }
    return found;
}

/** Citations from Responses API url_citation annotations (+ optional consulted sources), deduped, cleaned. */
export function extractCitations(annotations = [], sources = []) {
    const out = []; const seen = new Set();
    const add = (url, title, kind) => {
        const u = cleanUrl(url); if (!u || seen.has(u)) return; seen.add(u);
        out.push({ url: u, title: title ? sanitizeText(String(title)).slice(0, 300) : null, domain: normDomain(u), kind });
    };
    for (const a of annotations) if (a?.type === 'url_citation' && a.url) add(a.url, a.title, 'cited');
    for (const s of sources) if (s?.url) add(s.url, s.title, 'source');
    return out;
}

export function summarize(rows, entities) {
    const ok = rows.filter((r) => r.status === 'ok');
    const n = ok.length;
    const per = entities.map((e) => {
        const ms = ok.map((r) => r.entities.find((x) => x.name === e.name)).filter(Boolean);
        const men = ms.filter((m) => m.mentioned);
        const sent = { positive: 0, neutral: 0, negative: 0 };
        for (const m of men) if (m.sentiment && sent[m.sentiment] !== undefined) sent[m.sentiment]++;
        return { name: e.name, role: e.role, domain: e.domain, checks: n, mentions: men.length,
            mentionRate: n ? +(men.length / n).toFixed(3) : 0,
            avgRank: men.length ? +(men.reduce((s, m) => s + m.rank, 0) / men.length).toFixed(2) : null,
            firstPlace: men.filter((m) => m.rank === 1).length,
            citedChecks: ms.filter((m) => m.cited).length,
            citationRate: n ? +(ms.filter((m) => m.cited).length / n).toFixed(3) : 0,
            recommended: men.filter((m) => m.recommended === true).length, sentiment: sent };
    });
    const totalMentions = per.reduce((s, p) => s + p.mentions, 0);
    for (const p of per) p.shareOfVoice = totalMentions ? +(p.mentions / totalMentions).toFixed(3) : 0;
    const brand = per.find((p) => p.role === 'brand');
    const byPrompt = {};
    for (const r of ok) {
        const b = r.entities.find((x) => x.role === 'brand');
        const k = r.prompt; byPrompt[k] ??= { prompt: k, checks: 0, brandMentioned: 0, bestRank: null };
        byPrompt[k].checks++; if (b?.mentioned) { byPrompt[k].brandMentioned++; byPrompt[k].bestRank = Math.min(byPrompt[k].bestRank ?? 99, b.rank); }
    }
    const domains = {};
    for (const r of ok) for (const c of r.citations) if (c.kind === 'cited' && c.domain) domains[c.domain] = (domains[c.domain] ?? 0) + 1;
    const topCitedDomains = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([domain, count]) => ({ domain, count }));
    const others = {};
    for (const r of ok) for (const o of r.otherBrandsMentioned || []) others[o] = (others[o] ?? 0) + 1;
    const otherBrands = Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }));
    return { checks: n, brand: brand?.name ?? null, brandMentionRate: brand?.mentionRate ?? 0, brandShareOfVoice: brand?.shareOfVoice ?? 0,
        brandAvgRank: brand?.avgRank ?? null, leaderboard: [...per].sort((a, b) => b.mentions - a.mentions || (a.avgRank ?? 99) - (b.avgRank ?? 99)),
        prompts: Object.values(byPrompt), topCitedDomains, otherBrandsMentioned: otherBrands };
}
