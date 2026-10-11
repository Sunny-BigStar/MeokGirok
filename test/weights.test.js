import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'meokgirok-w-'));
process.env.DATA_DIR = dir;
process.env.ANALYZE_MOCK = '1';
// 체중 기능이 없던 이전 버전 db 형식으로 시작해도 동작해야 함
writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ profile: null, entries: [] }));
const { app } = await import('../src/app.js');

let server, base;
before(() => new Promise((r) => (server = app.listen(0, () => ((base = `http://localhost:${server.address().port}`), r())))));
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, body) =>
  fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

const profile = { sex: 'male', age: 30, heightCm: 175, weightKg: 70, activity: 'moderate', goal: 'maintain' };

test('이전 버전 db에서도 체중 목록 조회 가능', async () => {
  const r = await (await call('GET', '/api/weights')).json();
  assert.deepEqual(r.weights, []);
});

test('체중 입력 검증', async () => {
  assert.equal((await call('PUT', '/api/weights', { date: 'x', weightKg: 60 })).status, 400);
  assert.equal((await call('PUT', '/api/weights', { date: '2026-10-01', weightKg: 5 })).status, 400);
  assert.equal((await call('PUT', '/api/weights', { date: '2026-10-01', weightKg: 'abc' })).status, 400);
});

test('최신 체중이 프로필/권장량에 반영되고, 같은 날은 덮어씀', async () => {
  await call('PUT', '/api/profile', profile);
  const before = await (await call('GET', '/api/profile')).json();

  await call('PUT', '/api/weights', { date: '2026-10-01', weightKg: 70 });
  const r = await (await call('PUT', '/api/weights', { date: '2026-10-08', weightKg: 66.4 })).json();
  assert.equal(r.weights.length, 2);
  const after = await (await call('GET', '/api/profile')).json();
  assert.equal(after.profile.weightKg, 66.4);
  assert.ok(after.targets.calories < before.targets.calories); // 체중 감소 -> BMR 감소

  const same = await (await call('PUT', '/api/weights', { date: '2026-10-08', weightKg: 67 })).json();
  assert.equal(same.weights.length, 2);
  assert.equal(same.weights.at(-1).kg, 67);
});

test('과거 날짜 체중을 넣어도 프로필은 가장 최근 값을 유지', async () => {
  await call('PUT', '/api/weights', { date: '2026-09-01', weightKg: 80 });
  const p = await (await call('GET', '/api/profile')).json();
  assert.equal(p.profile.weightKg, 67);
});

test('체중 삭제 시 이전 기록으로 프로필 복귀, 없는 날짜는 404', async () => {
  assert.equal((await call('DELETE', '/api/weights/2026-10-08')).status, 204);
  assert.equal((await call('DELETE', '/api/weights/2026-10-08')).status, 404);
  const p = await (await call('GET', '/api/profile')).json();
  assert.equal(p.profile.weightKg, 70); // 남은 최신 기록: 10-01의 70kg
});

test('요약에 주간 리포트 포함', async () => {
  await call('POST', '/api/entries', { date: '2026-10-11', time: '12:00', meal: 'lunch', name: 'a', calories: 2500, carbs: 300, protein: 100, fat: 80 });
  const s = await (await call('GET', '/api/summary?date=2026-10-11')).json();
  assert.equal(s.report.loggedDays, 1);
  assert.equal(s.report.avg.calories, 2500);
  assert.ok(Array.isArray(s.report.insights));
});

test('분석 요청에 hint를 보내도 정상 처리(긴 hint는 잘림)', async () => {
  const r = await call('POST', '/api/analyze', { image: 'data:image/png;base64,AAAA', hint: '밥은 반 공기'.repeat(100) });
  assert.equal(r.status, 200);
  const r2 = await call('POST', '/api/analyze', { image: 'data:image/png;base64,AAAA', hint: { evil: 1 } });
  assert.equal(r2.status, 200);
});
