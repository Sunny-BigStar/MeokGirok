import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'meokgirok-a-'));
process.env.DATA_DIR = dir;
process.env.ANALYZE_MOCK = '1';
process.env.APP_PASSWORD = 'correct horse';
const { app } = await import('../src/app.js');

let server, base;
before(() => new Promise((r) => (server = app.listen(0, () => ((base = `http://localhost:${server.address().port}`), r())))));
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (url, body, headers = {}) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('로그인 전: API는 401, 페이지는 로그인 화면으로 리다이렉트, 로그인 페이지는 공개', async () => {
  assert.equal((await fetch(base + '/api/summary?date=2026-10-11')).status, 401);
  assert.equal((await post('/api/analyze', { image: 'data:image/png;base64,AAAA' })).status, 401);
  const page = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login.html');
  assert.equal((await fetch(base + '/login.html')).status, 200);
});

test('잘못된 비밀번호는 401, 쿠키 없음', async () => {
  const r = await post('/api/login', { password: 'nope' });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('로그인 성공 시 HttpOnly+SameSite 쿠키로 접근 가능', async () => {
  const r = await post('/api/login', { password: 'correct horse' });
  assert.equal(r.status, 200);
  const setCookie = r.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';')[0];

  const s = await fetch(base + '/api/summary?date=2026-10-11', { headers: { cookie } });
  assert.equal(s.status, 200);
  const meta = await (await fetch(base + '/api/meta', { headers: { cookie } })).json();
  assert.equal(meta.authEnabled, true);

  // 위조 토큰은 거부
  const forged = await fetch(base + '/api/summary?date=2026-10-11', { headers: { cookie: 'mg_session=abc' } });
  assert.equal(forged.status, 401);
});

test('로그아웃하면 쿠키가 지워짐', async () => {
  const r = await post('/api/logout', {});
  assert.match(r.headers.get('set-cookie'), /mg_session=;/);
});

test('로그인 실패가 반복되면 429', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = (await post('/api/login', { password: 'bad' + i })).status;
  assert.equal(last, 429);
  // 잠금 중에는 올바른 비밀번호도 거부 (무차별 대입 방지)
  assert.equal((await post('/api/login', { password: 'correct horse' })).status, 429);
});
