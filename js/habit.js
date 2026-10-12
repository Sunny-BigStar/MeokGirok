// 캐릭터 하루 변화 · 식사 알림 · 연속 기록 성장 (CLAUDE.md 8장)
// 모두 entries에서 계산하는 순수 함수 — 따로 저장하지 않는다 (9장). 섭취량은 보지 않고 '기록 습관'만 본다.

/**
 * 오늘 기록한 끼니로 캐릭터 표정·말을 정한다.
 * 0개 → 기본, 아침·점심·저녁 모두 → 만족, 그 외 → 신남 + 가장 늦은 끼니에 맞는 한마디
 */
function habitState(meals) {
  const recorded = meals.filter((m) => m.items.length > 0);
  if (recorded.length === 0) return { expression: 'expr-default', message: HABIT_MESSAGES.none };
  const kinds = new Set(recorded.map((m) => m.meal));
  if (MAIN_MEALS.every((k) => kinds.has(k))) return { expression: 'expr-satisfied', message: HABIT_MESSAGES.allThree };
  // '마지막 기록' = 끼니 시간이 가장 늦은 것 (저장 순서가 아니라 먹은 시간 기준)
  const last = recorded.slice().sort((a, b) => a.time.localeCompare(b.time)).pop();
  return { expression: 'expr-excited', message: HABIT_MESSAGES[last.meal] || HABIT_MESSAGES.etc };
}

/**
 * 시간대가 이미 지났는데 오늘 기록이 없는 아침·점심·저녁 (간식·야식·음료는 알리지 않음).
 * 예: 13시 → 아침, 17시 → 아침·점심. 자정~새벽엔 새 날의 아침 시간대가 아직이라 없음.
 */
function missedMeals(meals, dismissed, now = new Date()) {
  const today = toDateStr(now);
  const hour = now.getHours();
  return MAIN_MEALS.filter((k) => {
    const passed = hour > MEAL_TIME_SLOTS[k].end;
    const recorded = meals.some((m) => m.meal === k && m.items.length > 0);
    const hidden = dismissed.some((d) => d.date === today && d.meal === k);
    return passed && !recorded && !hidden;
  });
}

/**
 * 연속 기록일: 오늘부터 거꾸로 끊기지 않고 기록한 날 수.
 * 오늘 아직 기록 전이면 어제부터 센다 — 아침에 앱을 열자마자 0일이 되지 않게
 */
function streakDays(recorded, now = new Date()) {
  let d = toDateStr(now);
  if (!recorded.has(d)) d = shiftDate(d, -1);
  let n = 0;
  while (recorded.has(d)) {
    n++;
    d = shiftDate(d, -1);
  }
  return n;
}

/**
 * 성장 단계: 기록한 날 수 '누적' 기준 (끊겨도 내려가지 않음).
 * 반환: { index(-1이면 아직 없음), current, next, remaining(다음 단계까지 남은 날) }
 */
function growthStage(totalDays) {
  let index = -1;
  GROWTH_STAGES.forEach((s, i) => {
    if (totalDays >= s.days) index = i;
  });
  const next = GROWTH_STAGES[index + 1] || null;
  return {
    index,
    current: index >= 0 ? GROWTH_STAGES[index] : null,
    next,
    remaining: next ? next.days - totalDays : 0,
  };
}

// 성장 띠 아래 한 줄: "총 8일 기록 · 6일 더 기록하면 꽃이 펴요"
function growthText(totalDays) {
  const g = growthStage(totalDays);
  if (totalDays === 0) return '첫 기록을 남기면 씨앗이 생겨요.';
  if (!g.next) return `총 ${totalDays}일 기록 · 열매까지 다 자랐어요! 🎉`;
  return `총 ${totalDays}일 기록 · ${g.remaining}일 더 기록하면 ${g.next.grow}`;
}
