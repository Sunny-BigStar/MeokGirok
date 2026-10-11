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
  $('entries').replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${SOURCE_ICON[e.source] ?? ''}</span><div class="info"><div class="name"></div><div class="muted"></div></div><div class="kc"></div><button class="del" aria-label="삭제">✕</button>`;
      li.querySelector('.name').textContent = e.name;
      li.querySelector('.muted').textContent =
        `${e.time === '00:00' ? '' : e.time + ' · '}탄 ${fmt(e.carbs)} 단 ${fmt(e.protein)} 지 ${fmt(e.fat)}`;
      li.querySelector('.kc').textContent = `${fmt(e.calories)} kcal`;
      li.querySelector('.del').onclick = async () => {
        if (!confirm(`"${e.name}" 기록을 삭제할까요?`)) return;
        await api(`/api/entries/${e.id}`, { method: 'DELETE' });
        refresh();
      };
      return li;
    }),
  );
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

$('prev').onclick = () => ((date = shift(date, -1)), refresh());
$('next').onclick = () => ((date = shift(date, 1)), refresh());
$('date').onchange = (e) => e.target.value && ((date = e.target.value), refresh());

// ---------- 프로필 ----------
function fillSelect(sel, map) {
  sel.replaceChildren(...Object.entries(map).map(([v, l]) => new Option(l, v)));
}

async function openProfile() {
  const { profile } = await api('/api/profile');
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

function resetEntryDialog() {
  $('entryForm').reset();
  for (const id of ['analyzing', 'analyzeErr', 'preview', 'pick', 'fields', 'entrySave']) $(id).hidden = true;
  candidates = [];
  current = null;
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
    const dataUrl = await shrink(file);
    $('preview').src = dataUrl;
    $('preview').hidden = false;
    const r = await api('/api/analyze', json('POST', { image: dataUrl }));
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
  } catch (e) {
    $('analyzing').hidden = true;
    $('analyzeErr').textContent = e.message;
    $('analyzeErr').hidden = false;
  }
};

$('entryForm').elements.mult.oninput = applyCandidate;
$('entryCancel').onclick = () => $('entryDlg').close();
$('entryForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('entryForm').elements;
  const now = new Date();
  try {
    await api('/api/entries', json('POST', {
      date,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      source,
      name: f.name.value,
      ...Object.fromEntries(NUTRIENTS.map((n) => [n.key, f[n.key].value || 0])),
    }));
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
  fillSelect($('activitySel'), meta.activity);
  fillSelect($('goalSel'), meta.goals);
  await refresh();
})().catch((e) => alert(e.message));
