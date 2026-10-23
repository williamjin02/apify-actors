import assert from 'node:assert/strict';
import { extractPage, cleanEmail, canonicalSocial, normalizeWebsite, normPhone, companyNameFrom } from '../src/extract.js';
import { detectTech } from '../src/tech.js';
const D = new Set(['acme.com']);
let n = 0; const t = (name, fn) => { fn(); n++; };
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
console.log(`${n} tests passed`);
