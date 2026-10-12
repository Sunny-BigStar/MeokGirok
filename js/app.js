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

// "2026년 10월 12일 (일)"
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

// ---------- 영양 요약 카드 ----------

// 표시용 숫자: kcal·mg은 정수, g은 정수(1 g 미만만 소수 첫째 자리). 저장값은 그대로
function formatAmount(value, unit) {
  if (value === null) return '–';
  if (unit === 'g' && value > 0 && value < 1) return String(Math.round(value * 10) / 10);
  return formatNumber(Math.round(value));
}

const STATUS_TEXT = {
  caution: '주의',
  over: '넘었어요',
  low: '아직 부족',
  good: '적당해요',
  plenty: '넉넉해요',
};

// 막대 한 줄: 이름 · 섭취/기준 · 막대(영양소 색) · % 또는 상태
function barHtml(r, missing) {
  const star = missing && r.value !== null ? '*' : '';
  let targetText;
  if (r.key === 'protein') targetText = `${r.target.min}~${r.target.max} ${r.unit}`;
  else if (r.target === null) targetText = '기준 없음';
  else targetText = `${formatNumber(r.target)} ${r.unit}`;
  const valueText = r.target === null ? `${formatAmount(r.value, r.unit)} ${r.unit}${star}` : `${formatAmount(r.value, r.unit)}${star} / ${targetText}`;

  // 오른쪽 표시: 단백질은 범위 대비 상태, 나머지는 %(+주의·넘었어요)
  let right = '';
  if (r.status === 'unknown') right = '<span class="pct muted">값 없음</span>';
  else if (r.key === 'protein') right = `<span class="pct status-${r.status}">${STATUS_TEXT[r.status]}</span>`;
  else if (r.pct !== null) {
    const tag = STATUS_TEXT[r.status] ? ` <em>${STATUS_TEXT[r.status]}</em>` : '';
    right = `<span class="pct status-${r.status}">${Math.round(r.pct * 100)}%${tag}</span>`;
  }

  // 기준이 없는 트랜스지방은 막대 없이 g만
  const bar =
    r.target === null
      ? ''
      : `<span class="bar-track"><span class="bar-fill" style="width:${Math.min((r.pct || 0) * 100, 100)}%;background:${NUTRIENT_COLORS[r.key] || 'var(--green)'}"></span></span>`;
  return `
    <li class="bar-row" data-key="${r.key}">
      <span class="bar-label"><span class="dot" style="background:${NUTRIENT_COLORS[r.key] || 'var(--muted)'}"></span>${r.label}</span>
      <span class="bar-value">${valueText}</span>
      ${right}
      ${bar}
    </li>`;
}

const RING_LEN = 2 * Math.PI * 52; // 원 둘레 (r=52)

function renderSummary(day, judged, isToday) {
  const cal = judged.calories;
  document.getElementById('ring-value').textContent = formatNumber(cal.value === null ? 0 : cal.value);
  document.getElementById('ring-target').textContent = formatNumber(cal.target);
  // 100%를 넘으면 꽉 찬 링 (넘은 정도는 아래 문구로)
  const filled = Math.min(cal.pct || 0, 1);
  const ring = document.getElementById('ring-fill');
  ring.style.strokeDasharray = `${RING_LEN}`;
  ring.style.strokeDashoffset = `${RING_LEN * (1 - filled)}`;
  // 지난날엔 '남은 권장량'이 의미 없으므로 권장량 대비 비율로 보여준다
  let note;
  if (isToday) note = cal.status === 'over' ? '오늘 권장량을 넘었어요' : `남은 권장량 ${formatNumber(cal.remaining ?? cal.target)} kcal`;
  else note = cal.status === 'over' ? '그날 권장량을 넘었어요' : `그날 권장량의 ${Math.round((cal.pct || 0) * 100)}%`;
  document.getElementById('ring-note').textContent = note;

  document.getElementById('nutrient-bars').innerHTML = MAIN_NUTRIENTS.map((k) => barHtml(judged[k], day.missing[k])).join('');
  document.getElementById('nutrient-bars-more').innerHTML = ['sat_fat', 'trans_fat', 'cholesterol']
    .map((k) => barHtml(judged[k], day.missing[k]))
    .join('');
  // 일부 음식만 값이 비어 합계가 실제보다 적을 수 있을 때 안내
  const partly = NUTRIENT_FIELDS.some((f) => day.missing[f.key] && day.totals[f.key] !== null);
  document.getElementById('summary-missing').hidden = !partly;
}

// ---------- 영양 균형 카드 ----------

// 캐릭터 표정은 섭취량이 아니라 '오늘 기록한 끼니' 기준 (CLAUDE.md 8장: 적게 먹었다고 보상하지 않음)
function buddyExpression(meals) {
  if (meals.length === 0) return 'expr-default';
  const kinds = new Set(meals.map((m) => m.meal));
  if (['breakfast', 'lunch', 'dinner'].every((k) => kinds.has(k))) return 'expr-satisfied';
  return 'expr-excited';
}

function setBuddy(expr) {
  document.getElementById('buddy-img').src = `assets/character/${expr}.png`;
}

function renderBalance(day, judged, isToday, dayLabel) {
  const card = document.getElementById('balance-card');
  card.classList.remove('grade-good', 'grade-mild', 'grade-bad', 'grade-empty');
  const lines = document.getElementById('balance-lines');
  const tip = document.getElementById('balance-tip');
  setBuddy(buddyExpression(day.meals));

  if (day.itemCount === 0) {
    card.classList.add('grade-empty');
    document.getElementById('balance-title').textContent = `${dayLabel} 영양 균형`;
    lines.innerHTML = isToday
      ? '<p>아직 기록이 없어요. 먹은 걸 기록하면 영양 균형을 알려드릴게요.</p>'
      : '<p>이 날은 기록이 없어요.</p>';
    tip.textContent = '';
    return null;
  }
  const grade = balanceGrade(judged);
  const msg = balanceMessages(judged);
  card.classList.add(`grade-${grade}`);
  document.getElementById('balance-title').textContent = `${dayLabel} 영양 균형: ${BALANCE_GRADES[grade]}`;
  lines.innerHTML = msg.lines.map((l) => `<p>${l}</p>`).join('');
  // 지난날에 '다음 끼니'를 제안하는 건 맞지 않아 오늘만 보여준다
  tip.textContent = isToday ? msg.tip : '';
  return msg;
}

// 끼니 저장 직후: 냠냠 표정 + 균형 한 줄 요약 말풍선을 잠깐 보여준다 (5장·8장)
let buddyTimer = null;
function showSavedReaction(msg, meals) {
  const bubble = document.getElementById('buddy-bubble');
  setBuddy('expr-yum');
  bubble.textContent = msg ? msg.oneLine : '기록했어요!';
  bubble.hidden = false;
  clearTimeout(buddyTimer);
  buddyTimer = setTimeout(() => {
    bubble.hidden = true;
    setBuddy(buddyExpression(meals));
  }, 5000);
}

// 오늘 화면에서 보고 있는 날짜 (저장하지 않음 — 앱을 새로 열면 항상 오늘)
let viewDate = null;

/**
 * 오늘 화면 = 고른 날짜의 요약·균형·식사 기록 (6단계: 지난날도 같은 화면에서).
 * opts.date: 보여줄 날짜(없으면 보던 날짜), opts.justSaved: 저장 직후 반응
 */
function renderToday(opts = {}) {
  const profile = loadProfile();
  if (!profile) return openMe();
  document.body.classList.remove('first-run');
  const today = toDateStr();
  let date = opts.date || viewDate || today;
  if (isFuture(date)) date = today;
  viewDate = date;
  const isToday = date === today;
  const dayLabel = isToday ? '오늘의' : formatMonthDay(date);

  document.getElementById('today-date').textContent = formatFullDate(date);
  document.getElementById('date-next').disabled = isToday; // 미래로는 못 감
  document.getElementById('go-today').hidden = isToday;
  document.getElementById('summary-title').textContent = `${dayLabel} 영양 요약`;
  document.getElementById('meals-title').textContent = `${dayLabel} 식사 기록`;
  document.getElementById('today-empty').textContent = isToday
    ? '아직 기록이 없어요. 먹은 걸 가볍게 남겨 보세요.'
    : '이 날은 기록이 없어요. 깜빡했다면 지금 남겨도 괜찮아요.';

  const day = sumDay(date);
  const judged = judgeNutrients(day.totals, getTargets(profile));
  renderSummary(day, judged, isToday);
  const msg = renderBalance(day, judged, isToday, dayLabel);
  // 냠냠 반응은 오늘 기록일 때만 (지난날 기록은 '오늘의 기록 습관'이 아니므로)
  if (opts.justSaved && isToday) showSavedReaction(msg, day.meals);
  else {
    clearTimeout(buddyTimer);
    document.getElementById('buddy-bubble').hidden = true;
  }

  renderMealList(date);
  if (calendarOpen()) renderCalendar(date); // 기록이 바뀌었으면 점도 갱신
  if (currentScreen() !== 'screen-today') showScreen('screen-today');
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
  if (from === `screen-${target}`) {
    // 지난날을 보다가 '오늘' 탭을 누르면 오늘로
    if (target === 'today') renderToday({ date: toDateStr() });
    return;
  }
  if (from === 'screen-record' && !confirmLeaveRecord()) return;
  if (target === 'me') openMe();
  else if (target === 'record') openEntryForm();
  else renderToday({ date: toDateStr() }); // '오늘' 탭은 항상 오늘로
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
    renderToday(); // 요약·균형 카드도 함께 갱신
    showToast('끼니를 지웠어요.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fillStaticIcons();
  initMeScreen((isFirst) => {
    renderToday();
    showToast(isFirst ? '반가워요! 이제 먹은 걸 기록해 보세요.' : '내 정보를 저장했어요.');
  });
  initPhotoUpload();
  initRecordScreen({
    // 저장·삭제·뒤로 후 모두 오늘 화면으로 돌아온다
    // 저장한 끼니의 날짜로 돌아온다 (지난날에 기록했으면 그 날짜 화면)
    onDone(message, opts = {}) {
      renderToday({ justSaved: Boolean(opts.saved), date: opts.date });
      if (message) showToast(message);
    },
  });

  // 사이드바(데스크톱)·하단 탭(모바일)·오른쪽 위 캐릭터 버튼 모두 data-nav로 이동
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) navigate(nav.dataset.nav);
  });
  // 보고 있는 날짜로 기록하기를 연다 (지난날을 보다가 누르면 그 날짜로). 하단 탭 '기록하기'는 항상 오늘
  document.getElementById('add-meal').addEventListener('click', () => openEntryForm({ date: viewDate }));

  // 날짜 이동 ‹ › · 오늘로 · 캘린더
  document.getElementById('date-prev').addEventListener('click', () => renderToday({ date: shiftDate(viewDate, -1) }));
  document.getElementById('date-next').addEventListener('click', () => renderToday({ date: shiftDate(viewDate, 1) }));
  document.getElementById('go-today').addEventListener('click', () => renderToday({ date: toDateStr() }));
  initCalendar(
    () => viewDate || toDateStr(),
    (date) => renderToday({ date })
  );

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
