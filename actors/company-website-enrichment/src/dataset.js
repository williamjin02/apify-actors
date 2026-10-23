// Read website values from another Actor's dataset, in pages (never the whole dataset at once).
// Field names other Actors commonly use for a company's site (e.g. Google Maps scrapers use "website").
export const WEBSITE_FIELDS = ['website', 'websiteUrl', 'companyWebsite', 'companyUrl', 'companyDomain', 'domain', 'homepage', 'url', 'loc'];
// Map links are not company websites (Google Maps results carry both "url" and "website").
const NOT_A_COMPANY_SITE = /(google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl)/i;
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
export async function websitesFromDataset(client, id, field, maxItems) {
    const out = []; let offset = 0; let scanned = 0; let chosen = field || null;
    while (out.length < maxItems) {
        let page;
        try { page = await client.dataset(id).listItems({ offset, limit: 1000, clean: true }); }
        catch (e) { const err = new Error(`Could not read dataset ${id}: ${e.message}. Use the dataset ID of a run you can access.`); err.isInputError = true; throw err; }
        const items = page.items ?? [];
        if (!items.length) break;
        // Pick the highest-priority field present anywhere on the first page, so a first item without "website" does not select "url".
        if (!chosen) chosen = WEBSITE_FIELDS.find((f) => items.some((it) => typeof getPath(it, f) === 'string' && getPath(it, f).trim())) ?? null;
        for (const it of items) {
            scanned++;
            const v = chosen ? getPath(it, chosen) : null;
            if (typeof v === 'string' && v.trim() && !NOT_A_COMPANY_SITE.test(v)) out.push(v.trim());
            if (out.length >= maxItems) break;
        }
        offset += items.length;
        if (items.length < 1000) break;
    }
    return { websites: out, field: chosen, itemsScanned: scanned };
}
