import test from 'node:test';
import assert from 'node:assert/strict';
import { calcTargets, sumEntries, validateProfile } from '../src/nutrition.js';

const base = { sex: 'male', age: 30, heightCm: 175, weightKg: 70, activity: 'moderate', goal: 'maintain' };

test('BMR/TDEE: 30세 남 175cm 70kg 보통 활동', () => {
  const t = calcTargets(base);
  assert.equal(t.bmr, 1649); // 700 + 1093.75 - 150 + 5
  assert.equal(t.tdee, 2556);
  assert.equal(t.calories, 2556);
});

test('감량 목표는 -500kcal, 하한선 적용', () => {
  assert.equal(calcTargets({ ...base, goal: 'lose' }).calories, 2056);
  const small = { sex: 'female', age: 60, heightCm: 150, weightKg: 40, activity: 'sedentary', goal: 'lose' };
  assert.equal(calcTargets(small).calories, 1200);
});

test('탄단지 열량 합이 목표 칼로리와 거의 일치', () => {
  const t = calcTargets(base);
  assert.ok(Math.abs(t.carbs * 4 + t.protein * 4 + t.fat * 9 - t.calories) <= 10);
});

test('프로필 검증', () => {
  assert.deepEqual(validateProfile(base), []);
  assert.ok(validateProfile({ ...base, age: 5 }).length > 0);
  assert.ok(validateProfile({ ...base, sex: 'x', goal: 'y' }).length === 2);
});

test('sumEntries 합산', () => {
  const t = sumEntries([{ calories: 100.5, carbs: 10 }, { calories: 200, protein: '5' }]);
  assert.equal(t.calories, 300.5);
  assert.equal(t.carbs, 10);
  assert.equal(t.protein, 5);
});
