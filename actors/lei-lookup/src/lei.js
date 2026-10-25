// Query parsing, LEI checksum, record flattening and name scoring. No network here.
const ISO2 = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' '));
export const isCountry = (c) => ISO2.has(String(c || '').toUpperCase());

export function leiChecksumOk(lei) {
    const s = String(lei).toUpperCase();
    if (!/^[A-Z0-9]{18}\d{2}$/.test(s)) return false;
    let r = 0;
    for (const ch of s) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of v) r = (r * 10 + Number(d)) % 97; }
    return r === 1;
}
export function isinChecksumOk(isin) {
    const s = String(isin).toUpperCase(); if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
    const digits = [...s].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
    let sum = 0; let dbl = true;
    for (let i = digits.length - 2; i >= 0; i--) { let n = Number(digits[i]); if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; }
    return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/** "lei: X", "isin: X", "bic: X", "name: X", or auto-detect. Name may carry "| DE" country hint. */
export function parseQuery(raw, defaultCountry) {
    const str = String(raw ?? '').trim();
    if (!str) return { status: 'invalid_input', error: 'Empty value.' };
    const m = str.match(/^(lei|isin|bic|swift|name)\s*[:=]\s*(.+)$/i);
    let type = m ? m[1].toLowerCase().replace('swift', 'bic') : null; let body = (m ? m[2] : str).trim();
    let country = null;
    const parts = body.split('|'); if (parts.length > 1) { const c = parts.at(-1).trim().toUpperCase(); if (isCountry(c)) { country = c; body = parts.slice(0, -1).join('|').trim(); } }
    if (!country && isCountry(defaultCountry)) country = String(defaultCountry).toUpperCase();
    const compact = body.toUpperCase().replace(/[\s-]/g, '');
    if (!type) {
        if (/^[A-Z0-9]{18}\d{2}$/.test(compact)) type = 'lei';
        else if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(compact) && /\d/.test(compact.slice(2)) && isCountry(compact.slice(0, 2))) type = 'isin';
        else if (/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact) && body === body.toUpperCase() && !/\s/.test(body) && isCountry(compact.slice(4, 6)) && (/\d/.test(compact) || compact.length === 11)) type = 'bic';
        else type = 'name';
    }
    if (type === 'lei') { if (!leiChecksumOk(compact)) return { type, value: compact, status: 'invalid_format', error: 'Not a valid LEI: 20 characters with a mod-97 check digit. Not sent.' }; return { type, value: compact }; }
    if (type === 'isin') { if (!isinChecksumOk(compact)) return { type, value: compact, status: 'invalid_format', error: 'Not a valid ISIN (12 characters with a check digit). Not sent.' }; return { type, value: compact }; }
    if (type === 'bic') { if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact)) return { type, value: compact, status: 'invalid_format', error: 'A BIC is 8 or 11 characters, e.g. DEUTDEFFXXX. Not sent.' }; return { type, value: compact }; }
    const name = body.replace(/\s+/g, ' ').trim();
    if (name.length < 2) return { type, value: name, status: 'invalid_input', error: 'Company name too short.' };
    return { type: 'name', value: name.slice(0, 200), country };
}

const SUFFIX = [[/\baktiengesellschaft\b/g, 'ag'], [/\bgesellschaft mit beschrankter haftung\b/g, 'gmbh'], [/\blimited\b/g, 'ltd'], [/\bincorporated\b/g, 'inc'], [/\bcorporation\b/g, 'corp'], [/\bcompany\b/g, 'co'], [/\bpublic limited company\b/g, 'plc'], [/\bsociete anonyme\b/g, 'sa'], [/\bsocieta per azioni\b/g, 'spa'], [/\bbesloten vennootschap\b/g, 'bv']];
export function normName(s) {
    let x = String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    for (const [re, to] of SUFFIX) x = x.replace(re, to);
    return x.replace(/\s+/g, ' ').trim();
}
const LEGAL = new Set('ag gmbh ltd inc corp co plc sa spa bv nv llc lp llp se sas sarl srl ab as oy kg mbh the and'.split(' '));
/** 0-100 similarity of query to a record's names. */
export function nameScore(query, names) {
    const q = normName(query); if (!q) return 0;
    const qt = q.split(' '); const qcore = qt.filter((t) => !LEGAL.has(t));
    let best = 0;
    for (const n of names) {
        const c = normName(n); if (!c) continue;
        if (c === q) return 100;
        const ct = c.split(' '); const ccore = ct.filter((t) => !LEGAL.has(t));
        let s;
        if (qcore.length && qcore.join(' ') === ccore.join(' ')) s = 95;
        else {
            const set = new Set(ccore); const inter = qcore.filter((t) => set.has(t)).length;
            const union = new Set([...qcore, ...ccore]).size || 1;
            s = Math.round(85 * inter / union);
            if (qt.length > 1 && c.startsWith(q + ' ')) s = Math.max(s, 70);
        }
        best = Math.max(best, s);
    }
    return best;
}

const addr = (a) => (a ? { lines: (a.addressLines ?? []).filter(Boolean), city: a.city ?? null, region: a.region ?? null, postalCode: a.postalCode ?? null, country: a.country ?? null } : null);
const addrText = (a) => (a ? [...(a.addressLines ?? []), [a.postalCode, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ') : null);
export function flatten(rec) {
    const at = rec?.attributes ?? {}; const e = at.entity ?? {}; const g = at.registration ?? {};
    const lei = at.lei ?? rec?.id ?? null;
    return {
        lei, legalName: e.legalName?.name ?? null,
        otherNames: [...(e.otherNames ?? []), ...(e.transliteratedOtherNames ?? [])].map((n) => n?.name).filter(Boolean),
        entityStatus: e.status ?? null, registrationStatus: g.status ?? null,
        legalFormCode: e.legalForm?.id ?? null, legalForm: e.legalForm?.other ?? null,
        jurisdiction: e.jurisdiction ?? null, category: e.category ?? null, country: e.legalAddress?.country ?? null,
        legalAddress: addr(e.legalAddress), legalAddressText: addrText(e.legalAddress),
        headquartersAddress: addr(e.headquartersAddress), headquartersAddressText: addrText(e.headquartersAddress),
        registrationAuthorityId: e.registeredAt?.id ?? null, registeredAs: e.registeredAs ?? null,
        entityCreationDate: e.creationDate ?? null, initialRegistrationDate: g.initialRegistrationDate ?? null,
        lastUpdateDate: g.lastUpdateDate ?? null, nextRenewalDate: g.nextRenewalDate ?? null,
        managingLou: g.managingLou ?? null, corroborationLevel: g.corroborationLevel ?? null,
        bic: at.bic ?? [], successorLei: e.successorEntity?.lei ?? null,
        hasDirectParent: !!rec?.relationships?.['direct-parent']?.links?.['lei-record'],
        hasUltimateParent: !!rec?.relationships?.['ultimate-parent']?.links?.['lei-record'],
        gleifUrl: lei ? `https://search.gleif.org/#/record/${lei}` : null,
    };
}
export const parentSummary = (rec) => { if (!rec) return null; const f = flatten(rec); return { lei: f.lei, legalName: f.legalName, country: f.country, entityStatus: f.entityStatus }; };

const EXPAND = [[/\bAG$/i, 'Aktiengesellschaft'], [/\bLtd\.?$/i, 'Limited'], [/\bInc\.?$/i, 'Inc.'], [/\bCorp\.?$/i, 'Corporation'], [/\bCo\.?$/i, 'Company'], [/\bPLC$/i, 'Public Limited Company'], [/\bLimited$/i, 'Ltd'], [/\bAktiengesellschaft$/i, 'AG'], [/\bS\.?p\.?A\.?$/i, 'S.p.A.'], [/\bS\.?A\.?$/i, 'S.A.'], [/\bN\.?V\.?$/i, 'N.V.'], [/\bB\.?V\.?$/i, 'B.V.'], [/\bSE$/i, 'SE']];
/** Alternative legal-name spellings to try when the first search finds nothing good. */
export function nameVariants(name) {
    const out = [];
    for (const [re, to] of EXPAND) if (re.test(name)) { const v = name.replace(re, to); if (v !== name) out.push(v); break; }
    return out;
}
