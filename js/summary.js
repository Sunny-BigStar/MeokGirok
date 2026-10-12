// 영양 요약·균형 판단 — 화면과 분리한 순수 함수. 날짜를 받으므로 6단계 캘린더(과거 날짜)에서도 그대로 쓴다

// 하루 기준값: 열량은 프로필로 계산, 단백질은 몸무게 범위, 나머지는 식약처 1일 기준치 (CLAUDE.md 5장)
function getTargets(profile) {
  return {
    calories: calcDailyCalories(profile),
    protein: proteinRange(profile.weight),
    carbs: NUTRITION_STANDARDS.carbs,
    fat: NUTRITION_STANDARDS.fat,
    sugars: NUTRITION_STANDARDS.sugars,
    sodium: NUTRITION_STANDARDS.sodium,
    sat_fat: NUTRITION_STANDARDS.sat_fat,
    cholesterol: NUTRITION_STANDARDS.cholesterol,
    trans_fat: null, // 기준치 없음
  };
}

// 그날 끼니·음식·합계
function sumDay(date) {
  const meals = getMealsByDate(date);
  const items = meals.flatMap((m) => m.items);
  return { meals, itemCount: items.length, ...sumItems(items) };
}

/**
 * 영양소마다 상태를 붙인다.
 *  제한 영양소: ok / caution(80%↑) / over(100%↑)
 *  단백질: low(범위 아래) / good / plenty(범위 위)
 *  열량: ok / over(110% 초과)
 *  탄수화물·트랜스지방: info (판단하지 않고 보여주기만)
 *  값을 하나도 모르면: unknown (판단하지 않음 — 0으로 보고 '부족'이라 하지 않기 위해)
 */
function judgeNutrients(totals, targets) {
  const R = BALANCE_RULES;
  const result = {};
  for (const f of NUTRIENT_FIELDS) {
    const key = f.key;
    const value = totals[key];
    const target = targets[key];
    const r = { key, label: f.label, unit: f.unit, value, target, pct: null, status: 'info' };

    if (key === 'protein') {
      r.pct = value === null ? null : value / target.max;
      if (value === null) r.status = 'unknown';
      else if (value < target.min) {
        r.status = 'low';
        r.gap = Math.round(target.min - value);
      } else if (value > target.max) r.status = 'plenty';
      else r.status = 'good';
    } else if (target === null) {
      r.status = value === null ? 'unknown' : 'info';
    } else {
      r.pct = value === null ? null : value / target;
      if (value === null) r.status = 'unknown';
      else if (key === 'calories') {
        r.status = r.pct > R.caloriesOver ? 'over' : 'ok';
        r.remaining = Math.max(Math.round(target - value), 0);
      } else if (R.limitKeys.includes(key)) {
        r.status = r.pct >= R.over ? 'over' : r.pct >= R.caution ? 'caution' : 'ok';
      }
    }
    result[key] = r;
  }
  return result;
}

// 걸리는 항목 = 넘었어요(제한 영양소·열량) + 단백질 부족. '주의'는 세지 않는다 (사용자 결정)
function flaggedItems(judged) {
  return Object.values(judged).filter((r) => r.status === 'over' || r.status === 'low');
}

// 등급: 0개 균형 · 1~2개 약간 불균형 · 3개 이상 또는 제한 영양소 150% 이상 불균형
function balanceGrade(judged) {
  const flagged = flaggedItems(judged);
  const severe = BALANCE_RULES.limitKeys.some((k) => judged[k].pct !== null && judged[k].pct >= BALANCE_RULES.severe);
  if (severe || flagged.length > BALANCE_RULES.mildMax) return 'bad';
  if (flagged.length > 0) return 'mild';
  return 'good';
}

// 받침에 따라 이/가, 은/는 (나트륨이 · 당류가)
function josa(word, withBatchim, without) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasBatchim ? withBatchim : without);
}

// 문구 순서: 넘은 것(비율 큰 순) → 단백질 부족 → 주의(비율 큰 순)
function orderedIssues(judged) {
  const all = Object.values(judged);
  const byPct = (a, b) => b.pct - a.pct;
  return [
    ...all.filter((r) => r.status === 'over').sort(byPct),
    ...all.filter((r) => r.status === 'low'),
    ...all.filter((r) => r.status === 'caution').sort(byPct),
  ];
}

function issueText(r) {
  if (r.status === 'over') {
    return r.key === 'calories' ? '열량이 오늘 권장량을 넘었어요.' : `${josa(r.label, '이', '가')} 오늘 기준을 넘었어요.`;
  }
  if (r.status === 'low') return `${josa(r.label, '은', '는')} 아직 ${r.gap} g 정도 여유가 있어요.`;
  return `${josa(r.label, '은', '는')} 기준의 ${Math.round(r.pct * 100)}%예요. 조금만 살펴봐요.`;
}

/**
 * 균형 카드 문구: lines(무엇이 과하고 부족한지, 최대 2줄) + tip(다음 끼니 제안 1줄) + oneLine(저장 직후 말풍선용 한 줄)
 * 비난하지 않는 톤 (CLAUDE.md 7장)
 */
function balanceMessages(judged) {
  const issues = orderedIssues(judged);
  if (issues.length === 0) {
    return { lines: ['오늘은 균형 있게 먹고 있어요.'], tip: NEXT_MEAL_TIPS.none, oneLine: '오늘은 균형 있게 먹고 있어요.' };
  }
  const lines = issues.slice(0, 2).map(issueText);
  const first = issues[0];
  const tip = NEXT_MEAL_TIPS[first.key] || NEXT_MEAL_TIPS.none;
  // 5장 예시처럼 "나트륨이 기준을 넘었고, 단백질은 아직 20 g 부족해요" 형태의 한 줄
  const flagged = issues.filter((r) => r.status !== 'caution').slice(0, 2);
  let oneLine;
  if (flagged.length === 0) oneLine = lines[0];
  else {
    const parts = flagged.map((r) =>
      r.status === 'over'
        ? r.key === 'calories'
          ? '열량이 권장량을 넘었'
          : `${josa(r.label, '이', '가')} 기준을 넘었`
        : `${josa(r.label, '은', '는')} 아직 ${r.gap} g 부족해`
    );
    // 마지막 조각만 문장으로 끝내고 앞은 "~고,"로 잇는다
    oneLine = parts.map((p, i) => (i < parts.length - 1 ? `${p}고, ` : p.endsWith('넘었') ? `${p}어요.` : `${p}요.`)).join('');
  }
  return { lines, tip, oneLine };
}
