// 기록하기 화면 — 끼니(식사 종류·날짜·시간)에 음식을 장바구니처럼 담고, 줄마다 먹은 양을 고른 뒤 저장
// 모든 입력 방식(직접·재기록·사진)은 음식을 담기만 하고, 저장은 사용자가 버튼을 눌러야 된다 (CLAUDE.md 6장)

/**
 * draft.items의 음식 하나:
 *   { id, name, source, basis, multiplier, base(1배 값), nutrients(먹은 양 반영 값), amountError }
 * base를 따로 들고 있어야 줄에서 양을 바꿀 때 다시 계산할 수 있다. 저장할 땐 base를 뺀다.
 */
let draft = null; // { id, isEdit, original: { meal, date } | null, items }
let draftSnapshot = ''; // 연 직후 상태 — 나갈 때 바뀐 게 있는지 비교
let editingItemId = null; // 입력칸에서 고치는 중인 음식 (없으면 새로 담기)
let foodMeta = { source: 'manual', basis: '직접 입력한 값' }; // 입력칸에 채워진 음식의 출처
let recordCallbacks = null; // { onDone(message) }

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
    (m) => `<label><input type="radio" name="meal" value="${m.key}" /><span>${iconSvg(m.icon)}${m.label}</span></label>`
  ).join('');
}

// 빈 칸은 0이 아니라 null (모르는 값을 0으로 추측하지 않음)
function readOptionalNumber(input) {
  if (input.value.trim() === '') return null;
  const n = Number(input.value);
  return Number.isFinite(n) ? n : NaN;
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

// ---------- 음식 입력칸 (1배 기준 값만 받는다. 먹은 양은 담긴 줄에서 고름) ----------

function editorOpen() {
  return !foodForm().hidden;
}

function foodFormIsEmpty() {
  const form = foodForm();
  return form.foodName.value.trim() === '' && NUTRIENT_FIELDS.every((f) => form[`n-${f.key}`].value.trim() === '');
}

// 입력칸 → { name, base, errors }
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
  return { name, base, errors };
}

function closeFoodEditor() {
  const form = foodForm();
  form.reset();
  form.hidden = true;
  editingItemId = null;
  foodMeta = { source: 'manual', basis: '직접 입력한 값' };
  form.querySelector('.more-nutrients').open = false;
  document.getElementById('food-submit').textContent = '이 끼니에 담기';
  document.getElementById('add-food').hidden = false;
  updateFoodState();
}

/**
 * 음식 입력칸을 열고 값을 채운다. 4·5단계(사진·최근 음식)도 이 함수로 확인 화면을 연다.
 * prefill: { name, nutrients(1배 기준), source, basis }
 */
function openFoodEditor(prefill = {}) {
  const form = foodForm();
  form.reset();
  form.hidden = false;
  editingItemId = null;
  document.getElementById('food-submit').textContent = '이 끼니에 담기';
  document.getElementById('add-food').hidden = true;
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
  foodMeta = { source: prefill.source || 'manual', basis: prefill.basis || '직접 입력한 값' };
  updateFoodState();
}

function updateFoodState() {
  const { errors } = readFoodForm();
  document.getElementById('food-submit').disabled = errors.length > 0;
  updateSaveState();
}

// 입력칸의 음식을 담거나(새 음식) 바꾼다(고치는 중인 음식)
function commitFoodForm() {
  const { name, base, errors } = readFoodForm();
  if (errors.length) return false;
  const existing = draft.items.find((it) => it.id === editingItemId);
  if (existing) {
    existing.name = name;
    existing.base = base;
    existing.nutrients = scaleNutrients(base, existing.multiplier);
  } else {
    draft.items.push({ id: newEntryId(), name, ...foodMeta, multiplier: 1, base, nutrients: scaleNutrients(base, 1), amountError: false });
  }
  closeFoodEditor();
  renderBasket();
  return true;
}

function startEditItem(id) {
  const item = draft.items.find((it) => it.id === id);
  if (!item) return;
  openFoodEditor({ name: item.name, nutrients: item.base, source: item.source, basis: item.basis });
  editingItemId = id;
  document.getElementById('food-submit').textContent = '이 음식 고치기';
  renderBasket();
  foodForm().scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- 담긴 음식: 줄마다 먹은 양 [전체 | 1/2 | 직접 입력] + ✕ ----------

function amountMode(item) {
  if (item.customOpen) return 'custom';
  if (item.multiplier === 1) return 'full';
  if (item.multiplier === 0.5) return 'half';
  return 'custom';
}

function basketRowHtml(it) {
  const mode = amountMode(it);
  const src = INPUT_SOURCES[it.source] || INPUT_SOURCES.manual;
  const btn = (m, label) =>
    `<button type="button" class="amount-btn${mode === m ? ' on' : ''}" data-action="amount" data-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  return `
    <li class="basket-item${it.id === editingItemId ? ' editing' : ''}" data-id="${it.id}">
      <span class="basket-icon" title="${src.label}">${iconSvg(src.icon)}</span>
      <button type="button" class="basket-name" data-action="edit-item" title="눌러서 고치기">
        <strong>${escapeHtml(it.name)}</strong>
        <span class="basket-kcal">${formatNumber(it.nutrients.calories)} kcal</span>
      </button>
      <span class="amount-group" role="group" aria-label="먹은 양">
        ${btn('full', '전체')}${btn('half', '1/2')}${btn('custom', '직접 입력')}
      </span>
      <button type="button" class="icon-btn remove-btn" data-action="remove-item" aria-label="빼기">${iconSvg('close')}</button>
      ${
        mode === 'custom'
          ? `<label class="custom-amount"><input type="number" inputmode="decimal" min="0.1" max="10" step="any" value="${it.amountError ? '' : it.multiplier}" data-action="custom-amount" aria-label="배수" /><span>배</span></label>`
          : ''
      }
    </li>`;
}

function renderBasket() {
  const items = draft.items;
  document.getElementById('basket-list').innerHTML = items.map(basketRowHtml).join('');
  document.getElementById('basket-empty').hidden = items.length > 0;
  updateBasketTotals();
}

// 합계만 다시 그린다 (직접 입력 칸에 타이핑하는 중에 목록 전체를 다시 그리면 커서가 사라지므로)
function updateBasketTotals() {
  const items = draft.items;
  const { totals, missing } = sumItems(items);
  document.getElementById('basket-count').textContent = items.length ? `(${items.length})` : '';
  document.getElementById('basket-total').textContent = items.length ? `${formatNumber(totals.calories)} kcal` : '';
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
  updateSaveState();
}

function setItemMultiplier(item, m) {
  item.multiplier = m;
  item.nutrients = scaleNutrients(item.base, m);
  item.amountError = false;
}

function onBasketClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.dataset.action === 'custom-amount') return;
  const id = btn.closest('.basket-item').dataset.id;
  const item = draft.items.find((it) => it.id === id);
  const action = btn.dataset.action;
  if (action === 'edit-item') {
    startEditItem(id);
  } else if (action === 'remove-item') {
    draft.items = draft.items.filter((it) => it.id !== id);
    if (editingItemId === id) closeFoodEditor();
    renderBasket();
  } else if (action === 'amount') {
    const mode = btn.dataset.mode;
    item.customOpen = mode === 'custom';
    if (mode === 'full') setItemMultiplier(item, 1);
    if (mode === 'half') setItemMultiplier(item, 0.5);
    renderBasket();
    if (mode === 'custom') {
      const input = document.querySelector(`.basket-item[data-id="${id}"] [data-action="custom-amount"]`);
      input.focus();
      input.select();
    }
  }
}

// 직접 입력 배수: 타이핑할 때마다 그 줄 kcal과 합계만 갱신
function onCustomAmountInput(e) {
  if (e.target.dataset.action !== 'custom-amount') return;
  const row = e.target.closest('.basket-item');
  const item = draft.items.find((it) => it.id === row.dataset.id);
  const m = Number(e.target.value);
  if (e.target.value.trim() !== '' && multiplierOk(m)) {
    setItemMultiplier(item, m);
    item.customOpen = true;
  } else {
    item.amountError = true;
  }
  row.classList.toggle('invalid', item.amountError);
  row.querySelector('.basket-kcal').textContent = `${formatNumber(item.nutrients.calories)} kcal`;
  updateBasketTotals();
}

// ---------- 저장 ----------

// 저장 버튼 상태: 담긴 음식이 있거나, 입력칸에 완성된 음식이 있으면 저장 가능
function updateSaveState() {
  if (!draft) return;
  const info = readMealInfo();
  const pendingEmpty = !editorOpen() || foodFormIsEmpty();
  const pendingValid = !pendingEmpty && readFoodForm().errors.length === 0;
  const amountBad = draft.items.some((it) => it.amountError);
  let hint = '';
  if (amountBad) hint = `먹은 양은 ${MULTIPLIER_LIMITS.min}~${MULTIPLIER_LIMITS.max}배 사이로 입력해 주세요.`;
  else if (!pendingEmpty && !pendingValid && draft.items.length > 0) hint = '입력 중인 음식을 마저 채우거나 비워 주세요.';
  else if (!info.meal) hint = '식사 종류를 골라 주세요.';
  const blocked = amountBad || (!pendingEmpty && !pendingValid);
  const hasFood = draft.items.length > 0 || pendingValid;
  document.getElementById('meal-save').disabled = !(info.meal && info.date && info.time && hasFood && !blocked);
  document.getElementById('hint-meal-save').textContent = hint;
}

function draftState() {
  return JSON.stringify({
    ...readMealInfo(),
    items: draft.items.map(({ id, name, multiplier, nutrients }) => ({ id, name, multiplier, nutrients })),
  });
}

function isRecordDirty() {
  if (!draft) return false;
  return draftState() !== draftSnapshot || (editorOpen() && !foodFormIsEmpty());
}

// 화면을 떠나기 전: 저장 안 한 내용이 있으면 확인
function confirmLeaveRecord() {
  return !isRecordDirty() || confirm('저장하지 않고 나갈까요?');
}

// 같은 날 같은 식사 종류 끼니가 있을 때: [합치기] [따로 두기] [취소] (CLAUDE.md 6장 7번)
// confirm()은 버튼이 2개뿐이라 <dialog>로 직접 묻는다.
// 버튼 클릭을 직접 받는다 — close 이벤트에만 기대면 환경에 따라 답을 못 받는 경우가 있었음
function askMerge(text) {
  const dialog = document.getElementById('merge-dialog');
  document.getElementById('merge-text').textContent = text;
  dialog.showModal();
  return new Promise((resolve) => {
    const done = (value) => {
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onClick = (e) => {
      const btn = e.target.closest('button[data-choice]');
      if (btn) done(btn.dataset.choice);
    };
    const onClose = () => done('cancel'); // Esc 키 등으로 닫힌 경우
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', onClose);
  });
}

// 저장할 땐 화면용 필드(base 등)를 빼고 CLAUDE.md 9장 형식만 남긴다
function toSavedItem({ id, name, source, basis, multiplier, nutrients }) {
  return { id, name, source, basis, multiplier, nutrients };
}

async function saveMeal() {
  // 입력칸에 완성된 음식이 남아 있으면 같이 담는다 (담기 버튼을 깜빡해도 잃지 않게)
  if (editorOpen() && !foodFormIsEmpty() && !commitFoodForm()) return;
  updateSaveState();
  if (document.getElementById('meal-save').disabled) return;
  const info = readMealInfo();
  const items = draft.items.map(toSavedItem);

  // 새 끼니이거나, 수정하면서 날짜·식사 종류를 바꿨을 때만 묻는다 (그대로 고치는 건 묻지 않음)
  const moved = !draft.original || draft.original.meal !== info.meal || draft.original.date !== info.date;
  const existing = moved
    ? getMealsByDate(info.date).find((m) => m.meal === info.meal && m.id !== draft.id) || null
    : null;
  if (existing) {
    const choice = await askMerge(`${formatMonthDay(info.date)} ${mealLabel(info.meal)} 끼니가 이미 있어요.`);
    if (choice === 'cancel') return;
    if (choice === 'merge') {
      upsertMeal({ ...existing, items: existing.items.concat(items) });
      if (draft.isEdit) deleteMeal(draft.id);
      draft = null;
      recordCallbacks.onDone(`${mealLabel(info.meal)} 끼니에 합쳤어요.`);
      return;
    }
    // 'separate'면 아래에서 따로 저장
  }

  const isEdit = draft.isEdit;
  upsertMeal({ id: draft.id, date: info.date, time: info.time, meal: info.meal, items });
  draft = null;
  recordCallbacks.onDone(isEdit ? '끼니를 고쳤어요.' : '끼니를 기록했어요.');
}

// ---------- 화면 열기 ----------

function startDraft(meal, isEdit) {
  draft = {
    id: meal.id,
    isEdit,
    original: isEdit ? { meal: meal.meal, date: meal.date } : null,
    // 저장된 값은 먹은 양이 반영된 값 → 줄에서 양을 바꿀 수 있게 1배 값(base)을 되돌려 둔다
    items: meal.items.map((it) => ({
      ...it,
      nutrients: { ...it.nutrients },
      base: unscaleNutrients(it.nutrients, it.multiplier),
      amountError: false,
    })),
  };
  setMealInfo(meal);
  document.getElementById('record-title').textContent = isEdit ? '끼니 수정' : '기록하기';
  document.getElementById('meal-save-label').textContent = isEdit ? '수정 완료' : '오늘 식사에 추가하기';
  document.getElementById('meal-delete').hidden = !isEdit;
  closeFoodEditor();
  renderBasket();
  // 새 끼니는 아직 사진 업로드가 없으니(4단계) 직접 입력칸을 펼친 채 시작
  if (!isEdit) openFoodEditor();
  draftSnapshot = draftState();
  showScreen('screen-record');
}

/** 새 끼니. prefill: { meal?, date?, time? } — 7단계 식사 알림 버튼이 meal만 채워서 부른다 */
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

function initRecordScreen(callbacks) {
  recordCallbacks = callbacks;
  renderNutrientInputs();
  renderMealOptions();

  const form = foodForm();
  form.addEventListener('input', updateFoodState);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commitFoodForm();
  });
  document.getElementById('food-cancel').addEventListener('click', () => {
    closeFoodEditor();
    renderBasket();
  });
  document.getElementById('add-food').addEventListener('click', () => {
    openFoodEditor();
    foodForm().foodName.focus();
  });

  ['meal-options', 'meal-date', 'meal-time'].forEach((id) => {
    document.getElementById(id).addEventListener('change', updateSaveState);
  });

  const list = document.getElementById('basket-list');
  list.addEventListener('click', onBasketClick);
  list.addEventListener('input', onCustomAmountInput);

  document.getElementById('meal-save').addEventListener('click', saveMeal);

  document.getElementById('meal-delete').addEventListener('click', () => {
    if (!confirm('이 끼니를 지울까요? 담긴 음식도 함께 지워져요.')) return;
    deleteMeal(draft.id);
    draft = null;
    recordCallbacks.onDone('끼니를 지웠어요.');
  });

  document.getElementById('record-back').addEventListener('click', () => {
    if (!confirmLeaveRecord()) return;
    draft = null;
    recordCallbacks.onDone(null);
  });
}
