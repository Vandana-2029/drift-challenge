import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { config } from '../server/config.js';
import { templateOutline } from '../server/planBuilder.js';
import { answersSchema } from '../server/schema.js';

let server, baseUrl, fakeGroq;
const quiet = { log() {}, warn() {}, error() {} };

before(async () => {
  const store = await createStore('');
  const app = await createApp({ store, log: quiet });
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});
after(() => { server?.close(); fakeGroq?.close(); });

// tiny cookie-keeping client
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(baseUrl + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const answers = {
  title: 'Become a confident English speaker', length: 30, startDate: '2026-11-02',
  goals: { d30: 'Speak for 5 minutes without stopping' }, areas: ['Speaking', 'Vocabulary'],
  level: 'some', hoursWeekday: 1.5, hoursWeekend: 1, breakMode: 'sun-catchup',
};

test('signup, me, generate, save plan, progress round-trip, logout', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/me')).status, 401);
  const s = await c('POST', '/api/auth/signup', { name: 'Asha', email: 'Asha@Example.com', password: 'secret123' });
  assert.equal(s.status, 201);
  assert.equal(s.body.user.email, 'asha@example.com');
  const me = await c('GET', '/api/me');
  assert.equal(me.body.hasPlan, false);

  const g = await c('POST', '/api/plan/generate', { answers });
  assert.equal(g.status, 200);
  assert.equal(g.body.usedAI, false);
  assert.equal(g.body.plan.days.length, 30);

  assert.equal((await c('POST', '/api/plan', { plan: g.body.plan, resetProgress: true })).status, 200);
  assert.equal((await c('GET', '/api/me')).body.hasPlan, true);
  assert.equal((await c('GET', '/api/plan')).body.plan.meta.totalDays, 30);

  const put = await c('PUT', '/api/progress', { data: { tasks: { 'd01-speaki-1': { status: 'done', at: '2026-11-02' } } } });
  assert.equal(put.status, 200);
  const got = await c('GET', '/api/progress');
  assert.equal(got.body.data.tasks['d01-speaki-1'].status, 'done');

  assert.equal((await c('POST', '/api/auth/logout')).status, 200);
});

test('duplicate email, wrong password and bad plan are rejected', async () => {
  const c = client();
  await c('POST', '/api/auth/signup', { name: 'B', email: 'b@example.com', password: 'password1' });
  assert.equal((await client()('POST', '/api/auth/signup', { name: 'B2', email: 'b@example.com', password: 'password1' })).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'b@example.com', password: 'nope' })).status, 401);
  assert.equal((await c('POST', '/api/plan', { plan: { meta: {} } })).status, 400);
  assert.equal((await c('POST', '/api/plan/generate', { answers: { ...answers, areas: [] } })).status, 400);
});

test('uses Groq when a key is set (mocked), and falls back when it fails', async () => {
  const a = answersSchema.parse(answers);
  const outline = templateOutline(a);
  outline.weeks[0].tasks = [{ track: 'Speaking', title: 'Record a 2-minute self-introduction' }];
  let mode = 'ok';
  let lastBody;
  fakeGroq = http.createServer((req, res) => {
    let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
      lastBody = JSON.parse(raw);
      if (mode === 'fail') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"boom"}}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(outline) } }] }));
    });
  }).listen(0);
  config.groqKey = 'test-key';
  config.groqBaseUrl = `http://localhost:${fakeGroq.address().port}`;
  try {
    const c = client();
    await c('POST', '/api/auth/signup', { name: 'C', email: 'c@example.com', password: 'password1' });
    const g = await c('POST', '/api/plan/generate', { answers });
    assert.equal(g.body.usedAI, true);
    assert.equal(lastBody.response_format.type, 'json_schema');
    assert.ok(g.body.plan.days[0].tasks.some(t => t.title === 'Record a 2-minute self-introduction'));
    mode = 'fail';
    const g2 = await c('POST', '/api/plan/generate', { answers });
    assert.equal(g2.status, 200);
    assert.equal(g2.body.usedAI, false);
    assert.match(g2.body.note, /template/);
  } finally {
    config.groqKey = '';
  }
});

test('daily generation limit protects the free AI quota', async () => {
  const c = client();
  await c('POST', '/api/auth/signup', { name: 'D', email: 'd@example.com', password: 'password1' });
  let last;
  for (let i = 0; i < config.plansPerDay + 1; i++) last = await c('POST', '/api/plan/generate', { answers });
  assert.equal(last.status, 429);
});
