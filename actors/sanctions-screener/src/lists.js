// Parsers for the official list files. Each returns [{list, listId, type, primaryName, names[], programs[], countries[], datesOfBirth[], listedOn, remarks}]
import { parse } from 'csv-parse/sync';
import { countryToIso } from './match.js';

const nul = (v) => { const s = String(v ?? '').trim(); return !s || s === '-0-' ? null : s; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
const dobFromRemarks = (r) => [...String(r ?? '').matchAll(/DOB ([^;]+?)(?:;|$)/g)].map((m) => m[1].trim()).flatMap((x) => x.split(/\s+to\s+|,\s*(?=\d|[A-Z][a-z]{2} )/)).map((x) => x.trim()).filter(Boolean);
const nationalityFromRemarks = (r) => [...String(r ?? '').matchAll(/(?:nationality|citizen) ([A-Za-z ,'-]+?)(?:;|\.|$)/gi)].map((m) => countryToIso(m[1]));

/** OFAC legacy CSV trio (SDN.CSV/ALT.CSV/ADD.CSV, or the CONS_* files). */
export function parseOfac(list, primCsv, altCsv, addCsv) {
    const opts = { relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true };
    const recs = new Map();
    for (const r of parse(primCsv, opts)) {
        const id = nul(r[0]); const name = nul(r[1]); if (!id || !name || !/^\d+$/.test(id)) continue;
        const t = (nul(r[2]) ?? '').toLowerCase();
        recs.set(id, { list, listId: id, type: t === 'individual' ? 'individual' : t === 'vessel' ? 'vessel' : t === 'aircraft' ? 'aircraft' : 'entity', primaryName: name, names: [name],
            programs: uniq(String(nul(r[3]) ?? '').split(/\]\s*\[|;|\s{2,}/).map((x) => x.replace(/[[\]]/g, '').trim())), countries: [], datesOfBirth: dobFromRemarks(r[11]), listedOn: null, remarks: nul(r[11])?.slice(0, 500) ?? null });
        const nat = nationalityFromRemarks(r[11]); recs.get(id).countries.push(...nat);
    }
    if (altCsv) for (const r of parse(altCsv, opts)) { const rec = recs.get(nul(r[0])); const n = nul(r[3]); if (rec && n) rec.names.push(n); }
    if (addCsv) for (const r of parse(addCsv, opts)) { const rec = recs.get(nul(r[0])); const c = countryToIso(nul(r[4])); if (rec && c) rec.countries.push(c); }
    for (const r of recs.values()) { r.names = uniq(r.names); r.countries = uniq(r.countries); }
    return [...recs.values()];
}

const tagAll = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
const tag1 = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? dec(m[1].trim()) : null; };
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function parseUn(xml) {
    const out = [];
    const generated = (xml.match(/dateGenerated="([^"]+)"/) ?? [])[1] ?? null;
    for (const [kind, type] of [['INDIVIDUAL', 'individual'], ['ENTITY', 'entity']]) {
        for (const b of tagAll(xml, kind)) {
            const primary = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((t) => tag1(b, t)).filter(Boolean).join(' ');
            if (!primary) continue;
            const aliases = tagAll(b, `${kind}_ALIAS`).map((a) => tag1(a, 'ALIAS_NAME')).filter(Boolean);
            const countries = [...tagAll(b, 'NATIONALITY').flatMap((n) => tagAll(n, 'VALUE')), ...tagAll(b, `${kind}_ADDRESS`).map((a) => tag1(a, 'COUNTRY'))].map((c) => countryToIso(c && dec(c)));
            const dobs = tagAll(b, 'INDIVIDUAL_DATE_OF_BIRTH').map((d) => tag1(d, 'DATE') ?? tag1(d, 'YEAR')).filter(Boolean);
            out.push({ list: 'un', listId: tag1(b, 'REFERENCE_NUMBER') ?? tag1(b, 'DATAID'), type, primaryName: primary, names: uniq([primary, ...aliases, tag1(b, 'NAME_ORIGINAL_SCRIPT')]),
                programs: uniq([tag1(b, 'UN_LIST_TYPE')]), countries: uniq(countries), datesOfBirth: uniq(dobs.map((d) => d.slice(0, 10))), listedOn: tag1(b, 'LISTED_ON'), remarks: tag1(b, 'COMMENTS1')?.slice(0, 500) ?? null });
        }
    }
    return { records: out, generated };
}
export function parseEu(csv) {
    const rows = parse(csv, { delimiter: ';', columns: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, bom: true });
    const recs = new Map(); let generated = null;
    for (const r of rows) {
        const id = r.Entity_LogicalId; if (!id) continue; generated ||= r.fileGenerationDate || null;
        let rec = recs.get(id);
        if (!rec) { rec = { list: 'eu', listId: r.Entity_EU_ReferenceNumber || id, type: r.Entity_SubjectType === 'P' || r.Entity_SubjectType_ClassificationCode === 'person' ? 'individual' : 'entity', primaryName: null, names: [], programs: [], countries: [], datesOfBirth: [], listedOn: r.Entity_Regulation_PublicationDate || r.Entity_DesignationDate || null, remarks: (r.Entity_Remark || '').slice(0, 500) || null }; recs.set(id, rec); }
        if (r.NameAlias_WholeName) { rec.names.push(r.NameAlias_WholeName); rec.primaryName ||= r.NameAlias_WholeName; }
        if (r.Entity_Regulation_Programme) rec.programs.push(r.Entity_Regulation_Programme);
        for (const c of [r.Address_CountryIso2Code, r.Citizenship_CountryIso2Code]) if (c && /^[A-Z]{2}$/.test(c) && c !== '00') rec.countries.push(c);
        if (r.BirthDate_BirthDate) rec.datesOfBirth.push(r.BirthDate_BirthDate); else if (r.BirthDate_Year) rec.datesOfBirth.push(r.BirthDate_Year);
    }
    const out = [];
    for (const r of recs.values()) { if (!r.primaryName) continue; r.names = uniq(r.names); r.primaryName = r.names.find((n) => /^[\x00-\u024f\s.,'"()-]+$/.test(n)) ?? r.primaryName; r.programs = uniq(r.programs); r.countries = uniq(r.countries); r.datesOfBirth = uniq(r.datesOfBirth); out.push(r); }
    return { records: out, generated };
}
export function parseUk(csv) {
    const nl = csv.indexOf('\n'); const first = csv.slice(0, nl);
    const generated = (first.match(/Report Date:\s*(.+)/) ?? [])[1]?.trim() ?? null;
    const body = /^Report Date/i.test(first) ? csv.slice(nl + 1) : csv;
    const rows = parse(body, { columns: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, bom: true });
    const recs = new Map();
    for (const r of rows) {
        const id = r['Unique ID']; if (!id) continue;
        const dt = (r['Designation Type'] || '').toLowerCase();
        const type = dt.startsWith('indiv') ? 'individual' : dt.startsWith('ship') ? 'vessel' : 'entity';
        const name = ['Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5', 'Name 6'].map((k) => (r[k] || '').trim()).filter(Boolean).join(' ');
        let rec = recs.get(id);
        if (!rec) { rec = { list: 'uk', listId: id, type, primaryName: null, names: [], programs: [], countries: [], datesOfBirth: [], listedOn: r['Date Designated'] || null, remarks: (r['Other Information'] || '').trim().slice(0, 500) || null }; recs.set(id, rec); }
        if (name) { rec.names.push(name); if (/primary/i.test(r['Name type'] || '') || !rec.primaryName) rec.primaryName = /primary/i.test(r['Name type'] || '') ? name : (rec.primaryName || name); }
        if (r['Name non-latin script']) rec.names.push(r['Name non-latin script'].trim());
        if (r['Regime Name']) rec.programs.push(r['Regime Name'].replace(/\s*\((Sanctions|EU Exit)\).*$/, '').replace(/^The /, '').trim());
        for (const c of [r['Address Country'], ...(r['Nationality(/ies)'] || '').split(/[,;]|\(\d+\)/)]) { const iso = countryToIso(c?.trim()); if (iso) rec.countries.push(iso); }
        if (r['D.O.B']) rec.datesOfBirth.push(...r['D.O.B'].split(/[;|]|\(\d+\)/).map((x) => x.trim()).filter(Boolean));
    }
    const out = [];
    for (const r of recs.values()) { if (!r.primaryName) continue; r.names = uniq(r.names); r.programs = uniq(r.programs); r.countries = uniq(r.countries); r.datesOfBirth = uniq(r.datesOfBirth); out.push(r); }
    return { records: out, generated };
}
