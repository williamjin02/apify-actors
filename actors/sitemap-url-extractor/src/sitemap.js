// Pure parsing / helper functions (no Apify dependency) so they can be unit-tested locally.
import { gunzipSync } from 'node:zlib';

export const COMMON_SITEMAP_PATHS = [
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml',
    '/sitemap.xml.gz', '/sitemap.txt', '/sitemaps/sitemap.xml',
];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

export function decodeXmlText(s) {
    if (s == null) return null;
    let t = String(s).trim();
    const cdata = t.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) t = cdata[1].trim();
    t = t.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    return t || null;
}

export function maybeGunzip(buf) {
    if (buf && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try { return gunzipSync(buf); } catch { return buf; }
    }
    return buf;
}

const tag = (block, name) => {
    const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, 'i');
    const m = block.match(re);
    return m ? decodeXmlText(m[1]) : null;
};

export function normalizeLastmod(v) {
    if (!v) return null;
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function absolutize(u, base) {
    if (!u) return null;
    try {
        const url = new URL(u.trim(), base);
        if (!/^https?:$/.test(url.protocol)) return null;
        url.hash = '';
        return url.href;
    } catch { return null; }
}

/**
 * Detects the document type and extracts child sitemaps and URL entries.
 * @returns {{type: string, sitemaps: {url:string,lastmod:string|null}[], urls: object[]}}
 */
export function parseSitemap(body, baseUrl, { includeImages = false, includeAlternates = false } = {}) {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    const head = text.slice(0, 4000).toLowerCase();
    const out = { type: 'unknown', sitemaps: [], urls: [] };

    if (/<(?:[\w-]+:)?sitemapindex\b/i.test(text.slice(0, 20000))) {
        out.type = 'sitemapindex';
        const re = /<(?:[\w-]+:)?sitemap\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?sitemap>/gi;
        let m;
        while ((m = re.exec(text))) {
            const loc = absolutize(tag(m[1], 'loc'), baseUrl);
            if (loc) out.sitemaps.push({ url: loc, lastmod: normalizeLastmod(tag(m[1], 'lastmod')) });
        }
        return out;
    }
    if (/<(?:[\w-]+:)?urlset\b/i.test(text.slice(0, 20000))) {
        out.type = 'urlset';
        const re = /<(?:[\w-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?url>/gi;
        let m;
        while ((m = re.exec(text))) {
            const b = m[1];
            const loc = absolutize(tag(b, 'loc'), baseUrl);
            if (!loc) continue;
            const pr = tag(b, 'priority');
            const item = {
                url: loc,
                lastmod: normalizeLastmod(tag(b, 'lastmod')),
                changefreq: tag(b, 'changefreq'),
                priority: pr != null && !Number.isNaN(Number(pr)) ? Number(pr) : null,
                imageCount: (b.match(/<image:image\b/gi) || []).length,
            };
            if (includeImages) {
                item.images = [...b.matchAll(/<image:loc>([\s\S]*?)<\/image:loc>/gi)]
                    .map((x) => absolutize(decodeXmlText(x[1]), baseUrl)).filter(Boolean);
            }
            if (includeAlternates) {
                item.alternates = [...b.matchAll(/<(?:xhtml:)?link\b([^>]*)\/?>/gi)].map((x) => {
                    const attrs = x[1];
                    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
                    const lang = attrs.match(/hreflang\s*=\s*["']([^"']+)["']/i);
                    return href ? { hreflang: lang ? lang[1] : null, href: absolutize(decodeXmlText(href[1]), baseUrl) } : null;
                }).filter((a) => a && a.href);
            }
            const news = tag(b, 'publication_date');
            if (news) item.newsPublicationDate = normalizeLastmod(news);
            out.urls.push(item);
        }
        return out;
    }
    if (/<rss\b|<feed\b|<rdf:rdf\b/.test(head)) {
        out.type = 'feed';
        const re = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
        let m;
        while ((m = re.exec(text))) {
            const b = m[2];
            let link = tag(b, 'link');
            if (!link) {
                const href = b.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["']/i);
                link = href ? decodeXmlText(href[1]) : null;
            }
            const loc = absolutize(link, baseUrl);
            if (!loc) continue;
            out.urls.push({
                url: loc,
                lastmod: normalizeLastmod(tag(b, 'lastBuildDate') || tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published')),
                changefreq: null, priority: null, imageCount: 0,
            });
        }
        return out;
    }
    if (/<html\b|<!doctype html/.test(head)) { out.type = 'html'; return out; }
    // Plain-text sitemap: one URL per line.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));
    if (lines.length) {
        out.type = 'text';
        for (const l of lines) {
            const loc = absolutize(l, baseUrl);
            if (loc) out.urls.push({ url: loc, lastmod: null, changefreq: null, priority: null, imageCount: 0 });
        }
    }
    return out;
}

export function parseRobotsSitemaps(robotsTxt, baseUrl) {
    const res = [];
    for (const line of String(robotsTxt).split(/\r?\n/)) {
        const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
        if (m) { const u = absolutize(m[1], baseUrl); if (u) res.push(u); }
    }
    return [...new Set(res)];
}

export function looksLikeSitemapUrl(u) {
    try {
        const p = new URL(u).pathname.toLowerCase();
        return /\.(xml|gz|txt|rss|atom)$/.test(p) || p.includes('sitemap') || p.endsWith('/feed') || p.endsWith('/feed/');
    } catch { return false; }
}

/** Parses absolute dates ("2026-01-31") or relative ones ("7 days", "2 weeks", "24 hours"). */
export function parseDateInput(v, now = Date.now()) {
    if (!v) return null;
    const s = String(v).trim().toLowerCase();
    const rel = s.match(/^(\d+)\s*(minute|hour|day|week|month|year)s?(\s+ago)?$/);
    if (rel) {
        const mult = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[rel[2]];
        return new Date(now - Number(rel[1]) * mult);
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: "${v}". Use YYYY-MM-DD or a relative value like "7 days".`);
    return d;
}

export function compilePatterns(list, field) {
    return (list || []).filter((p) => p && String(p).trim()).map((p) => {
        const s = String(p).trim();
        try {
            // Glob support: if it contains * but no regex-only tokens, convert.
            if (/\*/.test(s) && !/[\\^$()|[\]{}+?]/.test(s)) {
                return new RegExp(s.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i');
            }
            return new RegExp(s, 'i');
        } catch (e) { throw new Error(`Invalid pattern in "${field}": ${s} (${e.message})`); }
    });
}
