// HTML -> clean, compact Markdown for LLM input.
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const DROP = 'script,style,noscript,template,svg,canvas,iframe,object,embed,form,button,input,select,textarea,link,meta,'
    + 'nav,footer,aside,[role="navigation"],[role="banner"],[role="contentinfo"],[aria-hidden="true"],[hidden],'
    + '.cookie,.cookies,#cookie-banner,.cookie-banner,.consent,#onetrust-banner-sdk,.ad,.ads,.advert,.advertisement,.newsletter,.popup,.modal';
const BINARY = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tgz|rar|7z|mp3|mp4|mov|avi|webm|wav|woff2?|ttf|eot|exe|dmg|iso|apk|css|js|json|xml|rss|csv|xlsx?|docx?|pptx?)(\?|#|$)/i;

export function isProbablyHtmlUrl(u) { return !BINARY.test(u); }

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '_' });
td.use(gfm);
td.remove(['script', 'style', 'noscript']);
// Keep image alt text only (no URLs) unless it's meaningful; drops data: URIs that waste tokens.
td.addRule('img', { filter: 'img', replacement: (_c, n) => { const alt = (n.getAttribute('alt') || '').trim(); return alt ? `[image: ${alt}]` : ''; } });

/**
 * @returns {{ title, description, lang, markdown, links: string[] }}
 */
export function htmlToMarkdown(html, baseUrl, { contentSelector, removeSelectors, keepHeaderFooter = false } = {}) {
    const $ = cheerio.load(html);
    const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || $('h1').first().text() || '').trim().replace(/\s+/g, ' ') || null;
    const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim() || null;
    const lang = ($('html').attr('lang') || '').trim() || null;
    // Collect links before pruning so crawling still sees nav links.
    const links = [];
    $('a[href]').each((_i, a) => {
        const h = $(a).attr('href');
        if (!h || /^(mailto:|tel:|javascript:|#)/i.test(h)) return;
        try { const u = new URL(h, baseUrl); u.hash = ''; if (/^https?:$/.test(u.protocol)) links.push(u.href); } catch { /* ignore bad hrefs */ }
    });
    let root = contentSelector ? $(contentSelector) : null;
    if (!root || !root.length) root = $('main').length === 1 ? $('main') : ($('article').length === 1 ? $('article') : $('body'));
    root.find(keepHeaderFooter ? DROP.replace('nav,footer,', '') : DROP).remove();
    if (!keepHeaderFooter) root.find('header').filter((_i, el) => $(el).find('h1').length === 0).remove();
    if (removeSelectors) { try { root.find(removeSelectors).remove(); } catch { /* invalid selector -> ignore */ } }
    // Make relative links absolute so the LLM can return real URLs.
    root.find('a[href]').each((_i, a) => { try { $(a).attr('href', new URL($(a).attr('href'), baseUrl).href); } catch { /* keep */ } });
    let md = td.turndown(root.html() || '');
    md = md.replace(/\[([^\]]*)\]\((data:|javascript:)[^)]*\)/g, '$1')
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    return { title, description, lang, markdown: md, links: [...new Set(links)] };
}

/** Rough token estimate (~4 chars/token for English Markdown). */
export const estTokens = (s) => Math.ceil((s?.length || 0) / 4);

/** Trim markdown to a token budget, cutting on a paragraph boundary when possible. */
export function truncateToTokens(md, maxTokens) {
    const maxChars = maxTokens * 4;
    if (md.length <= maxChars) return { text: md, truncated: false };
    let cut = md.lastIndexOf('\n\n', maxChars);
    if (cut < maxChars * 0.8) cut = maxChars;
    return { text: `${md.slice(0, cut)}\n\n[... page truncated ...]`, truncated: true };
}
