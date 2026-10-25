// Name normalization, Jaro-Winkler token scoring, candidate index, country names. No network.
const LEGAL = new Set('ltd limited llc inc incorporated corp corporation co company plc gmbh mbh ag kg sa sas sarl srl spa sl bv nv ab as asa oy oao ooo zao pao jsc ojsc cjsc pjsc llp lp fze fzco fzc fz est jv the of and de la le el al'.split(' '));
const TITLES = new Set('mr mrs ms dr prof sir sheikh shaykh haji hajji mullah maulana general gen colonel col'.split(' '));
export function normalize(s) {
    return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/đ|ð/g, 'd').replace(/ł/g, 'l').replace(/ı/g, 'i')
        .replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9\u0400-\u04ff\u0600-\u06ff\u4e00-\u9fff]+/g, ' ').trim();
}
/** Significant tokens: no legal suffixes, titles or 1-letter tokens (unless that leaves nothing). */
export function tokens(s) {
    const all = normalize(s).split(' ').filter(Boolean);
    const sig = all.filter((t) => !LEGAL.has(t) && !TITLES.has(t) && t.length > 1);
    return sig.length ? sig : all;
}
export function jaroWinkler(a, b) {
    if (a === b) return 1;
    const la = a.length; const lb = b.length; if (!la || !lb) return 0;
    const md = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
    const ma = new Array(la).fill(false); const mb = new Array(lb).fill(false); let m = 0;
    for (let i = 0; i < la; i++) { const lo = Math.max(0, i - md); const hi = Math.min(i + md + 1, lb); for (let j = lo; j < hi; j++) { if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; } } }
    if (!m) return 0;
    let t = 0; let k = 0;
    for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
    const j = (m / la + m / lb + (m - t / 2) / m) / 3;
    let p = 0; while (p < Math.min(4, la, lb) && a[p] === b[p]) p++;
    return j + p * 0.1 * (1 - j);
}
const tokSim = (a, b) => { const s = jaroWinkler(a, b); return s < 0.9 ? s * 0.6 : s; };
/** 0-100. Order-insensitive, symmetric token matching that penalizes extra or missing tokens. */
export function scoreTokens(qt, ct) {
    if (!qt.length || !ct.length) return 0;
    if (qt.join(' ') === ct.join(' ')) return 100;
    const sq = [...qt].sort().join(' '); const sc = [...ct].sort().join(' ');
    if (sq === sc) return 99;
    const best = (from, to) => from.reduce((acc, t) => acc + Math.max(...to.map((u) => tokSim(t, u))), 0);
    const sym = (best(qt, ct) + best(ct, qt)) / (qt.length + ct.length);
    // A full candidate name contained in a longer query (or vice versa) with all tokens matching exactly.
    const cover = (Math.min(qt.length, ct.length) >= 2 && (qt.every((t) => ct.includes(t)) || ct.every((t) => qt.includes(t)))) ? 0.9 : 0;
    const whole = qt.length === ct.length && sym > 0.8 ? jaroWinkler(sq.replace(/ /g, ''), sc.replace(/ /g, '')) : 0;
    return Math.round(100 * Math.max(sym, cover, whole));
}
/** Inverted index over 3-char token prefixes -> name entry ids. */
export class NameIndex {
    constructor() { this.names = []; this.idx = new Map(); }
    add(recordRef, name) {
        const t = tokens(name); if (!t.length) return;
        const id = this.names.length; this.names.push({ r: recordRef, name, t });
        for (const tok of new Set(t)) { const k = tok.slice(0, 3); let a = this.idx.get(k); if (!a) { a = []; this.idx.set(k, a); } a.push(id); }
    }
    search(query, minScore) {
        const qt = tokens(query); if (!qt.length) return [];
        const cand = new Set();
        for (const tok of qt) { for (const k of [tok.slice(0, 3)]) { const a = this.idx.get(k); if (a) for (const id of a) cand.add(id); } }
        const out = [];
        for (const id of cand) { const n = this.names[id]; const s = scoreTokens(qt, n.t); if (s >= minScore) out.push({ ...n, score: s }); }
        return out.sort((a, b) => b.score - a.score);
    }
}

const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const ISO = 'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WS XK YE ZA ZM ZW'.split(' ');
const cKey = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, ' ').replace(/[^a-z]/g, '');
const C2ISO = new Map();
for (const c of ISO) { try { C2ISO.set(cKey(dn.of(c)), c); } catch { /* ignore */ } }
for (const [n, c] of Object.entries({ 'russian federation': 'RU', 'iran islamic republic of': 'IR', iran: 'IR', 'democratic peoples republic of korea': 'KP', 'korea north': 'KP', 'north korea': 'KP', dprk: 'KP', 'korea south': 'KR', 'republic of korea': 'KR', 'syrian arab republic': 'SY', 'democratic republic of the congo': 'CD', 'congo democratic republic of the': 'CD', 'congo kinshasa': 'CD', 'republic of the congo': 'CG', burma: 'MM', 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', 'united states': 'US', usa: 'US', 'united states of america': 'US', 'viet nam': 'VN', 'lao peoples democratic republic': 'LA', 'venezuela bolivarian republic of': 'VE', 'bolivia plurinational state of': 'BO', 'turkiye': 'TR', 'turkey': 'TR', 'czech republic': 'CZ', 'ivory coast': 'CI', 'cote divoire': 'CI', 'palestinian territory': 'PS', 'west bank': 'PS', 'gaza': 'PS', 'crimea': 'UA', 'moldova republic of': 'MD', 'tanzania united republic of': 'TZ', 'belarus': 'BY', 'macedonia': 'MK', 'north macedonia': 'MK', 'eswatini': 'SZ', 'swaziland': 'SZ', 'east timor': 'TL', 'hong kong': 'HK', 'taiwan': 'TW', 'kosovo': 'XK' })) C2ISO.set(cKey(n), c);
export function countryToIso(name) { if (!name) return null; const s = String(name).trim(); if (/^[A-Z]{2}$/.test(s)) return s; return C2ISO.get(cKey(s)) ?? null; }
export function isoName(c) { try { return dn.of(c); } catch { return null; } }
