// 기록 데이터 함수 — 화면과 분리해 4~7단계에서도 그대로 재사용한다

function pad2(n) {
  return String(n).padStart(2, '0');
}

// toISOString()은 UTC라 한국 새벽에 날짜가 하루 밀린다 → 기기 현지 시간으로 직접 조립
function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeStr(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// file://에서는 crypto.randomUUID가 없을 수 있어 시간+난수로 만든다
function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// 1배 기준 값 × 먹은 양. null(모르는 값)은 계산하지 않고 null 그대로 둔다
function scaleNutrients(base, multiplier) {
  const out = {};
  for (const f of NUTRIENT_FIELDS) {
    const v = base[f.key];
    out[f.key] = v === null || v === undefined ? null : roundTo(v * multiplier, f.decimals);
  }
  return out;
}

// 수정 화면용: 저장된 값(먹은 양 반영)을 1배 기준으로 되돌린다
function unscaleNutrients(nutrients, multiplier) {
  const out = {};
  for (const f of NUTRIENT_FIELDS) {
    const v = nutrients[f.key];
    // 되돌린 값은 반올림 오차가 커지지 않게 한 자리 더 둔다
    out[f.key] = v === null || v === undefined ? null : roundTo(v / multiplier, f.decimals + 1);
  }
  return out;
}

// 지금 시각이 속한 식사 시간대 (없으면 null)
function mealByTime(d = new Date()) {
  const h = d.getHours();
  for (const [key, { start, end }] of Object.entries(MEAL_TIME_SLOTS)) {
    const inSlot = start <= end ? h >= start && h <= end : h >= start || h <= end;
    if (inSlot) return key;
  }
  return null;
}

function mealLabel(key) {
  const m = MEAL_TYPES.find((t) => t.key === key);
  return m ? m.label : '기타';
}

// "2026-10-12" → "10월 12일"
function formatMonthDay(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// 먹은 양 배수를 사람 말로 (1배는 표시하지 않음)
function amountLabel(multiplier) {
  return multiplier === 0.5 ? '절반' : `${multiplier}배`;
}

// 공백·대소문자만 다른 이름은 같은 음식으로 본다 (중복 담기 방지·최근 음식 묶기 공통)
function nameKey(name) {
  return name.replace(/\s+/g, '').toLowerCase();
}

// "오늘" · "어제" · "10월 3일"
function relativeDay(dateStr, now = new Date()) {
  const today = toDateStr(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dateStr === today) return '오늘';
  if (dateStr === toDateStr(y)) return '어제';
  return formatMonthDay(dateStr);
}

/**
 * 최근 먹은 음식 목록 — 따로 저장하지 않고 entries에서 계산 (CLAUDE.md 9장).
 * 이름 기준으로 묶고, 최근 30일 안에 자주 먹은 순 → 같으면 최근 순. 30일보다 오래된 음식은 남는 자리에 최근 순.
 * 반환: [{ name, item(마지막으로 먹었을 때의 음식), count(전체 횟수), lastDate }]
 */
function getRecentFoods(now = new Date()) {
  const cutoffDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (RECENT_FOODS.days - 1));
  const cutoff = toDateStr(cutoffDay);
  const byName = new Map();
  for (const meal of loadEntries()) {
    for (const it of meal.items) {
      if (!it.name) continue;
      const key = nameKey(it.name);
      const when = `${meal.date} ${meal.time}`;
      const f = byName.get(key) || { count: 0, recentCount: 0, lastWhen: '', lastDate: '', item: null };
      f.count++;
      if (meal.date >= cutoff) f.recentCount++;
      // 같은 음식은 마지막으로 먹었을 때의 값·양을 쓴다
      if (when > f.lastWhen) {
        f.lastWhen = when;
        f.lastDate = meal.date;
        f.item = it;
      }
      byName.set(key, f);
    }
  }
  const all = [...byName.values()];
  const byRecent = (a, b) => b.lastWhen.localeCompare(a.lastWhen);
  const recent = all.filter((f) => f.lastDate >= cutoff).sort((a, b) => b.recentCount - a.recentCount || byRecent(a, b));
  const older = all.filter((f) => f.lastDate < cutoff).sort(byRecent);
  return recent
    .concat(older)
    .slice(0, RECENT_FOODS.limit)
    .map((f) => ({ name: f.item.name, item: f.item, count: f.count, lastDate: f.lastDate }));
}

// 사용자가 입력한 음식명을 innerHTML에 넣기 전에 이스케이프
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}


// ---------- 끼니 단위 저장 (entries = 끼니 배열) ----------

function getMealsByDate(date) {
  return loadEntries()
    .filter((m) => m.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function getMeal(id) {
  return loadEntries().find((m) => m.id === id) || null;
}


// id가 이미 있으면 수정, 없으면 추가
function upsertMeal(meal) {
  const meals = loadEntries();
  const i = meals.findIndex((m) => m.id === meal.id);
  if (i >= 0) meals[i] = meal;
  else meals.push(meal);
  saveEntries(meals);
}

function deleteMeal(id) {
  saveEntries(loadEntries().filter((m) => m.id !== id));
}

/**
 * 음식들의 영양소 합계. 끼니 합계·하루 합계 모두 저장하지 않고 이 함수로 계산한다.
 * null(모르는 값)은 더하지 않고, 하나라도 있으면 missing[key] = true로 알려준다.
 * 아는 값이 하나도 없으면 합계도 null — 0으로 보이면 "안 먹었다"로 오해하므로
 */
function sumItems(items) {
  const totals = {};
  const missing = {};
  for (const f of NUTRIENT_FIELDS) {
    let sum = 0;
    let known = 0;
    missing[f.key] = false;
    for (const item of items) {
      const v = item.nutrients[f.key];
      if (v === null || v === undefined) missing[f.key] = true;
      else {
        sum += v;
        known++;
      }
    }
    totals[f.key] = known ? roundTo(sum, f.decimals) : null;
  }
  return { totals, missing };
}