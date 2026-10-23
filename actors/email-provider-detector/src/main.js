import { Actor, log } from 'apify';
import { domainsFromDataset, DOMAIN_FIELDS } from './dataset.js';
import { Dns } from './dns.js';
import {
    toDomain, isDkimRecord, classifyMx, pickSpf, parseSpf, spfServices, parseDmarc, dmarcVendors, txtVerifications, inferUnderlying, scoreEmailSecurity, CONSUMER_DOMAINS,
} from './classify.js';

const EVENT = 'domain-checked';
const DKIM_SELECTORS = ['google', 'selector1', 'selector2', 'k1', 's1', 'default'];
const MAX_SPF_QUERIES = 25;
class InputError extends Error {}
const txtStrings = (r) => (r.records || []).map((t) => (Array.isArray(t) ? t.join('') : String(t)));

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const {
        domains = [], checkDkim = true, countSpfLookups = true, detectSaas = true, includeRawRecords = false,
        concurrency = 20, dnsTimeoutSecs = 5,
    } = input;
    const raw = (Array.isArray(domains) ? domains : String(domains).split(/[\n,;\s]+/))
        .map((w) => (typeof w === 'object' && w ? (w.url ?? w.domain ?? w.email) : w)).map((w) => String(w ?? '').trim()).filter(Boolean);
    const capRaw = input.maxDomains ?? input.maxItems ?? input.limit ?? input.maxResults;
    let cap = Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Math.floor(Number(capRaw)) : 1000;
    const envCap = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isFinite(envCap) && envCap > 0) cap = Math.min(cap, envCap);

    const dsId = String(input.datasetId || input?.payload?.resource?.defaultDatasetId || input?.resource?.defaultDatasetId || '').trim();
    if (dsId) {
        const fromDs = await domainsFromDataset(Actor.newClient(), dsId, String(input.domainField || '').trim(), Math.max(1, Math.floor(Number(input.datasetMaxItems) || 1000)));
        raw.push(...fromDs.values);
        log.info(`Read ${fromDs.values.length} values from dataset ${dsId} (field "${fromDs.field ?? 'none found'}", ${fromDs.itemsScanned} items scanned).`);
        if (!raw.length) throw new InputError(`Dataset ${dsId} has no domain, website or email values${fromDs.field ? ` in field "${fromDs.field}"` : ''}. Set "domainField" (tried: ${DOMAIN_FIELDS.join(', ')}).`);
    }
    if (!raw.length) throw new InputError('Add at least one domain, website URL or email address, e.g. "stripe.com", or pass a datasetId from another Actor run.');

    // Normalize + dedupe. Email local parts are dropped immediately and never stored.
    const seen = new Set(); const targets = []; const invalid = [];
    for (const r of raw) {
        const n = toDomain(r);
        if (!n) { invalid.push(r.includes('@') ? '(invalid email)' : r.slice(0, 200)); continue; }
        if (seen.has(n.domain)) continue; seen.add(n.domain); targets.push(n);
    }
    const overCap = targets.length > cap ? targets.splice(cap) : [];
    if (overCap.length) log.warning(`maxDomains is ${cap}: ${overCap.length} extra domains were not checked.`);

    const dns = new Dns({ timeoutSecs: Math.max(1, Math.min(30, Number(dnsTimeoutSecs) || 5)) });
    const resolverMode = await dns.selfTest();
    log.info(`DNS resolver: ${resolverMode === 'system' ? 'system resolver with DNS-over-HTTPS fallback' : 'DNS-over-HTTPS (system resolver could not return MX/TXT records)'}`);
    const charging = Actor.getChargingManager();
    const counts = {}; let chargeLimitHit = false; const skipped = [];
    const espCounts = {};

    async function countLookups(domain) {
        // Recursive SPF lookup count per RFC 7208 §4.6.4 (include, a, mx, ptr, exists, redirect). Capped.
        let lookups = 0; let queries = 0; const visited = new Set(); const allIncludes = new Set();
        async function walk(d, depth) {
            if (depth > 10 || visited.has(d) || queries >= MAX_SPF_QUERIES || d.includes('%')) return; // macros (%{i}) need the sender IP: count, don't resolve
            visited.add(d); queries++;
            const r = await dns.query(d, 'TXT');
            const { record } = pickSpf(txtStrings(r));
            if (!record) return;
            const p = parseSpf(record);
            lookups += p.lookupMechanisms;
            for (const inc of [...p.includes, ...(p.redirect ? [p.redirect] : [])]) { allIncludes.add(inc); await walk(inc, depth + 1); }
        }
        await walk(domain, 0);
        return { lookups, nestedIncludes: [...allIncludes], truncated: queries >= MAX_SPF_QUERIES };
    }

    async function check(t) {
        const { domain } = t;
        const base = { domain, inputType: t.inputType, isConsumerDomain: CONSUMER_DOMAINS.has(domain) };
        const [mxR, txtR, dmarcR] = await Promise.all([dns.query(domain, 'MX'), dns.query(domain, 'TXT'), dns.query(`_dmarc.${domain}`, 'TXT')]);
        if (mxR.status === 'nxdomain' && txtR.status === 'nxdomain') {
            const aR = await dns.query(domain, 'A');
            if (aR.status === 'nxdomain') return { ...base, status: 'nxdomain', error: 'Domain does not exist in DNS (NXDOMAIN).', checkedAt: new Date().toISOString() };
        }
        if (mxR.status === 'error' && txtR.status === 'error') return { ...base, status: 'error', error: 'DNS lookups failed (timeout/SERVFAIL) on both the system resolver and DNS-over-HTTPS.', checkedAt: new Date().toISOString() };

        const mx = classifyMx(mxR.records, domain);
        let acceptsMail = mx.hosts.length > 0;
        let implicitMx = false;
        if (!mxR.records.length && mxR.status !== 'error') {
            const aR = await dns.query(domain, 'A'); // RFC 5321 implicit MX
            implicitMx = aR.status === 'ok' && aR.records.length > 0; acceptsMail = implicitMx;
        }
        const txts = txtStrings(txtR);
        const spfPick = pickSpf(txts);
        const spf = parseSpf(spfPick.record);
        const dmarc = parseDmarc(txtStrings(dmarcR));
        const extra = await Promise.all([
            dns.query(`_mta-sts.${domain}`, 'TXT'), dns.query(`default._bimi.${domain}`, 'TXT'),
            checkDkim ? (async () => {
                // A wildcard *._domainkey record would make every selector look real: probe a random one first.
                const probe = `zz${Math.random().toString(36).slice(2, 10)}._domainkey.${domain}`;
                const [wTx, wCn] = await Promise.all([dns.query(probe, 'TXT'), dns.query(probe, 'CNAME')]);
                if (txtStrings(wTx).length || (wCn.status === 'ok' && wCn.records.length)) return [];
                return Promise.all(DKIM_SELECTORS.map(async (s) => {
                    const [tx, cn] = await Promise.all([dns.query(`${s}._domainkey.${domain}`, 'TXT'), dns.query(`${s}._domainkey.${domain}`, 'CNAME')]);
                    return (txtStrings(tx).some(isDkimRecord) || (cn.status === 'ok' && cn.records.length)) ? s : null;
                }));
            })() : Promise.resolve([]),
            countSpfLookups && spfPick.record ? countLookups(domain) : Promise.resolve(null),
        ]);
        const [mtaR, bimiR, dkimRaw, spfWalk] = extra;
        const dkimSelectors = (dkimRaw || []).filter(Boolean);
        const mtaSts = { present: txtStrings(mtaR).some((x) => /^v=stsv1/i.test(x)) };
        const bimiRec = txtStrings(bimiR).find((x) => /^v=bimi1/i.test(x));
        const bimi = { present: !!bimiRec, hasVmc: !!bimiRec && /a=https?:\/\/\S+/i.test(bimiRec) };
        const verifications = detectSaas ? txtVerifications(txts) : [];
        const spfDomains = spfWalk ? spfWalk.nestedIncludes : [...spf.includes, ...(spf.redirect ? [spf.redirect] : [])];
        const sendingServices = spfServices(spfDomains);

        let provider = mx.provider; let underlying = null;
        if (mx.gateway || !provider || ['forwarding', 'self_hosted'].includes(provider.type)) underlying = inferUnderlying({ spfIncludes: spfDomains, dkimSelectors, verifications });
        const effective = provider && !['forwarding', 'self_hosted'].includes(provider.type) ? provider : (underlying ?? provider);
        const espMatch = !acceptsMail ? 'none' : (effective?.espMatch ?? 'unknown');
        const score = scoreEmailSecurity({ acceptsMail, spfCount: spfPick.count, spf, spfLookups: spfWalk?.lookups, dmarc, dkimSelectors, mtaSts, bimi });

        if (implicitMx) score.issues.unshift('No MX record: mail falls back to the A record (implicit MX). This domain probably does not receive email; check a sister domain.');
        const row = {
            ...base,
            status: acceptsMail ? 'ok' : 'no_mail',
            espMatch,
            mailboxProvider: effective?.name ?? null,
            mailboxProviderId: effective?.id ?? null,
            mailboxProviderType: effective?.type ?? (effective ? 'hosted_mailbox' : null),
            secureEmailGateway: mx.gateway?.name ?? null,
            providerDetectedVia: mx.gateway && underlying ? 'spf_dkim_behind_gateway' : (provider && provider === effective ? 'mx' : (underlying ? 'spf_dkim_txt' : null)),
            implicitMx,
            mxHosts: mx.hosts.slice(0, 10),
            acceptsMail,
            nullMx: mx.nullMx,
            spf: {
                present: spfPick.count > 0, multipleRecords: spfPick.count > 1, allQualifier: spf.all,
                includes: spf.includes, redirect: spf.redirect,
                dnsLookupCount: spfWalk?.lookups ?? null, tooManyLookups: spfWalk ? spfWalk.lookups > 10 : null,
            },
            dmarc: { present: dmarc.present, policy: dmarc.policy, subdomainPolicy: dmarc.subdomainPolicy, pct: dmarc.present ? dmarc.pct : null,
                reportingEnabled: dmarc.hasRua, reportingVendors: dmarcVendors(dmarc.reportingDomains) },
            dkimSelectorsFound: checkDkim ? dkimSelectors : null,
            mtaSts: mtaSts.present, bimi: bimi.present, bimiVmc: bimi.hasVmc,
            emailSecurityScore: score.score, emailSecurityGrade: score.grade, issues: score.issues,
            sendingServices,
            saasVerifications: detectSaas ? verifications : null,
            checkedAt: new Date().toISOString(),
        };
        if (includeRawRecords) row.rawRecords = { mx: mxR.records, spf: spfPick.record, dmarc: txtStrings(dmarcR).find((x) => /^v=dmarc1/i.test(x)) ?? null,
            txt: txts.filter((x) => !/^v=(spf1|dmarc1)/i.test(x)).map((x) => x.slice(0, 300)).slice(0, 50) };
        return row;
    }

    async function save(row) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (!['ok', 'no_mail'].includes(row.status)) { await Actor.pushData(row); return; } // nxdomain / error rows are free
        if (chargeLimitHit) { counts[row.status]--; skipped.push(row.domain); return; }
        if (charging) {
            const allowed = charging.calculateMaxEventChargeCountWithinLimit(EVENT);
            if (Number.isFinite(allowed) && allowed < 1) { chargeLimitHit = true; counts[row.status]--; skipped.push(row.domain); log.warning('Reached the maximum cost you set for this run. Stopping; results so far are saved.'); return; }
        }
        espCounts[row.espMatch] = (espCounts[row.espMatch] ?? 0) + 1;
        const r = await Actor.pushData(row, EVENT);
        if (r?.eventChargeLimitReached) chargeLimitHit = true;
    }

    const conc = Math.max(1, Math.min(50, Math.floor(Number(concurrency) || 20)));
    let idx = 0; let done = 0;
    const worker = async () => {
        while (idx < targets.length && !chargeLimitHit) {
            const t = targets[idx++];
            let row;
            try { row = await check(t); } catch (e) { row = { domain: t.domain, inputType: t.inputType, status: 'error', error: e.message, checkedAt: new Date().toISOString() }; }
            await save(row);
            if (++done % 100 === 0) log.info(`Checked ${done}/${targets.length} domains`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, worker));

    for (const t of targets.slice(idx)) skipped.push(t.domain);
    for (const d of skipped) await Actor.pushData({ domain: d, status: 'skipped_charge_limit', error: 'Not checked: the run reached the maximum cost you set. Raise the limit and run these again.', checkedAt: new Date().toISOString() });
    if (skipped.length) counts.skipped_charge_limit = skipped.length;
    for (const v of invalid) await Actor.pushData({ domain: null, input: v, inputType: 'invalid', status: 'invalid_input', error: 'Not a valid domain, URL or email address.', checkedAt: new Date().toISOString() });
    if (invalid.length) counts.invalid_input = invalid.length;

    const checked = (counts.ok ?? 0) + (counts.no_mail ?? 0);
    const dsIdOut = Actor.getEnv().defaultDatasetId;
    const summary = {
        domainsRequested: targets.length + overCap.length, domainsChecked: checked, byStatus: counts, byEspMatch: espCounts,
        notCheckedOverMaxDomains: overCap.length, chargeLimitReached: chargeLimitHit, sourceDatasetId: dsId || null, dnsQueries: dns.queries, dnsResolver: resolverMode,
        zeroResultsReason: checked ? null : `No domain could be checked: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no valid input'}. See the error field of each row.`,
        finishedAt: new Date().toISOString(),
    };
    if (checked) summary.nextSteps = [
        `Split your list for ESP matching: filter the dataset by espMatch ("google" -> send from Google Workspace inboxes, "microsoft" -> Microsoft 365 inboxes).`,
        `Export to Google Sheets: run swillz/google-sheets-import-export with {"spreadsheet": "<your sheet URL>", "datasetId": "${dsIdOut}"}`,
        `Enrich the same companies (socials, tech stack, contact page): run swillz/company-website-enrichment with {"datasetId": "${dsIdOut}"}`,
    ];
    await Actor.setValue('OUTPUT', summary);
    if (targets.length >= 3 && !checked && (counts.error ?? 0) === targets.length) throw new Error(`DNS failed for all ${targets.length} domains. This looks like a network problem; try again.`);
    await Actor.exit(`${checked ? '' : '0 results: '}Checked ${checked} of ${targets.length} domains (${Object.entries(espCounts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})${checked === targets.length && !invalid.length ? '' : `; ${Object.entries(counts).filter(([k]) => !['ok', 'no_mail'].includes(k)).map(([k, v]) => `${v} ${k}`).join(', ')} not charged`}.`);
} catch (e) {
    if (e instanceof InputError || e?.isInputError) { log.error(e.message); await Actor.fail(`Invalid input: ${e.message}`); }
    else { log.exception(e, 'Run failed'); await Actor.fail(e.message); }
}
