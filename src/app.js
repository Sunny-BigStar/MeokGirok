import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITY, GOALS, calcTargets, sumEntries, validateProfile, FIELDS } from './nutrition.js';
import * as store from './store.js';
import { AnalyzeError, analyzeImage } from './analyze.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(here, '..', 'public')));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

app.get('/api/meta', (_req, res) => {
  res.json({
    activity: Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label])),
    goals: Object.fromEntries(Object.entries(GOALS).map(([k, v]) => [k, v.label])),
  });
});

app.get('/api/profile', wrap(async (_req, res) => {
  const profile = await store.getProfile();
  res.json({ profile, targets: profile ? calcTargets(profile) : null });
}));

app.put('/api/profile', wrap(async (req, res) => {
  const b = req.body ?? {};
  const profile = {
    sex: b.sex,
    age: Number(b.age),
    heightCm: Number(b.heightCm),
    weightKg: Number(b.weightKg),
    activity: b.activity,
    goal: b.goal,
  };
  const errors = validateProfile(profile);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  await store.setProfile(profile);
  res.json({ profile, targets: calcTargets(profile) });
}));

// 사진(data URL) -> 영양성분 추정. 저장은 하지 않고 사용자가 확인/수정 후 /api/entries로 저장.
app.post('/api/analyze', wrap(async (req, res) => {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(req.body?.image ?? '');
  if (!m || !ALLOWED_IMAGES.includes(m[1]))
    return res.status(400).json({ error: 'JPEG/PNG/WebP/GIF 이미지만 분석할 수 있습니다.' });
  res.json(await analyzeImage(m[2], m[1]));
}));

app.post('/api/entries', wrap(async (req, res) => {
  const b = req.body ?? {};
  if (!DATE_RE.test(b.date ?? '')) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
  if (!String(b.name ?? '').trim()) return res.status(400).json({ error: '음식 이름을 입력해 주세요.' });
  const entry = {
    date: b.date,
    time: /^\d{2}:\d{2}$/.test(b.time ?? '') ? b.time : '00:00',
    name: String(b.name).trim().slice(0, 100),
    meal: MEALS.includes(b.meal) ? b.meal : 'snack',
    source: ['label', 'food', 'manual'].includes(b.source) ? b.source : 'manual',
  };
  for (const f of FIELDS) {
    const v = Number(b[f] ?? 0);
    if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: `${f} 값이 올바르지 않습니다.` });
    entry[f] = Math.round(v * 10) / 10;
  }
  res.status(201).json(await store.addEntry(entry));
}));

app.delete('/api/entries/:id', wrap(async (req, res) => {
  const ok = await store.deleteEntry(req.params.id);
  res.status(ok ? 204 : 404).end();
}));

// 자주 먹는 음식: 최근 30일 기록을 이름별로 묶어 빈도 > 최근순으로 최대 8개
app.get('/api/recent', wrap(async (req, res) => {
  const date = DATE_RE.test(req.query.date ?? '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const entries = await store.listRange(shiftDate(date, -30), shiftDate(date, 1));
  const byName = new Map();
  for (const e of entries) {
    const cur = byName.get(e.name);
    if (!cur) byName.set(e.name, { entry: e, count: 1 });
    else {
      cur.count++;
      if (e.date + e.time > cur.entry.date + cur.entry.time) cur.entry = e;
    }
  }
  const items = [...byName.values()]
    .sort((a, b) => b.count - a.count || (b.entry.date + b.entry.time).localeCompare(a.entry.date + a.entry.time))
    .slice(0, 8)
    .map(({ entry, count }) => {
      const { id, date: _d, time: _t, ...food } = entry;
      return { ...food, count };
    });
  res.json({ items });
}));

// 하루 요약: 섭취량, 권장량, 달성률, 최근 7일 칼로리
app.get('/api/summary', wrap(async (req, res) => {
  const date = req.query.date;
  if (!DATE_RE.test(date ?? '')) return res.status(400).json({ error: 'date=YYYY-MM-DD 가 필요합니다.' });
  const profile = await store.getProfile();
  const targets = profile ? calcTargets(profile) : null;
  const entries = await store.listEntries(date);
  const totals = sumEntries(entries);
  const percent = targets
    ? Object.fromEntries(FIELDS.map((f) => [f, Math.round((totals[f] / targets[f]) * 100)]))
    : null;

  const from = shiftDate(date, -6);
  const range = await store.listRange(from, date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDate(from, i);
    return { date: d, calories: sumEntries(range.filter((e) => e.date === d)).calories };
  });
  res.json({ date, profile, targets, totals, percent, entries, week });
}));

app.use((err, _req, res, _next) => {
  if (err instanceof AnalyzeError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '이미지가 너무 큽니다.' });
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});
