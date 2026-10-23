// In-memory simulation of the Sheets API to exercise write/append/replace/dedup paths end-to-end.
import { GoogleClient } from '../src/google.js';
const grid = { title: 'T', rows: [], rowCount: 1000, colCount: 26 }; let meta = [];
const A1 = (s) => { const m = decodeURIComponent(s).match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)/); const c = (x) => [...x].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; return m ? { c0: c(m[1]), r0: +m[2] - 1, c1: c(m[3]), r1: +m[4] - 1 } : null; };
const trim = () => { while (grid.rows.length && !grid.rows.at(-1).some((v) => v !== '' && v != null)) grid.rows.pop(); grid.rows = grid.rows.map((r) => { r = [...r]; while (r.length && (r.at(-1) === '' || r.at(-1) == null)) r.pop(); return r; }); };
GoogleClient.prototype.drive = async () => ({ name: 'Sim', capabilities: { canEdit: true } });
GoogleClient.prototype.getToken = async () => 't';
GoogleClient.prototype.sheets = async function (path, method = 'GET', body) {
  if (path.startsWith('/XXXXXXXXXXXXXXXXXXXXXXXX?')) return { spreadsheetUrl: 'u', properties: { title: 'Sim' }, sheets: grid.exists ? [{ properties: { sheetId: 1, title: grid.title, index: 0, gridProperties: { rowCount: grid.rowCount, columnCount: grid.colCount } } }] : [{ properties: { sheetId: 0, title: 'Sheet1', index: 0, gridProperties: { rowCount: 1000, columnCount: 26 } } }] };
  if (path.includes('developerMetadata:search')) return { matchedDeveloperMetadata: meta };
  if (path.endsWith(':batchUpdate')) { for (const r of body.requests) { if (r.addSheet) { grid.exists = true; grid.title = r.addSheet.properties.title; return { replies: [{ addSheet: { properties: { sheetId: 1, title: grid.title, index: 1, gridProperties: { rowCount: 1000, columnCount: 26 } } } }] }; } if (r.updateSheetProperties) { grid.rowCount = r.updateSheetProperties.properties.gridProperties.rowCount; grid.colCount = r.updateSheetProperties.properties.gridProperties.columnCount; } if (r.createDeveloperMetadata) meta.push({ developerMetadata: { metadataValue: r.createDeveloperMetadata.developerMetadata.metadataValue } }); } return { replies: [] }; }
  if (path.includes('values:batchClear')) { for (const rg of body.ranges) { const a = A1(rg); for (let r = a.r0; r <= a.r1 && r < grid.rows.length; r++) for (let c = a.c0; c <= a.c1; c++) if (grid.rows[r]) grid.rows[r][c] = ''; } trim(); return {}; }
  if (method === 'PUT') { const a = A1(path.split('?')[0]); if (a.r1 >= grid.rowCount || a.c1 >= grid.colCount) throw new Error('exceeds grid limits'); body.values.forEach((row, i) => { const r = grid.rows[a.r0 + i] ?? (grid.rows[a.r0 + i] = []); for (let k = 0; k < grid.rows.length; k++) grid.rows[k] ??= []; row.forEach((v, j) => { r[a.c0 + j] = v; }); }); trim(); return {}; }
  if (method === 'GET' && path.includes('/values/')) return { values: grid.rows.map((r) => [...r]) };
  throw new Error('unhandled ' + method + ' ' + path);
};
const { Actor } = await import('apify');
const runs = JSON.parse(process.env.SIM_RUNS); const origExit = Actor.exit; const origFail = Actor.fail;
let resolve; Actor.exit = async () => { resolve('ok'); }; Actor.fail = async (m) => { resolve('FAIL ' + m); };
for (const input of runs) {
  Actor.getInput = async () => ({ spreadsheet: 'https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXXXXXX/edit', ...input });
  const p = new Promise((r) => { resolve = r; });
  process.env.GOOGLE_SA_JSON = JSON.stringify({ type: 'service_account', client_email: 'sim@x', private_key: 'k' });
  await import('../src/main.js?' + Math.random()); console.log(await p, JSON.stringify(grid.rows));
}
process.exit(0);
