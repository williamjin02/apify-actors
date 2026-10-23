import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseSitemap, parseRobotsSitemaps, maybeGunzip, parseDateInput, compilePatterns, looksLikeSitemapUrl } from '../src/sitemap.js';

const idx = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ex.com/a.xml</loc><lastmod>2026-01-01</lastmod></sitemap><sitemap><loc>/b.xml.gz</loc></sitemap></sitemapindex>`;
let r = parseSitemap(idx, 'https://ex.com/sitemap.xml');
assert.equal(r.type, 'sitemapindex'); assert.equal(r.sitemaps.length, 2); assert.equal(r.sitemaps[1].url, 'https://ex.com/b.xml.gz');

const us = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc><![CDATA[https://ex.com/p?a=1&b=2]]></loc><lastmod>2026-05-02T10:00:00+02:00</lastmod><changefreq>daily</changefreq><priority>0.8</priority>
<image:image><image:loc>https://ex.com/i.jpg</image:loc></image:image><xhtml:link rel="alternate" hreflang="de" href="https://ex.com/de/p"/></url>
<url><loc>https://ex.com/q?x=1&amp;y=2#frag</loc></url><url><loc>javascript:alert(1)</loc></url></urlset>`;
r = parseSitemap(us, 'https://ex.com/', { includeImages: true, includeAlternates: true });
assert.equal(r.type, 'urlset'); assert.equal(r.urls.length, 2);
assert.equal(r.urls[0].url, 'https://ex.com/p?a=1&b=2'); assert.equal(r.urls[0].lastmod, '2026-05-02T08:00:00.000Z');
assert.equal(r.urls[0].priority, 0.8); assert.equal(r.urls[0].imageCount, 1); assert.deepEqual(r.urls[0].images, ['https://ex.com/i.jpg']);
assert.equal(r.urls[0].alternates[0].hreflang, 'de'); assert.equal(r.urls[1].url, 'https://ex.com/q?x=1&y=2');

r = parseSitemap('<sm:urlset xmlns:sm="x"><sm:url><sm:loc>https://ex.com/n</sm:loc></sm:url></sm:urlset>', 'https://ex.com');
assert.equal(r.urls[0].url, 'https://ex.com/n');

const gz = maybeGunzip(gzipSync(Buffer.from(us)));
assert.equal(parseSitemap(gz, 'https://ex.com').urls.length, 2);

r = parseSitemap('https://ex.com/1\nhttps://ex.com/2\n\nnot a url', 'https://ex.com');
assert.equal(r.type, 'text'); assert.equal(r.urls.length, 2);

r = parseSitemap('<?xml version="1.0"?><rss><channel><item><link>https://ex.com/post</link><pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate></item></channel></rss>', 'https://ex.com');
assert.equal(r.type, 'feed'); assert.equal(r.urls[0].url, 'https://ex.com/post'); assert.ok(r.urls[0].lastmod.startsWith('2026-01-05'));
r = parseSitemap('<feed xmlns="http://www.w3.org/2005/Atom"><entry><link href="https://ex.com/atom"/><updated>2026-02-01T00:00:00Z</updated></entry></feed>', 'https://ex.com');
assert.equal(r.urls[0].url, 'https://ex.com/atom');

assert.equal(parseSitemap('<!DOCTYPE html><html><body>404</body></html>', 'https://ex.com').type, 'html');
assert.deepEqual(parseRobotsSitemaps('User-agent: *\nSitemap: https://ex.com/s.xml\nsitemap:/t.xml\n', 'https://ex.com'), ['https://ex.com/s.xml', 'https://ex.com/t.xml']);

const now = Date.parse('2026-10-23T00:00:00Z');
assert.equal(parseDateInput('7 days', now).toISOString(), '2026-10-16T00:00:00.000Z');
assert.equal(parseDateInput('2026-01-31').toISOString().slice(0, 10), '2026-01-31');
assert.throws(() => parseDateInput('yesterday-ish'));
const [g] = compilePatterns(['*/blog/*']); assert.ok(g.test('https://ex.com/blog/x')); assert.ok(!g.test('https://ex.com/shop'));
const [rx] = compilePatterns(['/p/\\d+$']); assert.ok(rx.test('https://ex.com/p/12'));
assert.throws(() => compilePatterns(['(unclosed'], 'f'));
assert.ok(looksLikeSitemapUrl('https://ex.com/sitemap_index.xml')); assert.ok(!looksLikeSitemapUrl('https://ex.com/'));
console.log('All parser tests passed');
