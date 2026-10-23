// Pure helpers for Google Play review extraction (no I/O) - unit tested in test/local.test.js
export const SORTS = { NEWEST: 2, MOST_RELEVANT: 1, RATING: 3 };

const PKG_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/;

/** Accepts a package name ("com.spotify.music") or any Play Store URL with ?id=. Returns package name or throws. */
export function parseAppId(input) {
    const s = String(input ?? '').trim();
    if (!s) throw new Error('empty app');
    if (PKG_RE.test(s)) return s;
    let u;
    try { u = new URL(s.startsWith('http') ? s : `https://${s}`); } catch { throw new Error(`"${s}" is not a package name or Google Play URL`); }
    const id = u.searchParams.get('id');
    if (id && PKG_RE.test(id)) return id;
    throw new Error(`"${s}" is not a package name or Google Play URL (expected e.g. com.spotify.music or https://play.google.com/store/apps/details?id=com.spotify.music)`);
}

export function buildReviewsBody({ appId, sort = 2, count = 100, token = null, score = null }) {
    const inner = JSON.stringify([null, null, [2, sort, [count, null, token], null, [null, score]], [appId, 7]]);
    const freq = JSON.stringify([[['UsvDTd', inner, null, 'generic']]]);
    return new URLSearchParams({ 'f.req': freq }).toString();
}

const tsToIso = (t) => (Array.isArray(t) && Number.isFinite(t[0]) ? new Date(t[0] * 1000 + Math.round((t[1] || 0) / 1e6)).toISOString() : null);

/** Parses a batchexecute response. Returns { reviews: raw[], nextToken } or throws on unexpected format. */
export function parseReviewsResponse(text) {
    const line = String(text).split('\n').find((l) => l.startsWith('[["wrb.fr"'));
    if (!line) throw new Error('Unexpected response from Google Play (no data frame)');
    const outer = JSON.parse(line);
    const payload = outer?.[0]?.[2];
    if (!payload) return { reviews: [], nextToken: null }; // app has no reviews / unknown app
    const d = JSON.parse(payload);
    const reviews = Array.isArray(d?.[0]) ? d[0] : [];
    const tail = d?.[d.length - 1];
    const nextToken = Array.isArray(tail) && typeof tail[1] === 'string' ? tail[1] : null;
    return { reviews, nextToken };
}

export function mapReview(r, { appId, appTitle, language, country }) {
    const reply = Array.isArray(r?.[7]) ? r[7] : null;
    return {
        reviewId: r?.[0] ?? null,
        appId,
        appTitle: appTitle ?? null,
        userName: r?.[1]?.[0] ?? null,
        userImage: r?.[1]?.[1]?.[3]?.[2] ?? null,
        rating: Number.isFinite(r?.[2]) ? r[2] : null,
        text: r?.[4] ?? null,
        date: tsToIso(r?.[5]),
        thumbsUpCount: Number.isFinite(r?.[6]) ? r[6] : 0,
        appVersion: r?.[10] ?? null,
        replyText: reply?.[1] ?? null,
        replyDate: reply ? tsToIso(reply[2]) : null,
        language,
        country,
        reviewUrl: r?.[0] ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&reviewId=${encodeURIComponent(r[0])}` : null,
    };
}

/** "2026-01-01" | ISO | "30 days" | "2 weeks" | "6 months" -> Date | null */
export function parseDateInput(v, now = Date.now()) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const s = String(v).trim();
    const m = s.match(/^(\d+)\s*(day|days|d|week|weeks|w|month|months|year|years|y)$/i);
    if (m) {
        const n = Number(m[1]); const u = m[2].toLowerCase()[0];
        const days = u === 'd' ? n : u === 'w' ? n * 7 : u === 'm' ? n * 30 : n * 365;
        return new Date(now - days * 86400000);
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`"${s}" is not a valid date (use 2026-01-01 or e.g. "30 days")`);
    return d;
}

export function parseAppTitle(html) {
    const m = String(html).match(/<meta property="og:title" content="([^"]+)"/) || String(html).match(/<title>([^<]+)<\/title>/);
    if (!m) return null;
    return m[1].replace(/\s+[-–]\s+[^-–]*Google Play[^-–]*$/, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() || null;
}
