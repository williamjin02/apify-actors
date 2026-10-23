// DNS resolver: system resolver first, DNS-over-HTTPS (Cloudflare, then Google) fallback. Per-run cache.
import { Resolver } from 'node:dns/promises';

const TYPES = { MX: 15, TXT: 16, A: 1, AAAA: 28, CNAME: 5 };
const NOTFOUND = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'ENONAME']);

export class Dns {
    constructor({ timeoutSecs = 5, useSystem = true } = {}) {
        this.timeoutMs = Math.max(1, timeoutSecs) * 1000;
        this.useSystem = useSystem;
        this.resolver = new Resolver({ timeout: this.timeoutMs, tries: 2 });
        this.cache = new Map();
        this.queries = 0;
    }

    // Some sandboxes/proxies answer only A queries and return ENODATA for MX/TXT. Probe once with
    // well-known records; if the system resolver cannot see them, use DNS-over-HTTPS for the whole run.
    async selfTest() {
        if (!this.useSystem) return 'doh';
        const probes = [['gmail.com', 'resolveMx'], ['google.com', 'resolveTxt']];
        for (const [name, fn] of probes) {
            try { const r = await this.resolver[fn](name); if (r?.length) return 'system'; } catch { /* try next */ }
        }
        this.useSystem = false;
        return 'doh';
    }

    // Returns { status: 'ok'|'nodata'|'nxdomain'|'error', records }
    async query(name, type) {
        const key = `${type}:${name}`;
        if (!this.cache.has(key)) this.cache.set(key, this.#query(name, type));
        return this.cache.get(key);
    }

    async #query(name, type) {
        this.queries++;
        if (this.useSystem) {
            try {
                const fn = { MX: 'resolveMx', TXT: 'resolveTxt', A: 'resolve4', AAAA: 'resolve6', CNAME: 'resolveCname' }[type];
                const records = await this.resolver[fn](name);
                return { status: 'ok', records };
            } catch (e) {
                if (e.code === 'ENOTFOUND') return { status: 'nxdomain', records: [] };
                if (NOTFOUND.has(e.code)) return { status: 'nodata', records: [] };
                // SERVFAIL / timeout / refused: try DoH
            }
        }
        return this.#doh(name, type);
    }

    async #doh(name, type) {
        const urls = [
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
            `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
        ];
        for (const url of urls) {
            try {
                const res = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(this.timeoutMs) });
                if (!res.ok) continue;
                const j = await res.json();
                if (j.Status === 3) return { status: 'nxdomain', records: [] };
                if (j.Status !== 0) continue;
                const ans = (j.Answer || []).filter((a) => a.type === TYPES[type]);
                if (!ans.length) return { status: 'nodata', records: [] };
                return { status: 'ok', records: ans.map((a) => parseAnswer(type, a.data)) };
            } catch { /* next */ }
        }
        return { status: 'error', records: [] };
    }
}

function parseAnswer(type, data) {
    if (type === 'MX') { const [p, ...h] = String(data).split(/\s+/); return { priority: Number(p), exchange: h.join(' ').replace(/\.$/, '') }; }
    if (type === 'TXT') {
        const parts = [...String(data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
        return parts.length ? parts : [String(data)];
    }
    return String(data).replace(/\.$/, '');
}
