// 월간 캘린더 — 오늘 화면에 항상 펼쳐져 있다 (별도 화면·접기 없음, CLAUDE.md 4-1)
// 기록한 날은 entries에서 계산한다 (따로 저장하지 않음, 9장)

let calMonth = null; // 지금 보고 있는 달 { year, month(0~11) }
let onPickDate = null; // 날짜를 고르면 부를 함수

// "YYYY-MM-DD"에서 하루씩 앞뒤로
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// 미래 날짜는 고를 수 없다 (먹지 않은 날을 미리 기록하지 않게)
function isFuture(dateStr, now = new Date()) {
  return dateStr > toDateStr(now);
}

/** 달력 칸: 첫 주 앞의 빈칸은 null, 마지막 주 뒤도 7칸이 되게 null로 채운다 */
function buildMonthCells(year, month) {
  const cells = [];
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=일
  const days = new Date(year, month + 1, 0).getDate(); // 그달 마지막 날 = 날 수
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toDateStr(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

// 끼니가 1개 이상인 날 = 기록한 날 (9장)
function recordedDates() {
  return new Set(
    loadEntries()
      .filter((m) => m.items.length > 0)
      .map((m) => m.date)
  );
}

function renderCalendar(selected) {
  const { year, month } = calMonth;
  const now = new Date();
  const today = toDateStr(now);
  const recorded = recordedDates();
  document.getElementById('cal-title').textContent = `${year}년 ${month + 1}월`;
  // 이번 달보다 뒤로는 넘기지 않는다
  document.getElementById('cal-next').disabled = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());

  document.getElementById('cal-grid').innerHTML = buildMonthCells(year, month)
    .map((date) => {
      if (!date) return '<span class="cal-cell empty"></span>';
      const day = Number(date.slice(8));
      const classes = ['cal-cell', recorded.has(date) ? 'recorded' : '', date === selected ? 'selected' : '', date === today ? 'today' : ''];
      const future = isFuture(date, now);
      const label = `${formatMonthDay(date)}${recorded.has(date) ? ' 기록함' : ''}`;
      return `<button type="button" class="${classes.filter(Boolean).join(' ')}" data-date="${date}" ${future ? 'disabled' : ''} aria-label="${label}" ${date === selected ? 'aria-pressed="true"' : ''} ${date === today ? 'aria-current="date"' : ''}>${day}</button>`;
    })
    .join('');
}

/**
 * 오늘 화면을 그릴 때마다 부른다 — 캘린더는 항상 펼쳐져 있다 (CLAUDE.md 4-1, 접기 없음).
 * 보는 날짜가 바뀌면 그 날짜가 있는 달로 맞추고, 같은 날짜면 사용자가 넘겨 둔 달을 유지한다.
 */
let calSelected = null;
function syncCalendar(selected) {
  if (!calMonth || selected !== calSelected) {
    const [y, m] = selected.split('-').map(Number);
    calMonth = { year: y, month: m - 1 };
  }
  calSelected = selected;
  renderCalendar(selected);
}

function shiftMonth(delta) {
  const d = new Date(calMonth.year, calMonth.month + delta, 1);
  calMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar(calSelected);
}

/** onPick(date): 날짜를 골랐을 때 (화면 전체를 그 날짜로) */
function initCalendar(onPick) {
  onPickDate = onPick;
  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
  document.getElementById('cal-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn || btn.disabled) return;
    onPickDate(btn.dataset.date);
  });
}