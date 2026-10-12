// 시작점 — 화면 전환과 첫 실행 판단

// 화면은 섹션 hidden 토글로만 바꾼다 (라우터 없이 단순하게)
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== id;
  });
  window.scrollTo(0, 0);
}

// 사용자가 입력한 음식명을 innerHTML에 넣기 전에 이스케이프
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderTodayList() {
  const entries = getEntriesByDate(toDateStr());
  const list = document.getElementById('today-list');
  list.innerHTML = entries
    .map(
      (e) => `
      <li class="entry-item">
        <span class="entry-meta"><span class="meal-tag">${mealLabel(e.meal)}</span>${e.time}</span>
        <span class="entry-name">${escapeHtml(e.name)}</span>
        <span class="entry-kcal">${formatNumber(e.nutrients.calories)} kcal</span>
        <span class="entry-actions">
          <button type="button" class="link-btn" data-action="edit" data-id="${e.id}">수정</button>
          <button type="button" class="link-btn danger" data-action="delete" data-id="${e.id}">삭제</button>
        </span>
      </li>`
    )
    .join('');
  document.getElementById('today-empty').hidden = entries.length > 0;
}

// 오늘 화면 (영양소 현황은 3단계에서 추가)
function renderToday() {
  const profile = loadProfile();
  if (!profile) return openSetup();
  document.getElementById('today-calories').textContent = formatNumber(calcDailyCalories(profile));
  renderTodayList();
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

document.addEventListener('DOMContentLoaded', () => {
  initSetupScreen(renderToday);
  initEntryScreen({
    // 저장·취소·삭제 후 모두 오늘 화면으로 돌아온다
    onDone(message) {
      renderToday();
      if (message) showToast(message);
    },
  });

  document.getElementById('open-setup').addEventListener('click', openSetup);
  document.getElementById('cta-manual').addEventListener('click', () => openEntryForm());

  // 목록 항목마다 리스너를 달지 않고 목록 하나에서 받는다 (다시 그려도 유지됨)
  document.getElementById('today-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') {
      openEntryFormForEdit(btn.dataset.id);
    } else if (btn.dataset.action === 'delete' && confirm('이 기록을 지울까요?')) {
      deleteEntry(btn.dataset.id);
      renderTodayList();
      showToast('기록을 지웠어요.');
    }
  });

  // 프로필이 없으면 첫 실행으로 보고 초기설정부터
  if (loadProfile()) {
    renderToday();
  } else {
    openSetup();
  }
});
