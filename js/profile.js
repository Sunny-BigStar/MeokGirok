// 내 정보 화면 — 기본 정보 입력, 권장 열량 계산, 나의 영양 기준 표시, 저장

// Mifflin-St Jeor 기초대사량
function calcBmr(p) {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

// 하루 권장 열량 = 기초대사량 × 활동계수. 저장하지 않고 매번 계산해 값 불일치를 막는다
function calcDailyCalories(p) {
  const level = ACTIVITY_LEVELS.find((l) => l.key === p.activity);
  return Math.round(calcBmr(p) * level.factor);
}

// 단백질 목표범위 = 몸무게 × 0.8 ~ 1.2 g (5장)
function proteinRange(weight) {
  const { min, max } = NUTRITION_STANDARDS.proteinPerKg;
  return { min: Math.round(weight * min), max: Math.round(weight * max) };
}

function formatNumber(n) {
  return n.toLocaleString('ko-KR');
}

const meForm = () => document.getElementById('me-form');

// 폼 값을 읽어 프로필 객체로. 비어 있거나 범위 밖이면 errors에 담는다
function readProfileForm() {
  const form = meForm();
  const data = new FormData(form);
  const profile = {
    age: Number(data.get('age')),
    sex: data.get('sex'),
    height: Number(data.get('height')),
    weight: Number(data.get('weight')),
    activity: data.get('activity'),
  };
  const errors = {};
  for (const field of ['age', 'height', 'weight']) {
    const raw = data.get(field);
    const { min, max, unit } = PROFILE_LIMITS[field];
    if (raw === '' || raw === null) {
      errors[field] = '';
    } else if (!(profile[field] >= min && profile[field] <= max)) {
      errors[field] = `${min}~${max}${unit} 사이로 입력해 주세요.`;
    }
  }
  if (!profile.sex) errors.sex = '';
  if (!profile.activity) errors.activity = '';
  return { profile, errors };
}

function renderActivityOptions() {
  const select = document.getElementById('activity');
  select.innerHTML =
    '<option value="">선택해 주세요</option>' +
    ACTIVITY_LEVELS.map((l) => `<option value="${l.key}">${l.label} (${l.desc})</option>`).join('');
}

// 나의 영양 기준 카드: 권장 열량 + 5개 기준 (값은 CLAUDE.md 5장 상수에서)
function renderStandards(profile, valid) {
  document.getElementById('me-calories').textContent = valid ? formatNumber(calcDailyCalories(profile)) : '–';
  const rows = MAIN_NUTRIENTS.map((key) => {
    const f = NUTRIENT_FIELDS.find((n) => n.key === key);
    let value;
    if (key === 'protein') {
      const r = valid ? proteinRange(profile.weight) : null;
      value = r ? `${r.min}~${r.max} ${f.unit}` : '–';
    } else {
      // 당류·나트륨 등은 '이하'로 지킬 기준이라 그렇게 표현
      const limit = `${formatNumber(NUTRITION_STANDARDS[key])} ${f.unit}`;
      value = key === 'carbs' ? limit : `${limit} 이하`;
    }
    return `<li><span class="dot" style="background:${NUTRIENT_COLORS[key]}"></span><span>${f.label}</span><strong>${value}</strong></li>`;
  });
  document.getElementById('me-standards').innerHTML = rows.join('');
}

// 입력할 때마다 기준 카드·안내문·저장 버튼 상태를 갱신
function updateMePreview() {
  const { profile, errors } = readProfileForm();
  for (const field of ['age', 'height', 'weight']) {
    document.getElementById(`hint-${field}`).textContent = errors[field] || '';
  }
  const valid = Object.keys(errors).length === 0;
  renderStandards(profile, valid);
  document.getElementById('me-save').disabled = !valid;
}

function fillMeForm(profile) {
  const form = meForm();
  form.reset();
  if (profile) {
    form.age.value = profile.age;
    form.height.value = profile.height;
    form.weight.value = profile.weight;
    form.activity.value = profile.activity;
    const sex = form.querySelector(`input[name="sex"][value="${profile.sex}"]`);
    if (sex) sex.checked = true;
  }
  // 첫 실행이면 환영 문구와 '시작하기', 이후엔 그냥 '저장'
  document.getElementById('me-save').textContent = profile ? '저장' : '저장하고 시작하기';
  document.getElementById('me-welcome').hidden = Boolean(profile);
  // 앱 설정은 첫 실행에도 보인다 — 새 기기에서 백업 파일부터 가져올 수 있게 (8단계에서 바꿈)
  renderApiKeyCard();
  document.getElementById('data-msg').textContent = '';
  updateMePreview();
}

// ---------- 앱 설정: Gemini API 키 ----------

// 저장된 키는 앞뒤 4글자만 보여준다 (어깨 너머로 보이거나 화면 공유할 때 대비)
function maskKey(key) {
  return key.length <= 8 ? '•'.repeat(key.length) : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function renderApiKeyCard(message = '') {
  const key = loadApiKey();
  document.getElementById('key-saved').hidden = !key;
  document.getElementById('key-form').hidden = Boolean(key);
  document.getElementById('key-masked').textContent = key ? maskKey(key) : '';
  document.getElementById('key-input').value = '';
  document.getElementById('key-save').disabled = true;
  document.getElementById('key-msg').textContent = message;
}

function initApiKeyCard() {
  const input = document.getElementById('key-input');
  input.addEventListener('input', () => {
    document.getElementById('key-save').disabled = input.value.trim() === '';
  });
  document.getElementById('key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    // 복사할 때 딸려 온 공백·줄바꿈 제거
    const key = input.value.replace(/\s+/g, '');
    if (!key) return;
    saveApiKey(key);
    renderApiKeyCard('키를 저장했어요. 이제 기록하기에서 사진을 올려 보세요.');
  });
  document.getElementById('key-delete').addEventListener('click', () => {
    if (!confirm('저장된 API 키를 지울까요? 사진 분석을 쓰려면 다시 입력해야 해요.')) return;
    deleteApiKey();
    renderApiKeyCard('키를 지웠어요.');
  });
}

// ---------- 앱 설정: 데이터 내보내기·가져오기·전체 초기화 (8단계) ----------

function setDataMsg(text) {
  document.getElementById('data-msg').textContent = text;
}

async function onDataFile(e, callbacks) {
  const file = e.target.files[0];
  e.target.value = ''; // 같은 파일을 다시 골라도 동작하게
  if (!file) return;
  if (file.size > BACKUP_MAX_BYTES) return setDataMsg('파일이 너무 커요. 먹기록에서 내보낸 JSON 파일을 골라 주세요.');
  const result = parseBackup(await file.text());
  if (!result.ok) return setDataMsg(`가져오지 못했어요: ${result.error} 지금 데이터는 그대로예요.`);

  // 바꾸기 전에 꼭 묻는다 (가져오기 = 지금 데이터를 파일 내용으로 바꾸기)
  const now = loadEntries().length;
  const next = result.data.entries.length;
  const ok = confirm(`지금 기록 ${now}끼니를 파일의 ${next}끼니로 바꿀까요?\n지금 데이터는 사라져요. 걱정되면 먼저 내보내기를 해 두세요.`);
  if (!ok) return setDataMsg('가져오기를 취소했어요. 지금 데이터는 그대로예요.');
  applyBackup(result.data);
  callbacks.onImported(`${next}끼니를 가져왔어요.${loadApiKey() ? '' : ' API 키는 파일에 없으니 사진 분석을 쓰려면 다시 입력해 주세요.'}`);
}

function initDataSection(callbacks) {
  document.getElementById('data-export').addEventListener('click', () => {
    downloadBackup();
    setDataMsg(`${backupFileName()} 파일로 내보냈어요.`);
  });
  document.getElementById('data-import').addEventListener('click', () => document.getElementById('data-file').click());
  document.getElementById('data-file').addEventListener('change', (e) => onDataFile(e, callbacks));
  document.getElementById('data-reset').addEventListener('click', () => {
    if (!confirm('기록·내 정보·알림 설정·API 키를 모두 지울까요?\n되돌릴 수 없어요. 필요하면 먼저 내보내기를 해 두세요.')) return;
    resetAll();
    callbacks.onReset();
  });
}

function initMeScreen(onSaved, dataCallbacks) {
  initApiKeyCard();
  initDataSection(dataCallbacks);
  renderActivityOptions();
  const form = meForm();
  form.addEventListener('input', updateMePreview);
  form.addEventListener('change', updateMePreview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { profile, errors } = readProfileForm();
    if (Object.keys(errors).length > 0) return;
    const isFirst = !loadProfile();
    saveProfile(profile);
    onSaved(isFirst);
  });
}
