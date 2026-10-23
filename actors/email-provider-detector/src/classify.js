// Pure classification helpers (no network). Everything here works on public DNS record strings.

const host = (h) => String(h || '').toLowerCase().replace(/\.$/, '');
const endsWithAny = (h, suffixes) => suffixes.some((s) => h === s || h.endsWith(`.${s}`));

// Mailbox providers, matched on MX host suffix. espMatch = sender pool for cold-email ESP matching.
export const MAILBOX_PROVIDERS = [
    { id: 'google_workspace', name: 'Google Workspace', espMatch: 'google', mx: ['google.com', 'googlemail.com', 'smtp.google.com'] },
    { id: 'microsoft_365', name: 'Microsoft 365', espMatch: 'microsoft', mx: ['protection.outlook.com', 'mail.protection.outlook.com', 'outlook.com', 'hotmail.com', 'outlook.cn', 'protection.outlook.de', 'mx.microsoft'] },
    { id: 'zoho', name: 'Zoho Mail', espMatch: 'other', mx: ['zoho.com', 'zoho.eu', 'zoho.in', 'zoho.com.au', 'zoho.jp', 'zohomail.com'] },
    { id: 'yahoo', name: 'Yahoo Mail', espMatch: 'other', mx: ['yahoodns.net', 'yahoo.com'] },
    { id: 'icloud', name: 'Apple iCloud Mail', espMatch: 'other', mx: ['icloud.com', 'me.com'] },
    { id: 'proton', name: 'Proton Mail', espMatch: 'other', mx: ['protonmail.ch', 'proton.me'] },
    { id: 'fastmail', name: 'Fastmail', espMatch: 'other', mx: ['messagingengine.com', 'fastmail.com'] },
    { id: 'amazon_workmail', name: 'Amazon WorkMail / SES inbound', espMatch: 'other', mx: ['awsapps.com', 'amazonaws.com'] },
    { id: 'rackspace', name: 'Rackspace Email', espMatch: 'other', mx: ['emailsrvr.com'] },
    { id: 'godaddy', name: 'GoDaddy Email', espMatch: 'other', mx: ['secureserver.net'] },
    { id: 'ionos', name: 'IONOS (1&1)', espMatch: 'other', mx: ['ionos.com', 'ionos.de', 'ionos.co.uk', 'ionos.es', 'ionos.fr', 'perfora.net', 'kundenserver.de', '1and1.com'] },
    { id: 'ovh', name: 'OVHcloud', espMatch: 'other', mx: ['ovh.net', 'ovh.com'] },
    { id: 'strato', name: 'Strato', espMatch: 'other', mx: ['rzone.de', 'strato.de'] },
    { id: 'gmx_webde', name: 'GMX / WEB.DE', espMatch: 'other', mx: ['gmx.net', 'gmx.com', 'web.de'] },
    { id: 'one_com', name: 'one.com', espMatch: 'other', mx: ['one.com'] },
    { id: 'namecheap', name: 'Namecheap Private Email', espMatch: 'other', mx: ['privateemail.com', 'registrar-servers.com'] },
    { id: 'hostinger', name: 'Hostinger Email', espMatch: 'other', mx: ['hostinger.com', 'hostinger.io'] },
    { id: 'titan', name: 'Titan Email', espMatch: 'other', mx: ['titan.email'] },
    { id: 'yandex', name: 'Yandex 360', espMatch: 'other', mx: ['yandex.net', 'yandex.ru'] },
    { id: 'mail_ru', name: 'VK WorkSpace / Mail.ru', espMatch: 'other', mx: ['mail.ru'] },
    { id: 'tencent', name: 'Tencent Exmail / QQ', espMatch: 'other', mx: ['qq.com', 'exmail.qq.com'] },
    { id: 'netease', name: 'NetEase Enterprise Mail', espMatch: 'other', mx: ['163.com', 'qiye.163.com', '126.com'] },
    { id: 'alibaba', name: 'Alibaba Mail', espMatch: 'other', mx: ['mxhichina.com', 'aliyun.com', 'qiye.aliyun.com'] },
    { id: 'naver', name: 'Naver Works', espMatch: 'other', mx: ['naver.com', 'worksmobile.com'] },
    { id: 'cloudflare_routing', name: 'Cloudflare Email Routing (forwarding)', espMatch: 'other', type: 'forwarding', mx: ['mx.cloudflare.net'] },
    { id: 'improvmx', name: 'ImprovMX (forwarding)', espMatch: 'other', type: 'forwarding', mx: ['improvmx.com'] },
    { id: 'forwardemail', name: 'Forward Email (forwarding)', espMatch: 'other', type: 'forwarding', mx: ['forwardemail.net'] },
    { id: 'mailgun_inbound', name: 'Mailgun inbound routing', espMatch: 'other', type: 'forwarding', mx: ['mailgun.org'] },
];

// Secure email gateways (SEGs) that sit in front of the real mailbox. Cold email to these is filtered harder.
export const GATEWAYS = [
    { id: 'proofpoint', name: 'Proofpoint', mx: ['pphosted.com', 'ppe-hosted.com', 'proofpoint.com', 'ppops.net'] },
    { id: 'mimecast', name: 'Mimecast', mx: ['mimecast.com', 'mimecast.co.za', 'mimecast-offshore.com'] },
    { id: 'barracuda', name: 'Barracuda', mx: ['barracudanetworks.com', 'barracuda.com', 'cudamail.com'] },
    { id: 'cisco', name: 'Cisco Secure Email (IronPort)', mx: ['iphmx.com'] },
    { id: 'trend_micro', name: 'Trend Micro Email Security', mx: ['tmes.trendmicro.com', 'tmes.trendmicro.eu', 'trendmicro.com', 'trendmicro.eu'] },
    { id: 'sophos', name: 'Sophos Email', mx: ['sophos.com'] },
    { id: 'forcepoint', name: 'Forcepoint Email Security', mx: ['mailcontrol.com'] },
    { id: 'symantec', name: 'Broadcom Symantec Email Security.cloud', mx: ['messagelabs.com'] },
    { id: 'trellix', name: 'Trellix (FireEye) Email Security', mx: ['fireeyecloud.com', 'trellix.com'] },
    { id: 'hornetsecurity', name: 'Hornetsecurity', mx: ['hornetsecurity.com', 'hornetsecurity.net'] },
    { id: 'spamtitan', name: 'SpamTitan', mx: ['spamtitan.com'] },
    { id: 'mailchannels', name: 'MailChannels', mx: ['mailchannels.net'] },
    { id: 'n_able_spamexperts', name: 'N-able Mail Assure / SpamExperts', mx: ['spamexperts.com', 'spamexperts.eu', 'spamexperts.net', 'antispamcloud.com'] },
    { id: 'siteground', name: 'SiteGround anti-spam', mx: ['mailspamprotection.com'] },
    { id: 'vade', name: 'Vade Secure', mx: ['vadesecure.com'] },
    { id: 'zix', name: 'Zix / OpenText', mx: ['zixmail.net'] },
    { id: 'cloudflare_email_security', name: 'Cloudflare Email Security (Area 1)', mx: ['cf-emailsecurity.net', 'area1security.com'] },
    { id: 'abnormal', name: 'Abnormal Security', mx: ['abnormalsecurity.com'] },
    { id: 'checkpoint', name: 'Check Point Harmony Email', mx: ['checkpointcloudsec.com'] },
    { id: 'libraesva', name: 'Libraesva', mx: ['libraesva.com', 'libraesva.cloud'] },
    { id: 'heinlein', name: 'Heinlein / mailbox.org', mx: ['mailbox.org'] },
];

// Services that send mail for the domain, from SPF include/redirect domains.
export const SPF_SERVICES = [
    ['_spf.google.com', 'Google Workspace'], ['spf.protection.outlook.com', 'Microsoft 365'], ['zoho.com', 'Zoho'], ['zoho.eu', 'Zoho'], ['zohomail.com', 'Zoho'],
    ['sendgrid.net', 'SendGrid'], ['mailgun.org', 'Mailgun'], ['amazonses.com', 'Amazon SES'], ['mcsv.net', 'Mailchimp'], ['mandrillapp.com', 'Mailchimp Transactional (Mandrill)'],
    ['_spf.salesforce.com', 'Salesforce'], ['salesforce.com', 'Salesforce'], ['exacttarget.com', 'Salesforce Marketing Cloud'], ['hubspotemail.net', 'HubSpot'], ['hubspot.com', 'HubSpot'],
    ['mail.zendesk.com', 'Zendesk'], ['zendesk.com', 'Zendesk'], ['freshdesk.com', 'Freshdesk'], ['helpscoutemail.com', 'Help Scout'], ['intercom.io', 'Intercom'],
    ['mktomail.com', 'Marketo'], ['pardot.com', 'Salesforce Pardot'], ['sparkpostmail.com', 'SparkPost'], ['mailjet.com', 'Mailjet'], ['sendinblue.com', 'Brevo'], ['brevo.com', 'Brevo'],
    ['mtasv.net', 'Postmark'], ['postmarkapp.com', 'Postmark'], ['klaviyo.com', 'Klaviyo'], ['constantcontact.com', 'Constant Contact'], ['createsend.com', 'Campaign Monitor'],
    ['mlsend.com', 'MailerLite'], ['emsd1.com', 'ActiveCampaign'], ['atlassian.net', 'Atlassian'], ['docusign.net', 'DocuSign'], ['service-now.com', 'ServiceNow'],
    ['greenhouse.io', 'Greenhouse'], ['shopify.com', 'Shopify'], ['qualtrics.com', 'Qualtrics'], ['smtp.com', 'SMTP.com'], ['mimecast.com', 'Mimecast'], ['pphosted.com', 'Proofpoint'],
    ['sophos.com', 'Sophos'], ['mailchannels.net', 'MailChannels'], ['messagelabs.com', 'Symantec'], ['iphmx.com', 'Cisco Secure Email'], ['secureserver.net', 'GoDaddy'],
    ['emailsrvr.com', 'Rackspace'], ['messagingengine.com', 'Fastmail'], ['protonmail.ch', 'Proton Mail'], ['icloud.com', 'Apple iCloud'], ['netsuite.com', 'Oracle NetSuite'],
    ['oraclecloud.com', 'Oracle Cloud'], ['successfactors.com', 'SAP SuccessFactors'], ['workday.com', 'Workday'], ['freshworks.com', 'Freshworks'], ['gorgias.com', 'Gorgias'],
    ['customer.io', 'Customer.io'], ['braze.com', 'Braze'], ['iterable.com', 'Iterable'], ['sendpulse.com', 'SendPulse'], ['elasticemail.com', 'Elastic Email'],
];

// DNS TXT verification tokens: the company set up this service for its domain.
export const TXT_VERIFICATIONS = [
    [/^ms=ms\d+/i, 'Microsoft 365'], [/^google-site-verification=/i, 'Google Search Console'], [/^facebook-domain-verification=/i, 'Meta Business'],
    [/^atlassian-domain-verification=/i, 'Atlassian'], [/^docusign=/i, 'DocuSign'], [/^adobe-(idp-site|sign)-verification/i, 'Adobe'],
    [/^apple-domain-verification=/i, 'Apple'], [/^openai-domain-verification=/i, 'OpenAI (ChatGPT Enterprise/Team)'], [/^anthropic-domain-verification/i, 'Anthropic (Claude)'],
    [/^stripe-verification=/i, 'Stripe'], [/^(zoom-domain-verification|zoom_verify_)/i, 'Zoom'], [/^slack-domain-verification=/i, 'Slack'],
    [/^hubspot-(developer|domain)-verification/i, 'HubSpot'], [/^miro-verification=/i, 'Miro'], [/^dropbox-domain-verification=/i, 'Dropbox'],
    [/^cisco-ci-domain-verification=/i, 'Cisco Webex'], [/^onetrust-domain-verification=/i, 'OneTrust'], [/^knowbe4-site-verification=/i, 'KnowBe4'],
    [/^mongodb-site-verification=/i, 'MongoDB Atlas'], [/^teamviewer-sso-verification=/i, 'TeamViewer'], [/^workplace-domain-verification=/i, 'Meta Workplace'],
    [/^logmein-verification-code=/i, 'GoTo (LogMeIn)'], [/^citrix-verification-code=/i, 'Citrix'], [/^amazonses:/i, 'Amazon SES'], [/^yandex-verification:/i, 'Yandex'],
    [/^jamf-site-verification=/i, 'Jamf'], [/^zapier-domain-verification/i, 'Zapier'], [/^pinterest-site-verification=/i, 'Pinterest'], [/^canva-site-verification=/i, 'Canva'],
    [/^notion-domain-verification/i, 'Notion'], [/^asana-domain-verification/i, 'Asana'], [/^figma-domain-verification/i, 'Figma'], [/^okta-verification/i, 'Okta'],
    [/^duo_sso_verification/i, 'Cisco Duo'], [/^1password-site-verification/i, '1Password'], [/^klaviyo-site-verification/i, 'Klaviyo'], [/^ahrefs-site-verification/i, 'Ahrefs'],
    [/^segment-site-verification/i, 'Segment'], [/^postman-domain-verification/i, 'Postman'], [/^webexdomainverification/i, 'Cisco Webex'], [/^brevo-code:/i, 'Brevo'],
    [/^sendinblue-code:/i, 'Brevo'], [/^mailru-verification:/i, 'Mail.ru'], [/^have-i-been-pwned-verification=/i, 'Have I Been Pwned'], [/^globalsign-domain-verification=/i, 'GlobalSign'],
];

export const CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.ru', 'yandex.ru', 'yandex.com', 'qq.com', '163.com', '126.com', 'zoho.com', 'fastmail.com', 'hey.com']);

// ---------- Input normalization ----------
const DOMAIN_RX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
// Returns { domain, inputType } or null. Emails are reduced to their domain; the local part is never kept.
export function toDomain(raw) {
    let s = String(raw ?? '').trim().toLowerCase();
    if (!s) return null;
    let inputType = 'domain';
    s = s.replace(/^mailto:/, '');
    if (/^[^\s@/]+@[^\s@/]+$/.test(s)) { s = s.split('@').pop(); inputType = 'email'; }
    else if (/^[a-z][a-z0-9+.-]*:\/\//.test(s) || s.includes('/')) {
        try { s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`).hostname; inputType = 'url'; } catch { return null; }
    }
    s = s.replace(/\.$/, '').replace(/^www\d?\./, '');
    try { s = new URL(`https://${s}`).hostname; } catch { return null; } // punycode for IDNs
    return DOMAIN_RX.test(s) ? { domain: s, inputType } : null;
}

// ---------- MX ----------
export function classifyMx(mxRecords, domain = '') {
    const sorted = [...(mxRecords || [])].map((r) => ({ exchange: host(r.exchange), priority: Number(r.priority) || 0 })).sort((a, b) => a.priority - b.priority);
    const nullMx = sorted.length === 1 && (sorted[0].exchange === '' || sorted[0].exchange === '.');
    const hosts = nullMx ? [] : sorted.map((r) => r.exchange).filter(Boolean);
    let gateway = null; let provider = null;
    for (const h of hosts) {
        if (!gateway) { const g = GATEWAYS.find((x) => endsWithAny(h, x.mx)); if (g) gateway = g; }
        if (!provider) { const p = MAILBOX_PROVIDERS.find((x) => endsWithAny(h, x.mx)); if (p) provider = p; }
    }
    if (!provider && hosts.length && hosts.every((h) => h === domain || h.endsWith(`.${domain}`))) provider = { id: 'self_hosted', name: 'Self-hosted / on-premises', espMatch: 'other', type: 'self_hosted' };
    return { hosts, nullMx, gateway, provider };
}

// ---------- SPF ----------
export function pickSpf(txts) {
    const recs = (txts || []).map((t) => (Array.isArray(t) ? t.join('') : String(t))).filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
    return { record: recs[0] ?? null, count: recs.length };
}
export function parseSpf(record) {
    const out = { includes: [], redirect: null, all: null, lookupMechanisms: 0, ip4: 0, ip6: 0 };
    if (!record) return out;
    for (const term of record.trim().split(/\s+/).slice(1)) {
        const m = term.match(/^([+\-~?]?)([a-z0-9]+)(?:[:=](.*))?$/i);
        if (!m) continue;
        const [, q, mech, val] = m; const k = mech.toLowerCase();
        if (k === 'include' && val) { out.includes.push(host(val)); out.lookupMechanisms++; }
        else if (k === 'redirect' && val) { out.redirect = host(val); out.lookupMechanisms++; }
        else if (k === 'a' || k === 'mx' || k === 'ptr' || k === 'exists') out.lookupMechanisms++;
        else if (k === 'ip4') out.ip4++;
        else if (k === 'ip6') out.ip6++;
        else if (k === 'all') out.all = `${q || '+'}all`;
    }
    return out;
}
export function spfServices(domains) {
    const found = new Set();
    for (const d of domains) {
        const h = host(d);
        for (const [suffix, name] of SPF_SERVICES) if (h === suffix || h.endsWith(`.${suffix}`)) { found.add(name); break; }
    }
    return [...found];
}

// ---------- DMARC ----------
export function parseDmarc(txts) {
    const recs = (txts || []).map((t) => (Array.isArray(t) ? t.join('') : String(t))).filter((t) => /^v=dmarc1/i.test(t.trim()));
    if (!recs.length) return { present: false, policy: null, subdomainPolicy: null, pct: null, hasRua: false, hasRuf: false, reportingDomains: [], multiple: false };
    const tags = {};
    for (const part of recs[0].split(';')) { const i = part.indexOf('='); if (i > 0) tags[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
    const domainsOf = (v) => (v || '').split(',').map((x) => x.trim().replace(/^mailto:/i, '').split('!')[0]).filter((x) => x.includes('@')).map((x) => x.split('@').pop().toLowerCase());
    const p = (tags.p || '').toLowerCase();
    return {
        present: true,
        policy: ['none', 'quarantine', 'reject'].includes(p) ? p : (p || 'invalid'),
        subdomainPolicy: tags.sp ? tags.sp.toLowerCase() : null,
        pct: tags.pct !== undefined && Number.isFinite(Number(tags.pct)) ? Number(tags.pct) : 100,
        hasRua: !!tags.rua, hasRuf: !!tags.ruf,
        // Only the domains that receive reports (a DMARC vendor or the company itself); mailbox names are never output.
        reportingDomains: [...new Set([...domainsOf(tags.rua), ...domainsOf(tags.ruf)])],
        multiple: recs.length > 1,
    };
}

export const DMARC_VENDORS = [['dmarcian.com', 'dmarcian'], ['valimail.com', 'Valimail'], ['agari.com', 'Agari'], ['ondmarc.com', 'Red Sift OnDMARC'], ['redsift.cloud', 'Red Sift OnDMARC'],
    ['easydmarc.us', 'EasyDMARC'], ['easydmarc.eu', 'EasyDMARC'], ['easydmarc.com', 'EasyDMARC'], ['dmarc-reports.cloudflare.net', 'Cloudflare DMARC Management'], ['uriports.com', 'URIports'],
    ['postmarkapp.com', 'Postmark DMARC'], ['proofpoint.com', 'Proofpoint EFD'], ['emaildefense.proofpoint.com', 'Proofpoint EFD'], ['mimecast.com', 'Mimecast DMARC Analyzer'],
    ['dmarcanalyzer.com', 'Mimecast DMARC Analyzer'], ['powerdmarc.com', 'PowerDMARC'], ['dmarcadvisor.com', 'DMARC Advisor'], ['sendmarc.com', 'Sendmarc'], ['dmarcly.com', 'DMARCLY'],
    ['mxtoolbox.com', 'MxToolbox'], ['250ok.net', 'Validity'], ['returnpath.net', 'Validity'], ['fraudmarc.com', 'Fraudmarc'], ['glockapps.com', 'GlockApps'], ['dmarc.postmarkapp.com', 'Postmark DMARC']];
export function dmarcVendors(domains) {
    const out = new Set();
    for (const d of domains) for (const [s, n] of DMARC_VENDORS) if (d === s || d.endsWith(`.${s}`)) { out.add(n); break; }
    return [...out];
}

export function txtVerifications(txts) {
    const out = new Set();
    for (const t of txts || []) { const s = (Array.isArray(t) ? t.join('') : String(t)).trim(); for (const [rx, n] of TXT_VERIFICATIONS) if (rx.test(s)) { out.add(n); break; } }
    return [...out];
}

// Underlying mailbox when MX points at a gateway (or is unknown): SPF includes, DKIM selectors, MS= token.
export function inferUnderlying({ spfIncludes = [], dkimSelectors = [], verifications = [] }) {
    const inc = spfIncludes.map(host);
    const g = inc.some((h) => h === '_spf.google.com' || h.endsWith('.google.com')) || dkimSelectors.includes('google');
    const m = inc.some((h) => h.endsWith('protection.outlook.com')) || dkimSelectors.includes('selector1') || dkimSelectors.includes('selector2');
    if (g && !m) return MAILBOX_PROVIDERS[0];
    if (m && !g) return MAILBOX_PROVIDERS[1];
    if (m && g) return null; // both configured: ambiguous
    if (verifications.includes('Microsoft 365')) return MAILBOX_PROVIDERS[1];
    if (inc.some((h) => /(^|\.)zoho\.(com|eu|in)$/.test(h))) return MAILBOX_PROVIDERS[2];
    return null;
}

// ---------- Score ----------
// Transparent 0-100 score of the domain's email authentication setup; issues[] explains each deduction.
export function isDkimRecord(txt) {
    const s = String(txt);
    if (/^v=(spf1|dmarc1)/i.test(s)) return false;
    return /(^|;)\s*p=[A-Za-z0-9+/]{16,}/.test(s); // a real public key; "p=" empty means revoked
}

export function scoreEmailSecurity({ acceptsMail, spfCount, spf, spfLookups, dmarc, dkimSelectors, mtaSts, bimi }) {
    let s = 0; const issues = [];
    if (!acceptsMail) issues.push('Domain does not accept email (no MX or null MX).'); else s += 10;
    if (spfCount === 0) issues.push('No SPF record: anyone can spoof this domain in the envelope sender.');
    else if (spfCount > 1) issues.push(`${spfCount} SPF records found: receivers treat this as a permanent error. Merge them into one.`);
    else {
        s += 20;
        if (spf.all === '+all') { s -= 15; issues.push('SPF ends in +all, which authorizes every server on the internet.'); }
        else if (spf.all === '?all' || (!spf.all && !spf.redirect)) { issues.push(`SPF ends in ${spf.all || 'no all mechanism'}: neutral, gives receivers no instruction.`); }
        else if (spf.all === '-all' || spf.all === '~all') s += 5;
        if (Number.isFinite(spfLookups) && spfLookups > 10) { s -= 10; issues.push(`SPF needs ${spfLookups} DNS lookups (limit 10): SPF permerror, mail can fail authentication.`); }
    }
    if (!dmarc.present) issues.push('No DMARC record: no protection against exact-domain spoofing, and Gmail/Yahoo bulk-sender rules are not met.');
    else {
        s += 20;
        if (dmarc.policy === 'reject') s += 25; else if (dmarc.policy === 'quarantine') s += 15;
        else if (dmarc.policy === 'none') issues.push('DMARC policy is p=none (monitor only): spoofed mail is still delivered.');
        else issues.push(`DMARC policy "${dmarc.policy}" is invalid.`);
        if (dmarc.pct !== null && dmarc.pct < 100 && dmarc.policy !== 'none') issues.push(`DMARC pct=${dmarc.pct}: policy applies to only part of the mail.`); else if (dmarc.policy !== 'none') s += 5;
        if (!dmarc.hasRua) issues.push('DMARC has no rua address, so no aggregate reports are collected.');
        if (dmarc.multiple) issues.push('Multiple DMARC records: receivers may ignore DMARC entirely.');
    }
    if (dkimSelectors && dkimSelectors.length) s += 10;
    if (mtaSts?.present) s += 5;
    if (bimi?.present) s += 5;
    s = Math.max(0, Math.min(100, s));
    const grade = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 35 ? 'D' : 'F';
    return { score: s, grade, issues };
}
