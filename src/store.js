import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILE = path.join(DIR, 'db.json');
const empty = () => ({ profile: null, entries: [] });

let queue = Promise.resolve(); // 쓰기 직렬화

async function load() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return empty();
    if (e instanceof SyntaxError) {
      // 손상된 파일은 덮어쓰지 않고 백업해 두고 빈 DB로 시작
      const backup = `${FILE}.corrupt-${Date.now()}`;
      await rename(FILE, backup);
      console.error(`db.json이 손상되어 ${backup} 로 백업했습니다.`);
      return empty();
    }
    throw e;
  }
}

async function save(db) {
  await mkdir(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, FILE);
}

function mutate(fn) {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export const getProfile = async () => (await load()).profile;
export const setProfile = (profile) => mutate((db) => void (db.profile = profile));

export const listEntries = async (date) =>
  (await load()).entries.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));

export const listRange = async (from, to) =>
  (await load()).entries.filter((e) => e.date >= from && e.date <= to);

export const addEntry = (entry) =>
  mutate((db) => {
    const saved = { ...entry, id: randomUUID() };
    db.entries.push(saved);
    return saved;
  });

export const listAll = async () => (await load()).entries;

export const updateEntry = (id, fields) =>
  mutate((db) => {
    const i = db.entries.findIndex((e) => e.id === id);
    if (i < 0) return null;
    db.entries[i] = { ...db.entries[i], ...fields, id };
    return db.entries[i];
  });

export const deleteEntry = (id) =>
  mutate((db) => {
    const before = db.entries.length;
    db.entries = db.entries.filter((e) => e.id !== id);
    return db.entries.length < before;
  });
