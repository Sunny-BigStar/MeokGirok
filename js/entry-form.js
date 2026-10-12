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
  updateAddRow();
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
  closeRecentPanel(); // 입력칸과 최근 음식 목록은 한 번에 하나만
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
  renderNameChips();
  updateAddRow();
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
    existing.touched = true;
    existing.name = name;
    existing.nameGuessed = false; // 사용자가 입력칸에서 확인한 이름
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

// 성분표면 '전체' = 총 내용량 ÷ 표 기준량 (예: 100g당 · 총 120g → 1.2배). 모르면 1배
function fullMultiplier(item) {
  if (item.totalAmount && item.basisAmount) return roundTo(item.totalAmount / item.basisAmount, 3);
  return 1;
}

function amountMode(item) {
  if (item.customOpen) return 'custom';
  const full = fullMultiplier(item);
  if (item.multiplier === full) return 'full';
  if (item.multiplier === roundTo(full / 2, 3)) return 'half';
  return 'custom';
}

// g으로 직접 입력은 표 기준량(g)을 알 때만 가능 (g ÷ 기준량 = 배수)
function canUseGrams(item) {
  return Boolean(item.basisAmount);
}

// 이름이나 열량이 비어 있으면 저장 전에 채워야 한다 (성분표에 제품명이 없을 때 등)
function needsInput(item) {
  return !item.name || item.nutrients.calories === null;
}

function kcalText(v) {
  return v === null ? '열량 입력 필요' : `${formatNumber(v)} kcal`;
}

function customAmountHtml(it) {
  const unit = it.customUnit === 'g' && canUseGrams(it) ? 'g' : 'x';
  const value = it.amountError ? '' : unit === 'g' ? Math.round(it.multiplier * it.basisAmount) : it.multiplier;
  const unitBtn = (u, label) =>
    `<button type="button" class="unit-btn${unit === u ? ' on' : ''}" data-action="unit" data-unit="${u}" aria-pressed="${unit === u}">${label}</button>`;
  const units = canUseGrams(it) ? `<span class="unit-toggle">${unitBtn('x', '배')}${unitBtn('g', 'g')}</span>` : '<span>배</span>';
  return `<div class="custom-amount"><input type="number" inputmode="decimal" min="0" step="any" value="${value}" data-action="custom-amount" aria-label="${unit === 'g' ? '먹은 양(g)' : '배수'}" />${units}</div>`;
}

function basketRowHtml(it) {
  const mode = amountMode(it);
  const src = INPUT_SOURCES[it.source] || INPUT_SOURCES.manual;
  const btn = (m, label) =>
    `<button type="button" class="amount-btn${mode === m ? ' on' : ''}" data-action="amount" data-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  const name = !it.name ? '<em>이름을 입력해 주세요</em>' : it.nameGuessed ? `${escapeHtml(it.name)}? <small class="guess">(추정)</small>` : escapeHtml(it.name);
  // 사진에서 온 음식은 어떤 기준의 값인지 함께 보여준다 (100g당 · 예상 등)
  const basis = it.source === 'label' || it.source === 'photo' ? `<small class="basket-basis">${escapeHtml(it.basis)}</small>` : '';
  const classes = ['basket-item', it.id === editingItemId ? 'editing' : '', needsInput(it) ? 'needs-input' : '', it.amountError ? 'invalid' : ''].filter(Boolean).join(' ');
  return `
    <li class="${classes}" data-id="${escapeHtml(it.id)}">
      <span class="basket-icon" title="${src.label}">${iconSvg(src.icon)}</span>
      <button type="button" class="basket-name" data-action="edit-item" title="눌러서 고치기">
        <strong>${name}</strong>
        <span class="basket-kcal">${kcalText(it.nutrients.calories)}</span>
        ${basis}
      </button>
      <span class="amount-group" role="group" aria-label="먹은 양">
        ${btn('full', '전체')}${btn('half', '1/2')}${btn('custom', '직접 입력')}
      </span>
      <button type="button" class="icon-btn remove-btn" data-action="remove-item" aria-label="빼기">${iconSvg('close')}</button>
      ${mode === 'custom' ? customAmountHtml(it) : ''}
    </li>`;
}

function renderBasket() {
  const items = draft.items;
  document.getElementById('basket-list').innerHTML = items.map(basketRowHtml).join('');
  document.getElementById('basket-empty').hidden = items.length > 0;
  updateBasketTotals();
  renderFavSuggest(); // 담긴 세트는 '담김'으로
}

// 합계만 다시 그린다 (직접 입력 칸에 타이핑하는 중에 목록 전체를 다시 그리면 커서가 사라지므로)
function updateBasketTotals() {
  const items = draft.items;
  const { totals, missing } = sumItems(items);
  document.getElementById('basket-count').textContent = items.length ? `(${items.length})` : '';
  document.getElementById('basket-total').textContent = items.length && totals.calories !== null ? `${formatNumber(totals.calories)} kcal` : '';
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
  // '전체'가 허용 범위를 넘는 큰 용량이면 직접 입력으로 고치게 한다
  item.amountError = !multiplierOk(m);
  if (item.amountError) item.customOpen = true;
}

function focusCustomInput(id) {
  const input = document.querySelector(`.basket-item[data-id="${id}"] [data-action="custom-amount"]`);
  if (input) {
    input.focus();
    input.select();
  }
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
    item.touched = true; // 사용자가 고른 양은 자동 교체로 덮어쓰지 않는다
    const mode = btn.dataset.mode;
    const full = fullMultiplier(item);
    item.customOpen = mode === 'custom';
    if (mode === 'full') setItemMultiplier(item, full);
    if (mode === 'half') setItemMultiplier(item, roundTo(full / 2, 3));
    renderBasket();
    if (mode === 'custom') focusCustomInput(id);
  } else if (action === 'unit') {
    item.customUnit = btn.dataset.unit;
    renderBasket();
    focusCustomInput(id);
  }
}

// 직접 입력(배 또는 g): 타이핑할 때마다 그 줄 kcal과 합계만 갱신
function onCustomAmountInput(e) {
  if (e.target.dataset.action !== 'custom-amount') return;
  const row = e.target.closest('.basket-item');
  const item = draft.items.find((it) => it.id === row.dataset.id);
  const raw = Number(e.target.value);
  const grams = item.customUnit === 'g' && canUseGrams(item);
  const m = grams ? roundTo(raw / item.basisAmount, 3) : raw;
  item.touched = true;
  if (e.target.value.trim() !== '' && raw > 0 && multiplierOk(m)) {
    setItemMultiplier(item, m);
    item.customOpen = true;
  } else {
    item.amountError = true;
  }
  row.classList.toggle('invalid', item.amountError);
  row.querySelector('.basket-kcal').textContent = kcalText(item.nutrients.calories);
  updateBasketTotals();
}

// ---------- 최근 먹은 음식 다시 담기 (5단계) ----------

function recentOpen() {
  return !document.getElementById('recent-panel').hidden;
}

// '+ 직접 입력 / 최근 음식' 버튼 줄은 입력칸·목록이 모두 닫혀 있을 때만
function updateAddRow() {
  document.getElementById('add-food-row').hidden = editorOpen() || recentOpen();
}

function inBasket(name) {
  return draft.items.some((it) => it.name && nameKey(it.name) === nameKey(name));
}

function renderRecentList() {
  const foods = getRecentFoods();
  document.getElementById('recent-empty').hidden = foods.length > 0;
  document.getElementById('recent-list').innerHTML = foods
    .map((f, i) => {
      const meta = f.count > 1 ? `${f.count}번 먹었어요` : relativeDay(f.lastDate);
      const amount = f.item.multiplier !== 1 ? ` · ${amountLabel(f.item.multiplier)}` : '';
      const added = inBasket(f.name);
      return `
      <li class="recent-item">
        <span class="recent-text">
          <strong>${escapeHtml(f.name)}</strong>
          <small>${formatNumber(f.item.nutrients.calories)} kcal${amount} · ${meta}</small>
        </span>
        <button type="button" class="btn-small${added ? ' done' : ''}" data-recent="${i}" ${added ? 'disabled' : ''}>${added ? '담김 ✓' : '담기'}</button>
      </li>`;
    })
    .join('');
}

function openRecentPanel() {
  // 쓰던 내용이 없을 때만 입력칸을 닫는다 (입력하던 걸 잃지 않게)
  if (editorOpen() && foodFormIsEmpty() && !editingItemId) closeFoodEditor();
  document.getElementById('recent-panel').hidden = false;
  renderRecentList();
  updateAddRow();
}

function closeRecentPanel() {
  document.getElementById('recent-panel').hidden = true;
  updateAddRow();
}

/**
 * 고른 음식을 지금 끼니에 담는다 — 마지막으로 먹었을 때의 값·양 그대로, 출처는 'relog'.
 * 저장된 값은 먹은 양이 반영된 값이라 1배 값(base)을 되돌려 두어야 줄에서 양을 바꿀 수 있다.
 * 바로 저장하지 않는다: 담긴 목록이 확인 화면이고 저장은 '오늘 식사에 추가하기' (6장)
 */
function addRecentFood(food) {
  if (!draft || inBasket(food.name)) return;
  const last = food.item;
  draft.items.push({
    id: newEntryId(),
    name: last.name,
    source: 'relog',
    basis: last.basis,
    multiplier: last.multiplier,
    base: unscaleNutrients(last.nutrients, last.multiplier),
    nutrients: { ...last.nutrients },
    amountError: false,
  });
  renderBasket();
  renderRecentList(); // 방금 담은 음식은 '담김'으로
}
// ---------- 이름 빠른 선택 칩 (6장: 성분표에 제품명이 없을 때 한 번 터치로) ----------

// 고정 4개 + 최근 먹은 음식 이름 (고정 이름과 겹치면 빼고)
function quickNames() {
  const names = QUICK_NAMES.slice();
  for (const f of getRecentFoods()) {
    if (names.length >= QUICK_NAMES.length + QUICK_NAMES_RECENT) break;
    if (!names.some((n) => nameKey(n) === nameKey(f.name))) names.push(f.name);
  }
  return names;
}

/** 칩 버튼들. attrs: 각 버튼에 붙일 data 속성 문자열 (어디서 눌렸는지 구분) */
function nameChipsHtml(attrs, current = '') {
  return quickNames()
    .map((n) => {
      const on = current && nameKey(current) === nameKey(n);
      return `<button type="button" class="name-chip${on ? ' on' : ''}" ${attrs} data-quick-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`;
    })
    .join('');
}

// 입력칸의 음식명 아래 칩
function renderNameChips() {
  document.getElementById('name-chips').innerHTML = nameChipsHtml('data-chip="editor"', foodForm().foodName.value);
}

// 분석 카드의 칩으로 이름 바꾸기 — 그 사진에서 담긴 음식을 찾아 이름만 바꾼다 (값은 그대로)
function renameItemFromPhoto(photoId, index, name) {
  if (!draft) return false;
  const item = draft.items.find((it) => it.photoId === photoId && it.photoIndex === index);
  if (!item) return false;
  item.name = name;
  item.nameGuessed = false;
  if (editingItemId === item.id) foodForm().foodName.value = name;
  renderBasket();
  return true;
}
// ---------- 사진 분석 결과 담기 (photo.js가 부른다) ----------

// 저장되는 basis 문구 — 사람이 읽는 문장으로 (CLAUDE.md 9장 basis)
function basisText(a) {
  const total = a.totalAmount ? ` (총 ${formatNumber(a.totalAmount)}g)` : '';
  if (a.basisType === 'per_100g') return `100g당${total}`;
  if (a.basisType === 'per_serving') return `1회 제공량${a.basisAmount ? `(${formatNumber(a.basisAmount)}g)` : ''}당${total}`;
  if (a.basisType === 'total') return `총 내용량${a.totalAmount ? `(${formatNumber(a.totalAmount)}g)` : ''}당`;
  return '예상 · 일반적인 1인분 기준';
}


/**
 * 분석된 음식을 끼니에 자동으로 담는다 (양 기본값 '전체', 6장 4번).
 * 같은 이름이 이미 담겨 있으면 중복으로 담지 않는다 — 성분표와 음식 사진을 둘 다 찍은 경우 대비.
 * 단, 성분표 값이 사진 추정보다 정확하므로, 아직 사용자가 손대지 않은 '사진 추정' 음식은 성분표 값으로 바꾼다.
 * (사진 여러 장은 동시에 분석되어 어느 쪽 답이 먼저 올지 모르기 때문)
 * 반환: { results: 항목마다 'added' | 'duplicate' | 'replaced', replaced: [{ photoId, index }] (바뀐 쪽 카드 표시용) }
 */
function addAnalyzedItems(photoId, kind, analyzed) {
  if (!draft) return { results: [], replaced: [] };
  const replaced = [];
  const results = analyzed.map((a, index) => {
    const fields = {
      name: a.name,
      source: kind === 'label' ? 'label' : 'photo',
      basis: basisText(a),
      basisAmount: a.basisAmount,
      totalAmount: a.totalAmount,
      photoId,
      photoIndex: index,
      nameGuessed: Boolean(a.nameGuessed),
      base: { ...a.nutrients },
      customOpen: false,
      customUnit: undefined,
      touched: false,
    };
    const existing = a.name ? draft.items.find((it) => it.name && nameKey(it.name) === nameKey(a.name)) : null;
    if (existing) {
      if (kind === 'label' && existing.source === 'photo' && !existing.touched) {
        replaced.push({ photoId: existing.photoId, index: existing.photoIndex });
        Object.assign(existing, fields);
        setItemMultiplier(existing, fullMultiplier(existing));
        return 'replaced';
      }
      return 'duplicate';
    }
    const item = { id: newEntryId(), ...fields };
    setItemMultiplier(item, fullMultiplier(item));
    draft.items.push(item);
    return 'added';
  });
  renderBasket();
  return { results, replaced };
}
// 같은 카드에서 재분석하면 그 사진으로 담았던 음식은 빼고 다시 담는다
function removeItemsFromPhoto(photoId) {
  if (!draft) return;
  draft.items = draft.items.filter((it) => it.photoId !== photoId);
  if (editingItemId && !draft.items.some((it) => it.id === editingItemId)) closeFoodEditor();
  renderBasket();
}
// ---------- 저장 ----------

// 저장 버튼 상태: 담긴 음식이 있거나, 입력칸에 완성된 음식이 있으면 저장 가능
function updateSaveState() {
  if (!draft) return;
  const info = readMealInfo();
  const pendingEmpty = !editorOpen() || foodFormIsEmpty();
  const pendingValid = !pendingEmpty && readFoodForm().errors.length === 0;
  const amountBad = draft.items.some((it) => it.amountError);
  const incomplete = draft.items.some(needsInput);
  const analyzing = typeof isAnalyzing === 'function' && isAnalyzing();
  const broken = entriesBroken(); // 저장된 기록을 읽지 못하면 덮어쓰지 않게 저장 막기
  let hint = '';
  if (broken) hint = '저장된 기록을 읽지 못해 지금은 저장할 수 없어요. 내 정보에서 백업 가져오기나 전체 초기화를 해 주세요.';
  else if (analyzing) hint = '사진을 분석하는 중이에요. 잠시만 기다려 주세요.';
  else if (incomplete) hint = '이름이나 열량이 비어 있는 음식이 있어요. 빨간 줄을 눌러 채워 주세요.';
  else if (amountBad) hint = `먹은 양은 ${MULTIPLIER_LIMITS.min}~${MULTIPLIER_LIMITS.max}배 사이로 입력해 주세요.`;
  else if (!pendingEmpty && !pendingValid && draft.items.length > 0) hint = '입력 중인 음식을 마저 채우거나 비워 주세요.';
  else if (!info.meal) hint = '식사 종류를 골라 주세요.';
  const blocked = broken || analyzing || incomplete || amountBad || (!pendingEmpty && !pendingValid);
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
    // Esc 키 등으로 닫힌 경우만 취소로 본다.
    // 이전 창을 닫을 때 생긴 close 이벤트가 늦게 도착하면 지금 열린 창을 '취소'로 닫아 버리므로,
    // 이벤트가 왔을 때 창이 아직 열려 있으면(= 이전 창의 늦은 이벤트) 무시한다
    const onClose = () => {
      if (dialog.open) return;
      done('cancel');
    };
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
      recordCallbacks.onDone(`${mealLabel(info.meal)} 끼니에 합쳤어요.`, { saved: true, date: info.date });
      return;
    }
    // 'separate'면 아래에서 따로 저장
  }

  const isEdit = draft.isEdit;
  upsertMeal({ id: draft.id, date: info.date, time: info.time, meal: info.meal, items });
  draft = null;
  recordCallbacks.onDone(isEdit ? '끼니를 고쳤어요.' : '끼니를 기록했어요.', { saved: true, date: info.date });
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
  closeRecentPanel();
  resetPhotos(); // 이전 끼니의 분석 카드·미리보기 정리 (사진은 저장하지 않음)
  renderBasket();
  // 메인 입력은 사진 → 업로드 박스를 먼저 보여주고 직접 입력은 '+ 음식 추가'로 (6장)
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
  form.addEventListener('input', (e) => {
    updateFoodState();
    if (e.target.name === 'foodName') renderNameChips(); // 입력한 이름과 같은 칩 강조
  });
  document.getElementById('name-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-quick-name]');
    if (!chip) return;
    form.foodName.value = chip.dataset.quickName;
    renderNameChips();
    updateFoodState();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commitFoodForm();
  });
  document.getElementById('food-cancel').addEventListener('click', () => {
    closeFoodEditor();
    renderBasket();
  });
  document.getElementById('add-recent').addEventListener('click', openRecentPanel);
  document.getElementById('recent-close').addEventListener('click', closeRecentPanel);
  document.getElementById('recent-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-recent]');
    if (!btn) return;
    const food = getRecentFoods()[Number(btn.dataset.recent)];
    if (food) addRecentFood(food);
  });
  document.getElementById('add-food').addEventListener('click', () => {
    openFoodEditor();
    foodForm().foodName.focus();
  });

  ['meal-options', 'meal-date', 'meal-time'].forEach((id) => {
    document.getElementById(id).addEventListener('change', updateSaveState);
  });
  // 식사 종류를 바꾸면 그 끼니의 자주 먹는 세트를 보여준다
  document.getElementById('meal-options').addEventListener('change', renderFavSuggest);
  initFavSuggest();

  const list = document.getElementById('basket-list');
  list.addEventListener('click', onBasketClick);
  list.addEventListener('input', onCustomAmountInput);

  document.getElementById('meal-save').addEventListener('click', saveMeal);

  document.getElementById('meal-delete').addEventListener('click', () => {
    if (!confirm('이 끼니를 지울까요? 담긴 음식도 함께 지워져요.')) return;
    deleteMeal(draft.id);
    const date = draft.original && draft.original.date; // 지운 끼니의 날짜 화면으로
    draft = null;
    recordCallbacks.onDone('끼니를 지웠어요.', { date });
  });

  document.getElementById('record-back').addEventListener('click', () => {
    if (!confirmLeaveRecord()) return;
    draft = null;
    recordCallbacks.onDone(null);
  });
}
