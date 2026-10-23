// Pure helpers (unit-tested in test/local.test.js).
export const MAX_CELL_CHARS = 50000;

export function flatten(obj, { arrays = 'join' } = {}, prefix = '', out = {}) {
    if (obj === null || typeof obj !== 'object') { out[prefix || 'value'] = obj; return out; }
    if (Array.isArray(obj)) {
        if (!prefix) { out.value = toCell(obj, arrays); return out; }
        if (arrays === 'expand' && obj.length) { obj.forEach((v, i) => flatten(v, { arrays }, `${prefix}/${i}`, out)); return out; }
        out[prefix] = toCell(obj, arrays); return out;
    }
    const keys = Object.keys(obj);
    if (!keys.length && prefix) { out[prefix] = ''; return out; }
    for (const k of keys) {
        const v = obj[k]; const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !(v instanceof Date)) flatten(v, { arrays }, key, out);
        else out[key] = v;
    }
    return out;
}

function toCell(arr, arrays) {
    if (arrays === 'json') return JSON.stringify(arr);
    if (arr.every((v) => v === null || typeof v !== 'object')) return arr.filter((v) => v !== null && v !== undefined).join(', ');
    return JSON.stringify(arr);
}

// Convert a JS value into a Sheets cell value. Returns [value, truncated?]
export function cell(v) {
    if (v === null || v === undefined) return ['', false];
    if (typeof v === 'number') return [Number.isFinite(v) ? v : String(v), false];
    if (typeof v === 'boolean') return [v, false];
    if (v instanceof Date) return [v.toISOString(), false];
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (s.length > MAX_CELL_CHARS) return [s.slice(0, MAX_CELL_CHARS), true];
    return [s, false];
}

// Union of keys in first-seen order, optionally restricted/ordered by `columns`.
export function headerFor(rows, columns) {
    if (columns?.length) return [...columns];
    const seen = new Set();
    for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
    return [...seen];
}

export const keyOf = (obj, cols) => JSON.stringify(cols.map((c) => normalize(obj[c])));
export function normalize(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
}

// Turn a 2D values array into objects.
export function rowsToObjects(values, { header = true, skipEmpty = true, startCol = 0 } = {}) {
    if (!values?.length) return { headers: [], rows: [] };
    const width = Math.max(...values.map((r) => r.length));
    let headers; let body = values;
    if (header) {
        const raw = values[0] ?? []; body = values.slice(1);
        const used = new Map();
        headers = [];
        for (let i = 0; i < width; i++) {
            let h = String(raw[i] ?? '').trim() || colLetterLocal(startCol + i);
            const n = used.get(h) ?? 0; used.set(h, n + 1);
            if (n) h = `${h}_${n + 1}`;
            headers.push(h);
        }
    } else headers = Array.from({ length: width }, (_, i) => colLetterLocal(startCol + i));
    const rows = [];
    for (const r of body) {
        if (skipEmpty && (!r.length || r.every((c) => c === '' || c === null || c === undefined))) continue;
        const o = {};
        headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
        rows.push(o);
    }
    return { headers, rows };
}

function colLetterLocal(n) { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// Parse the start column index from an A1 range like "B2:F" -> 1
export function rangeStartCol(range) {
    const m = String(range ?? '').match(/^(?:.*!)?\$?([A-Za-z]+)/);
    if (!m) return 0;
    let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

// Chunk rows so each request stays well under Google's ~10MB payload limit.
export function chunkRows(rows, { maxRows = 5000, maxBytes = 4_000_000 } = {}) {
    const out = []; let cur = []; let bytes = 0;
    for (const r of rows) {
        const b = JSON.stringify(r).length;
        if (cur.length && (cur.length >= maxRows || bytes + b > maxBytes)) { out.push(cur); cur = []; bytes = 0; }
        cur.push(r); bytes += b;
    }
    if (cur.length) out.push(cur);
    return out;
}
