import { readFileSync } from 'node:fs';
import yaml from 'yaml';

let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra && !cond ? ' :: ' + extra : ''));
  if (!cond) failures += 1;
}

const raw = readFileSync(new URL('../src/docs/openapi.yaml', import.meta.url), 'utf8');
const spec = yaml.parse(raw);
check('openapi 3.x + info + servers', spec?.openapi?.startsWith('3.') && !!spec.info?.version && spec.servers?.length > 0);

// ---- $ref integrity: every local ref must resolve ----
function refsOf(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => refsOf(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else refsOf(v, out);
    }
  }
  return out;
}
function resolve(ref) {
  const parts = ref.replace(/^#\//, '').split('/');
  let cur = spec;
  for (const p of parts) cur = cur?.[p];
  return cur;
}
const refs = refsOf(spec);
const broken = refs.filter((r) => r.startsWith('#/') && resolve(r) === undefined);
check(`all ${refs.length} local $refs resolve`, broken.length === 0, JSON.stringify(broken));

// ---- operation hygiene ----
const PUBLIC = new Set(['GET /health', 'GET /api/v1/', 'POST /api/v1/auth/register', 'POST /api/v1/auth/login', 'GET /api/v1/categories', 'GET /api/v1/categories/tree', 'GET /api/v1/categories/{id}', 'GET /api/v1/products', 'GET /api/v1/products/{id}']);
const problems = [];
const INVENTORY = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(ops)) {
    if (!['get', 'post', 'patch', 'delete', 'put'].includes(m)) continue;
    const label = `${m.toUpperCase()} ${p}`;
    INVENTORY.push(label);
    if (!op.summary) problems.push(`${label} missing summary`);
    if (!op.responses || Object.keys(op.responses).length === 0) problems.push(`${label} has no responses`);
    for (const [code, r] of Object.entries(op.responses ?? {})) {
      if (!r.description && !r.$ref) problems.push(`${label} ${code} missing description`);
      if (code !== '204' && r.content?.['application/json'] && !r.content['application/json'].schema) {
        problems.push(`${label} ${code} JSON without schema`);
      }
    }
    for (const t of op.tags ?? []) {
      if (!(spec.tags ?? []).some((tag) => tag.name === t)) problems.push(`${label} uses undeclared tag ${t}`);
    }
    const isPublic = (op.security ?? spec.security ?? []).length === 0;
    if (PUBLIC.has(label) !== isPublic) problems.push(`${label} publicity mismatch (spec public=${isPublic})`);
    for (const rawParam of op.parameters ?? []) {
      const param = rawParam.$ref ? resolve(rawParam.$ref) : rawParam;
      if (!param || !param.name || !param.in) problems.push(`${label} malformed parameter`);
    }
  }
}
check('operations: summaries, responses, tags, publicity', problems.length === 0, JSON.stringify(problems.slice(0, 5)));
check('inventory still 26 routes', INVENTORY.length === 26, String(INVENTORY.length));

// ---- error-code vocabulary: only documented codes used ----
const allowed = new Set(['VALIDATION_ERROR', 'BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'TOO_MANY_REQUESTS', 'INTERNAL_ERROR']);
const codes = new Set();
JSON.stringify(spec, (k, v) => {
  if (k === 'code' && typeof v === 'string') codes.add(v);
  if (k === 'enum' && Array.isArray(v)) v.forEach((e) => typeof e === 'string' && /_/.test(e) && codes.add(e));
  return v;
});
const unknown = [...codes].filter((c) => !allowed.has(c) && /^[A-Z_]+$/.test(c));
check('no undocumented error codes', unknown.length === 0, JSON.stringify(unknown));

// ---- live: served spec matches file, examples match reality ----
const BASE = 'http://127.0.0.1:5050';
const docs = await fetch(BASE + '/api-docs/');
check('swagger UI serves live', docs.status === 200);

const badReg = await (await fetch(BASE + '/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bad' }) })).json();
const reg400 = spec.paths['/api/v1/auth/register'].post.responses['400'];
const resolved400 = reg400.$ref ? resolve(reg400.$ref) : reg400;
const ex = resolved400.content['application/json'].example;
const shapeOk =
  badReg?.success === false &&
  badReg?.error?.code === ex?.error?.code &&
  Array.isArray(badReg?.error?.details) &&
  typeof badReg?.error?.details?.[0]?.field === 'string' &&
  typeof badReg?.requestId === 'string';
check('live validation error matches spec example shape', shapeOk, JSON.stringify(badReg)?.slice(0, 200));

const nf = await (await fetch(BASE + '/nope')).json();
check('live 404 matches Error schema keys', nf?.success === false && typeof nf?.error?.code === 'string' && typeof nf?.error?.message === 'string');

if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('Swagger audit passed');
