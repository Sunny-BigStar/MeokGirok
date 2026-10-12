// 초기설정 화면 — 프로필 입력, 권장 열량 계산, 저장

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

function formatNumber(n) {
  return n.toLocaleString('ko-KR');
}

// 폼 값을 읽어 프로필 객체로. 비어 있거나 범위 밖이면 errors에 담는다
function readProfileForm(form) {
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
  const box = document.getElementById('activity-options');
  box.innerHTML = ACTIVITY_LEVELS.map(
    (l) => `
      <label class="choice">
        <input type="radio" name="activity" value="${l.key}" />
        <span class="choice-body">
          <strong>${l.label}</strong>
          <small>${l.desc}</small>
        </span>
      </label>`
  ).join('');
}

// 입력할 때마다 미리보기·안내문·저장 버튼 상태를 갱신
function updateSetupPreview() {
  const form = document.getElementById('setup-form');
  const { profile, errors } = readProfileForm(form);

  for (const field of ['age', 'height', 'weight']) {
    document.getElementById(`hint-${field}`).textContent = errors[field] || '';
  }

  const valid = Object.keys(errors).length === 0;
  const result = document.getElementById('calorie-result');
  if (valid) {
    result.innerHTML = `하루 권장 열량 약 <strong>${formatNumber(calcDailyCalories(profile))}</strong> kcal`;
  } else {
    result.textContent = '모두 입력하면 하루 권장 열량을 알려드려요.';
  }
  document.getElementById('setup-save').disabled = !valid;
}

function fillSetupForm(profile) {
  const form = document.getElementById('setup-form');
  form.reset();
  if (profile) {
    form.age.value = profile.age;
    form.height.value = profile.height;
    form.weight.value = profile.weight;
    const sex = form.querySelector(`input[name="sex"][value="${profile.sex}"]`);
    if (sex) sex.checked = true;
    const act = form.querySelector(`input[name="activity"][value="${profile.activity}"]`);
    if (act) act.checked = true;
  }
  updateSetupPreview();
}

function initSetupScreen(onSaved) {
  renderActivityOptions();
  const form = document.getElementById('setup-form');
  form.addEventListener('input', updateSetupPreview);
  form.addEventListener('change', updateSetupPreview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { profile, errors } = readProfileForm(form);
    if (Object.keys(errors).length > 0) return;
    saveProfile(profile);
    onSaved(profile);
  });
}
