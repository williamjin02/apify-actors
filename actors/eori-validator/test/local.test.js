import assert from 'node:assert/strict';
import { parseEori, parseSoap, parseHmrc, soapRequest, nameMatch, normName } from '../src/eori.js';
let pass = 0; let fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
t('parse: EU plain', () => assert.deepEqual(parseEori('BE0403448140'), { country: 'BE', eori: 'BE0403448140', source: 'eu' }));
t('parse: GB to HMRC', () => assert.equal(parseEori('gb 220 430 231 000').source, 'hmrc'));
t('parse: XI to EU', () => assert.equal(parseEori('XI220430231000').source, 'eu'));
t('parse: EL -> GR', () => assert.equal(parseEori('EL094259216').eori, 'GR094259216'));
t('parse: prefix word', () => assert.equal(parseEori('EORI No: DE1234567').eori, 'DE1234567'));
t('parse: GB wrong length', () => assert.equal(parseEori('GB123').status, 'invalid_format'));
t('parse: too long', () => assert.equal(parseEori('DE1234567890123456').status, 'invalid_format'));
t('parse: CH unsupported', () => assert.equal(parseEori('CH123456').status, 'unsupported_country'));
t('parse: missing prefix', () => assert.equal(parseEori('1234567').status, 'invalid_format'));
t('parse: defaultCountry', () => assert.equal(parseEori('1234567', 'DE').eori, 'DE1234567'));
t('parse: empty', () => assert.equal(parseEori(' ').status, 'invalid_input'));
t('soap request escapes', () => assert.ok(soapRequest(['A<B']).includes('A&lt;B')));
t('parseSoap', () => {
    const x = '<S:Envelope><S:Body><ns0:validateEORIResponse><return><requestDate>25/10/2026</requestDate><result><eori>BE0403448140</eori><status>0</status><statusDescr>Valid</statusDescr><name>ACME &amp; CO</name><city>Brussels</city></result><result><eori>DE5555545</eori><status>1</status><statusDescr>Not valid</statusDescr></result></return></ns0:validateEORIResponse></S:Body></S:Envelope>';
    const p = parseSoap(x); assert.equal(p.requestDate, '25/10/2026'); assert.equal(p.results.BE0403448140.valid, true); assert.equal(p.results.BE0403448140.name, 'ACME & CO'); assert.equal(p.results.DE5555545.valid, false);
});
t('parseSoap error', () => assert.match(parseSoap('<return><requestDate>x</requestDate><errorDescription>Maximum allowed number of EORI in one request is 10.</errorDescription></return>').error, /Maximum/));
t('parseHmrc', () => {
    const r = parseHmrc([{ eori: 'GB117223643000', valid: true, companyDetails: { traderName: 'APPLE DISTRIBUTION INTERNATIONAL LIMITED', address: { cityName: 'ABERDEEN', postcode: 'AB10 1ZP' } } }, { eori: 'GB1', valid: false }]);
    assert.equal(r.GB117223643000.name, 'APPLE DISTRIBUTION INTERNATIONAL LIMITED'); assert.equal(r.GB1.valid, false); assert.equal(r.GB1.name, null);
});
t('nameMatch', () => { assert.equal(nameMatch('Apple Distribution International Ltd', 'APPLE DISTRIBUTION INTERNATIONAL LIMITED'), 'exact'); assert.equal(nameMatch('Apple', null), 'not_available'); assert.equal(nameMatch('Tesco', 'APPLE DISTRIBUTION'), 'mismatch'); assert.equal(normName('Müller GmbH'), 'muller'); });
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
