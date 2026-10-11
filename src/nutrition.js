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

/**
 * 최근 7일 리포트. days: [{ date, totals }] (기록 없는 날은 calories 0).
 * 평균은 '기록한 날'만 대상으로 해서, 안 적은 날이 평균을 깎지 않도록 한다.
 */
export function weeklyReport(days, targets) {
  const logged = days.filter((d) => d.totals.calories > 0);
  const n = logged.length;
  const avg = Object.fromEntries(
    FIELDS.map((f) => [f, n ? Math.round((logged.reduce((s, d) => s + d.totals[f], 0) / n) * 10) / 10 : 0]),
  );
  // 열량 기여 비율 (탄 4, 단 4, 지 9 kcal/g)
  const kcalFromMacros = avg.carbs * 4 + avg.protein * 4 + avg.fat * 9;
  const ratio = kcalFromMacros
    ? {
        carbs: Math.round(((avg.carbs * 4) / kcalFromMacros) * 100),
        protein: Math.round(((avg.protein * 4) / kcalFromMacros) * 100),
        fat: Math.round(((avg.fat * 9) / kcalFromMacros) * 100),
      }
    : null;

  const onTargetDays = targets
    ? logged.filter((d) => Math.abs(d.totals.calories / targets.calories - 1) <= 0.1).length
    : 0;
  const sodiumOverDays = targets ? logged.filter((d) => d.totals.sodium > targets.sodium).length : 0;

  const insights = [];
  if (!n) insights.push('최근 7일간 기록이 없어요. 오늘부터 시작해 보세요.');
  else if (targets) {
    if (n < 4) insights.push(`기록한 날이 ${n}일뿐이라 평균이 정확하지 않을 수 있어요.`);
    const calPct = avg.calories / targets.calories;
    if (calPct > 1.1) insights.push(`하루 평균 ${Math.round(avg.calories - targets.calories)}kcal 권장량을 넘겼어요.`);
    else if (calPct < 0.8) insights.push('평균 섭취량이 권장량의 80% 미만이에요. 너무 적게 먹고 있지 않은지 확인해 보세요.');
    else insights.push('평균 칼로리가 권장량 범위 안에 있어요. 👍');
    if (avg.protein < targets.protein * 0.8) insights.push('단백질이 부족한 편이에요. 달걀·두부·생선·살코기를 늘려 보세요.');
    if (avg.fiber < targets.fiber * 0.7) insights.push('식이섬유가 부족해요. 채소·과일·잡곡을 더해 보세요.');
    if (avg.sugar > targets.sugar) insights.push('당류 섭취가 권장 상한을 넘었어요. 음료와 간식을 점검해 보세요.');
    if (sodiumOverDays >= 3) insights.push(`나트륨 상한을 넘긴 날이 ${sodiumOverDays}일이에요. 국물과 가공식품을 줄여 보세요.`);
  }
  return { loggedDays: n, avg, ratio, onTargetDays, sodiumOverDays, insights };
}

/** YYYY-MM-DD 형식이면서 실제로 존재하는 날짜인지 (2026-13-45 같은 값 거부) */
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
