import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { SORTS, parseAppId, buildReviewsBody, parseReviewsResponse, mapReview, parseDateInput, parseAppTitle } from './play.js';

const REVIEW_EVENT = 'review';
const PAGE_SIZE = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class InputError extends Error {}

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const {
        apps = [],
        maxReviewsPerApp = 100,
        maxReviews = 0,
        sort = 'NEWEST',
        ratings = [],
        reviewsSince = null,
        language = 'en',
        country = 'us',
        proxyConfiguration = { useApifyProxy: false },
        maxRetries = 4,
    } = input;

    // ---------- Input validation ----------
    const rawApps = (Array.isArray(apps) ? apps : [apps]).map((a) => (typeof a === 'object' && a ? a.url ?? a.id : a)).filter((a) => String(a ?? '').trim());
    if (!rawApps.length) throw new InputError('Add at least one app: a package name like com.spotify.music or a Google Play URL.');
    const appIds = [];
    for (const a of rawApps) { try { appIds.push(parseAppId(a)); } catch (e) { throw new InputError(e.message); } }
    const uniqueApps = [...new Set(appIds)];
    const sortCode = SORTS[sort];
    if (!sortCode) throw new InputError(`Unknown sort "${sort}". Use NEWEST, MOST_RELEVANT or RATING.`);
    const stars = [...new Set((ratings || []).map(Number))];
    if (stars.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) throw new InputError('Star ratings must be whole numbers from 1 to 5.');
    let since;
    try { since = parseDateInput(reviewsSince); } catch (e) { throw new InputError(e.message); }
    const hl = String(language || 'en').trim().toLowerCase();
    const gl = String(country || 'us').trim().toLowerCase();
    if (!/^[a-z]{2,3}([_-][a-z0-9]{2,4})?$/i.test(hl)) throw new InputError(`"${language}" is not a valid language code (e.g. en, de, pt-BR).`);
    if (!/^[a-z]{2}$/.test(gl)) throw new InputError(`"${country}" is not a valid 2-letter country code (e.g. us, gb, de).`);
    const perApp = Number(maxReviewsPerApp) > 0 ? Math.floor(Number(maxReviewsPerApp)) : Infinity;
    const totalCap = Number(maxReviews) > 0 ? Math.floor(Number(maxReviews)) : Infinity;

    const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length
        ? await Actor.createProxyConfiguration(proxyConfiguration) : null;
    const charging = Actor.getChargingManager();
    let chargeLimitHit = false;
    const stats = { requests: 0, retries: 0, failedRequests: 0 };

    async function request(opts, label) {
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            stats.requests++;
            try {
                const res = await gotScraping({
                    ...opts,
                    proxyUrl: proxy ? await proxy.newUrl(`s${label}${attempt}`.replace(/[^\w]/g, '').slice(0, 50)) : undefined,
                    timeout: { request: 30000 },
                    throwHttpErrors: false,
                    retry: { limit: 0 },
                    headerGeneratorOptions: { browsers: ['chrome'], operatingSystems: ['windows', 'macos'], devices: ['desktop'] },
                });
                const code = res.statusCode;
                if (code === 429 || code >= 500 || code === 403) {
                    lastErr = new Error(`HTTP ${code}`);
                    if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(1500 * 2 ** attempt, 20000) + Math.random() * 700); continue; }
                    break;
                }
                return res;
            } catch (e) {
                lastErr = e;
                if (attempt < maxRetries) { stats.retries++; await sleep(Math.min(1500 * 2 ** attempt, 20000) + Math.random() * 700); }
            }
        }
        stats.failedRequests++;
        throw lastErr;
    }

    let pushed = 0;
    async function push(items) {
        if (!items.length || chargeLimitHit) return 0;
        if (pushed + items.length > totalCap) items = items.slice(0, totalCap - pushed);
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(REVIEW_EVENT);
            if (Number.isFinite(allowed) && allowed < items.length) {
                items = items.slice(0, Math.max(0, allowed));
                chargeLimitHit = true;
                log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.');
            }
        }
        if (!items.length) return 0;
        const r = await Actor.pushData(items, REVIEW_EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
        pushed += items.length;
        return items.length;
    }
    const stop = () => chargeLimitHit || pushed >= totalCap;

    const summary = { apps: [], input: { sort, ratings: stars, reviewsSince: since?.toISOString() ?? null, language: hl, country: gl, maxReviewsPerApp: perApp === Infinity ? 0 : perApp } };
    let formatErrors = 0;

    for (const appId of uniqueApps) {
        if (stop()) break;
        const app = { appId, appTitle: null, found: true, reviews: 0, pages: 0, error: null };
        summary.apps.push(app);
        // 1) App details page: validates the app exists in this country, gives the title.
        try {
            const res = await request({ url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=${hl}&gl=${gl}` }, appId);
            if (res.statusCode === 404) {
                app.found = false; app.error = `App not found on Google Play (${gl}). Check the package name.`;
                log.warning(`${appId}: ${app.error}`); continue;
            }
            app.appTitle = parseAppTitle(res.body);
        } catch (e) { log.warning(`${appId}: could not load app page (${e.message}); continuing with reviews.`); }

        const ctx = { appId, appTitle: app.appTitle, language: hl, country: gl };
        const seen = new Set();
        for (const score of (stars.length ? stars : [null])) {
            let token = null; let got = 0; let done = false;
            while (!done && !stop() && got < perApp) {
                const count = Math.min(PAGE_SIZE, perApp - got);
                let parsed;
                try {
                    const res = await request({
                        url: `https://play.google.com/_/PlayStoreUi/data/batchexecute?hl=${hl}&gl=${gl}`,
                        method: 'POST',
                        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                        body: buildReviewsBody({ appId, sort: sortCode, count, token, score }),
                    }, appId);
                    parsed = parseReviewsResponse(res.body);
                } catch (e) {
                    if (/Unexpected response/.test(e.message)) formatErrors++;
                    app.error = `Stopped after ${app.reviews} reviews: ${e.message}`;
                    log.warning(`${appId}: ${app.error}`);
                    break;
                }
                app.pages++;
                let batch = [];
                for (const raw of parsed.reviews) {
                    const rev = mapReview(raw, ctx);
                    if (!rev.reviewId || seen.has(rev.reviewId)) continue;
                    if (since && rev.date && new Date(rev.date) < since) { if (sortCode === SORTS.NEWEST) { done = true; break; } continue; }
                    seen.add(rev.reviewId);
                    batch.push({ ...rev, scrapedAt: new Date().toISOString() });
                }
                if (got + batch.length > perApp) batch = batch.slice(0, perApp - got);
                const n = await push(batch);
                got += n; app.reviews += n;
                token = parsed.nextToken;
                if (!token || !parsed.reviews.length) done = true;
                await Actor.setStatusMessage(`${appId}: ${app.reviews} reviews (total ${pushed})`);
                await sleep(150 + Math.random() * 200);
            }
        }
        if (app.found && app.reviews === 0 && !app.error) log.warning(`${appId}: no reviews matched (country ${gl}, language ${hl}${stars.length ? `, stars ${stars}` : ''}${since ? `, since ${since.toISOString().slice(0, 10)}` : ''}).`);
        log.info(`${appId}${app.appTitle ? ` (${app.appTitle})` : ''}: ${app.reviews} reviews`);
    }

    summary.totals = { apps: uniqueApps.length, appsFound: summary.apps.filter((a) => a.found).length, reviews: pushed, ...stats, chargeLimitHit };
    await Actor.setValue('OUTPUT', summary);

    // Silent-failure guard: if Google changed its response format, fail loudly instead of returning an empty "success".
    if (formatErrors > 0 && pushed === 0) throw new Error('Google Play returned an unexpected response format. The actor needs an update; please open an issue.');
    if (!summary.totals.appsFound) await Actor.exit('No reviews: none of the apps were found on Google Play. Check the package names (e.g. com.spotify.music) and the country.');
    else await Actor.exit(`Done: ${pushed} reviews from ${summary.totals.appsFound} app(s).${chargeLimitHit ? ' Stopped at your maximum cost per run.' : ''}`);
} catch (e) {
    if (e instanceof InputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(`Error: ${e.message}`); }
}
