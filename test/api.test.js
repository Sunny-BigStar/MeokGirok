import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// store.js는 import 시점에 DATA_DIR을 읽으므로 먼저 설정
const dir = mkdtempSync(path.join(tmpdir(), 'meokgirok-'));
process.env.DATA_DIR = dir;
process.env.ANALYZE_MOCK = '1';
const { app } = await import('../src/app.js');

let server, base;
before(() => new Promise((r) => (server = app.listen(0, () => ((base = `http://localhost:${server.address().port}`), r())))));
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, body) =>
  fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const profile = { sex: 'female', age: 28, heightCm: 163, weightKg: 55, activity: 'light', goal: 'lose' };
const food = (o = {}) => ({ date: '2026-10-11', time: '12:00', meal: 'lunch', name: '비빔밥', calories: 600, carbs: 90, protein: 20, fat: 15, ...o });

test('프로필 없으면 요약에 target이 null', async () => {
  const s = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(s.targets, null);
  assert.equal(s.week.length, 7);
});

test('잘못된 프로필/기록/날짜는 400', async () => {
  assert.equal((await call('PUT', '/api/profile', { ...profile, age: 3 })).status, 400);
  assert.equal((await call('POST', '/api/entries', food({ name: ' ' }))).status, 400);
  assert.equal((await call('POST', '/api/entries', food({ calories: -5 }))).status, 400);
  assert.equal((await call('POST', '/api/entries', food({ date: 'x' }))).status, 400);
  assert.equal((await call('GET', '/api/summary?date=bad')).status, 400);
});

test('프로필 저장 → 기록 추가 → 달성률 계산 → 삭제', async () => {
  const p = await (await call('PUT', '/api/profile', profile)).json();
  assert.ok(p.targets.calories >= 1200);

  const a = await (await call('POST', '/api/entries', food())).json();
  await call('POST', '/api/entries', food({ name: '사과', meal: 'snack', calories: 95, time: '15:00' }));
  let s = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(s.totals.calories, 695);
  assert.equal(s.percent.calories, Math.round((695 / s.targets.calories) * 100));
  assert.equal(s.entries.length, 2);
  assert.equal(s.week.at(-1).calories, 695);

  assert.equal((await call('DELETE', `/api/entries/${a.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/entries/${a.id}`)).status, 404);
  s = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(s.totals.calories, 95);
});

test('다른 날짜 기록은 섞이지 않음', async () => {
  await call('POST', '/api/entries', food({ date: '2026-10-10', calories: 300 }));
  const s = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(s.totals.calories, 95);
  assert.equal(s.week.find((d) => d.date === '2026-10-10').calories, 300);
});

test('자주 먹는 음식: 빈도순, id/날짜 제외', async () => {
  await call('POST', '/api/entries', food({ date: '2026-10-09', name: '사과', meal: 'snack', calories: 95 }));
  const { items } = await (await call('GET', '/api/recent?date=2026-10-11')).json();
  assert.equal(items[0].name, '사과');
  assert.equal(items[0].count, 2);
  assert.equal(items[0].id, undefined);
  assert.equal(items[0].date, undefined);
});

test('분석: 이미지 형식 검증 + 목 결과', async () => {
  assert.equal((await call('POST', '/api/analyze', { image: 'nope' })).status, 400);
  const r = await call('POST', '/api/analyze', { image: 'data:image/png;base64,AAAA' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.kind, 'food');
  assert.ok(body.items.length >= 1);
});

test('기록 수정(PUT): 값 변경, 없는 id는 404, 잘못된 값은 400', async () => {
  const a = await (await call('POST', '/api/entries', food({ name: '수정전', calories: 100 }))).json();
  const r = await call('PUT', `/api/entries/${a.id}`, food({ name: '수정후', calories: 250, meal: 'dinner' }));
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.id, a.id);
  assert.equal(saved.calories, 250);
  assert.equal(saved.meal, 'dinner');
  assert.equal((await call('PUT', '/api/entries/nope', food())).status, 404);
  assert.equal((await call('PUT', `/api/entries/${a.id}`, food({ calories: 'x' }))).status, 400);
});

test('CSV 내보내기: BOM, 헤더, 인용/수식 이스케이프', async () => {
  await call('POST', '/api/entries', food({ name: '=SUM(A1), "특별"', date: '2026-10-12' }));
  const res = await call('GET', '/api/export.csv');
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const buf = Buffer.from(await res.arrayBuffer()); // text()는 BOM을 제거하므로 바이트로 확인
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = buf.toString('utf8').slice(1);
  assert.ok(text.startsWith('date,time,meal,name,calories'));
  assert.ok(text.includes(`"'=SUM(A1), ""특별"""`));
});

test('db.json이 손상돼도 백업 후 계속 동작', async () => {
  const { writeFileSync, readdirSync } = await import('node:fs');
  writeFileSync(path.join(dir, 'db.json'), '{ broken');
  const res = await call('GET', '/api/summary?date=2026-10-11');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).entries.length, 0);
  assert.ok(readdirSync(dir).some((f) => f.startsWith('db.json.corrupt-')));
});

test('분석 API는 과도한 요청을 429로 제한', async () => {
  const img = { image: 'data:image/png;base64,AAAA' };
  let last;
  for (let i = 0; i < 25; i++) last = (await call('POST', '/api/analyze', img)).status;
  assert.equal(last, 429);
});
