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
  updateMePreview();
}

function initMeScreen(onSaved) {
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
