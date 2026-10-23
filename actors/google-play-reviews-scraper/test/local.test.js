import assert from 'node:assert/strict';
import { parseAppId, buildReviewsBody, parseReviewsResponse, mapReview, parseDateInput, parseAppTitle } from '../src/play.js';

assert.equal(parseAppId('com.spotify.music'), 'com.spotify.music');
assert.equal(parseAppId('https://play.google.com/store/apps/details?id=com.whatsapp&hl=en'), 'com.whatsapp');
assert.equal(parseAppId('play.google.com/store/apps/details?id=com.a_b.c1'), 'com.a_b.c1');
assert.throws(() => parseAppId('spotify'));
assert.throws(() => parseAppId('https://example.com/x'));
assert.ok(decodeURIComponent(buildReviewsBody({ appId: 'com.x.y', score: 3 })).includes('[null,3]'));

const raw = ['id1', ['Ann', [null, 2, null, [null, null, 'https://img']]], 4, null, 'Nice app', [1792654935, 219000000], 7, ['Dev', 'Thanks!', [1792686344, 0]], null, null, '9.1'];
const payload = JSON.stringify([[raw], null, [null, 'TOKEN']]);
const resp = `)]}'\n\n123\n${JSON.stringify([['wrb.fr', 'UsvDTd', payload, null, null, null, 'generic']])}\n`;
const p = parseReviewsResponse(resp);
assert.equal(p.reviews.length, 1); assert.equal(p.nextToken, 'TOKEN');
const m = mapReview(p.reviews[0], { appId: 'com.x.y', appTitle: 'X', language: 'en', country: 'us' });
assert.equal(m.rating, 4); assert.equal(m.userName, 'Ann'); assert.equal(m.thumbsUpCount, 7); assert.equal(m.replyText, 'Thanks!');
assert.equal(m.appVersion, '9.1'); assert.ok(m.date.startsWith('2026-')); assert.ok(m.reviewUrl.includes('reviewId=id1'));
assert.deepEqual(parseReviewsResponse(`${JSON.stringify([['wrb.fr', 'UsvDTd', null]])}`), { reviews: [], nextToken: null });
assert.throws(() => parseReviewsResponse('<html>blocked</html>'));
assert.equal(parseDateInput(''), null);
assert.ok(Math.abs(parseDateInput('30 days', 1e12).getTime() - (1e12 - 30 * 864e5)) < 1);
assert.throws(() => parseDateInput('yesterdayish'));
assert.equal(parseAppTitle('<meta property="og:title" content="Spotify: Music &amp; Podcasts - Apps on Google Play">'), 'Spotify: Music & Podcasts');
assert.equal(parseAppTitle('<title>LINE（ライン） - 通話・メールアプリ - Google Play のアプリ</title>'), 'LINE（ライン） - 通話・メールアプリ');
assert.equal(parseAppTitle('<title>WhatsApp Messenger – Apps bei Google Play</title>'), 'WhatsApp Messenger');
console.log('all unit tests passed');
