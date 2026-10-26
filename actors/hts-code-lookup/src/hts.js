// Pure helpers for the HTS Code Lookup Actor (no network). Data: USITC HTS exportList JSON.
export const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'with', 'without', 'in', 'on', 'to', 'by', 'from', 'other', 'than', 'its', 'thereof', 'kind', 'kinds', 'used', 'type', 'nesoi', 'not', 'n', 'e', 's', 'i', 'whether', 'like', 'my', 'our', 'product', 'products', 'item', 'items', 'hts', 'code', 'tariff', 'duty', 'rate', 'what', 'is', 'are']);

export const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

/** Dotted HTS format: 8507 / 8507.60 / 8507.60.00 / 8507.60.00.20. */
export function formatHts(d) {
    d = digitsOf(d);
    if (d.length <= 4) return d;
    const parts = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
    return parts.join('.');
}

/** Classify a query: an HTS/HS code (with dots, spaces or plain digits) or product text. */
export function parseQuery(raw) {
    const q = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!q) return { kind: 'empty' };
    const m = q.match(/^(?:hts|htsus|hs|heading|subheading|code)?\s*:?\s*([0-9][0-9 .\-]*[0-9]|[0-9])$/i);
    if (m) {
        const d = digitsOf(m[1]);
        if (d.length < 2 || d.length > 10) return { kind: 'invalid', q, error: `"${q}" is not an HTS code: use 2 to 10 digits, e.g. 8507.60.00.20 or 6109.10.` };
        return { kind: 'code', q, digits: d };
    }
    if (q.length > 300) return { kind: 'invalid', q: q.slice(0, 100), error: 'Product descriptions must be 300 characters or less.' };
    const toks = queryTokens(q);
    if (!toks.length) return { kind: 'invalid', q, error: `"${q}" has no searchable words. Describe the product (e.g. "cotton t-shirts") or give an HTS code.` };
    return { kind: 'text', q, tokens: toks };
}

const LEMMA = { electrical: 'electric', electrically: 'electric', jewellery: 'jewelry', aluminium: 'aluminum', colour: 'color', tshirt: 'tshirt', teeshirt: 'tshirt' };
/** Everyday words -> extra words the HTS uses (any one may match). */
export const SYN = {
    bicycle: ['cycle'], bike: ['cycle'], ebike: ['cycle'], scooter: ['scooter', 'cycle'], solar: ['photovoltaic'], phone: ['telephone'], smartphone: ['telephone'], cellphone: ['telephone'],
    laptop: ['portable'], notebook: ['portable'], computer: ['computer', 'processing'], tv: ['television'], shoe: ['footwear'], sneaker: ['footwear'], boot: ['footwear'],
    car: ['vehicle'], truck: ['vehicle'], sofa: ['seat'], couch: ['seat'], chair: ['seat'], headphone: ['earphone'], earbud: ['earphone', 'headphone'],
    cable: ['conductor', 'wire'], charger: ['converter'], drone: ['unmanned'], led: ['diode'], mug: ['cup', 'tableware'], cup: ['tableware'], sunglass: ['spectacle'],
    supplement: ['preparation'], vitamin: ['provitamin'], candy: ['confectionery', 'sugar'], chocolate: ['cocoa'], phonecase: ['case'], purse: ['handbag'], backpack: ['rucksack'],
    hoodie: ['sweatshirt', 'pullover'], sweater: ['sweatshirt', 'pullover', 'jersey'], jean: ['trouser'], pant: ['trouser'], dress: ['dress'], sock: ['hosiery'], cosmetic: ['makeup', 'beauty'],
    lipstick: ['lip'], perfume: ['perfume'], toy: ['toy'], game: ['game'], printer: ['printing'], tablet: ['portable'], speaker: ['loudspeaker'], fridge: ['refrigerator'], battery: ['battery'],
};
export function stem(w) {
    if (LEMMA[w]) return LEMMA[w];
    const b = stemBasic(w); return LEMMA[b] ?? b;
}
function stemBasic(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
    if (/(ss|us|is)$/.test(w)) return w;
    if (/(sses|xes|ches|shes|zes)$/.test(w)) return w.slice(0, -2);
    if (/toes$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w)) return w.slice(0, -1);
    return w;
}

const clean = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, ' ');

/** Index tokens: split words plus hyphen-joined forms ("t-shirts" -> t, shirt, tshirt). */
/** Words a description explicitly excludes ("not roasted", "other than cotton"). */
export function negTokens(s) {
    const c = clean(s).replace(/\bwhether or not\b/g, ' '); const out = new Set();
    for (const m of c.matchAll(/\b(?:not|other than|excluding|except)\s+(?:of\s+|a\s+|an\s+)?([a-z0-9-]+)/g)) out.add(stem(m[1].replace(/-/g, '')));
    return out;
}
export function textTokens(s) {
    // "whether or not roasted" covers both; "not roasted" / "other than X" / "excluding X" exclude X.
    const c = clean(s).replace(/\bwhether or not\b/g, ' ').replace(/\b(not|other than|excluding|except)\s+(?:of\s+|a\s+|an\s+)?[a-z0-9-]+/g, ' ');
    const out = new Set();
    for (const w of c.split(/[^a-z0-9]+/)) if (w && !STOP.has(w)) out.add(stem(w));
    for (const m of c.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)+/g)) out.add(stem(m[0].replace(/-/g, '')));
    return out;
}

const PHRASES = [[/\be-?bikes?\b/g, 'electric cycle'], [/\b(sneakers?|trainers|running shoes?)\b/g, 'sports footwear'], [/\b(cell ?phones?|mobile phones?)\b/g, 'smartphone'],
    [/\be-?scooters?\b/g, 'electric scooter'], [/\bflip[- ]?flops?\b/g, 'footwear thong'], [/\bhoodies?\b/g, 'sweatshirt'], [/\bpower ?banks?\b/g, 'lithium-ion battery'], [/\bvapes?\b/g, 'vaporizing'],
    [/\b(laptops?|notebook computers?)\b/g, 'portable automatic data processing machines'], [/\b(?:wireless |bluetooth )?(earbuds?|headphones?|earphones?)\b/g, 'headphones earphones']];
export function queryTokens(q) {
    let c0 = clean(q); for (const [rx, rep] of PHRASES) c0 = c0.replace(rx, rep);
    const c = c0.replace(/([a-z0-9])-([a-z0-9])/g, '$1$2');
    const words = [...new Set(c.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d{1,2}$/.test(w)).map(stem))].slice(0, 12);
    const raw = [...new Set(c.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d{1,2}$/.test(w)))].slice(0, 12);
    return words.map((w, i) => {
        const orig = raw[i] ? stemBasic(raw[i]) : w;
            return [w, orig, ...new Set([...(SYN[w] ?? []), ...(SYN[orig] ?? [])].filter((x) => x !== w && x !== orig))];
    });
}

const CH99 = /\b(99\d{2})\.(\d{2})\.(\d{2})(?:\.(\d{2}))?(?:\s*(?:-|–|through|to)\s*(99\d{2})\.(\d{2})\.(\d{2}))?/g;
/** Chapter 99 references (e.g. "See 9903.88.15" or "9904.02.01-9904.02.03") in footnotes and rate text. */
export function chapter99Refs(row) {
    const texts = [[row.general, ['general']], [row.special, ['special']], [row.other, ['other']], ...(row.footnotes ?? []).map((f) => [f?.value, Array.isArray(f?.columns) ? f.columns : []])].filter(([t]) => t);
    const out = []; const add = (code, cols) => { const ex = out.find((r) => r.code === code); if (ex) { for (const c of cols) if (!ex.columns.includes(c)) ex.columns.push(c); } else out.push({ code, columns: [...cols] }); };
    for (const [t, cols] of texts) for (const m of String(t).matchAll(CH99)) {
        add(`${m[1]}.${m[2]}.${m[3]}`, cols);
        if (m[5]) add(`${m[5]}.${m[6]}.${m[7]}`, cols);
    }
    return out;
}

/** Special-program codes from the Special column, e.g. "Free (A,AU,BH,CL)" -> ["A","AU","BH","CL"]. */
export function specialPrograms(special) {
    const out = [];
    for (const m of String(special ?? '').matchAll(/\(([^)]+)\)/g)) for (const p of m[1].split(',')) { const v = p.trim().replace(/\*$/, ''); if (/^[A-Z+*]{1,4}$/.test(v) && !out.includes(v)) out.push(v); }
    return out;
}

const txt = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Build the in-memory index: parent links, breadcrumb paths, inherited rates, token sets. */
export function buildIndex(rows) {
    const items = []; const byCode = new Map(); const stack = [];
    for (const r of rows) {
        const indent = Number(r.indent) || 0;
        const code = String(r.htsno ?? '').trim();
        const d = digitsOf(code);
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        if (indent === 0 && d.length === 4) stack.length = 0;
        const parent = stack[stack.length - 1] ?? null;
        const it = {
            i: items.length, code, digits: d, indent, desc: txt(r.description), parent,
            general: txt(r.general), special: txt(r.special), other: txt(r.other),
            units: Array.isArray(r.units) ? r.units.filter(Boolean) : [], footnotes: (r.footnotes ?? []).map((f) => txt(f?.value)).filter(Boolean),
            quota: txt(r.quotaQuantity) || null, refs: chapter99Refs(r), children: 0,
        };
        it.path = parent ? [...parent.path, it.desc] : [it.desc];
        it.ancestorCode = d ? it : (parent?.ancestorCode ?? null);
        it.own = textTokens(it.desc);
        it.forCtx = new Set((clean(it.desc).match(/\b(?:for|used (?:in|with|on|for)|suitable for)\b[^;:]*/g) ?? []).flatMap((seg) => [...textTokens(seg.replace(/^\S+(?: \S+)?/, ''))]));
        it.nonFor = new Set([...[...it.own].filter((t) => !it.forCtx.has(t)), ...(parent?.nonFor ?? [])]);
        it.neg = new Set([...negTokens(it.desc), ...(parent?.neg ?? [])]);
        it.all = new Set([...it.own, ...(parent?.all ?? [])].filter((t) => !it.neg.has(t)));
        // Words below the 4-digit heading: what distinguishes this line from its siblings.
        it.sub = d.length === 4 ? new Set() : new Set([...it.own, ...(parent?.sub ?? [])].filter((t) => !it.neg.has(t)));
        if (parent) parent.children++;
        items.push(it);
        if (d && !byCode.has(d)) byCode.set(d, it);
        stack.push(it);
    }
    const df = new Map();
    for (const it of items) for (const t of it.own) df.set(t, (df.get(t) ?? 0) + 1);
    for (const it of items) {
        let h = it; while (h && h.digits.length !== 4) h = h.parent; it.head = h ?? null;
        let src = it; while (src && !src.general && !src.special && !src.other) src = src.parent;
        it.rateFrom = src ?? null;
        // Refs from ancestors (e.g. a heading footnote) apply to the line too.
        let p = it.parent; const inh = [...it.refs]; while (p) { for (const r of p.refs) if (!inh.some((x) => x.code === r.code)) inh.push(r); p = p.parent; }
        it.allRefs = inh;
    }
    return { items, byCode, df, n: items.length };
}

export function levelOf(d) { return d.length >= 10 ? 'statistical' : d.length === 8 ? 'tariff_line' : d.length === 6 ? 'subheading' : d.length === 4 ? 'heading' : d.length ? 'chapter' : 'header'; }

/** Exact or prefix lookup by digits. Returns items (the line itself first, then descendants). */
export function lookupCode(index, digits, { includeChildren = true, max = 50 } = {}) {
    const exact = index.byCode.get(digits) ?? null;
    const out = [];
    if (exact) out.push(exact);
    if (includeChildren || !exact) {
        for (const it of index.items) {
            if (out.length >= max) break;
            if (it === exact || !it.digits || !it.digits.startsWith(digits)) continue;
            out.push(it);
        }
    }
    return { exact, items: out.slice(0, max) };
}

/** Our own relevance ranking: share of query words matched in the line's full path, own-description hits, leaf preference. */
// The user's own words (first two alternatives) count fully; added synonyms count 0.85.
function strength(g, set) { if (set.has(g[0]) || (g[1] && set.has(g[1]))) return 1; for (let i = 2; i < g.length; i++) if (set.has(g[i])) return 0.85; return 0; }

export function searchText(index, tokens, { max = 10, includeChapter99 = false, statisticalOnly = false, relaxed = false } = {}) {
    const scored = [];
    const idf = (t) => Math.log(1 + (index.n ?? 1) / (1 + (index.df?.get(t) ?? 0)));
    const weights = tokens.map((g) => Math.max(...g.map(idf)));
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const wantsParts = tokens.some((g) => g.some((t) => /^(part|accessory|accessorie|component|spare)$/.test(t)));
    for (const it of index.items) {
        if (!it.digits) continue;
        const ch = it.digits.slice(0, 2);
        if (!includeChapter99 && (ch === '98' || ch === '99')) continue;
        if (statisticalOnly && it.digits.length < 10 && it.children) continue;
        let hit = 0; let own = 0; let head = 0; let wHit = 0;
        for (let k = 0; k < tokens.length; k++) {
            const g = tokens[k];
            const m = strength(g, it.all);
            if (m) { hit++; wHit += weights[k] * m; }
            own += strength(g, it.sub);
            if (it.head) head += strength(g, it.head.own);
        }
        if (!hit) continue;
        const cov = wHit / wSum;
        if (tokens.length === 1 ? cov < 0.8 : (hit / tokens.length < (relaxed ? 0.34 : 0.5) || cov < (relaxed ? 0.3 : 0.5))) continue;
        const leaf = it.children === 0 ? 1 : 0;
        const rated = it.rateFrom ? 1 : 0;
        // Head noun (last query word) is the product; it should name the line, not what the line is "for".
        const hn = tokens[tokens.length - 1];
        const hnIn = strength(hn, it.all) > 0;
        const hnOnlyFor = hnIn && !(strength(hn, it.nonFor) > 0);
        const headNoun = tokens.length > 1 ? (hnOnlyFor ? -14 : hnIn ? 8 : -6) : 0;
        const partsPenalty = !wantsParts && it.path.slice(1).some((p) => /\b(parts?|accessories)\b/i.test(p)) ? 12 : 0;
        const score = Math.round((-partsPenalty + headNoun + cov * 60 + (head / tokens.length) * 15 + (own / tokens.length) * 10 + leaf * 8 + rated * 4 + (it.digits.length >= 10 ? 3 : 0)) * 10) / 10;
        scored.push({ it, score, cov, own, leaf });
    }
    scored.sort((a, b) => b.score - a.score || b.it.digits.length - a.it.digits.length || a.it.i - b.it.i);
    // Keep the result list diverse: at most 4 lines per 6-digit subheading.
    const per = new Map(); const perH = new Map(); const out = [];
    for (const s of scored) {
        const k = s.it.digits.slice(0, 6); const n = per.get(k) ?? 0;
        const h = s.it.digits.slice(0, 4); const nh = perH.get(h) ?? 0;
        if (n >= 3 || nh >= 5) continue; per.set(k, n + 1); perH.set(h, nh + 1); out.push(s);
        if (out.length >= max) break;
    }
    if (!out.length && !relaxed && tokens.length > 1) return searchText(index, tokens, { max, includeChapter99, statisticalOnly, relaxed: true }).map((x) => ({ ...x, relaxed: true }));
    return out;
}

/** Longest existing prefix of a code that is not in the schedule (for not_found suggestions). */
export function closestCode(index, digits) {
    for (let n = digits.length - 1; n >= 2; n--) { const it = index.byCode.get(digits.slice(0, n)); if (it) return it; }
    return null;
}

/** Output row for one HTS line. */
export function toRow(it, index, { release, resolveRefs = true } = {}) {
    const rf = it.rateFrom;
    const refs = it.allRefs.slice(0, 12).map(({ code, columns }) => {
        const r = index.byCode.get(digitsOf(code));
        const appliesTo = columns.includes('other') && columns.length === 1 ? 'column2' : columns.includes('special') && columns.length === 1 ? 'special' : 'general';
        return { htsNumber: code, appliesTo, description: resolveRefs && r ? r.desc.slice(0, 300) : null, rate: resolveRefs && r ? (r.general || r.rateFrom?.general || null) : null };
    });
    return {
        htsNumber: it.code, htsDigits: it.digits, level: levelOf(it.digits), chapter: it.digits.slice(0, 2), heading: it.digits.slice(0, 4),
        description: it.desc, fullDescription: it.path.filter(Boolean).join(' > '),
        generalRate: rf?.general || null, specialRate: rf?.special || null, specialPrograms: specialPrograms(rf?.special), column2Rate: rf?.other || null,
        rateSource: rf ? (rf === it ? 'this_line' : `inherited from ${rf.code || 'parent'}`) : 'none',
        units: it.units, additionalDutyRefs: refs, footnotes: it.footnotes.slice(0, 10), quotaQuantity: it.quota,
        hasChildren: it.children > 0,
        htsRelease: release?.name ?? null, htsReleaseStart: release?.start ?? null,
        sourceUrl: `https://hts.usitc.gov/search?query=${encodeURIComponent(it.code)}`,
    };
}
