// JSON-schema helpers: normalize user schemas, make them OpenAI-strict compatible, validate outputs.
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

export class InputError extends Error {}

const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const KEYWORDS = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'format', 'anyOf', 'oneOf', 'allOf', 'nullable', 'default', 'examples', 'title', 'minimum', 'maximum', 'pattern', 'additionalProperties', '$ref']);
const isTypeStr = (v) => typeof v === 'string' && TYPES.has(v.replace(/\[\]$/, '').trim());
const isSchemaNode = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.type === 'string' && TYPES.has(v.type) && Object.keys(v).every((k) => KEYWORDS.has(k));
function isShorthand(v) {
    if (isTypeStr(v) || isSchemaNode(v)) return true;
    if (Array.isArray(v)) return v.length === 1 && isShorthand(v[0]);
    return !!v && typeof v === 'object' && Object.keys(v).length > 0 && Object.values(v).every(isShorthand);
}
function fromShorthand(v) {
    if (typeof v === 'string') { const t = v.trim(); return t.endsWith('[]') ? { type: 'array', items: { type: t.slice(0, -2) } } : { type: t }; }
    if (isSchemaNode(v)) return v;
    if (Array.isArray(v)) return { type: 'array', items: fromShorthand(v[0]) };
    return { type: 'object', properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromShorthand(x)])) };
}

/** Accepts an object or a JSON string. Wraps non-object roots so every provider gets an object. */
export function normalizeSchema(raw) {
    if (raw === undefined || raw === null || raw === '' || (typeof raw === 'object' && !Object.keys(raw).length)) return null;
    let s = raw;
    if (typeof s === 'string') {
        try { s = JSON.parse(s); } catch (e) { throw new InputError(`"JSON schema" is not valid JSON: ${e.message}`); }
    }
    if (typeof s !== 'object' || Array.isArray(s)) throw new InputError('"JSON schema" must be a JSON object, e.g. {"type":"object","properties":{"title":{"type":"string"}}}');
    // Shorthand: {"title":"string","price":"number","tags":"string[]","items":[{"name":"string"}],"seller":{"name":"string"}} -> full schema.
    if (!s.type && !s.properties && !s.$schema && isShorthand(s)) s = fromShorthand(s);
    if (s.type && s.type !== 'object') s = { type: 'object', properties: { items: s }, required: ['items'], 'x-wrapped': true };
    if (!s.type) s = { type: 'object', ...s };
    if (s.type === 'object' && !s.properties && !s.$ref && !s.anyOf && !s.oneOf && !s.allOf && !s.additionalProperties) throw new InputError('"JSON schema" has no fields. Use a shorthand like {"title":"string","price":"number","items":[{"name":"string"}]} or a JSON Schema with "properties".');
    try { ajv.compile(s); } catch (e) { throw new InputError(`"JSON schema" is not a valid JSON Schema: ${e.message}`); }
    return s;
}

const STRIP = ['$schema', '$id', 'x-wrapped', 'examples', 'default', 'format', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'patternProperties', 'propertyNames', 'if', 'then', 'else', 'not', 'dependentRequired', 'dependentSchemas', 'contains'];

/** OpenAI strict mode: every object closed, every property required (optional ones become nullable). */
export function toStrict(schema) {
    const walk = (n) => {
        if (Array.isArray(n)) return n.map(walk);
        if (!n || typeof n !== 'object') return n;
        const o = {};
        for (const [k, v] of Object.entries(n)) if (!STRIP.includes(k)) o[k] = v;
        if (o.properties) {
            const req = new Set(o.required || []);
            const props = {};
            for (const [k, v] of Object.entries(o.properties)) {
                let p = walk(v);
                if (!req.has(k)) p = nullable(p);
                props[k] = p;
            }
            o.properties = props; o.required = Object.keys(props); o.additionalProperties = false;
            o.type = 'object';
        } else if (o.type === 'object' || (Array.isArray(o.type) && o.type.includes('object'))) {
            o.properties = {}; o.required = []; o.additionalProperties = false;
        }
        if (o.items) o.items = walk(o.items);
        for (const k of ['anyOf', 'oneOf', 'allOf']) if (o[k]) o[k === 'oneOf' ? 'anyOf' : k] = walk(o[k]);
        if (o.oneOf) delete o.oneOf;
        for (const k of ['$defs', 'definitions']) if (o[k]) o[k] = Object.fromEntries(Object.entries(o[k]).map(([kk, vv]) => [kk, walk(vv)]));
        return o;
    };
    const nullable = (p) => {
        if (p.anyOf) return p.anyOf.some((x) => x.type === 'null') ? p : { ...p, anyOf: [...p.anyOf, { type: 'null' }] };
        if (typeof p.type === 'string') return p.type === 'null' ? p : { ...p, type: [p.type, 'null'] };
        if (Array.isArray(p.type)) return p.type.includes('null') ? p : { ...p, type: [...p.type, 'null'] };
        if (p.$ref) return { anyOf: [p, { type: 'null' }] };
        return p;
    };
    return walk(schema);
}

/** Drop nulls the strict-mode transform introduced for optional fields, so outputs match the user's schema. */
export function stripNulls(data, schema) {
    if (!schema || !data || typeof data !== 'object' || Array.isArray(data)) return data;
    const req = new Set(schema.required || []);
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        if (v === null && !req.has(k) && schema.properties?.[k]) continue;
        const ps = schema.properties?.[k];
        if (ps && v && typeof v === 'object') out[k] = Array.isArray(v) ? v.map((x) => stripNulls(x, ps.items)) : stripNulls(v, ps);
        else out[k] = v;
    }
    return out;
}

const cache = new WeakMap();
export function validate(schema, data) {
    if (!schema) return { ok: data !== null && typeof data === 'object', errors: data !== null && typeof data === 'object' ? null : 'Output is not a JSON object' };
    let v = cache.get(schema);
    if (!v) { v = ajv.compile(schema); cache.set(schema, v); }
    const ok = v(data);
    return { ok, errors: ok ? null : ajv.errorsText(v.errors, { separator: '; ' }).slice(0, 500) };
}
