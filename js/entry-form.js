// 추가/수정 화면 — 끼니 정보(식사 종류·날짜·시간)를 정하고, 음식을 장바구니처럼 하나씩 담은 뒤 끼니 저장
// 모든 입력 방식(직접·재기록·OCR·사진)은 음식 입력칸을 채우기만 하고, 저장은 사용자가 버튼을 눌러야 된다

let draft = null; // 지금 편집 중인 끼니 { id, isEdit, items }
let draftSnapshot = ''; // 연 직후 상태 — 나갈 때 바뀐 게 있는지 비교
let editingItemId = null; // 담긴 음식 중 고치는 중인 것 (없으면 새로 담기)
let foodMeta = { source: 'manual', basis: '직접 입력한 값' }; // 입력칸에 채워진 음식의 출처
let entryCallbacks = null; // { onDone(message) }

const foodForm = () => document.getElementById('food-form');

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

function multiplierOk(m) {
  return m >= MULTIPLIER_LIMITS.min && m <= MULTIPLIER_LIMITS.max;
}

// ---------- 끼니 정보 ----------

function readMealInfo() {
  const checked = document.querySelector('#meal-options input:checked');
  return {
    meal: checked ? checked.value : null,
    date: document.getElementById('meal-date').value,
    time: document.getElementById('meal-time').value,
  };
}

function setMealInfo({ meal, date, time }) {
  document.querySelectorAll('#meal-options input').forEach((r) => {
    r.checked = r.value === meal;
  });
  document.getElementById('meal-date').value = date;
  document.getElementById('meal-time').value = time;
}

// ---------- 음식 입력칸 ----------

function foodFormIsEmpty() {
  const form = foodForm();
  return form.foodName.value.trim() === '' && NUTRIENT_FIELDS.every((f) => form[`n-${f.key}`].value.trim() === '');
}

// 입력칸 → { item, errors }. item.nutrients는 먹은 양을 곱한 값
function readFoodForm() {
  const form = foodForm();
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
  if (!multiplierOk(multiplier)) errors.push('multiplier');

  const item = errors.length
    ? null
    : {
        id: editingItemId || newEntryId(),
        name,
        source: foodMeta.source,
        basis: foodMeta.basis,
        multiplier,
        nutrients: scaleNutrients(base, multiplier),
      };
  return { item, errors, base, multiplier };
}

function setAmount(multiplier) {
  const form = foodForm();
  const preset = form.querySelector(`input[name="amount"][value="${multiplier}"]`);
  if (preset) {
    preset.checked = true;
    form.multiplier.value = '';
  } else {
    form.querySelector('input[name="amount"][value="custom"]').checked = true;
    form.multiplier.value = multiplier;
  }
}

function resetFoodForm() {
  const form = foodForm();
  form.reset();
  setAmount(1);
  editingItemId = null;
  foodMeta = { source: 'manual', basis: '직접 입력한 값' };
  form.querySelector('.more-nutrients').open = false;
  document.getElementById('food-submit').textContent = '이 끼니에 담기';
  document.getElementById('food-cancel').hidden = true;
  updateFoodPreview();
}

/**
 * 음식 입력칸을 채워서 연다. 4~6단계(재기록·OCR·사진)는 이 함수만 부르면 된다.
 * prefill: { name, nutrients(1배 기준), multiplier, source, basis }
 */
function openFoodEditor(prefill = {}) {
  const form = foodForm();
  resetFoodForm();
  form.foodName.value = prefill.name || '';
  const nutrients = prefill.nutrients || {};
  let hasOptional = false;
  for (const f of NUTRIENT_FIELDS) {
    const v = nutrients[f.key];
    form[`n-${f.key}`].value = v === null || v === undefined ? '' : v;
    if (f.key !== 'calories' && form[`n-${f.key}`].value !== '') hasOptional = true;
  }
  // 채워진 선택 영양성분이 있으면 접힌 칸을 펼쳐서 확인할 수 있게
  form.querySelector('.more-nutrients').open = hasOptional;
  setAmount(prefill.multiplier || 1);
  foodMeta = { source: prefill.source || 'manual', basis: prefill.basis || '직접 입력한 값' };
  updateFoodPreview();
}

function updateFoodPreview() {
  const form = foodForm();
  form.multiplier.disabled = !form.querySelector('input[name="amount"][value="custom"]').checked;

  const { errors, base, multiplier } = readFoodForm();
  const preview = document.getElementById('food-preview');
  preview.textContent =
    base.calories !== null && multiplierOk(multiplier)
      ? `먹은 양 기준 약 ${formatNumber(roundTo(base.calories * multiplier, 0))} kcal`
      : '';
  document.getElementById('hint-multiplier').textContent = errors.includes('multiplier')
    ? `${MULTIPLIER_LIMITS.min}~${MULTIPLIER_LIMITS.max}배 사이로 입력해 주세요.`
    : '';
  document.getElementById('food-submit').disabled = errors.length > 0;
  updateMealSaveState();
}

// 입력칸의 음식을 장바구니에 담거나(새 음식) 바꾼다(고치는 중인 음식)
function commitFoodForm() {
  const { item, errors } = readFoodForm();
  if (errors.length) return false;
  const i = draft.items.findIndex((it) => it.id === item.id);
  if (i >= 0) draft.items[i] = item;
  else draft.items.push(item);
  resetFoodForm();
  renderBasket();
  return true;
}

function startEditItem(id) {
  const item = draft.items.find((it) => it.id === id);
  if (!item) return;
  openFoodEditor({
    name: item.name,
    nutrients: unscaleNutrients(item.nutrients, item.multiplier),
    multiplier: item.multiplier,
    source: item.source,
    basis: item.basis,
  });
  editingItemId = id;
  document.getElementById('food-submit').textContent = '이 음식 고치기';
  document.getElementById('food-cancel').hidden = false;
  updateFoodPreview();
  foodForm().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeItem(id) {
  draft.items = draft.items.filter((it) => it.id !== id);
  if (editingItemId === id) resetFoodForm();
  renderBasket();
}

// ---------- 담긴 음식 + 끼니 합계 ----------

function renderBasket() {
  const items = draft.items;
  const { totals, missing } = sumItems(items);
  document.getElementById('basket-count').textContent = items.length ? `(${items.length})` : '';
  document.getElementById('basket-total').textContent = items.length ? `${formatNumber(totals.calories)} kcal` : '';
  document.getElementById('basket-empty').hidden = items.length > 0;

  document.getElementById('basket-list').innerHTML = items
    .map(
      (it) => `
      <li class="basket-item${it.id === editingItemId ? ' editing' : ''}">
        <span class="basket-name">${escapeHtml(it.name)}${it.multiplier !== 1 ? ` <small>${amountLabel(it.multiplier)}</small>` : ''}</span>
        <span class="basket-kcal">${formatNumber(it.nutrients.calories)} kcal</span>
        <span class="basket-actions">
          <button type="button" class="link-btn" data-action="edit-item" data-id="${it.id}">수정</button>
          <button type="button" class="link-btn danger" data-action="remove-item" data-id="${it.id}">빼기</button>
        </span>
      </li>`
    )
    .join('');

  // 끼니 합계는 오늘 화면 주요 영양소와 같은 3개 (+열량은 제목 오른쪽)
  const parts = ['protein', 'sugars', 'sodium'].map((key) => {
    const f = NUTRIENT_FIELDS.find((n) => n.key === key);
    if (totals[key] === null) return `${f.label} –`; // 아는 값이 없음
    return `${f.label} ${formatNumber(totals[key])} ${f.unit}${missing[key] ? '*' : ''}`;
  });
  // '*'는 일부만 비었을 때만 (전부 비면 이미 '–')
  const anyMissing = ['calories', 'protein', 'sugars', 'sodium'].some((k) => missing[k] && totals[k] !== null);
  document.getElementById('basket-summary').textContent = items.length
    ? `끼니 합계 · ${parts.join(' · ')}${anyMissing ? ' (* 일부 값 없음)' : ''}`
    : '';
  updateMealSaveState();
}

// 저장 버튼 상태: 담긴 음식이 있거나, 입력칸에 완성된 음식이 있으면 저장 가능
function updateMealSaveState() {
  if (!draft) return;
  const info = readMealInfo();
  const foodEmpty = foodFormIsEmpty();
  const foodValid = readFoodForm().errors.length === 0;
  let hint = '';
  if (!foodEmpty && !foodValid && draft.items.length > 0) {
    hint = '입력 중인 음식을 마저 채우거나 비워 주세요.';
  } else if (!info.meal) {
    hint = '식사 종류를 골라 주세요.';
  }
  const blocked = !foodEmpty && !foodValid;
  const hasFood = draft.items.length > 0 || (!foodEmpty && foodValid);
  document.getElementById('meal-save').disabled = !(info.meal && info.date && info.time && hasFood && !blocked);
  document.getElementById('hint-meal-save').textContent = hint;
}

function isEntryDirty() {
  if (!draft) return false;
  return JSON.stringify({ ...readMealInfo(), items: draft.items }) !== draftSnapshot || !foodFormIsEmpty();
}

// 화면을 떠나기 전: 저장 안 한 내용이 있으면 확인
function confirmLeaveEntry() {
  return !isEntryDirty() || confirm('저장하지 않고 나갈까요?');
}

function saveMeal() {
  // 입력칸에 완성된 음식이 남아 있으면 같이 담는다 (담기 버튼을 깜빡해도 잃지 않게)
  if (!foodFormIsEmpty() && !commitFoodForm()) return;
  const info = readMealInfo();
  if (!info.meal || draft.items.length === 0) return;

  // 같은 날 같은 식사 종류 끼니가 있으면 새로 만들지 않고 그 끼니에 담을지 묻는다 (CLAUDE.md 9장)
  const existing = findMealByType(info.date, info.meal, draft.id);
  if (existing) {
    const ok = confirm(`${formatMonthDay(info.date)} ${mealLabel(info.meal)} 끼니가 이미 있어요. 그 끼니에 담을까요?`);
    if (!ok) return;
    upsertMeal({ ...existing, items: existing.items.concat(draft.items) });
    if (draft.isEdit) deleteMeal(draft.id);
    draft = null;
    entryCallbacks.onDone(`${mealLabel(info.meal)} 끼니에 담았어요.`);
    return;
  }

  const isEdit = draft.isEdit;
  upsertMeal({ id: draft.id, date: info.date, time: info.time, meal: info.meal, items: draft.items });
  draft = null;
  entryCallbacks.onDone(isEdit ? '끼니를 고쳤어요.' : '끼니를 기록했어요.');
}

// ---------- 화면 열기 ----------

function startDraft(meal, isEdit) {
  draft = { id: meal.id, isEdit, items: meal.items.map((it) => ({ ...it, nutrients: { ...it.nutrients } })) };
  setMealInfo(meal);
  document.getElementById('entry-title').textContent = isEdit ? '끼니 수정' : '기록 추가';
  document.getElementById('meal-delete').hidden = !isEdit;
  resetFoodForm();
  renderBasket();
  draftSnapshot = JSON.stringify({ ...readMealInfo(), items: draft.items });
  showScreen('screen-entry');
}

/** 새 끼니. prefill: { meal?, date?, time? } — 8단계 식사 알림 버튼이 meal만 채워서 부른다 */
function openEntryForm(prefill = {}) {
  const now = new Date();
  startDraft(
    {
      id: newEntryId(),
      meal: prefill.meal || mealByTime(now),
      date: prefill.date || toDateStr(now),
      time: prefill.time || toTimeStr(now),
      items: [],
    },
    false
  );
}

function openMealForEdit(id) {
  const meal = getMeal(id);
  if (meal) startDraft(meal, true);
}

function initEntryScreen(callbacks) {
  entryCallbacks = callbacks;
  renderNutrientInputs();
  renderMealOptions();

  const form = foodForm();
  form.addEventListener('input', updateFoodPreview);
  form.addEventListener('change', updateFoodPreview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commitFoodForm();
  });
  document.getElementById('food-cancel').addEventListener('click', () => {
    resetFoodForm();
    renderBasket();
  });

  ['meal-options', 'meal-date', 'meal-time'].forEach((id) => {
    document.getElementById(id).addEventListener('change', updateMealSaveState);
  });

  document.getElementById('basket-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-item') {
      startEditItem(btn.dataset.id);
      renderBasket();
    } else if (btn.dataset.action === 'remove-item') {
      removeItem(btn.dataset.id);
    }
  });

  document.getElementById('meal-save').addEventListener('click', saveMeal);

  document.getElementById('meal-delete').addEventListener('click', () => {
    if (!confirm('이 끼니를 지울까요? 담긴 음식도 함께 지워져요.')) return;
    deleteMeal(draft.id);
    draft = null;
    entryCallbacks.onDone('끼니를 지웠어요.');
  });

  document.getElementById('entry-back').addEventListener('click', () => {
    if (!confirmLeaveEntry()) return;
    draft = null;
    entryCallbacks.onDone(null);
  });
}
