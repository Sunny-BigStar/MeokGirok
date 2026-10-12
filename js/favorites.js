// 자주 먹는 세트 — 매번 같은 조합을 하나씩 입력하지 않도록 (사용자 요청 2026-10-12)
// 기록하기에서 식사 종류를 고르면 그 끼니의 세트를 보여주고, 누르면 담기만 한다 (저장은 사용자가 버튼으로, 6장)

// 처음 쓸 때 넣어 두는 기본 세트 — 사용자가 알려준 평소 조합.
// 값은 편의점 제품의 '일반적인 값'이라 실제 제품과 다를 수 있다 → 예상·참고용으로 표시하고 내 정보에서 고칠 수 있게
const FAVORITE_BASIS = '일반적인 값 · 예상 · 참고용';
const fav = (calories, carbs, sugars, protein, fat, sat_fat, trans_fat, cholesterol, sodium) => ({
  calories, carbs, sugars, protein, fat, sat_fat, trans_fat, cholesterol, sodium,
});
const DEFAULT_FAVORITES = [
  {
    name: '아침 세트',
    meals: ['breakfast'],
    items: [
      { name: '아이스 아메리카노', nutrients: fav(10, 2, 0, 1, 0, 0, 0, 0, 10) },
      { name: '베이글', nutrients: fav(260, 50, 5, 10, 2, 0.5, 0, 0, 430) },
      { name: '크림치즈', nutrients: fav(100, 1, 1, 2, 10, 6, 0.3, 30, 95) },
    ],
  },
  { name: '컵라면', meals: ['lunch', 'dinner'], items: [{ name: '컵라면', nutrients: fav(500, 77, 4, 10, 16, 8, 0, 0, 1790) }] },
  { name: '삼각김밥', meals: ['lunch', 'dinner'], items: [{ name: '삼각김밥', nutrients: fav(220, 38, 3, 5, 5, 1, 0, 10, 480) }] },
  { name: '편의점 김밥', meals: ['lunch', 'dinner'], items: [{ name: '편의점 김밥', nutrients: fav(450, 70, 6, 13, 13, 3, 0, 45, 1050) }] },
  { name: '편의점 도시락', meals: ['lunch', 'dinner'], items: [{ name: '편의점 도시락', nutrients: fav(780, 105, 12, 27, 27, 7, 0.2, 90, 1700) }] },
];

// ---------- 저장 ----------

function saveFavorites(list) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(list));
}

// 저장된 적이 없으면(첫 사용·전체 초기화 후) 기본 세트를 넣는다. 사용자가 다 지운 경우([])는 다시 넣지 않는다
function loadFavorites() {
  const raw = localStorage.getItem(STORAGE_KEYS.favorites);
  if (raw === null) {
    const seeded = DEFAULT_FAVORITES.map((f) => ({
      id: newEntryId(),
      name: f.name,
      meals: f.meals.slice(),
      items: f.items.map((it) => ({ name: it.name, basis: FAVORITE_BASIS, nutrients: { ...it.nutrients } })),
    }));
    saveFavorites(seeded);
    return seeded;
  }
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function favoritesForMeal(mealKey) {
  return loadFavorites().filter((f) => f.meals.includes(mealKey) && f.items.length > 0);
}

function favoriteKcal(f) {
  return f.items.reduce((s, it) => s + (it.nutrients.calories || 0), 0);
}

// ---------- 기록하기: "이걸 드셨나요?" ----------

// 세트의 음식이 모두 이미 담겨 있으면 '담김'
function favoriteInBasket(f) {
  return f.items.every((it) => inBasket(it.name));
}

function renderFavSuggest() {
  const box = document.getElementById('fav-suggest');
  if (!draft) return;
  const meal = readMealInfo().meal;
  const favs = meal ? favoritesForMeal(meal) : [];
  box.hidden = favs.length === 0;
  if (!favs.length) return;
  const sets = favs.filter((f) => f.items.length > 1);
  const singles = favs.filter((f) => f.items.length === 1);
  const btnText = (f) => (favoriteInBasket(f) ? '담김 ✓' : '담기');

  const setHtml = sets
    .map(
      (f) => `
      <div class="fav-set">
        <p class="fav-ask">이걸 드셨나요?</p>
        <div class="fav-set-body">
          <span class="fav-text">
            <strong>${escapeHtml(f.name)}</strong>
            <small>${f.items.map((it) => escapeHtml(it.name)).join(' + ')} · 약 ${formatNumber(favoriteKcal(f))} kcal</small>
          </span>
          <button type="button" class="btn-small${favoriteInBasket(f) ? ' done' : ''}" data-fav="${escapeHtml(f.id)}" ${favoriteInBasket(f) ? 'disabled' : ''}>${btnText(f)}</button>
        </div>
      </div>`
    )
    .join('');
  const singleHtml = singles.length
    ? `<p class="fav-label">자주 먹는 음식 · 누르면 담겨요</p>
       <div class="fav-chips">${singles
         .map(
           (f) =>
             `<button type="button" class="fav-chip${favoriteInBasket(f) ? ' done' : ''}" data-fav="${escapeHtml(f.id)}" ${favoriteInBasket(f) ? 'disabled' : ''}>${escapeHtml(f.name)} <small>${favoriteInBasket(f) ? '담김 ✓' : `${formatNumber(favoriteKcal(f))} kcal`}</small></button>`
         )
         .join('')}</div>`
    : '';
  box.innerHTML = setHtml + singleHtml + `<p class="note">세트 값은 ${FAVORITE_BASIS}이에요. 내 정보에서 고칠 수 있어요.</p>`;
}

// 세트를 담는다: 이미 담긴 음식은 건너뛴다 (중복 방지). 출처는 '최근 음식'(relog) — 다시 기록하는 성격이라서
function addFavoriteSet(f) {
  if (!draft) return 0;
  let added = 0;
  for (const it of f.items) {
    if (inBasket(it.name)) continue;
    const base = { ...it.nutrients };
    draft.items.push({ id: newEntryId(), name: it.name, source: 'relog', basis: it.basis || FAVORITE_BASIS, multiplier: 1, base, nutrients: scaleNutrients(base, 1), amountError: false });
    added++;
  }
  renderBasket();
  return added;
}

function initFavSuggest() {
  document.getElementById('fav-suggest').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn || btn.disabled) return;
    const f = loadFavorites().find((x) => x.id === btn.dataset.fav);
    if (f) addFavoriteSet(f);
  });
}

// ---------- 내 정보: 자주 먹는 세트 관리 ----------

let favEditingId = null; // 고치는 중인 세트 (null이면 새로 만들기)

function renderFavManager() {
  const list = loadFavorites();
  document.getElementById('fav-empty').hidden = list.length > 0;
  document.getElementById('fav-list').innerHTML = list
    .map(
      (f) => `
      <li class="fav-row" data-id="${escapeHtml(f.id)}">
        <span class="fav-text">
          <strong>${escapeHtml(f.name)}</strong> <small class="fav-meals">${f.meals.map(mealLabel).join('·')}</small>
          <small>${f.items.map((it) => escapeHtml(it.name)).join(' + ')} · 약 ${formatNumber(favoriteKcal(f))} kcal</small>
        </span>
        <span class="fav-row-actions">
          <button type="button" class="link-btn" data-fav-action="edit">수정</button>
          <button type="button" class="link-btn danger" data-fav-action="delete">삭제</button>
        </span>
      </li>`
    )
    .join('');
}

// 세트 안 음식 한 줄: 이름·열량(필수) + 나머지 영양성분(선택, 접힘)
function favItemRowHtml(it = { name: '', nutrients: {} }) {
  const v = (k) => (it.nutrients[k] === null || it.nutrients[k] === undefined ? '' : it.nutrients[k]);
  const optional = NUTRIENT_FIELDS.filter((f) => f.key !== 'calories')
    .map(
      (f) => `
      <label class="mini-field"><span>${f.label}</span>
        <span class="input-unit"><input type="number" inputmode="decimal" min="0" step="any" data-key="${f.key}" value="${v(f.key)}" /><span>${f.unit}</span></span>
      </label>`
    )
    .join('');
  return `
    <li class="fav-item">
      <div class="fav-item-main">
        <input type="text" maxlength="40" placeholder="음식명" data-key="name" value="${escapeHtml(it.name)}" aria-label="음식명" />
        <span class="input-unit"><input type="number" inputmode="decimal" min="0" step="any" placeholder="열량" data-key="calories" value="${v('calories')}" aria-label="열량" /><span>kcal</span></span>
        <button type="button" class="icon-btn remove-btn" data-fav-item="remove" aria-label="이 음식 빼기">${iconSvg('close')}</button>
      </div>
      <details class="more-nutrients"><summary>나머지 영양성분 <small class="optional">(선택)</small></summary><div class="nutrient-grid">${optional}</div></details>
    </li>`;
}

function openFavEditor(f) {
  favEditingId = f ? f.id : null;
  const form = document.getElementById('fav-form');
  form.hidden = false;
  document.getElementById('fav-add').hidden = true;
  document.getElementById('fav-form-title').textContent = f ? '세트 고치기' : '새 세트 만들기';
  form.favName.value = f ? f.name : '';
  form.querySelectorAll('input[name="favMeal"]').forEach((cb) => {
    cb.checked = f ? f.meals.includes(cb.value) : false;
  });
  const items = f ? f.items : [{ name: '', nutrients: {} }];
  document.getElementById('fav-items').innerHTML = items.map(favItemRowHtml).join('');
  updateFavForm();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeFavEditor() {
  favEditingId = null;
  document.getElementById('fav-form').hidden = true;
  document.getElementById('fav-add').hidden = false;
  document.getElementById('fav-msg').textContent = '';
}

// 폼 → { set, error }. 빈 칸은 null (0으로 추측하지 않음), 이름·열량은 필수 (직접 입력과 같은 규칙)
function readFavForm() {
  const form = document.getElementById('fav-form');
  const name = form.favName.value.trim();
  const meals = [...form.querySelectorAll('input[name="favMeal"]:checked')].map((cb) => cb.value);
  const items = [];
  let bad = '';
  form.querySelectorAll('.fav-item').forEach((row, i) => {
    const get = (k) => row.querySelector(`[data-key="${k}"]`);
    const itemName = get('name').value.trim();
    const nutrients = {};
    for (const f of NUTRIENT_FIELDS) {
      const raw = get(f.key).value.trim();
      const n = raw === '' ? null : Number(raw);
      if (n !== null && !(Number.isFinite(n) && n >= 0)) bad = bad || `${i + 1}번째 음식의 ${f.label} 값을 확인해 주세요.`;
      nutrients[f.key] = n !== null && Number.isFinite(n) ? n : null;
    }
    if (!itemName) bad = bad || `${i + 1}번째 음식의 이름을 입력해 주세요.`;
    if (nutrients.calories === null) bad = bad || `${i + 1}번째 음식의 열량을 입력해 주세요.`;
    items.push({ name: itemName, basis: FAVORITE_BASIS, nutrients });
  });
  let error = '';
  if (!name) error = '세트 이름을 입력해 주세요.';
  else if (!meals.length) error = '언제 보여줄지 식사 종류를 하나 이상 골라 주세요.';
  else if (!items.length) error = '음식을 하나 이상 넣어 주세요.';
  else error = bad;
  return { set: { id: favEditingId || newEntryId(), name, meals, items }, error };
}

function updateFavForm() {
  const { error } = readFavForm();
  document.getElementById('fav-save').disabled = Boolean(error);
  document.getElementById('fav-hint').textContent = error;
}

function initFavManager() {
  const form = document.getElementById('fav-form');
  // 식사 종류 체크 칩 (여러 개 고를 수 있음: 점심·저녁 모두 등)
  document.getElementById('fav-meals').innerHTML = MEAL_TYPES.map(
    (m) => `<label><input type="checkbox" name="favMeal" value="${m.key}" /><span>${m.label}</span></label>`
  ).join('');
  document.getElementById('fav-add').addEventListener('click', () => openFavEditor(null));
  document.getElementById('fav-cancel').addEventListener('click', closeFavEditor);
  document.getElementById('fav-add-item').addEventListener('click', () => {
    document.getElementById('fav-items').insertAdjacentHTML('beforeend', favItemRowHtml());
    updateFavForm();
  });
  form.addEventListener('input', updateFavForm);
  form.addEventListener('change', updateFavForm);
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav-item="remove"]');
    if (!btn) return;
    btn.closest('.fav-item').remove();
    updateFavForm();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { set, error } = readFavForm();
    if (error) return;
    const list = loadFavorites();
    const i = list.findIndex((f) => f.id === set.id);
    if (i >= 0) list[i] = set;
    else list.push(set);
    saveFavorites(list);
    closeFavEditor();
    renderFavManager();
    document.getElementById('fav-msg').textContent = `'${set.name}' 세트를 저장했어요.`;
  });
  document.getElementById('fav-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav-action]');
    if (!btn) return;
    const id = btn.closest('.fav-row').dataset.id;
    const f = loadFavorites().find((x) => x.id === id);
    if (!f) return;
    if (btn.dataset.favAction === 'edit') openFavEditor(f);
    else if (confirm(`'${f.name}' 세트를 지울까요? 이미 기록한 끼니는 그대로예요.`)) {
      saveFavorites(loadFavorites().filter((x) => x.id !== id));
      if (favEditingId === id) closeFavEditor();
      renderFavManager();
      document.getElementById('fav-msg').textContent = `'${f.name}' 세트를 지웠어요.`;
    }
  });
}
