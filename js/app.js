// 시작점 — 화면 전환, 탭 내비게이션, 오늘 화면

// 화면은 섹션 hidden 토글로만 바꾼다 (라우터 없이 단순하게). 탭 강조도 여기서 함께
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== id;
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = `screen-${tab.dataset.nav}` === id;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

function currentScreen() {
  const el = document.querySelector('.screen:not([hidden])');
  return el ? el.id : null;
}

// 끼니 줄에 보일 음식명: 3개까지는 모두, 넘으면 "a + b 외 n개"
function mealNames(items) {
  const names = items.map((it) => escapeHtml(it.name));
  return names.length <= 3 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} 외 ${names.length - 2}개`;
}

// 끼니 아이콘: 사진은 저장하지 않으므로 첫 음식의 입력 방식 아이콘
function mealIcon(items) {
  const src = INPUT_SOURCES[items[0] && items[0].source] || INPUT_SOURCES.manual;
  return iconSvg(src.icon);
}

function renderMealList(date) {
  const meals = getMealsByDate(date);
  const allItems = meals.flatMap((m) => m.items);
  document.getElementById('today-total').textContent = meals.length
    ? `${formatNumber(sumItems(allItems).totals.calories)} kcal`
    : '';
  document.getElementById('today-empty').hidden = meals.length > 0;

  document.getElementById('meal-list').innerHTML = meals
    .map((m) => {
      const kcal = sumItems(m.items).totals.calories;
      const detail = m.items
        .map(
          (it) => `<li><span>${escapeHtml(it.name)}${it.multiplier !== 1 ? ` <small>${amountLabel(it.multiplier)}</small>` : ''}</span><span>${formatNumber(it.nutrients.calories)} kcal</span></li>`
        )
        .join('');
      return `
      <li class="meal-row" data-id="${m.id}">
        <div class="meal-line">
          <button type="button" class="meal-main" data-action="toggle" aria-expanded="false">
            <span class="meal-time">${m.time}</span>
            <span class="meal-icon">${mealIcon(m.items)}</span>
            <span class="meal-text"><span class="meal-tag">${mealLabel(m.meal)}</span><span class="meal-names">${mealNames(m.items)}</span></span>
            <span class="meal-kcal">${formatNumber(kcal)} kcal</span>
          </button>
          <button type="button" class="icon-btn more-btn" data-action="menu" aria-label="끼니 메뉴" aria-expanded="false">${iconSvg('more')}</button>
          <div class="meal-menu" hidden>
            <button type="button" data-action="edit">끼니 수정</button>
            <button type="button" data-action="delete" class="danger">끼니 삭제</button>
          </div>
        </div>
        <ul class="meal-items" hidden>${detail}</ul>
      </li>`;
    })
    .join('');
}

function closeMealMenus(except) {
  document.querySelectorAll('.meal-menu').forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    menu.parentElement.querySelector('.more-btn').setAttribute('aria-expanded', 'false');
  });
}

// 오늘 화면 (영양소 현황은 3단계에서 추가)
function renderToday() {
  const profile = loadProfile();
  if (!profile) return openSetup();
  document.getElementById('tabbar').hidden = false;
  document.getElementById('today-calories').textContent = formatNumber(calcDailyCalories(profile));
  renderMealList(toDateStr());
  showScreen('screen-today');
}

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

function openSetup() {
  fillSetupForm(loadProfile());
  showScreen('screen-setup');
}

// 탭 이동. 추가 화면에서 저장 안 한 내용이 있으면 먼저 확인
function navigate(target) {
  const from = currentScreen();
  if (from === `screen-${target}`) return;
  if (from === 'screen-entry' && !confirmLeaveEntry()) return;
  if (target === 'setup') openSetup();
  else if (target === 'entry') openEntryForm();
  else renderToday();
}

function onMealListClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const row = btn.closest('.meal-row');
  const id = row.dataset.id;
  const action = btn.dataset.action;

  if (action === 'toggle') {
    const items = row.querySelector('.meal-items');
    items.hidden = !items.hidden;
    btn.setAttribute('aria-expanded', String(!items.hidden));
  } else if (action === 'menu') {
    const menu = row.querySelector('.meal-menu');
    closeMealMenus(menu);
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  } else if (action === 'edit') {
    openMealForEdit(id);
  } else if (action === 'delete') {
    closeMealMenus();
    if (!confirm('이 끼니를 지울까요? 담긴 음식도 함께 지워져요.')) return;
    deleteMeal(id);
    renderMealList(toDateStr());
    showToast('끼니를 지웠어요.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fillStaticIcons();
  initSetupScreen(renderToday);
  initEntryScreen({
    // 저장·삭제·뒤로 후 모두 오늘 화면으로 돌아온다
    onDone(message) {
      renderToday();
      if (message) showToast(message);
    },
  });

  document.getElementById('tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-nav]');
    if (tab) navigate(tab.dataset.nav);
  });
  document.getElementById('cta-add').addEventListener('click', () => openEntryForm());

  // 목록 항목마다 리스너를 달지 않고 목록 하나에서 받는다 (다시 그려도 유지됨)
  document.getElementById('meal-list').addEventListener('click', onMealListClick);
  // 메뉴 밖을 누르면 열린 ⋯ 메뉴를 닫는다
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.meal-line')) closeMealMenus();
  });

  // 프로필이 없으면 첫 실행으로 보고 초기설정부터 (탭은 프로필 저장 후에 보임)
  if (loadProfile()) {
    renderToday();
  } else {
    openSetup();
  }
});
