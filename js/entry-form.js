// 추가/수정 화면 — 모든 입력 방식(직접·재기록·OCR·사진)이 이 확인 폼을 거쳐야 저장된다

let entryFormState = null; // 지금 열린 폼의 { id, source, basis, isEdit }
let entryFormCallbacks = null; // { onDone(message) }

function renderNutrientInputs() {
  const box = document.getElementById('nutrient-inputs');
  box.innerHTML = NUTRIENT_FIELDS.filter((f) => f.key !== 'calories')
    .map(
      (f) => `
      <label class="mini-field">
        <span>${f.label}</span>
        <span class="input-unit">
          <input name="n-${f.key}" type="number" inputmode="decimal" min="0" step="any" />
          <span>${f.unit}</span>
        </span>
      </label>`
    )
    .join('');
}

function renderMealOptions() {
  const box = document.getElementById('meal-options');
  box.innerHTML = MEAL_TYPES.map(
    (m) => `<label><input type="radio" name="meal" value="${m.key}" /><span>${m.label}</span></label>`
  ).join('');
}

// 빈 칸은 0이 아니라 null (모르는 값을 0으로 추측하지 않음)
function readOptionalNumber(input) {
  if (input.value.trim() === '') return null;
  const n = Number(input.value);
  return Number.isFinite(n) ? n : NaN;
}

function readMultiplier(form) {
  const amount = form.querySelector('input[name="amount"]:checked');
  if (!amount) return NaN;
  if (amount.value === 'custom') {
    const v = form.multiplier.value.trim();
    return v === '' ? NaN : Number(v);
  }
  return Number(amount.value);
}

// 폼 → { entry, errors }
function readEntryForm(form) {
  const errors = [];
  const name = form.foodName.value.trim();
  if (!name) errors.push('name');

  const base = {};
  for (const f of NUTRIENT_FIELDS) {
    const v = readOptionalNumber(form[`n-${f.key}`]);
    if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(f.key);
    base[f.key] = Number.isNaN(v) ? null : v;
  }
  if (base.calories === null) errors.push('calories');

  const multiplier = readMultiplier(form);
  const { min, max } = MULTIPLIER_LIMITS;
  if (!(multiplier >= min && multiplier <= max)) errors.push('multiplier');

  const meal = form.querySelector('input[name="meal"]:checked');
  if (!meal) errors.push('meal');
  if (!form.date.value) errors.push('date');
  if (!form.time.value) errors.push('time');

  const entry = {
    id: entryFormState.id,
    date: form.date.value,
    time: form.time.value,
    meal: meal ? meal.value : null,
    name,
    source: entryFormState.source,
    basis: entryFormState.basis,
    multiplier,
    nutrients: errors.length ? null : scaleNutrients(base, multiplier),
  };
  return { entry, errors, base };
}

function updateEntryPreview() {
  const form = document.getElementById('entry-form');
  form.multiplier.disabled = !form.querySelector('input[name="amount"][value="custom"]').checked;

  const { entry, errors, base } = readEntryForm(form);
  const preview = document.getElementById('entry-preview');
  const multiplier = readMultiplier(form);
  if (base.calories !== null && multiplier >= MULTIPLIER_LIMITS.min && multiplier <= MULTIPLIER_LIMITS.max) {
    const kcal = roundTo(base.calories * multiplier, 0);
    preview.textContent = `먹은 양 기준 약 ${formatNumber(kcal)} kcal`;
  } else {
    preview.textContent = '';
  }

  document.getElementById('hint-multiplier').textContent = errors.includes('multiplier')
    ? `${MULTIPLIER_LIMITS.min}~${MULTIPLIER_LIMITS.max}배 사이로 입력해 주세요.`
    : '';
  document.getElementById('entry-save').disabled = errors.length > 0 || !entry;
}

/**
 * 추가/수정 화면 열기. 다른 입력 방식은 prefill만 채워서 이 함수를 부른다.
 * prefill: { id?, name?, nutrients?(1배 기준), multiplier?, meal?, date?, time?, source?, basis? }
 */
function openEntryForm(prefill = {}) {
  const form = document.getElementById('entry-form');
  form.reset();
  const isEdit = Boolean(prefill.id);
  entryFormState = {
    id: prefill.id || newEntryId(),
    source: prefill.source || 'manual',
    basis: prefill.basis || '직접 입력한 값',
    isEdit,
  };

  const now = new Date();
  form.foodName.value = prefill.name || '';
  const nutrients = prefill.nutrients || {};
  for (const f of NUTRIENT_FIELDS) {
    const v = nutrients[f.key];
    form[`n-${f.key}`].value = v === null || v === undefined ? '' : v;
  }

  // 1배·절반은 버튼으로, 그 외 배수는 직접 입력 칸으로
  const m = prefill.multiplier || 1;
  const preset = form.querySelector(`input[name="amount"][value="${m}"]`);
  if (preset) {
    preset.checked = true;
  } else {
    form.querySelector('input[name="amount"][value="custom"]').checked = true;
    form.multiplier.value = m;
  }

  // 식사 종류 기본값: 지정이 없으면 지금 시간대로
  const meal = prefill.meal || mealByTime(now);
  if (meal) form.querySelector(`input[name="meal"][value="${meal}"]`).checked = true;

  form.date.value = prefill.date || toDateStr(now);
  form.time.value = prefill.time || toTimeStr(now);

  document.getElementById('entry-title').textContent = isEdit ? '기록 수정' : '기록 추가';
  document.getElementById('entry-delete').hidden = !isEdit;
  updateEntryPreview();
  showScreen('screen-entry');
  form.foodName.focus();
}

// 저장된 기록 → 수정 화면 prefill (먹은 양을 되돌려 1배 기준으로)
function openEntryFormForEdit(id) {
  const e = getEntry(id);
  if (!e) return;
  openEntryForm({
    id: e.id,
    name: e.name,
    nutrients: unscaleNutrients(e.nutrients, e.multiplier),
    multiplier: e.multiplier,
    meal: e.meal,
    date: e.date,
    time: e.time,
    source: e.source,
    basis: e.basis,
  });
}

function initEntryScreen(callbacks) {
  entryFormCallbacks = callbacks;
  renderNutrientInputs();
  renderMealOptions();

  const form = document.getElementById('entry-form');
  form.addEventListener('input', updateEntryPreview);
  form.addEventListener('change', updateEntryPreview);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { entry, errors } = readEntryForm(form);
    if (errors.length > 0) return; // 버튼이 비활성이라 보통 오지 않지만 Enter 키 대비
    upsertEntry(entry);
    entryFormCallbacks.onDone(entryFormState.isEdit ? '기록을 고쳤어요.' : '기록했어요.');
  });

  document.getElementById('entry-cancel').addEventListener('click', () => {
    entryFormCallbacks.onDone(null);
  });

  document.getElementById('entry-delete').addEventListener('click', () => {
    if (!confirm('이 기록을 지울까요?')) return;
    deleteEntry(entryFormState.id);
    entryFormCallbacks.onDone('기록을 지웠어요.');
  });
}
