const $ = (id) => document.getElementById(id);

const NUTRIENTS = [
  { key: 'calories', label: '칼로리', unit: 'kcal' },
  { key: 'carbs', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
  { key: 'sugar', label: '당류', unit: 'g', limit: true },
  { key: 'fiber', label: '식이섬유', unit: 'g' },
  { key: 'sodium', label: '나트륨', unit: 'mg', limit: true },
];
const MEALS = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
const mealByHour = (h) => (h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack');
const SOURCE_ICON = { label: '🏷️', food: '🍽️', manual: '✏️' };

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (date, n) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) return void (location.href = '/login.html');
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let date = localDate();
let meta;
let hasProfile = false;

// ---------- 대시보드 ----------
async function refresh() {
  const s = await api(`/api/summary?date=${date}`);
  hasProfile = !!s.profile;
  $('date').value = date;
  $('setup').hidden = hasProfile;
  $('summary').hidden = !hasProfile;
  if (hasProfile) renderSummary(s);
  renderEntries(s.entries);
  renderWeek(s);
  renderReport(s);
  loadRecent();
  if (hasProfile) loadWeights();
}

async function loadRecent() {
  const { items } = await api(`/api/recent?date=${date}`);
  $('recentCard').hidden = items.length === 0;
  $('recent').replaceChildren(
    ...items.map((food) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = food.name;
      const small = document.createElement('small');
      small.textContent = `${fmt(food.calories)}kcal`;
      b.append(small);
      b.onclick = () => openFromFood(food);
      return b;
    }),
  );
}

function renderSummary({ totals, targets, percent }) {
  const p = percent.calories;
  const left = targets.calories - totals.calories;
  const ring = $('ring');
  ring.style.setProperty('--p', Math.min(p, 100));
  ring.style.setProperty('--c', p > 110 ? 'var(--over)' : p > 100 ? 'var(--warn)' : 'var(--brand)');
  $('kcalNow').textContent = fmt(totals.calories);
  $('kcalGoal').textContent = `/ ${fmt(targets.calories)} kcal`;
  $('kcalMsg').textContent = `하루 권장량의 ${p}%`;
  $('kcalSub').textContent =
    left >= 0 ? `${fmt(left)} kcal 더 먹을 수 있어요` : `권장량을 ${fmt(-left)} kcal 넘었어요`;

  $('bars').replaceChildren(
    ...NUTRIENTS.filter((n) => n.key !== 'calories').map((n) => {
      const pct = percent[n.key];
      const cls = pct > 100 ? (n.limit ? 'over' : 'warn') : '';
      const row = document.createElement('div');
      row.className = 'bar';
      row.innerHTML = `<div class="bar-head"><span></span><span></span></div><div class="track"><div class="fill ${cls}"></div></div>`;
      const [a, b] = row.querySelectorAll('.bar-head span');
      a.textContent = n.label + (n.limit ? ' (상한)' : '');
      b.textContent = `${fmt(totals[n.key])} / ${fmt(targets[n.key])}${n.unit} · ${pct}%`;
      row.querySelector('.fill').style.width = `${Math.min(pct, 100)}%`;
      return row;
    }),
  );
}

function renderEntries(entries) {
  $('empty').hidden = entries.length > 0;
  const nodes = [];
  for (const meal of Object.keys(MEALS)) {
    const group = entries.filter((e) => (e.meal ?? 'snack') === meal);
    if (!group.length) continue;
    const head = document.createElement('li');
    head.className = 'meal-head';
    head.innerHTML = '<span></span><span></span>';
    head.children[0].textContent = MEALS[meal];
    head.children[1].textContent = fmt(group.reduce((s, e) => s + e.calories, 0)) + ' kcal';
    nodes.push(head, ...group.map(entryRow));
  }
  $('entries').replaceChildren(...nodes);
}

function entryRow(e) {
  const li = document.createElement('li');
  li.innerHTML = '<span>' + (SOURCE_ICON[e.source] ?? '') + '</span><div class="info"><div class="name"></div><div class="muted"></div></div><div class="kc"></div><button class="del" aria-label="삭제">✕</button>';
  li.querySelector('.info').onclick = () => openEdit(e);
  li.querySelector('.name').textContent = e.name;
  li.querySelector('.muted').textContent = `탄 ${fmt(e.carbs)} 단 ${fmt(e.protein)} 지 ${fmt(e.fat)}`;
  li.querySelector('.kc').textContent = `${fmt(e.calories)} kcal`;
  li.querySelector('.del').onclick = async () => {
    if (!confirm(`"${e.name}" 기록을 삭제할까요?`)) return;
    await api(`/api/entries/${e.id}`, { method: 'DELETE' });
    refresh();
  };
  return li;
}

function renderWeek({ week, targets }) {
  const max = Math.max(1, targets?.calories ?? 0, ...week.map((d) => d.calories));
  $('week').replaceChildren(
    ...week.map((d) => {
      const col = document.createElement('div');
      col.className = 'col' + (d.date === date ? ' today' : '');
      const over = targets && d.calories > targets.calories * 1.1;
      col.innerHTML = `<span></span><i class="${over ? 'over' : ''}"></i><span></span>`;
      const [top, bottom] = col.querySelectorAll('span');
      top.textContent = d.calories ? fmt(d.calories) : '';
      bottom.textContent = d.date.slice(8) + '일';
      col.querySelector('i').style.height = `${(d.calories / max) * 100 * 0.78}%`;
      return col;
    }),
  );
}

$('today').onclick = () => ((date = localDate()), refresh());
$('prev').onclick = () => ((date = shift(date, -1)), refresh());
$('next').onclick = () => ((date = shift(date, 1)), refresh());
$('date').onchange = (e) => e.target.value && ((date = e.target.value), refresh());

// ---------- 프로필 ----------
function fillSelect(sel, map) {
  sel.replaceChildren(...Object.entries(map).map(([v, l]) => new Option(l, v)));
}

let prevWeight = null; // 프로필에서 몸무게가 바뀌면 체중 기록에도 남기기 위해 기억

async function openProfile() {
  const { profile } = await api('/api/profile');
  prevWeight = profile ? profile.weightKg : null;
  const f = $('profileForm').elements;
  if (profile) for (const k of Object.keys(profile)) f[k].value = profile[k];
  $('profileErr').hidden = true;
  $('profileDlg').showModal();
}
$('profileBtn').onclick = $('setupBtn').onclick = openProfile;
$('profileCancel').onclick = () => $('profileDlg').close();
$('profileForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('profileForm').elements;
  try {
    await api('/api/profile', json('PUT', Object.fromEntries(
      ['sex', 'age', 'heightCm', 'weightKg', 'activity', 'goal'].map((k) => [k, f[k].value]),
    )));
    if (Number(f.weightKg.value) !== prevWeight) {
      await api('/api/weights', json('PUT', { date: localDate(), weightKg: f.weightKg.value }));
    }
    $('profileDlg').close();
    refresh();
  } catch (e) {
    $('profileErr').textContent = e.message;
    $('profileErr').hidden = false;
  }
};

// ---------- 기록 추가 ----------
let candidates = []; // 분석된 후보(영양성분은 '1회 기준')
let current = null;
let source = 'manual';
let lastImage = null; // 재분석용(메모리에만 보관)
let editing = null; // 수정 중인 기록(없으면 새 기록)

function resetEntryDialog() {
  $('entryForm').reset();
  $('warn').hidden = true;
  $('entryForm').elements.meal.value = mealByHour(new Date().getHours());
  for (const id of ['analyzing', 'analyzeErr', 'preview', 'pick', 'fields', 'entrySave']) $(id).hidden = true;
  candidates = [];
  current = null;
  editing = null;
  lastImage = null;
  $('hint').value = '';
  $('hintBox').hidden = true;
  $('presets').replaceChildren();
}

function showFields() {
  $('fields').hidden = false;
  $('entrySave').hidden = false;
}

// 선택한 후보 x 섭취량(배)을 입력칸에 반영
function applyCandidate() {
  const f = $('entryForm').elements;
  const m = Number(f.mult.value) || 1;
  if (!current) return;
  f.name.value = current.name;
  f.calories.value = Math.round(current.calories * m);
  f.carbs.value = Math.round(current.carbs_g * m * 10) / 10;
  f.protein.value = Math.round(current.protein_g * m * 10) / 10;
  f.fat.value = Math.round(current.fat_g * m * 10) / 10;
  f.sugar.value = Math.round(current.sugar_g * m * 10) / 10;
  f.fiber.value = Math.round(current.fiber_g * m * 10) / 10;
  f.sodium.value = Math.round(current.sodium_mg * m);
  $('servingDesc').textContent = `기준: ${current.serving_description} (정확도 ${Math.round(current.confidence * 100)}%)`;
  renderPresets(m);
  $('warn').textContent = current.warning ?? '';
  $('warn').hidden = !current.warning;
}

// 섭취량 빠른 선택. 라벨에 총 제공 횟수가 있으면 '한 통 전체' 추가
function renderPresets(active) {
  const steps = [0.5, 1, 1.5, 2];
  const total = Math.round(current.servings_per_container * 100) / 100;
  if (total > 1 && !steps.includes(total)) steps.push(total);
  $('presets').replaceChildren(
    ...steps.map((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v === total && total > 2 ? `전체 ×${v}` : `×${v}`;
      b.className = v === active ? 'on' : '';
      b.onclick = () => (($('entryForm').elements.mult.value = v), applyCandidate());
      return b;
    }),
  );
}

function renderPick() {
  $('pick').hidden = candidates.length < 2;
  $('pick').replaceChildren(
    ...candidates.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.name;
      b.className = c === current ? 'on' : '';
      b.onclick = () => ((current = c), renderPick(), applyCandidate());
      return b;
    }),
  );
}

// 지난 기록을 1회 기준값으로 삼아 입력창을 미리 채움
function openFromFood(food) {
  resetEntryDialog();
  $('entryTitle').textContent = '다시 기록';
  $('entryForm').elements.mult.parentElement.hidden = false;
  source = food.source;
  $('note').textContent = '';
  current = {
    name: food.name, serving_description: '지난 기록 기준', confidence: 1,
    calories: food.calories, carbs_g: food.carbs, protein_g: food.protein, fat_g: food.fat,
    sugar_g: food.sugar, fiber_g: food.fiber, sodium_mg: food.sodium,
  };
  applyCandidate();
  showFields();
  $('entryDlg').showModal();
}

// 기존 기록 수정: 저장된 값을 그대로 편집 (배수/프리셋 없음)
function openEdit(e) {
  resetEntryDialog();
  editing = e;
  source = e.source;
  $('entryTitle').textContent = '기록 수정';
  const f = $('entryForm').elements;
  f.mult.parentElement.hidden = true;
  f.meal.value = e.meal ?? 'snack';
  f.name.value = e.name;
  for (const n of NUTRIENTS) f[n.key].value = e[n.key];
  $('servingDesc').textContent = '';
  $('note').textContent = '';
  showFields();
  $('entryDlg').showModal();
}

$('manualBtn').onclick = () => {
  resetEntryDialog();
  source = 'manual';
  $('entryTitle').textContent = '직접 입력';
  $('entryForm').elements.mult.parentElement.hidden = true;
  $('servingDesc').textContent = '';
  $('note').textContent = '';
  showFields();
  $('entryDlg').showModal();
};

$('photo').onchange = async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  resetEntryDialog();
  $('entryTitle').textContent = '사진 분석';
  $('entryForm').elements.mult.parentElement.hidden = false;
  $('analyzing').hidden = false;
  $('entryDlg').showModal();
  try {
    lastImage = await shrink(file);
    $('preview').src = lastImage;
    $('preview').hidden = false;
    await runAnalysis('');
  } catch (e) {
    showAnalyzeError(e);
  }
};

function showAnalyzeError(e) {
  $('analyzing').hidden = true;
  $('analyzeErr').textContent = e.message;
  $('analyzeErr').hidden = false;
  $('hintBox').hidden = !lastImage;
}

$('reanalyze').onclick = async () => {
  const hint = $('hint').value.trim();
  for (const id of ['analyzeErr', 'fields', 'entrySave', 'pick', 'hintBox']) $(id).hidden = true;
  $('analyzing').hidden = false;
  try {
    await runAnalysis(hint);
  } catch (e) {
    showAnalyzeError(e);
  }
};

async function runAnalysis(hint) {
  const r = await api('/api/analyze', json('POST', { image: lastImage, hint }));
  $('analyzing').hidden = true;
  if (!r.items.length) throw new Error(r.note || '음식이나 영양성분표를 찾지 못했어요. 다시 찍어 주세요.');
  source = r.kind === 'label' ? 'label' : 'food';
  candidates = r.items;
  current = candidates[0];
  // 라벨에 총 제공 횟수가 있어도 기본값은 1회분. 사용자가 배수로 조절.
  $('note').textContent = r.note;
  renderPick();
  applyCandidate();
  showFields();
  $('hintBox').hidden = false;
}

$('entryForm').elements.mult.oninput = applyCandidate;
$('entryCancel').onclick = () => $('entryDlg').close();
$('entryForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('entryForm').elements;
  const now = new Date();
  try {
    const body = {
      date: editing ? editing.date : date,
      time: editing ? editing.time : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      source,
      meal: f.meal.value,
      name: f.name.value,
      ...Object.fromEntries(NUTRIENTS.map((n) => [n.key, f[n.key].value || 0])),
    };
    await api(editing ? `/api/entries/${editing.id}` : '/api/entries', json(editing ? 'PUT' : 'POST', body));
    $('entryDlg').close();
    refresh();
  } catch (e) {
    $('analyzeErr').textContent = e.message;
    $('analyzeErr').hidden = false;
  }
};

// 업로드 용량/속도를 위해 긴 변 1568px JPEG로 축소 (휴대폰 사진은 수 MB)
function shrink(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('이미지를 열 수 없어요.')));
    img.src = url;
  });
}

// ---------- 시작 ----------
(async () => {
  meta = await api('/api/meta');
  $('logout').hidden = !meta.authEnabled;
  fillSelect($('activitySel'), meta.activity);
  fillSelect($('goalSel'), meta.goals);
  await refresh();
})().catch((e) => {
  const offline = e instanceof TypeError; // fetch 자체가 실패 = 서버/네트워크 문제
  $('banner').textContent = offline ? '서버에 연결할 수 없어요. 네트워크를 확인하고 새로고침해 주세요.' : e.message;
  $('banner').hidden = false;
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// ---------- 주간 리포트 ----------
function renderReport({ report, targets }) {
  $('reportCard').hidden = !targets;
  if (!targets) return;
  const stat = (v, l) => {
    const d = document.createElement('div');
    d.innerHTML = '<b></b><span></span>';
    d.firstChild.textContent = v;
    d.lastChild.textContent = l;
    return d;
  };
  $('reportStats').replaceChildren(
    stat(report.loggedDays + '/7일', '기록한 날'),
    stat(report.loggedDays ? fmt(report.avg.calories) : '-', '평균 kcal'),
    stat(report.onTargetDays + '일', '권장량 ±10%'),
  );
  const r = report.ratio;
  $('ratioBar').replaceChildren(
    ...(r ? [['c', '탄수', r.carbs], ['p', '단백질', r.protein], ['f', '지방', r.fat]] : []).map(([cls, label, pct]) => {
      const d = document.createElement('div');
      d.className = cls;
      d.style.flex = String(Math.max(pct, 1));
      d.textContent = pct >= 12 ? label + ' ' + pct + '%' : '';
      d.title = label + ' ' + pct + '%';
      return d;
    }),
  );
  $('insights').replaceChildren(
    ...report.insights.map((t) => Object.assign(document.createElement('li'), { textContent: t })),
  );
}

// ---------- 체중 ----------
async function loadWeights() {
  const { weights } = await api('/api/weights');
  $('weightCard').hidden = false;
  const last = weights.at(-1);
  const first = weights.at(0);
  const diff = last && first ? Math.round((last.kg - first.kg) * 10) / 10 : 0;
  $('weightSub').textContent = last
    ? last.kg + 'kg' + (weights.length > 1 ? ' (' + (diff > 0 ? '+' : '') + diff + 'kg)' : '')
    : '';
  $('weightChart').replaceChildren(...(weights.length > 1 ? [weightSvg(weights.slice(-30))] : []));
}

function weightSvg(points) {
  const W = 300, H = 110, P = 14;
  const ks = points.map((p) => p.kg);
  const lo = Math.min(...ks) - 0.5, hi = Math.max(...ks) + 0.5;
  const xy = points.map((p, i) => [P + (i / (points.length - 1)) * (W - 2 * P), H - P - ((p.kg - lo) / (hi - lo)) * (H - 2 * P)]);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', xy.map((p) => p.join(',')).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--brand)');
  line.setAttribute('stroke-width', '2.5');
  svg.append(line);
  xy.forEach(([x, y], i) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', 3.5);
    c.setAttribute('fill', 'var(--brand)');
    const t = document.createElementNS(ns, 'title');
    t.textContent = points[i].date + ' ' + points[i].kg + 'kg';
    c.append(t);
    svg.append(c);
  });
  return svg;
}

$('weightForm').onsubmit = async (ev) => {
  ev.preventDefault();
  try {
    await api('/api/weights', json('PUT', { date, weightKg: $('weightInput').value }));
    $('weightInput').value = '';
    refresh();
  } catch (e) {
    alert(e.message);
  }
};

$('logout').onclick = async (e) => {
  e.preventDefault();
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login.html';
};
