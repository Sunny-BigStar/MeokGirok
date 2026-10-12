// localStorage 읽기/쓰기 — 서버 없이 기기에만 저장한다

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // 손상된 값이면 없는 것으로 보고 초기설정을 다시 받는다
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

// entries = 끼니 배열. 예전 형식(음식 1개 = 기록 1건)이 있으면 읽을 때 한 번 변환해 다시 저장한다
function loadEntries() {
  let list;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.entries);
    list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
  } catch (e) {
    return [];
  }
  if (list.some(isLegacyEntry)) {
    list = migrateLegacyEntries(list);
    saveEntries(list);
  }
  return list;
}

// 2단계 첫 버전의 기록: items 없이 음식 정보가 바로 들어 있음
function isLegacyEntry(e) {
  return Boolean(e) && !Array.isArray(e.items) && Boolean(e.nutrients);
}

// 같은 날짜·식사 종류의 예전 기록은 한 끼니로 합친다 (끼니 시간은 가장 이른 것)
function migrateLegacyEntries(list) {
  const meals = list.filter((e) => !isLegacyEntry(e));
  const legacy = list.filter(isLegacyEntry).sort((a, b) => a.time.localeCompare(b.time));
  for (const e of legacy) {
    let meal = meals.find((m) => m.date === e.date && m.meal === e.meal);
    if (!meal) {
      meal = { id: e.id, date: e.date, time: e.time, meal: e.meal, items: [] };
      meals.push(meal);
    }
    if (e.time < meal.time) meal.time = e.time;
    meal.items.push({
      id: e.id + '-i', // 끼니 id와 겹치지 않게
      name: e.name,
      source: e.source,
      basis: e.basis,
      multiplier: e.multiplier,
      nutrients: e.nutrients,
    });
  }
  return meals;
}

// Gemini API 키: 사용자가 내 정보에서 입력 → 이 기기 localStorage에만 (코드·파일에 절대 넣지 않음, CLAUDE.md 10장)
function loadApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
}

function saveApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.apiKey, key);
}

function deleteApiKey() {
  localStorage.removeItem(STORAGE_KEYS.apiKey);
}

// '오늘은 안 먹었어요'로 숨긴 식사 알림: [{ date, meal }]만 저장 (섭취 기록으로 남기지 않음, 8장)
function loadDismissed() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.dismissed) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function dismissMeal(date, meal, now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DISMISSED_KEEP_DAYS);
  const cutoffStr = toDateStr(cutoff);
  const list = loadDismissed().filter((d) => d.date >= cutoffStr && !(d.date === date && d.meal === meal));
  list.push({ date, meal });
  localStorage.setItem(STORAGE_KEYS.dismissed, JSON.stringify(list));
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
}
