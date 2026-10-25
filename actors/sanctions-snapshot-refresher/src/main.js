// Private helper for swillz/sanctions-screener. Downloads the five official lists, parses them with the same code
// (src/lists.js and src/match.js are copies of the screener's files) and writes SNAPSHOT to the public-read named
// key-value store "sanctions-lists-snapshot". A list that fails keeps its previous copy; the screener then downloads
// it live once that copy is older than maxListAgeHours. Needs full permissions to write the named store.
import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { parseOfac, parseUn, parseEu, parseUk } from './lists.js';

const OFAC = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/';
const SOURCES = {
    ofac_sdn: ['SDN.CSV', 'ALT.CSV', 'ADD.CSV'].map((f) => OFAC + f),
    ofac_consolidated: ['CONS_PRIM.CSV', 'CONS_ALT.CSV', 'CONS_ADD.CSV'].map((f) => OFAC + f),
    un: ['https://scsanctions.un.org/resources/xml/en/consolidated.xml'],
    eu: ['https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw'],
    uk: ['https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv'],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(url) {
    let last;
    for (let a = 0; a < 3; a++) {
        try {
            const res = await gotScraping({ url, timeout: { request: 240000 }, throwHttpErrors: false, retry: { limit: 0 } });
            if (res.statusCode === 200 && res.body?.length > 200) return String(res.body);
            last = `HTTP ${res.statusCode}`;
        } catch (e) { last = e.code ?? e.message; }
        await sleep(5000 * (a + 1));
    }
    throw new Error(`${url.split('?')[0]}: ${last}`);
}
await Actor.init();
const store = await Actor.openKeyValueStore('sanctions-lists-snapshot');
const prev = (await store.getValue('SNAPSHOT')) ?? { lists: {} };
const fresh = {}; const failed = {};
await Promise.all(Object.entries(SOURCES).map(async ([l, urls]) => {
    try {
        const t = await Promise.all(urls.map(fetchText)); const fetchedAt = new Date().toISOString();
        let recs; let generated = null;
        if (l.startsWith('ofac')) recs = parseOfac(l, ...t);
        else if (l === 'un') ({ records: recs, generated } = parseUn(t[0]));
        else if (l === 'eu') ({ records: recs, generated } = parseEu(t[0]));
        else ({ records: recs, generated } = parseUk(t[0]));
        const prevCount = prev.lists?.[l]?.records?.length ?? 0;
        if (recs.length < 100 || (prevCount && recs.length < prevCount * 0.7)) throw new Error(`suspicious record count ${recs.length} (previous ${prevCount})`);
        fresh[l] = { fetchedAt, listDate: generated, records: recs };
    } catch (e) { failed[l] = e.message; log.warning(`${l}: ${e.message}`); }
}));
await store.setValue('SNAPSHOT', { createdAt: new Date().toISOString(), lists: { ...(prev.lists ?? {}), ...fresh } });
const summary = { refreshed: Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, { records: v.records.length, listDate: v.listDate }])), failed };
await Actor.setValue('OUTPUT', summary);
log.info(`Snapshot written: ${JSON.stringify(summary)}`);
if (!Object.keys(fresh).length) await Actor.fail('No list could be refreshed.');
else await Actor.exit(Object.keys(failed).length ? `Refreshed ${Object.keys(fresh).length}/5 lists; kept previous copy of ${Object.keys(failed).join(', ')}` : 'Refreshed all 5 lists');
