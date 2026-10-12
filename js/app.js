// 시작점 — 화면 전환과 첫 실행 판단

// 화면은 섹션 hidden 토글로만 바꾼다 (라우터 없이 단순하게)
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== id;
  });
  window.scrollTo(0, 0);
}

// 오늘 화면 (1단계 자리표시자: 권장 열량만 표시, 2·3단계에서 교체)
function renderToday(profile) {
  document.getElementById('today-calories').textContent = formatNumber(calcDailyCalories(profile));
  showScreen('screen-today');
}

function openSetup() {
  fillSetupForm(loadProfile());
  showScreen('screen-setup');
}

document.addEventListener('DOMContentLoaded', () => {
  initSetupScreen(renderToday);
  document.getElementById('open-setup').addEventListener('click', openSetup);

  // 프로필이 없으면 첫 실행으로 보고 초기설정부터
  const profile = loadProfile();
  if (profile) {
    renderToday(profile);
  } else {
    openSetup();
  }
});
