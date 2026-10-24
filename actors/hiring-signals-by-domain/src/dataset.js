// Read domain / website / email values from another Actor's dataset, in pages (never the whole dataset at once).
export const DOMAIN_FIELDS = ['domain', 'companyDomain', 'website', 'websiteUrl', 'companyWebsite', 'companyUrl', 'homepage', 'email', 'emails', 'companyEmail', 'workEmail', 'url', 'loc'];
// Map links are not company websites (Google Maps results carry both "url" and "website").
const NOT_A_COMPANY_SITE = /(google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl)/i;
const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
const firstString = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.find((x) => typeof x === 'string' && x.trim()) : undefined);
export async function domainsFromDataset(client, id, field, maxItems) {
    const out = []; let offset = 0; let scanned = 0; let chosen = field || null;
    while (out.length < maxItems) {
        let page;
        try { page = await client.dataset(id).listItems({ offset, limit: 1000, clean: true }); }
        catch (e) { const err = new Error(`Could not read dataset ${id}: ${e.message}. Use the dataset ID of a run you can access.`); err.isInputError = true; throw err; }
        const items = page.items ?? [];
        if (!items.length) break;
        if (!chosen) chosen = DOMAIN_FIELDS.find((f) => items.some((it) => firstString(getPath(it, f))?.trim())) ?? null;
        for (const it of items) {
            scanned++;
            const v = chosen ? firstString(getPath(it, chosen)) : null;
            if (typeof v === 'string' && v.trim() && !NOT_A_COMPANY_SITE.test(v)) out.push(v.trim());
            if (out.length >= maxItems) break;
        }
        offset += items.length;
        if (items.length < 1000) break;
    }
    return { values: out, field: chosen, itemsScanned: scanned };
}
