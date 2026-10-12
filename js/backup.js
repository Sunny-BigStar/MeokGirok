// JSON 내보내기·가져오기·전체 초기화 — 서버가 없어 기록이 이 기기 localStorage에만 있으므로 (CLAUDE.md 3장)
// API 키는 내보내지 않는다: 백업 파일은 메신저·클라우드로 옮기기 쉬워 키가 함께 새어 나갈 수 있음 (10장)

const BACKUP_APP = 'meokgirok';
const BACKUP_VERSION = 1;
const BACKUP_MAX_BYTES = 5 * 1024 * 1024; // 잘못 고른 큰 파일 대비

function buildBackup(now = new Date()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: `${toDateStr(now)}T${toTimeStr(now)}:00`,
    profile: loadProfile(),
    entries: loadEntries(),
    dismissed: loadDismissed(),
    favorites: loadFavorites(), // 자주 먹는 세트도 함께 옮긴다
  };
}

function backupFileName(now = new Date()) {
  return `meokgirok-backup-${toDateStr(now)}.json`;
}

// 브라우저에서 파일로 내려받기 (서버 없이)
function downloadBackup() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 가져오기 전 검사: 하나라도 틀리면 아무것도 바꾸지 않는다 ----------

class BackupError extends Error {}

// id는 HTML 속성(data-id)에 들어가므로 글자·숫자·-·_ 만 받는다.
// 다른 사람이 만든 파일의 id에 따옴표 등을 넣어 화면에 코드를 끼워 넣는 것을 막기 위해 — 아니면 새 id
function safeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : newEntryId();
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d; // 2026-02-30 같은 날짜 거르기
}

function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function cleanProfile(p) {
  if (p === null || p === undefined) return null;
  const sexOk = p.sex === 'male' || p.sex === 'female';
  const actOk = ACTIVITY_LEVELS.some((l) => l.key === p.activity);
  const inRange = ['age', 'height', 'weight'].every((k) => typeof p[k] === 'number' && p[k] >= PROFILE_LIMITS[k].min && p[k] <= PROFILE_LIMITS[k].max);
  if (!sexOk || !actOk || !inRange) throw new BackupError('내 정보 값이 올바르지 않아요.');
  return { age: p.age, sex: p.sex, height: p.height, weight: p.weight, activity: p.activity };
}

// 알 수 없는 필드는 버리고 CLAUDE.md 9장 형식만 남긴다
function cleanItem(it, where) {
  if (!it || typeof it !== 'object') throw new BackupError(`${where}의 음식 정보가 올바르지 않아요.`);
  const name = typeof it.name === 'string' ? it.name.trim() : '';
  if (!name) throw new BackupError(`${where}에 이름이 없는 음식이 있어요.`);
  if (!(typeof it.multiplier === 'number' && it.multiplier > 0)) throw new BackupError(`${where} '${name}'의 먹은 양이 올바르지 않아요.`);
  const src = it.nutrients && typeof it.nutrients === 'object' ? it.nutrients : null;
  if (!src) throw new BackupError(`${where} '${name}'의 영양성분이 없어요.`);
  const nutrients = {};
  for (const f of NUTRIENT_FIELDS) {
    const v = src[f.key];
    if (v === null || v === undefined) nutrients[f.key] = null; // 모르는 값은 null 그대로 (0으로 만들지 않음)
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) nutrients[f.key] = v;
    else throw new BackupError(`${where} '${name}'의 ${f.label} 값이 올바르지 않아요.`);
  }
  if (nutrients.calories === null) throw new BackupError(`${where} '${name}'의 열량이 없어요.`);
  return {
    id: safeId(it.id),
    name,
    source: INPUT_SOURCES[it.source] ? it.source : 'manual',
    basis: typeof it.basis === 'string' ? it.basis : '',
    multiplier: it.multiplier,
    nutrients,
  };
}

// 자주 먹는 세트: 이름·식사 종류·음식(이름·열량 필수)만 받고 나머지는 버린다
function cleanFavorite(f, i) {
  const where = `${i + 1}번째 세트`;
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) throw new BackupError(`${where}의 이름이 없어요.`);
  const meals = Array.isArray(f.meals) ? f.meals.filter((k) => MEAL_TYPES.some((t) => t.key === k)) : [];
  if (!meals.length || !Array.isArray(f.items) || !f.items.length) throw new BackupError(`${where} '${f.name}'의 식사 종류나 음식이 없어요.`);
  const items = f.items.map((it) => {
    const c = cleanItem({ ...it, multiplier: 1 }, where); // 음식 검사는 기록과 같은 규칙
    return { name: c.name, basis: c.basis, nutrients: c.nutrients };
  });
  return { id: safeId(f.id), name: f.name.trim().slice(0, 20), meals, items };
}

function cleanMeal(m, i) {
  const where = `${i + 1}번째 끼니`;
  if (!m || typeof m !== 'object') throw new BackupError(`${where}의 정보가 올바르지 않아요.`);
  if (!isValidDate(m.date)) throw new BackupError(`${where}의 날짜 형식이 맞지 않아요.`);
  if (!isValidTime(m.time)) throw new BackupError(`${where}의 시간 형식이 맞지 않아요.`);
  if (!MEAL_TYPES.some((t) => t.key === m.meal)) throw new BackupError(`${where}의 식사 종류를 알 수 없어요.`);
  if (!Array.isArray(m.items)) throw new BackupError(`${where}에 음식 목록이 없어요.`);
  return {
    id: safeId(m.id),
    date: m.date,
    time: m.time,
    meal: m.meal,
    items: m.items.map((it) => cleanItem(it, where)),
  };
}

/**
 * 파일 내용(문자열)을 검사해 { ok: true, data } 또는 { ok: false, error(사람 말) }
 * data: { profile(null이면 지금 프로필 유지), entries, dismissed }
 */
function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'JSON 파일을 읽지 못했어요. 먹기록에서 내보낸 파일인지 확인해 주세요.' };
  }
  try {
    if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP) throw new BackupError('먹기록 백업 파일이 아니에요.');
    if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) throw new BackupError('이 앱보다 새로운 버전에서 만든 파일이라 읽을 수 없어요.');
    if (!Array.isArray(obj.entries)) throw new BackupError('기록 목록이 없어요.');
    // 2단계 첫 버전 형식(음식 1개 = 기록 1건)도 끼니 형식으로 바꿔서 받는다
    const raw = obj.entries.some(isLegacyEntry) ? migrateLegacyEntries(obj.entries) : obj.entries;
    // 음식이 하나도 없는 끼니는 빈 줄로만 보이므로 받지 않는다
    const entries = raw.map(cleanMeal).filter((m) => m.items.length > 0);
    const profile = cleanProfile(obj.profile);
    const dismissed = (Array.isArray(obj.dismissed) ? obj.dismissed : [])
      .filter((d) => d && isValidDate(d.date) && MAIN_MEALS.includes(d.meal))
      .map((d) => ({ date: d.date, meal: d.meal }));
    // 세트가 없는 예전 백업이면 지금 세트를 그대로 둔다 (undefined)
    const favorites = Array.isArray(obj.favorites) ? obj.favorites.map(cleanFavorite) : undefined;
    return { ok: true, data: { profile, entries, dismissed, favorites } };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.message };
    return { ok: false, error: '파일 내용을 읽지 못했어요.' };
  }
}

// 가져오기 = 합치기가 아니라 바꾸기 (같은 끼니가 두 번 들어가지 않게)
function applyBackup(data) {
  if (data.profile) saveProfile(data.profile); // 파일에 프로필이 없으면 지금 프로필 유지
  saveEntries(data.entries, { force: true }); // 사용자가 확인한 '바꾸기'라 읽지 못한 기록이 있어도 덮어쓴다
  localStorage.setItem(STORAGE_KEYS.dismissed, JSON.stringify(data.dismissed));
  if (data.favorites) saveFavorites(data.favorites);
}

// 전체 초기화: 기록·내 정보·알림 설정·API 키 모두
function resetAll() {
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  loadEntries(); // 비워진 상태를 다시 읽어 '읽지 못함' 표시를 푼다
}
