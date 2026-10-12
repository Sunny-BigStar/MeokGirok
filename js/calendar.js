// 월간 캘린더 — 오늘 화면 안에서 펼쳐진다 (별도 화면 없음, CLAUDE.md 4-1)
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

function calendarOpen() {
  return !document.getElementById('calendar').hidden;
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

function openCalendar(selected) {
  const [y, m] = selected.split('-').map(Number);
  calMonth = { year: y, month: m - 1 }; // 처음 열면 고른 날짜가 있는 달
  document.getElementById('calendar').hidden = false;
  document.getElementById('date-toggle').setAttribute('aria-expanded', 'true');
  renderCalendar(selected);
}

function closeCalendar() {
  document.getElementById('calendar').hidden = true;
  document.getElementById('date-toggle').setAttribute('aria-expanded', 'false');
}

function shiftMonth(delta, selected) {
  const d = new Date(calMonth.year, calMonth.month + delta, 1);
  calMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar(selected);
}

/** getSelected: 지금 고른 날짜를 돌려주는 함수, onPick(date): 날짜를 골랐을 때 */
function initCalendar(getSelected, onPick) {
  onPickDate = onPick;
  document.getElementById('date-toggle').addEventListener('click', () => {
    if (calendarOpen()) closeCalendar();
    else openCalendar(getSelected());
  });
  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1, getSelected()));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1, getSelected()));
  document.getElementById('cal-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn || btn.disabled) return;
    closeCalendar(); // 고르면 접는다 — 아래 요약·기록을 바로 보이게
    onPickDate(btn.dataset.date);
  });
}
