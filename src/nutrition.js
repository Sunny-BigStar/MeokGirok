// 하루 권장량 계산 (Mifflin-St Jeor 기반). 의학적 조언이 아닌 일반 참고용 추정치.
export const ACTIVITY = {
  sedentary: { factor: 1.2, label: '거의 안 움직임' },
  light: { factor: 1.375, label: '가벼운 활동 (주 1~3회 운동)' },
  moderate: { factor: 1.55, label: '보통 (주 3~5회 운동)' },
  active: { factor: 1.725, label: '활발 (주 6~7회 운동)' },
  very_active: { factor: 1.9, label: '매우 활발 (육체노동/선수)' },
};

export const GOALS = {
  lose: { delta: -500, protein: 1.6, label: '감량' },
  maintain: { delta: 0, protein: 1.2, label: '유지' },
  gain: { delta: 300, protein: 1.6, label: '증량' },
};

export function validateProfile(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['프로필 형식이 올바르지 않습니다.'];
  if (!['male', 'female'].includes(p.sex)) errors.push('성별을 선택해 주세요.');
  if (!(p.age >= 10 && p.age <= 100)) errors.push('나이는 10~100 사이여야 합니다.');
  if (!(p.heightCm >= 100 && p.heightCm <= 250)) errors.push('키는 100~250cm 사이여야 합니다.');
  if (!(p.weightKg >= 30 && p.weightKg <= 300)) errors.push('몸무게는 30~300kg 사이여야 합니다.');
  if (!ACTIVITY[p.activity]) errors.push('활동량을 선택해 주세요.');
  if (!GOALS[p.goal]) errors.push('목표를 선택해 주세요.');
  return errors;
}

export function calcTargets(p) {
  const bmr =
    10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.activity].factor;
  const goal = GOALS[p.goal];
  const floor = p.sex === 'male' ? 1500 : 1200; // 과도한 저칼로리 방지
  const calories = Math.round(Math.max(floor, tdee + goal.delta));

  const protein = Math.round(p.weightKg * goal.protein);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    carbs,
    protein,
    fat,
    sugar: Math.round((calories * 0.1) / 4), // WHO: 당류는 총 열량의 10% 미만
    fiber: Math.round((calories / 1000) * 14), // 1000kcal당 14g
    sodium: 2000, // WHO: 나트륨 2,000mg 미만
  };
}

export const FIELDS = ['calories', 'carbs', 'protein', 'fat', 'sugar', 'fiber', 'sodium'];

export function sumEntries(entries) {
  const total = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  for (const e of entries) for (const f of FIELDS) total[f] += Number(e[f]) || 0;
  for (const f of FIELDS) total[f] = Math.round(total[f] * 10) / 10;
  return total;
}
