// EU VAT number parsing, local format checks and name matching. No network here.
export const FORMATS = {
    AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/,
    EE: /^\d{9}$/, EL: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/,
    HU: /^\d{8}$/, IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, IT: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/,
    LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^[1-9]\d{1,9}$/, SE: /^\d{10}01$/,
    SI: /^\d{8}$/, SK: /^\d{10}$/, XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};
export const COUNTRY_NAMES = { AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', EL: 'Greece', ES: 'Spain', FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland', IT: 'Italy', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia', XI: 'Northern Ireland' };
const NON_EU = { GB: 'United Kingdom (check GB numbers with HMRC; only Northern Ireland "XI" numbers are in VIES)', CH: 'Switzerland', NO: 'Norway', LI: 'Liechtenstein', IS: 'Iceland', US: 'United States', TR: 'Turkey', RS: 'Serbia', UA: 'Ukraine', AU: 'Australia', CA: 'Canada' };

/**
 * Parse "DE 123.456.789", "de123456789", "ATU12345678", "GR123456789", "6388047V" (+ defaultCountry).
 * Returns {country, number, vatId} or {error, status}.
 */
export function parseVat(raw, defaultCountry) {
    const s = String(raw ?? '').toUpperCase().trim()
        .replace(/^(VAT|UST-?ID(NR)?|TVA|IVA|BTW|MWST|NIP|P\.?IVA)\s*(NO|NR|NUMBER|ID)?[\s.:#-]*/, '')
        .replace(/[\s.\-_/\\,:]/g, '');
    if (!s) return { status: 'invalid_input', error: 'Empty value.' };
    if (/^CHE\d/.test(s)) return { status: 'unsupported_country', country: 'CH', error: 'Swiss UID numbers are not in VIES.' };
    let dc = String(defaultCountry || '').toUpperCase().trim(); if (dc === 'GR') dc = 'EL';
    if (dc && !FORMATS[dc]) dc = '';
    if (/^[A-Z]{2}/.test(s)) {
        let cc = s.slice(0, 2); if (cc === 'GR') cc = 'EL';
        if (FORMATS[cc]) return finish(cc, s.slice(2));
        if (NON_EU[cc]) return { status: 'unsupported_country', country: cc, error: `${NON_EU[cc]} is not in the EU VIES system.` };
        if (dc) return finish(dc, s); // e.g. a French number "AB123456789" with defaultCountry FR
        return { status: 'invalid_format', country: cc, error: `"${cc}" is not an EU VAT country code. Use the 2-letter prefix, e.g. DE, FR, IE (Greece is EL).` };
    }
    if (dc) return finish(dc, s);
    return { status: 'invalid_format', error: 'Missing country prefix. Start with the 2-letter EU code (e.g. "DE123456789") or set defaultCountry.' };
}
function finish(country, number) {
    const vatId = `${country}${number}`;
    if (!FORMATS[country].test(number)) return { status: 'invalid_format', country, number, vatId, error: `Wrong format for ${COUNTRY_NAMES[country]} (${country}). Not sent to VIES.` };
    return { country, number, vatId };
}

const LEGAL = /\b(limited|ltd|llc|inc|incorporated|corp|corporation|company|co|plc|gmbh|mbh|ag|kg|ohg|ug|haftungsbeschrankt|sa|sas|sasu|sarl|srl|spa|sl|slu|bv|nv|vof|ab|as|asa|aps|oy|oyj|sp|zoo|sro|as|kft|zrt|doo|ad|ood|eood|ee|ltda|lda|unipessoal|sociedad|limitada|anonima|societe|eurl|plc|teoranta|cvba|bvba|srl|sprl|vzw|ek|ev|eg|se)\b/g;
export function normName(s) {
    return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
}
/** exact | close | partial | mismatch | not_available (VIES returns no name, e.g. Germany) | null (no expected name). */
export function nameMatch(expected, official) {
    if (!expected) return null;
    if (!official || official === '---') return 'not_available';
    const a = normName(expected); const b = normName(official);
    if (!a || !b) return 'not_available';
    if (a === b) return 'exact';
    const ta = new Set(a.split(' ')); const tb = new Set(b.split(' '));
    const inter = [...ta].filter((x) => tb.has(x)).length; const jac = inter / new Set([...ta, ...tb]).size;
    if (jac >= 0.75 || b.startsWith(a) || a.startsWith(b)) return 'close';
    if (inter > 0) return 'partial';
    return 'mismatch';
}
export function cleanField(v) { const s = String(v ?? '').trim(); return !s || s === '---' ? null : s; }
