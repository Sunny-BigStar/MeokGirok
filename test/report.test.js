import test from 'node:test';
import assert from 'node:assert/strict';
import { calcTargets, weeklyReport } from '../src/nutrition.js';

const targets = calcTargets({ sex: 'male', age: 30, heightCm: 175, weightKg: 70, activity: 'moderate', goal: 'maintain' });
const day = (date, o = {}) => ({
  date,
  totals: { calories: 0, carbs: 0, protein: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0, ...o },
});
const empty7 = () => Array.from({ length: 7 }, (_, i) => day(`2026-10-0${i + 1}`));

test('기록이 없으면 안내 문구만', () => {
  const r = weeklyReport(empty7(), targets);
  assert.equal(r.loggedDays, 0);
  assert.equal(r.ratio, null);
  assert.match(r.insights[0], /기록이 없어요/);
});

test('평균은 기록한 날만 대상으로 계산', () => {
  const days = empty7();
  days[0] = day('2026-10-01', { calories: 2000, carbs: 250, protein: 100, fat: 60 });
  days[1] = day('2026-10-02', { calories: 3000, carbs: 350, protein: 120, fat: 100 });
  const r = weeklyReport(days, targets);
  assert.equal(r.loggedDays, 2);
  assert.equal(r.avg.calories, 2500);
  assert.equal(r.avg.carbs, 300);
  assert.equal(r.ratio.carbs + r.ratio.protein + r.ratio.fat >= 99, true);
  assert.ok(r.insights.some((t) => t.includes('2일뿐')));
});

test('권장량 ±10% 일수와 나트륨 초과 일수', () => {
  const days = empty7().map((d, i) =>
    day(d.date, { calories: i < 4 ? targets.calories : 1000, protein: 100, fiber: 40, sodium: i < 3 ? 3000 : 1000 }),
  );
  const r = weeklyReport(days, targets);
  assert.equal(r.onTargetDays, 4);
  assert.equal(r.sodiumOverDays, 3);
  assert.ok(r.insights.some((t) => t.includes('나트륨')));
});

test('칼로리 초과/단백질 부족 인사이트', () => {
  const days = empty7().map((d) => day(d.date, { calories: targets.calories * 1.3, protein: 10, fiber: 40 }));
  const r = weeklyReport(days, targets);
  assert.ok(r.insights.some((t) => t.includes('넘겼어요')));
  assert.ok(r.insights.some((t) => t.includes('단백질')));
});
