// EORI parsing, routing, SOAP/JSON parsing and name matching. No network here.
export const EU = { AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', GR: 'Greece', ES: 'Spain', FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland', IT: 'Italy', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia', XI: 'Northern Ireland' };
export const COUNTRY_NAMES = { ...EU, GB: 'United Kingdom' };
const NON_EORI = { CH: 'Switzerland', NO: 'Norway', US: 'United States', CN: 'China', TR: 'Turkey', IS: 'Iceland', LI: 'Liechtenstein' };

/** Parse "GB 123 456 789 000", "eori: de1234567", "EL..." -> {country, eori, source} or {status, error}. */
export function parseEori(raw, defaultCountry) {
    let s = String(raw ?? '').toUpperCase().trim().replace(/^(EORI[\s-]*(NUMBER|NUMMER|NO|NR)|EORI)[\s.:#-]*/, '').replace(/[\s.\-_/\\,:]/g, '');
    if (!s) return { status: 'invalid_input', error: 'Empty value.' };
    let dc = String(defaultCountry || '').toUpperCase().trim(); if (dc === 'EL') dc = 'GR'; if (dc === 'UK') dc = 'GB';
    if (dc && !COUNTRY_NAMES[dc]) dc = '';
    if (!/^[A-Z]{2}/.test(s)) { if (!dc) return { status: 'invalid_format', error: 'Missing country prefix. EORI numbers start with a 2-letter code, e.g. "DE1234567" or "GB123456789000", or set defaultCountry.' }; s = dc + s; }
    let cc = s.slice(0, 2); let rest = s.slice(2);
    if (cc === 'EL') cc = 'GR'; if (cc === 'UK') cc = 'GB';
    if (NON_EORI[cc]) return { status: 'unsupported_country', country: cc, eori: cc + rest, error: `${NON_EORI[cc]} does not issue EU or UK EORI numbers. Only EU member states, GB and XI are checked.` };
    if (!COUNTRY_NAMES[cc]) {
        if (dc && /^[A-Z0-9]{1,15}$/.test(s)) { cc = dc; rest = s; } else return { status: 'invalid_format', country: cc, error: `"${cc}" is not an EU/UK EORI country code (use e.g. DE, FR, NL, GB, XI).` };
    }
    const eori = cc + rest;
    if (!/^[A-Z0-9]{1,15}$/.test(rest)) return { status: 'invalid_format', country: cc, eori, error: 'An EORI is the country code plus up to 15 letters or digits.' };
    if ((cc === 'GB' || cc === 'XI') && !/^\d{12}$/.test(rest)) return { status: 'invalid_format', country: cc, eori, error: `${cc} EORI numbers are ${cc} + 12 digits (usually the 9-digit VAT number + 000). Not sent.` };
    return { country: cc, eori, source: cc === 'GB' ? 'hmrc' : 'eu' };
}

const tag = (xml, name) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`)); return m ? decode(m[1].trim()) : null; };
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
export function soapRequest(eoris) {
    return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ev:validateEORI xmlns:ev="http://eori.ws.eos.dds.s/">${eoris.map((e) => `<ev:eori>${escapeXml(e)}</ev:eori>`).join('')}</ev:validateEORI></soap:Body></soap:Envelope>`;
}
/** -> {error, requestDate, results: {EORI: {valid, name, address, street, postalCode, city, country, statusDescr, errorReason}}} */
export function parseSoap(xml) {
    const out = { error: null, requestDate: tag(xml, 'requestDate'), results: {} };
    const fault = tag(xml, 'faultstring'); if (fault) out.error = fault;
    const desc = tag(xml, 'errorDescription'); if (desc) out.error = desc;
    for (const m of xml.matchAll(/<result>([\s\S]*?)<\/result>/g)) {
        const r = m[1]; const e = tag(r, 'eori'); if (!e) continue;
        const status = tag(r, 'status');
        out.results[e.toUpperCase()] = {
            valid: status === '0' ? true : status === '1' ? false : null, statusDescr: tag(r, 'statusDescr'), errorReason: tag(r, 'errorReason'),
            name: clean(tag(r, 'name')), address: clean(tag(r, 'address')), street: clean(tag(r, 'street')), postalCode: clean(tag(r, 'postalCode')), city: clean(tag(r, 'city')), country: clean(tag(r, 'country')),
        };
    }
    return out;
}
export function parseHmrc(body) {
    const res = {};
    for (const r of Array.isArray(body) ? body : []) {
        if (!r?.eori) continue;
        const cd = r.companyDetails ?? null; const a = cd?.address ?? {};
        res[String(r.eori).toUpperCase()] = { valid: typeof r.valid === 'boolean' ? r.valid : null, name: clean(cd?.traderName), street: clean(a.streetAndNumber), city: clean(a.cityName), postalCode: clean(a.postcode), country: cd ? 'GB' : null, processingDate: r.processingDate ?? null };
    }
    return res;
}
export function clean(v) { const s = String(v ?? '').trim(); return !s || s === '---' ? null : s; }

const LEGAL = /\b(limited|ltd|llc|inc|incorporated|corp|corporation|company|co|plc|gmbh|mbh|ag|kg|ohg|ug|sa|sas|sarl|srl|spa|sl|slu|bv|nv|ab|as|asa|aps|oy|oyj|sp|zoo|sro|kft|zrt|doo|ltda|lda|se)\b/g;
export function normName(s) {
    return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
}
/** exact | close | partial | mismatch | not_available (trader did not consent to publish a name) | null (no expected name). */
export function nameMatch(expected, official) {
    if (!expected) return null;
    if (!official) return 'not_available';
    const a = normName(expected); const b = normName(official);
    if (!a || !b) return 'not_available';
    if (a === b) return 'exact';
    const ta = new Set(a.split(' ')); const tb = new Set(b.split(' '));
    const inter = [...ta].filter((x) => tb.has(x)).length; const jac = inter / new Set([...ta, ...tb]).size;
    if (jac >= 0.75 || b.startsWith(a) || a.startsWith(b)) return 'close';
    if (inter > 0) return 'partial';
    return 'mismatch';
}
