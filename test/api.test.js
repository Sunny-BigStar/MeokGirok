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
