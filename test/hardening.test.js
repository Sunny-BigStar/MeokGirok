import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'meokgirok-h-'));
process.env.DATA_DIR = dir;
process.env.ANALYZE_MOCK = '1';
process.env.APP_PASSWORD = 'pw';
const { app } = await import('../src/app.js');

let server, base, cookie;
before(async () => {
  await new Promise((r) => (server = app.listen(0, () => ((base = `http://localhost:${server.address().port}`), r()))));
  const r = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, body, extra = {}) =>
  fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, ...extra },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const food = (o = {}) => ({ date: '2026-10-10', time: '08:00', meal: 'breakfast', name: '토스트', calories: 300, carbs: 40, protein: 10, fat: 10, ...o });

test('보안 헤더: CSP, nosniff, 프레임 금지, x-powered-by 제거', async () => {
  const res = await fetch(base + '/login.html');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('페이지 HTML에 인라인 스크립트/스타일 속성이 없어 CSP와 충돌하지 않음', async () => {
  for (const p of ['/login.html']) {
    const html = await (await fetch(base + p)).text();
    assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, `${p} 인라인 script`);
    assert.equal(/\sstyle=/.test(html), false, `${p} 인라인 style`);
  }
  const index = await (await fetch(base + '/', { headers: { cookie } })).text();
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(index), false);
  assert.equal(/\sstyle=/.test(index), false);
});

test('깨진 JSON 요청은 500이 아니라 400', async () => {
  const r = await call('POST', '/api/entries', '{ not json');
  assert.equal(r.status, 400);
});

test('HTTPS 프록시 뒤에서는 쿠키에 Secure, 평문 HTTP에서는 없음', async () => {
  const login = (h) =>
    fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ password: 'pw' }) });
  assert.match((await login({ 'x-forwarded-proto': 'https' })).headers.get('set-cookie'), /Secure/i);
  assert.doesNotMatch((await login({})).headers.get('set-cookie'), /Secure/i);
});

test('전날 식단 복사: 새 id로 복제, 원본 유지, 잘못된 요청은 400', async () => {
  await call('POST', '/api/entries', food());
  await call('POST', '/api/entries', food({ name: '커피', meal: 'snack', calories: 5 }));
  assert.equal((await call('POST', '/api/entries/copy', { from: '2026-10-10', to: '2026-10-10' })).status, 400);
  assert.equal((await call('POST', '/api/entries/copy', { from: 'x', to: '2026-10-11' })).status, 400);

  const r = await call('POST', '/api/entries/copy', { from: '2026-10-10', to: '2026-10-11' });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).copied, 2);

  const a = await (await call('GET', '/api/summary?date=2026-10-10')).json();
  const b = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(a.entries.length, 2);
  assert.equal(b.entries.length, 2);
  assert.equal(b.totals.calories, a.totals.calories);
  assert.equal(new Set([...a.entries, ...b.entries].map((e) => e.id)).size, 4);

  // 복사본을 지워도 원본은 영향 없음
  await call('DELETE', `/api/entries/${b.entries[0].id}`);
  assert.equal((await (await call('GET', '/api/summary?date=2026-10-10')).json()).entries.length, 2);
});

test('원본이 비어 있으면 0개 복사', async () => {
  const r = await call('POST', '/api/entries/copy', { from: '2026-01-01', to: '2026-01-02' });
  assert.equal((await r.json()).copied, 0);
});
