import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeResult } from '../src/analyze.js';
import { isDate } from '../src/nutrition.js';

const item = (o = {}) => ({
  name: '테스트', serving_description: '1회', servings_per_container: 1, calories: 200,
  carbs_g: 30, sugar_g: 5, fiber_g: 2, protein_g: 5, fat_g: 6, sodium_mg: 300, confidence: 0.9, ...o,
});
const run = (o) => sanitizeResult({ kind: 'label', note: '', items: [item(o)] }).items[0];

test('정상 값은 경고 없이 통과 (30*4+5*4+6*9=194 ≈ 200)', () => {
  const r = run();
  assert.equal(r.warning, '');
  assert.equal(r.calories, 200);
});

test('음수/NaN/비현실적 값 보정', () => {
  const r = run({ calories: -50, carbs_g: NaN, protein_g: 99999, sodium_mg: 'abc', confidence: 7 });
  assert.equal(r.calories >= 0, true);
  assert.equal(r.carbs_g, 0);
  assert.equal(r.protein_g, 400);
  assert.equal(r.sodium_mg, 0);
  assert.equal(r.confidence, 1);
});

test('칼로리와 탄단지가 크게 어긋나면 경고', () => {
  const r = run({ calories: 900 });
  assert.match(r.warning, /잘 맞지 않아요/);
  assert.equal(r.calories, 900); // 값은 바꾸지 않고 사용자에게 확인 요청
});

test('칼로리 0이고 탄단지가 있으면 계산해 채우고 안내', () => {
  const r = run({ calories: 0 });
  assert.equal(r.calories, 194);
  assert.match(r.warning, /계산했어요/);
});

test('당류가 탄수화물보다 크면 맞춤', () => {
  const r = run({ carbs_g: 10, sugar_g: 40, calories: 100, protein_g: 0, fat_g: 6 });
  assert.equal(r.sugar_g, 10);
});

test('전부 0이면 직접 입력 안내', () => {
  const r = run({ calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 });
  assert.match(r.warning, /직접 입력/);
});

test('이상한 응답 형태도 안전하게 처리', () => {
  assert.deepEqual(sanitizeResult(null), { kind: 'unknown', note: '', items: [] });
  assert.equal(sanitizeResult({ kind: 'weird', items: 'x' }).kind, 'unknown');
  assert.equal(sanitizeResult({ items: [{}] }).items[0].name, '이름 없음');
});

test('isDate: 존재하지 않는 날짜 거부', () => {
  assert.equal(isDate('2026-10-11'), true);
  assert.equal(isDate('2024-02-29'), true);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2026-13-45'), false);
  assert.equal(isDate('2026-1-1'), false);
  assert.equal(isDate(20261011), false);
  assert.equal(isDate(undefined), false);
});
