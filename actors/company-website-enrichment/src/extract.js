import * as cheerio from 'cheerio';
import { getDomain } from 'tldts';

// Only generic, role-based mailboxes are kept. Personal addresses (e.g. jane.doe@) are never output.
export const ROLE_EMAIL = /^(?:info|information|hello|hi|hey|contact|contactus|contact-us|kontakt|contacto|contato|sales|vertrieb|ventas|support|help|helpdesk|service|services|customerservice|customer-service|customercare|care|office|admin|press|media|pr|news|newsroom|marketing|partners?|partnerships|alliances|careers?|jobs|recruiting|recruitment|talent|hr|billing|accounts?|accounting|finance|invoices?|enquir(?:y|ies)|inquir(?:y|ies)|anfrage|team|business|bd|biz|legal|privacy|dpo|gdpr|compliance|security|abuse|webmaster|feedback|orders?|shop|store|booking|bookings|reservations?|investors?|ir|general|mail|post|welcome|bonjour|hola|ciao|studio|events|community|developers?|api|noreply|no-reply)(?:[._+-][a-z0-9]+)*$/i;
const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;

export const SOCIAL = [
    ['linkedin', /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school|showcase)\/[^/?#]+/i],
    ['twitter', /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?!intent|share|home|search|hashtag|i\/)[A-Za-z0-9_]{1,15}\/?(?:[?#].*)?$/i],
    ['facebook', /^https?:\/\/(?:www\.|m\.|[a-z]{2}-[a-z]{2}\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|login|groups\/?$)[^?#]+/i],
    ['instagram', /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|stories\/)[A-Za-z0-9_.]+\/?(?:[?#].*)?$/i],
    ['youtube', /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i],
    ['tiktok', /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/?#]+/i],
    ['github', /^https?:\/\/(?:www\.)?github\.com\/(?!features|about|pricing|login|sponsors|marketplace|topics|orgs\/?$)[A-Za-z0-9-]+\/?(?:[?#].*)?$/i],
    ['pinterest', /^https?:\/\/(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+\/(?!pin\/)[A-Za-z0-9_]+\/?(?:[?#].*)?$/i],
];

const PAGE_TYPES = [
    ['contact', /contact|kontakt|contacto|contato|contatti|get-in-touch|reach-us|talk-to|support\/contact/i, /^(contact|contact us|kontakt|contacto|contato|get in touch|talk to (?:us|sales))$/i],
    ['about', /\/(?:about|about-us|company|who-we-are|our-story|ueber-uns|uber-uns|a-propos|quienes-somos|chi-siamo|over-ons)(?:\/|$|\.)/i, /^(about|about us|company|who we are|our story|über uns|a propos|quiénes somos)$/i],
    ['legal', /\/(?:impressum|imprint|legal-notice|mentions-legales|aviso-legal|colofon|legal)(?:\/|$|\.)/i, /^(impressum|imprint|legal notice|mentions légales|aviso legal)$/i],
    ['careers', /\/(?:careers?|jobs|join-us|work-with-us|karriere|vacatures|empleo|stellenangebote)(?:\/|$|\.)/i, /^(careers|jobs|join us|we're hiring|work with us|karriere)$/i],
];

const ATS_LINKS = [
    ['greenhouse', /https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/i],
    ['lever', /https?:\/\/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i],
    ['ashby', /https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i],
    ['workable', /https?:\/\/apply\.workable\.com\/([A-Za-z0-9_-]+)/i],
    ['recruitee', /https?:\/\/([A-Za-z0-9-]+)\.recruitee\.com/i],
    ['smartrecruiters', /https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i],
    ['workday', /https?:\/\/([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i],
    ['bamboohr', /https?:\/\/([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs)/i],
    ['personio', /https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i],
    ['teamtailor', /https?:\/\/([a-z0-9-]+)\.teamtailor\.com/i],
];

const ORG_TYPE = /Organization|Corporation|Business|Store|Company|Agency|Restaurant|Hotel|Clinic|Firm|Office|NGO|School|University/i;
const clean = (s, max = 500) => { if (s == null) return null; const t = String(s).replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };

export function domainOf(host) { return getDomain(host, { allowPrivateDomains: false }) || host.replace(/^www\./, ''); }

function flattenLd(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => flattenLd(n, out)); return; }
    out.push(node);
    if (node['@graph']) flattenLd(node['@graph'], out);
    for (const k of ['publisher', 'author', 'provider', 'brand', 'parentOrganization', 'mainEntity', 'about']) if (node[k] && typeof node[k] === 'object') flattenLd(node[k], out);
}
const typeOf = (n) => [].concat(n['@type'] ?? []).join(' ');
const str = (v) => (Array.isArray(v) ? v[0] : v);
const urlOf = (v) => { v = str(v); if (!v) return null; if (typeof v === 'string') return v; return v.url ?? v.contentUrl ?? v['@id'] ?? null; };

export function parseLd($) {
    const nodes = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).contents().text().trim(); if (!raw) return;
        try { flattenLd(JSON.parse(raw), nodes); } catch { try { flattenLd(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')), nodes); } catch { /* ignore bad JSON-LD */ } }
    });
    const orgs = nodes.filter((n) => ORG_TYPE.test(typeOf(n)) && !/Person/i.test(typeOf(n)));
    if (!orgs.length) return null;
    orgs.sort((a, b) => score(b) - score(a));
    const o = orgs[0];
    const addrNode = [].concat(o.address ?? []).find((a) => a && typeof a === 'object') ?? null;
    const address = addrNode ? {
        street: clean(addrNode.streetAddress, 200), city: clean(addrNode.addressLocality, 100), region: clean(addrNode.addressRegion, 100),
        postalCode: clean(addrNode.postalCode, 30), country: clean(typeof addrNode.addressCountry === 'object' ? addrNode.addressCountry?.name : addrNode.addressCountry, 60),
    } : (typeof o.address === 'string' ? { full: clean(o.address, 300) } : null);
    return {
        name: clean(str(o.name), 200), legalName: clean(str(o.legalName), 200), description: clean(str(o.description), 1000),
        logo: urlOf(o.logo) ?? urlOf(o.image), telephone: [].concat(o.telephone ?? []).map(String), email: [].concat(o.email ?? []).map(String),
        address, sameAs: [].concat(o.sameAs ?? []).filter((x) => typeof x === 'string'), foundingDate: clean(str(o.foundingDate), 30),
        numberOfEmployees: clean(typeof o.numberOfEmployees === 'object' ? (o.numberOfEmployees.value ?? [o.numberOfEmployees.minValue, o.numberOfEmployees.maxValue].filter(Boolean).join('-')) : o.numberOfEmployees, 40),
        type: typeOf(o),
    };
    function score(n) { return ['address', 'logo', 'sameAs', 'telephone', 'legalName', 'url'].filter((k) => n[k]).length + (/^Organization$|Corporation/.test(typeOf(n)) ? 1 : 0); }
}

export function normPhone(p) {
    let s = decodeURIComponent(String(p)).replace(/^tel:|^callto:/i, '').split(/[;,?]/)[0].trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return (s.trim().startsWith('+') ? '+' : '') + s.replace(/^\+/, '').replace(/[^\d()\s.-]/g, '').replace(/\s+/g, ' ').trim();
}

export function cleanEmail(e, siteDomains) {
    e = String(e).replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    try { e = decodeURIComponent(e); } catch { /* keep */ }
    const m = e.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,24})$/i); if (!m) return null;
    const [, local, host] = m;
    if (!siteDomains.has(domainOf(host))) return null; // only the company's own domain
    if (!ROLE_EMAIL.test(local)) return null; // only role-based mailboxes, never personal ones
    if (/^(?:no-?reply)/.test(local)) return null;
    return `${local}@${host}`;
}

export function canonicalSocial(url) {
    for (const [net, re] of SOCIAL) {
        if (re.test(url)) {
            let u = url.split('#')[0].split('?')[0].replace(/\/+$/, '');
            u = u.replace(/^http:/i, 'https:').replace(/\/\/(?:mobile|m)\./i, '//www.').replace(/\/\/twitter\.com/i, '//x.com').replace(/\/\/www\.twitter\.com/i, '//x.com');
            const uu = new URL(u);
            if (['twitter', 'github'].includes(net)) uu.hostname = uu.hostname.replace(/^www\./, '');
            else if (!/^www\./.test(uu.hostname) && uu.hostname.split('.').length === 2) uu.hostname = `www.${uu.hostname}`;
            u = uu.href.replace(/\/+$/, '');
            if (net === 'facebook' && /facebook\.com\/(?:pages\/category|profile\.php)/i.test(u) && !/id=/.test(url)) return null;
            return [net, u];
        }
    }
    return null;
}

/** Extract everything from one HTML page. */
export function extractPage(html, pageUrl, siteDomains) {
    const $ = cheerio.load(html);
    const base = new URL(pageUrl);
    const links = []; const emails = new Set(); const phones = new Map(); const socials = {}; const pages = {}; let jobBoard = null;
    $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim(); if (!href) return;
        if (/^mailto:/i.test(href)) { const e = cleanEmail(href, siteDomains); if (e) emails.add(e); return; }
        if (/^(?:tel|callto):/i.test(href)) { const p = normPhone(href); if (p) phones.set(p.replace(/\D/g, ''), p); return; }
        let abs; try { abs = new URL(href, base); } catch { return; }
        if (!/^https?:$/.test(abs.protocol)) return;
        const s = abs.href;
        const soc = canonicalSocial(s); if (soc && !socials[soc[0]]) socials[soc[0]] = soc[1];
        if (!jobBoard) for (const [ats, re] of ATS_LINKS) { const m = s.match(re); if (m) { jobBoard = { ats, slug: decodeURIComponent(m[1]), url: s.split('#')[0] }; break; } }
        if (siteDomains.has(domainOf(abs.hostname))) {
            const text = clean($(el).text(), 80) ?? '';
            const path = abs.pathname.toLowerCase();
            for (const [type, pathRe, textRe] of PAGE_TYPES) {
                if (pathRe.test(path) || textRe.test(text)) {
                    const cand = abs.origin + abs.pathname;
                    if (cand.replace(/\/$/, '') === (base.origin + base.pathname).replace(/\/$/, '') && type !== 'careers') continue;
                    const prev = pages[type]; const len = abs.pathname.length + (textRe.test(text) ? 0 : 5);
                    if (!prev || len < prev.len) pages[type] = { url: cand, len };
                }
            }
            links.push(s);
        }
    });
    const ld = parseLd($);
    if (ld) {
        ld.email.forEach((e) => { const c = cleanEmail(e, siteDomains); if (c) emails.add(c); });
        ld.telephone.forEach((t) => { const p = normPhone(t); if (p) phones.set(p.replace(/\D/g, ''), p); });
        ld.sameAs.forEach((u) => { const soc = canonicalSocial(u); if (soc && !socials[soc[0]]) socials[soc[0]] = soc[1]; });
    }
    // Plain-text emails (visible text only, scripts/styles removed)
    $('script,style,noscript,svg').remove();
    const text = $('body').text().replace(/\s+/g, ' ');
    for (const m of text.matchAll(EMAIL_RE)) { const e = cleanEmail(m[0], siteDomains); if (e) emails.add(e); }
    const meta = (sel) => clean($(sel).attr('content'), 1000);
    const abs = (u) => { try { return u ? new URL(u, base).href : null; } catch { return null; } };
    return {
        title: clean($('title').first().text(), 300),
        siteName: meta('meta[property="og:site_name"]'),
        description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
        ogImage: abs(meta('meta[property="og:image"]')),
        icon: abs($('link[rel="apple-touch-icon"]').attr('href') || $('link[rel~="icon"]').attr('href')),
        language: clean($('html').attr('lang'), 20),
        ld, emails: [...emails], phones: [...phones.values()], socials, pages: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.url])), jobBoard,
    };
}

export function companyNameFrom(home, domain) {
    const label = domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const titleParts = (home.title ?? '').split(/\s+[|–—·•:-]\s+/).map((p) => p.trim()).filter(Boolean);
    const short = (x) => x && x.length <= 40 && x.split(/\s+/).length <= 5;
    const cands = [home.ld?.name, home.ld?.legalName, home.siteName, ...titleParts].filter(Boolean);
    // 1) a candidate that contains the domain label (e.g. "Hootsuite" for hootsuite.com)
    const hit = cands.find((c) => short(c) && norm(c).includes(label)) ?? cands.find((c) => short(c) && label.includes(norm(c)) && norm(c).length >= 3);
    if (hit) return hit;
    // 2) structured names, if they look like names rather than slogans
    for (const c of [home.ld?.name, home.siteName]) if (short(c) && !/sign up|log ?in|welcome|home ?page|free/i.test(c)) return c;
    // 3) fall back to the domain label, capitalized
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

export function normalizeWebsite(input) {
    let s = String(input ?? '').trim(); if (!s) return null;
    if (/@/.test(s) && !/^https?:/i.test(s)) s = s.split('@').pop();
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    let u; try { u = new URL(s); } catch { return null; }
    if (!/\./.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname === 'localhost') return null;
    return { url: `${u.protocol}//${u.hostname}/`, host: u.hostname.toLowerCase(), domain: domainOf(u.hostname.toLowerCase()) };
}
