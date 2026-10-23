import assert from 'node:assert/strict';
import { extractPage, cleanEmail, canonicalSocial, normalizeWebsite, normPhone, companyNameFrom } from '../src/extract.js';
import { detectTech } from '../src/tech.js';
import { websitesFromDataset } from '../src/dataset.js';
const D = new Set(['acme.com']);
let n = 0; const t = (name, fn) => { fn(); n++; };
const pending = []; const ta = (name, fn) => pending.push(fn().then(() => { n++; }, (e) => { console.error(`FAIL ${name}`); throw e; }));
const fakeClient = (items) => ({ dataset: () => ({ listItems: async ({ offset, limit }) => ({ items: items.slice(offset, offset + limit) }) }) });
t('role emails kept, personal dropped, other domains dropped', () => {
    assert.equal(cleanEmail('mailto:Info@Acme.com?subject=hi', D), 'info@acme.com');
    assert.equal(cleanEmail('sales.emea@acme.com', D), 'sales.emea@acme.com');
    assert.equal(cleanEmail('jane.doe@acme.com', D), null);
    assert.equal(cleanEmail('john@acme.com', D), null);
    assert.equal(cleanEmail('info@gmail.com', D), null);
    assert.equal(cleanEmail('support@help.acme.com', D), 'support@help.acme.com');
    assert.equal(cleanEmail('noreply@acme.com', D), null);
});
t('socials', () => {
    assert.deepEqual(canonicalSocial('https://twitter.com/acme?lang=en'), ['twitter', 'https://x.com/acme']);
    assert.equal(canonicalSocial('https://twitter.com/intent/tweet?text=x'), null);
    assert.deepEqual(canonicalSocial('https://www.linkedin.com/company/acme-inc/'), ['linkedin', 'https://www.linkedin.com/company/acme-inc']);
    assert.equal(canonicalSocial('https://www.linkedin.com/in/janedoe'), null); // personal profiles never output
    assert.equal(canonicalSocial('https://www.facebook.com/sharer/sharer.php?u=x'), null);
});
t('normalize', () => {
    assert.equal(normalizeWebsite('Acme.com/about').url, 'https://acme.com/');
    assert.equal(normalizeWebsite('hello@acme.co.uk').domain, 'acme.co.uk');
    assert.equal(normalizeWebsite('not a url'), null);
    assert.equal(normPhone('tel:+1 (415) 555-0100'), '+1 (415) 555-0100');
    assert.equal(normPhone('tel:123'), null);
});
t('page extraction + JSON-LD', () => {
    const html = `<html lang="en"><head><title>Acme | Rockets for everyone</title><meta name="description" content="We build rockets.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":"Organization","name":"Acme Inc","logo":{"@type":"ImageObject","url":"/logo.png"},"telephone":"+1 415 555 0100","address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"SF","postalCode":"94105","addressCountry":"US"},"sameAs":["https://www.linkedin.com/company/acme"],"email":"press@acme.com"}]}</script>
<script src="https://js.hs-scripts.com/1.js"></script></head><body><a href="/contact-us">Contact</a><a href="/about">About us</a><a href="/careers">Careers</a>
<a href="https://jobs.lever.co/acme">Jobs</a><a href="mailto:jane@acme.com">Jane</a><a href="mailto:hello@acme.com">Mail</a><a href="tel:+14155550199">Call</a><p>Write to sales@acme.com or bob.smith@acme.com</p>
<a href="https://instagram.com/acme">IG</a></body></html>`;
    const x = extractPage(html, 'https://acme.com/', D);
    assert.deepEqual(x.emails.sort(), ['hello@acme.com', 'press@acme.com', 'sales@acme.com']);
    assert.equal(x.phones.length, 2);
    assert.equal(x.pages.contact, 'https://acme.com/contact-us');
    assert.equal(x.pages.about, 'https://acme.com/about');
    assert.equal(x.pages.careers, 'https://acme.com/careers');
    assert.deepEqual(x.jobBoard, { ats: 'lever', slug: 'acme', url: 'https://jobs.lever.co/acme' });
    assert.equal(x.socials.linkedin, 'https://www.linkedin.com/company/acme');
    assert.equal(x.socials.instagram, 'https://www.instagram.com/acme');
    assert.equal(x.ld.address.city, 'SF');
    assert.equal(companyNameFrom(x, 'acme.com'), 'Acme Inc');
    assert.deepEqual(detectTech(html, 'server: cloudflare\ncf-ray: 1').map((z) => z.name), ['HubSpot', 'Cloudflare']);
});
t('no false WooCommerce from text', () => { assert.equal(detectTech('<p>We integrate with WooCommerce</p>', '').length, 0); });
ta('dataset: Google Maps rows use website, not the maps url', async () => {
    const rows = [{ title: 'No site', url: 'https://www.google.com/maps/place/x' }, { title: 'A', url: 'https://www.google.com/maps/place/a', website: 'https://acme.com/' }, { website: ' beta.io ' }];
    const r = await websitesFromDataset(fakeClient(rows), 'ds', '', 1000);
    assert.equal(r.field, 'website'); assert.deepEqual(r.websites, ['https://acme.com/', 'beta.io']); assert.equal(r.itemsScanned, 3);
});
ta('dataset: explicit dot-path field, cap and paging', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ company: { url: `site${i}.com` } }));
    const r = await websitesFromDataset(fakeClient(rows), 'ds', 'company.url', 1200);
    assert.equal(r.websites.length, 1200); assert.equal(r.websites[1100], 'site1100.com');
});
ta('dataset: maps-only url field yields nothing; read errors are input errors', async () => {
    const r = await websitesFromDataset(fakeClient([{ url: 'https://maps.google.com/?cid=1' }]), 'ds', '', 10);
    assert.deepEqual(r.websites, []);
    const bad = { dataset: () => ({ listItems: async () => { throw new Error('not found'); } }) };
    await assert.rejects(websitesFromDataset(bad, 'nope', '', 10), (e) => e.isInputError && /nope/.test(e.message));
});
await Promise.all(pending);
console.log(`${n} tests passed`);
