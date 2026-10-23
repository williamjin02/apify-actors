import { Actor, log } from 'apify';
import { GoogleClient, GoogleError, parseServiceAccount, parseSpreadsheetId, parseGid, q, colLetter } from './google.js';
import { flatten, cell, headerFor, keyOf, rowsToObjects, rangeStartCol, chunkRows } from './transform.js';

const EV_READ = 'row-read';
const EV_WRITE = 'row-written';
const LOCK_KEY = 'apifyOwnerUserId';
const MAX_CELLS = 10_000_000;
class InputError extends Error {}

await Actor.init();
let sa = null; let usingOwnKey = false;
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        operation = 'write', spreadsheet, sheetName = '', range = '',
        datasetId: datasetIdIn = '', rawData = null, writeMode = 'append',
        headerRow = true, columns = [], deduplicateBy = [], arrayHandling = 'join',
        valueInputOption = 'RAW', valueRender = 'FORMATTED_VALUE', skipEmptyRows = true,
        maxRows = 0, serviceAccountKey = '',
    } = input;

    // ---------- auth ----------
    if (serviceAccountKey && String(serviceAccountKey).trim()) {
        try { sa = parseServiceAccount(serviceAccountKey); } catch (e) { throw new InputError(e.message); }
        usingOwnKey = true;
    } else {
        sa = parseServiceAccount(process.env.GOOGLE_SA_JSON);
        if (!sa) throw new Error('This actor is missing its built-in Google credentials. Provide your own service account key in "Your own service account key".');
    }
    const g = new GoogleClient(sa);
    log.info(`Using service account ${g.email}${usingOwnKey ? ' (your own key)' : ''}.`);

    const id = parseSpreadsheetId(spreadsheet);
    if (!id) throw new InputError('Paste the spreadsheet URL (https://docs.google.com/spreadsheets/d/...) or its ID in "Spreadsheet".');
    const gid = parseGid(spreadsheet);
    const op = String(operation).toLowerCase();
    if (!['read', 'write'].includes(op)) throw new InputError('Operation must be "read" (sheet to dataset) or "write" (dataset to sheet).');

    // ---------- access + metadata ----------
    let file;
    try { file = await g.drive(`/files/${id}?fields=name,capabilities(canEdit)&supportsAllDrives=true`); }
    catch (e) { throw accessError(e, g.email, id, op); }
    const canEdit = !!file.capabilities?.canEdit;
    if (op === 'write' && !canEdit) throw new InputError(`The service account can open "${file.name}" but cannot edit it. Share the spreadsheet with ${g.email} as Editor.`);
    let meta;
    try { meta = await g.sheets(`/${id}?fields=spreadsheetUrl,properties(title),sheets(properties(sheetId,title,index,gridProperties))`); }
    catch (e) { throw accessError(e, g.email, id, op); }

    // ---------- sheet lock (built-in key only) ----------
    const userId = process.env.APIFY_USER_ID || Actor.getEnv().userId;
    if (!usingOwnKey && userId) await enforceLock(g, id, userId, canEdit, file.name);

    let sheet = pickSheet(meta.sheets, sheetName, gid);
    const summary = { operation: op, spreadsheetId: id, spreadsheetTitle: meta.properties?.title, spreadsheetUrl: meta.spreadsheetUrl, serviceAccount: g.email };

    if (op === 'read') {
        if (!sheet) throw new InputError(`Sheet tab "${sheetName}" not found. Tabs in this spreadsheet: ${meta.sheets.map((s) => s.properties.title).join(', ')}.`);
        const a1 = range ? `${q(sheet.properties.title)}!${String(range).replace(/^.*!/, '')}` : q(sheet.properties.title);
        const res = await g.sheets(`/${id}/values/${encodeURIComponent(a1)}?valueRenderOption=${valueRender === 'UNFORMATTED_VALUE' ? 'UNFORMATTED_VALUE' : 'FORMATTED_VALUE'}&dateTimeRenderOption=FORMATTED_STRING`);
        let { headers, rows } = rowsToObjects(res.values ?? [], { header: headerRow, skipEmpty: skipEmptyRows, startCol: rangeStartCol(range) });
        if (columns?.length) rows = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ''])));
        let dupes = 0;
        if (deduplicateBy?.length) {
            const missing = deduplicateBy.filter((c) => !(columns?.length ? columns : headers).includes(c));
            if (missing.length) throw new InputError(`Deduplicate column(s) not found in the sheet header: ${missing.join(', ')}. Header: ${headers.join(', ')}`);
            const seen = new Set(); const kept = [];
            for (const r of rows) { const k = keyOf(r, deduplicateBy); if (seen.has(k)) { dupes++; continue; } seen.add(k); kept.push(r); }
            rows = kept;
        }
        if (maxRows > 0) rows = rows.slice(0, maxRows);
        rows = rows.slice(0, chargeLimit(EV_READ, rows.length));
        for (const chunk of chunkRows(rows, { maxRows: 1000, maxBytes: 5_000_000 })) {
            await Actor.pushData(chunk);
            await Actor.charge({ eventName: EV_READ, count: chunk.length });
        }
        Object.assign(summary, { sheetName: sheet.properties.title, range: res.range, columns: columns?.length ? columns : headers, rowsRead: rows.length, duplicatesSkipped: dupes });
        log.info(`Read ${rows.length} rows from "${sheet.properties.title}" into the dataset.`);
        await Actor.setValue('OUTPUT', summary);
        await Actor.setStatusMessage(`Read ${rows.length} rows from ${sheet.properties.title}`, { isStatusMessageTerminal: true });
    } else {
        // ---------- load data ----------
        const dsId = String(datasetIdIn || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
        let items = [];
        if (Array.isArray(rawData) && rawData.length) items = rawData;
        else if (dsId) items = await loadDataset(dsId, maxRows);
        else throw new InputError('Provide a dataset ID (e.g. from another actor run) or JSON rows in "Raw data" to write.');
        if (maxRows > 0) items = items.slice(0, maxRows);
        const flat = items.map((it) => flatten(it, { arrays: arrayHandling }));

        // ---------- target sheet ----------
        let created = false;
        if (!sheet) {
            const title = (sheetName || 'Sheet1').slice(0, 100);
            const r = await g.sheets(`/${id}:batchUpdate`, 'POST', { requests: [{ addSheet: { properties: { title } } }] });
            sheet = { properties: r.replies[0].addSheet.properties }; created = true;
            log.info(`Created sheet tab "${title}".`);
        }
        const title = sheet.properties.title; const sid = sheet.properties.sheetId;

        let existing = [];
        if (!created) {
            const res = await g.sheets(`/${id}/values/${encodeURIComponent(q(title))}?valueRenderOption=UNFORMATTED_VALUE`);
            existing = res.values ?? [];
        }
        const mode = String(writeMode).toLowerCase();
        if (!['append', 'replace'].includes(mode)) throw new InputError('Write mode must be "append" or "replace".');

        let header; let startRow; let dupes = 0; let writeHeader = headerRow;
        const existingHeader = headerRow && mode === 'append' && existing.length ? (existing[0] ?? []).map((h) => String(h ?? '').trim()) : null;
        if (existingHeader && existingHeader.some(Boolean)) {
            header = [...existingHeader];
            for (const k of headerFor(flat, columns)) if (!header.includes(k)) header.push(k);
        } else header = headerFor(flat, columns);
        if (!header.length) header = ['value'];

        let rowsOut = flat;
        if (deduplicateBy?.length) {
            const missing = deduplicateBy.filter((c) => !header.includes(c));
            if (missing.length) throw new InputError(`Deduplicate column(s) not found in the data: ${missing.join(', ')}.`);
            const seen = new Set();
            if (mode === 'append' && existingHeader) {
                const { rows: old } = rowsToObjects(existing, { header: true, skipEmpty: true });
                for (const o of old) seen.add(keyOf(o, deduplicateBy));
            }
            rowsOut = [];
            for (const r of flat) { const k = keyOf(r, deduplicateBy); if (seen.has(k)) { dupes++; continue; } seen.add(k); rowsOut.push(r); }
        }
        rowsOut = rowsOut.slice(0, chargeLimit(EV_WRITE, rowsOut.length));

        let truncated = 0;
        const matrix = rowsOut.map((r) => header.map((h) => { const [v, t] = cell(r[h]); if (t) truncated++; return v; }));

        if (mode === 'append') {
            startRow = existing.length; // 0-based index of first free row (after last non-empty row)
            if (headerRow && !(existingHeader && existingHeader.some(Boolean))) { writeHeader = true; }
            else if (headerRow) writeHeader = header.length !== existingHeader.length; // header grew -> rewrite row 1
            else writeHeader = false;
            if (headerRow && startRow === 0) startRow = 0;
        } else startRow = 0;

        const needRows = (mode === 'replace' ? 0 : startRow) + matrix.length + (headerRow && (mode === 'replace' || startRow === 0) ? 1 : 0);
        const needCols = header.length;
        const grid = sheet.properties.gridProperties ?? { rowCount: 1000, columnCount: 26 };
        const otherCells = meta.sheets.filter((s) => s.properties.sheetId !== sid).reduce((a, s) => a + (s.properties.gridProperties?.rowCount ?? 0) * (s.properties.gridProperties?.columnCount ?? 0), 0);
        const newRows = Math.max(grid.rowCount, needRows); const newCols = Math.max(grid.columnCount, needCols);
        if (otherCells + newRows * newCols > MAX_CELLS) throw new InputError(`This write needs ${newRows.toLocaleString()} x ${newCols} cells, which would exceed Google Sheets' 10 million cell limit per spreadsheet. Use a new spreadsheet, fewer columns ("Columns") or "Max rows".`);
        if (newRows > grid.rowCount || newCols > grid.columnCount) {
            await g.sheets(`/${id}:batchUpdate`, 'POST', { requests: [{ updateSheetProperties: { properties: { sheetId: sid, gridProperties: { rowCount: newRows, columnCount: newCols } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } }] });
        }

        const vio = valueInputOption === 'USER_ENTERED' ? 'USER_ENTERED' : 'RAW';
        const put = async (row0, values) => {
            const a1 = `${q(title)}!A${row0 + 1}:${colLetter(Math.max(0, header.length - 1))}${row0 + values.length}`;
            await g.sheets(`/${id}/values/${encodeURIComponent(a1)}?valueInputOption=${vio}`, 'PUT', { range: a1, majorDimension: 'ROWS', values });
        };

        let written = 0; let cursor;
        if (mode === 'replace') {
            cursor = 0;
            if (headerRow) { await put(0, [header]); cursor = 1; }
            for (const chunk of chunkRows(matrix)) { await put(cursor, chunk); cursor += chunk.length; written += chunk.length; await Actor.charge({ eventName: EV_WRITE, count: chunk.length }); }
            // Clear leftovers only after the new data is in place (no empty-sheet window if a run dies).
            const oldRows = existing.length; const oldCols = Math.max(0, ...existing.map((r) => r.length));
            const clears = [];
            if (oldRows > cursor) clears.push(`${q(title)}!A${cursor + 1}:${colLetter(Math.max(oldCols, header.length) - 1)}${oldRows}`);
            if (oldCols > header.length) clears.push(`${q(title)}!${colLetter(header.length)}1:${colLetter(oldCols - 1)}${Math.min(cursor, oldRows) || 1}`);
            if (clears.length) await g.sheets(`/${id}/values:batchClear`, 'POST', { ranges: clears });
        } else {
            cursor = startRow;
            if (headerRow && startRow === 0) { await put(0, [header]); cursor = 1; }
            else if (writeHeader) await put(0, [header]);
            for (const chunk of chunkRows(matrix)) { await put(cursor, chunk); cursor += chunk.length; written += chunk.length; await Actor.charge({ eventName: EV_WRITE, count: chunk.length }); }
        }
        if (truncated) log.warning(`${truncated} cell(s) were longer than 50,000 characters (Google's per-cell limit) and were truncated.`);
        Object.assign(summary, { sheetName: title, sheetCreated: created, writeMode: mode, datasetId: dsId || null, inputRows: items.length, rowsWritten: written, duplicatesSkipped: dupes, columns: header, truncatedCells: truncated, lastRow: cursor });
        log.info(`Wrote ${written} rows to "${title}" (${mode}); ${dupes} duplicates skipped.`);
        await Actor.setValue('OUTPUT', summary);
        await Actor.setStatusMessage(`Wrote ${written} rows to ${title} (${mode})${dupes ? `, ${dupes} duplicates skipped` : ''}`, { isStatusMessageTerminal: true });
    }
    await Actor.exit();
} catch (e) {
    const msg = e instanceof InputError || e instanceof GoogleError ? e.message : `Unexpected error: ${e.message}`;
    log.error(msg);
    await Actor.setValue('OUTPUT', { error: msg }).catch(() => {});
    await Actor.fail(msg);
}

function pickSheet(sheets, name, gid) {
    if (name) return sheets.find((s) => s.properties.title === name) ?? sheets.find((s) => s.properties.title.toLowerCase() === String(name).toLowerCase().trim()) ?? null;
    if (gid !== null) { const s = sheets.find((x) => x.properties.sheetId === gid); if (s) return s; }
    return [...sheets].sort((a, b) => a.properties.index - b.properties.index)[0] ?? null;
}

function accessError(e, email, id, op) {
    if (e.status === 404 || e.status === 403) {
        return new InputError(`Can't open spreadsheet ${id}. Share it with ${email} as ${op === 'write' ? 'Editor' : 'Editor (or Viewer for read-only)'} (Share button in Google Sheets, untick "Notify people"), and check the URL/ID.`);
    }
    return e;
}

async function enforceLock(g, id, userId, canEdit, name) {
    const r = await g.sheets(`/${id}/developerMetadata:search`, 'POST', { dataFilters: [{ developerMetadataLookup: { metadataKey: LOCK_KEY, locationType: 'SPREADSHEET' } }] });
    const owners = (r.matchedDeveloperMetadata ?? []).map((m) => m.developerMetadata.metadataValue);
    if (owners.length) {
        if (!owners.includes(userId)) throw new InputError(`"${name}" is locked to another Apify account. For your security, a spreadsheet shared with this actor's service account can only be used by the first Apify account that used it. Use your own service account key, or ask the sheet owner.`);
        return;
    }
    if (canEdit) {
        await g.sheets(`/${id}:batchUpdate`, 'POST', { requests: [{ createDeveloperMetadata: { developerMetadata: { metadataKey: LOCK_KEY, metadataValue: userId, location: { spreadsheet: true }, visibility: 'PROJECT' } } }] });
        log.info('Locked this spreadsheet to your Apify account (only your account can use it through this actor).');
    } else {
        log.warning('Shared as Viewer: the sheet lock needs Editor access. Share as Editor so that only your Apify account can use this spreadsheet through the actor.');
    }
}

function chargeLimit(eventName, wanted) {
    try {
        const cm = Actor.getChargingManager?.();
        const n = cm?.calculateMaxEventChargeCountWithinLimit?.(eventName);
        if (typeof n === 'number' && Number.isFinite(n) && n < wanted) { log.warning(`Your max cost per run allows ${n} of ${wanted} rows; processing ${n}.`); return Math.max(0, n); }
    } catch { /* not PPE / local */ }
    return wanted;
}

async function loadDataset(dsId, maxRows) {
    const client = Actor.apifyClient; const out = []; let offset = 0; const limit = 10000;
    try { await client.dataset(dsId).get().then((d) => { if (!d) throw new Error('nf'); }); }
    catch { throw new InputError(`Dataset "${dsId}" not found or not accessible from your account. Use the dataset ID from the run's Storage tab (or {{resource.defaultDatasetId}} in an integration).`); }
    for (;;) {
        const { items } = await client.dataset(dsId).listItems({ offset, limit, clean: true });
        out.push(...items); offset += items.length;
        if (items.length < limit || (maxRows > 0 && out.length >= maxRows)) break;
    }
    return out;
}
