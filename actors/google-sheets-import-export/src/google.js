// Minimal Google Sheets/Drive client: service-account JWT auth via node:crypto, REST via fetch. No secrets are ever logged.
import crypto from 'node:crypto';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class GoogleError extends Error {
    constructor(msg, status, reason) { super(msg); this.status = status; this.reason = reason; }
}

export function parseServiceAccount(raw) {
    if (!raw) return null;
    let sa = raw;
    if (typeof raw === 'string') {
        try { sa = JSON.parse(raw.trim()); } catch { throw new GoogleError('The service account key is not valid JSON. Paste the whole contents of the downloaded .json key file.'); }
    }
    if (!sa || sa.type !== 'service_account' || !sa.client_email || !sa.private_key) {
        throw new GoogleError('The service account key must be a Google service-account JSON key (type "service_account" with client_email and private_key).');
    }
    return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri || 'https://oauth2.googleapis.com/token' };
}

const b64u = (b) => Buffer.from(b).toString('base64url');

export class GoogleClient {
    constructor(sa, { maxRetries = 6 } = {}) { this.sa = sa; this.maxRetries = maxRetries; this.token = null; this.exp = 0; }
    get email() { return this.sa.client_email; }

    async getToken() {
        if (this.token && Date.now() < this.exp - 60_000) return this.token;
        const now = Math.floor(Date.now() / 1000);
        const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const claim = b64u(JSON.stringify({ iss: this.sa.client_email, scope: SCOPES, aud: this.sa.token_uri, iat: now, exp: now + 3600 }));
        let sig;
        try { sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(this.sa.private_key, 'base64url'); }
        catch { throw new GoogleError('Could not sign with the service account private key. Check that the key JSON is complete and unmodified.'); }
        for (let attempt = 0; ; attempt++) {
            let res;
            try {
                res = await fetch(this.sa.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
            } catch (e) { if (attempt < this.maxRetries) { await sleep(1000 * 2 ** attempt); continue; } throw e; }
            const j = await res.json().catch(() => ({}));
            if (res.ok) { this.token = j.access_token; this.exp = Date.now() + (j.expires_in || 3600) * 1000; return this.token; }
            if (res.status >= 500 && attempt < this.maxRetries) { await sleep(1000 * 2 ** attempt); continue; }
            throw new GoogleError(`Google rejected the service account key (${j.error || res.status}: ${j.error_description || ''}). The key may have been deleted or disabled.`, res.status, j.error);
        }
    }

    // Generic request with retries on 429/5xx/network errors (exponential backoff + jitter).
    async request(method, url, body) {
        for (let attempt = 0; ; attempt++) {
            const token = await this.getToken();
            let res;
            try {
                res = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
                    body: body ? JSON.stringify(body) : undefined });
            } catch (e) {
                if (attempt < this.maxRetries) { await sleep(Math.min(32000, 1000 * 2 ** attempt) + Math.random() * 500); continue; }
                throw new GoogleError(`Network error talking to Google: ${e.message}`);
            }
            if (res.ok) return res.status === 204 ? {} : res.json();
            const j = await res.json().catch(() => ({}));
            const reason = j?.error?.status || j?.error?.errors?.[0]?.reason || '';
            const msg = j?.error?.message || res.statusText;
            if ((res.status === 429 || res.status >= 500 || (res.status === 403 && /rate|quota/i.test(reason + msg))) && attempt < this.maxRetries) {
                const ra = Number(res.headers.get('retry-after')) * 1000;
                await sleep(ra || Math.min(64000, 1000 * 2 ** attempt) + Math.random() * 1000);
                continue;
            }
            if (res.status === 401 && attempt < 1) { this.token = null; continue; }
            throw new GoogleError(msg, res.status, reason);
        }
    }

    sheets(path, method = 'GET', body) { return this.request(method, `https://sheets.googleapis.com/v4/spreadsheets${path}`, body); }
    drive(path, method = 'GET', body) { return this.request(method, `https://www.googleapis.com/drive/v3${path}`, body); }
}

export function parseSpreadsheetId(s) {
    const v = String(s ?? '').trim();
    const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(v)) return v;
    return null;
}
export function parseGid(s) { const m = String(s ?? '').match(/[#?&]gid=(\d+)/); return m ? Number(m[1]) : null; }

// Quote a sheet title for A1 notation.
export const q = (title) => `'${String(title).replace(/'/g, "''")}'`;

export function colLetter(n) { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
