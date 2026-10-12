// 시작점 — 화면 전환(오늘 · 기록하기 · 내 정보), 오늘 화면

// 화면은 섹션 hidden 토글로만 바꾼다 (라우터 없이 단순하게). 메뉴 강조도 여기서 함께
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== id;
  });
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const active = `screen-${btn.dataset.nav}` === id;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

function currentScreen() {
  const el = document.querySelector('.screen:not([hidden])');
  return el ? el.id : null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// "2026년 10월 12일 (일)" — 날짜 이동(‹ ›)과 캘린더는 6단계
function formatFullDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

// 끼니 한 줄: [식사 종류 아이콘 + 점심 12:20] [음식1 kcal + 음식2 kcal] [⋯]
// 사진은 저장하지 않으므로 음식마다 썸네일 대신 입력 방식 아이콘 (CLAUDE.md 8-1)
function mealRowHtml(m) {
  const type = MEAL_TYPES.find((t) => t.key === m.meal) || MEAL_TYPES[MEAL_TYPES.length - 1];
  const foods = m.items
    .map((it) => {
      const src = INPUT_SOURCES[it.source] || INPUT_SOURCES.manual;
      const amount = it.multiplier !== 1 ? ` <small>${amountLabel(it.multiplier)}</small>` : '';
      return `<span class="food-chip"><span class="food-icon" title="${src.label}">${iconSvg(src.icon)}</span><span class="food-text"><span class="food-name">${escapeHtml(it.name)}${amount}</span><span class="food-kcal">${formatNumber(it.nutrients.calories)} kcal</span></span></span>`;
    })
    .join('<span class="food-plus">+</span>');
  return `
    <li class="meal-row" data-id="${m.id}">
      <div class="meal-type">
        <span class="meal-type-icon">${iconSvg(type.icon)}</span>
        <span><strong>${type.label}</strong><small>${m.time}</small></span>
      </div>
      <div class="meal-foods">${foods}</div>
      <div class="meal-more">
        <button type="button" class="icon-btn more-btn" data-action="menu" aria-label="끼니 메뉴" aria-expanded="false">${iconSvg('more')}</button>
        <div class="meal-menu" hidden>
          <button type="button" data-action="edit">수정</button>
          <button type="button" data-action="delete" class="danger">삭제</button>
        </div>
      </div>
    </li>`;
}

function renderMealList(date) {
  const meals = getMealsByDate(date);
  document.getElementById('today-empty').hidden = meals.length > 0;
  document.getElementById('meal-list').innerHTML = meals.map(mealRowHtml).join('');
}

function closeMealMenus(except) {
  document.querySelectorAll('.meal-menu').forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    menu.parentElement.querySelector('.more-btn').setAttribute('aria-expanded', 'false');
  });
}

// 오늘 화면 (영양 요약·균형 카드는 3단계에서 추가)
function renderToday() {
  const profile = loadProfile();
  if (!profile) return openMe();
  document.body.classList.remove('first-run');
  const today = toDateStr();
  document.getElementById('today-date').textContent = formatFullDate(today);
  document.getElementById('today-calories').textContent = formatNumber(calcDailyCalories(profile));
  renderMealList(today);
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

function openMe() {
  fillMeForm(loadProfile());
  showScreen('screen-me');
}

// 메뉴 이동. 기록하기에서 저장 안 한 내용이 있으면 먼저 확인
function navigate(target) {
  const from = currentScreen();
  if (from === `screen-${target}`) return;
  if (from === 'screen-record' && !confirmLeaveRecord()) return;
  if (target === 'me') openMe();
  else if (target === 'record') openEntryForm();
  else renderToday();
}

function onMealListClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('.meal-row').dataset.id;
  const action = btn.dataset.action;
  if (action === 'menu') {
    const menu = btn.parentElement.querySelector('.meal-menu');
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
  initMeScreen((isFirst) => {
    renderToday();
    showToast(isFirst ? '반가워요! 이제 먹은 걸 기록해 보세요.' : '내 정보를 저장했어요.');
  });
  initRecordScreen({
    // 저장·삭제·뒤로 후 모두 오늘 화면으로 돌아온다
    onDone(message) {
      renderToday();
      if (message) showToast(message);
    },
  });

  // 사이드바(데스크톱)·하단 탭(모바일)·오른쪽 위 캐릭터 버튼 모두 data-nav로 이동
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) navigate(nav.dataset.nav);
  });
  document.getElementById('add-meal').addEventListener('click', () => navigate('record'));

  // 목록 항목마다 리스너를 달지 않고 목록 하나에서 받는다 (다시 그려도 유지됨)
  document.getElementById('meal-list').addEventListener('click', onMealListClick);
  // 메뉴 밖을 누르면 열린 ⋯ 메뉴를 닫는다
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.meal-more')) closeMealMenus();
  });

  // 프로필이 없으면 첫 실행: 내 정보부터, 메뉴는 숨김 (CLAUDE.md 4장)
  if (loadProfile()) {
    renderToday();
  } else {
    document.body.classList.add('first-run');
    openMe();
  }
});
