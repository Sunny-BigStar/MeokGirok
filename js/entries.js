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

function getEntriesByDate(date) {
  return loadEntries()
    .filter((e) => e.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function getEntry(id) {
  return loadEntries().find((e) => e.id === id) || null;
}

// id가 이미 있으면 수정, 없으면 추가
function upsertEntry(entry) {
  const entries = loadEntries();
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  saveEntries(entries);
}

function deleteEntry(id) {
  saveEntries(loadEntries().filter((e) => e.id !== id));
}
