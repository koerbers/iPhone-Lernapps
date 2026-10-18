// Speichert alle Daten im Browser des Geräts (localStorage).
// Wichtig: Die Daten liegen nur auf diesem Gerät. Über „Sicherung“ in den
// Einstellungen kann man sie als Datei exportieren und woanders importieren.
//
// Mehrere Kinder: Jedes Kind hat ein Profil (Name, Alter, Avatar, Schwierigkeit) und einen
// eigenen Speicherbereich mit Listen, Lernstand, Statistik und Einstellungen. `db` enthält
// immer die Daten des gerade aktiven Kindes. Der Claude-Schlüssel gilt für alle Kinder.
import { LEVELS, levelOf } from './level.js';
import { plugin } from './platform.js';
import { MAX_BOX, newState } from './srs.js';
import { SUBJECT_IDS } from './subjects.js';
import { esc } from './ui.js';

const LEGACY_KEY = 'vokabeltrainer-v1'; // Version ohne Profile
const PROFILES_KEY = 'vokabeltrainer-profiles';
const dataKey = (profileId) => `vokabeltrainer-data-${profileId}`;

export const AVATAR_GROUPS = {
  Tiere: ['🦊', '🐼', '🦁', '🐸', '🐧', '🦄', '🐯', '🐨', '🐙', '🦉', '🐬', '🐝'],
  Weltall: ['🚀', '🛸', '👽', '🤖', '🧑‍🚀', '🪐', '🌌', '☄️', '👾', '🌟', '🌙', '⚔️'],
};
export const AVATARS = Object.values(AVATAR_GROUPS).flat();

/** Avatar eines Kindes als HTML: eigenes Bild (nur auf dem Gerät gespeichert) oder Emoji. */
export function avatarHtml(profile, cls = 'avatar') {
  if (SAFE_IMAGE.test(profile.avatarImage ?? '')) return `<img class="${cls} avatar-img" src="${profile.avatarImage}" alt="">`;
  return `<span class="${cls}">${esc(profile.avatar)}</span>`;
}

// Nur echte Bilddaten zulassen (eine manipulierte Sicherung könnte sonst Code einschleusen)
const SAFE_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

// ---------- Sicherung prüfen: nur bekannte Felder mit passenden Werten übernehmen ----------

const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const int = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);
const safeId = (v) => (typeof v === 'string' && /^[\w.-]{1,64}$/.test(v) ? v : null);
const list = (v) => (Array.isArray(v) ? v : []);

function cleanState(st) {
  if (!st || typeof st !== 'object') return undefined;
  return {
    box: int(st.box, 0, MAX_BOX, 0), due: num(st.due), correct: int(st.correct, 0, 1e6, 0),
    wrong: int(st.wrong, 0, 1e6, 0), last: Number.isFinite(st.last) ? st.last : null,
  };
}

/** Daten eines Kindes aus einer Sicherung. Unbrauchbare Einträge werden weggelassen. */
function cleanData(d) {
  const lists = list(d?.lists)
    .filter((l) => safeId(l?.id) && SUBJECT_IDS.includes(l.subject))
    .map((l) => ({ id: l.id, name: str(l.name, 100) || 'Liste', subject: l.subject, createdAt: num(l.createdAt) }));
  const listIds = new Set(lists.map((l) => l.id));
  const cards = list(d?.cards)
    .filter((c) => safeId(c?.id) && listIds.has(c.listId))
    .map((c) => {
      const card = {
        id: c.id, listId: c.listId, term: str(c.term), translation: str(c.translation), note: str(c.note),
        lesson: str(c.lesson, 100), createdAt: num(c.createdAt),
      };
      for (const dir of ['fwd', 'rev']) if (cleanState(c[dir])) card[dir] = cleanState(c[dir]);
      return card;
    });
  const sentences = list(d?.sentences)
    .filter((x) => safeId(x?.id) && listIds.has(x.listId))
    .map((x) => ({
      id: x.id, listId: x.listId, prompt: str(x.prompt, 1000),
      solutions: list(x.solutions).map((t) => str(t, 1000)).filter(Boolean),
      lesson: str(x.lesson, 100), correct: int(x.correct, 0, 1e6, 0), wrong: int(x.wrong, 0, 1e6, 0), createdAt: num(x.createdAt),
    }))
    .filter((x) => x.prompt && x.solutions.length);
  const logs = list(d?.logs)
    .filter((l) => Number.isFinite(l?.date) && SUBJECT_IDS.includes(l.subject))
    .map((l) => ({
      date: l.date, subject: l.subject, dir: l.dir === 'rev' ? 'rev' : 'fwd', kind: l.kind === 'sentence' ? 'sentence' : 'vocab',
      correct: l.correct === true, prompt: str(l.prompt, 1000),
    }));
  const s = d?.settings ?? {};
  const settings = {
    ...DEFAULT_SETTINGS,
    sessionSize: int(s.sessionSize, 1, 200, DEFAULT_SETTINGS.sessionSize),
    maxNew: int(s.maxNew, 0, 200, DEFAULT_SETTINGS.maxNew),
    mode: ['typing', 'choice', 'flashcard'].includes(s.mode) ? s.mode : DEFAULT_SETTINGS.mode,
    useAI: s.useAI !== false,
    timerOn: s.timerOn !== false,
    timerMinutes: int(s.timerMinutes, 15, 120, DEFAULT_SETTINGS.timerMinutes),
  };
  return { lists, cards, sentences, logs, settings };
}

/** Profil aus einer Sicherung: nur bekannte Felder mit passenden Werten übernehmen. */
function cleanProfile(p) {
  const id = String(p?.id ?? '');
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  return {
    id,
    name: String(p.name ?? 'Kind').slice(0, 40),
    age: Number.isInteger(p.age) && p.age >= 4 && p.age <= 20 ? p.age : null,
    avatar: AVATARS.includes(p.avatar) ? p.avatar : AVATARS[0],
    avatarImage: SAFE_IMAGE.test(p.avatarImage ?? '') ? p.avatarImage : null,
    difficulty: ['auto', ...Object.keys(LEVELS)].includes(p.difficulty) ? p.difficulty : 'auto',
  };
}

const DEFAULT_SETTINGS = {
  sessionSize: 20,
  maxNew: 10,
  mode: 'typing',
  useAI: true,
  timerOn: true,
  timerMinutes: 15,
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

function emptyState(level = LEVELS.medium) {
  return {
    lists: [], cards: [], sentences: [], logs: [],
    settings: { ...DEFAULT_SETTINGS, sessionSize: level.sessionSize, maxNew: level.maxNew },
  };
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert('Speichern fehlgeschlagen: ' + e.message);
  }
}

// ---------- Profile ----------

function loadProfiles() {
  const stored = readJSON(PROFILES_KEY);
  if (stored?.list?.length) return { claudeKey: '', ...stored };

  // Erster Start – oder Umstieg von der Version ohne Profile: vorhandene Daten ins erste Profil
  const legacy = readJSON(LEGACY_KEY);
  const profile = { id: uid(), name: legacy?.settings?.name || 'Kind 1', age: null, avatar: AVATARS[0], difficulty: 'auto' };
  const state = { list: [profile], active: profile.id, claudeKey: legacy?.settings?.claudeKey ?? '' };
  if (legacy) {
    delete legacy.settings?.claudeKey;
    delete legacy.settings?.name;
    writeJSON(dataKey(profile.id), legacy);
    localStorage.removeItem(LEGACY_KEY);
  }
  writeJSON(PROFILES_KEY, state);
  return state;
}

export const profiles = loadProfiles();

export function saveProfiles() {
  writeJSON(PROFILES_KEY, profiles);
}

export function activeProfile() {
  return profiles.list.find((p) => p.id === profiles.active) ?? profiles.list[0];
}

/** Schwierigkeitsstufe des aktiven Kindes (siehe level.js) */
export function currentLevel() {
  return levelOf(activeProfile());
}

export function getClaudeKey() {
  return profiles.claudeKey ?? '';
}

export function setClaudeKey(key) {
  profiles.claudeKey = key;
  saveProfiles();
}

export function addProfile({ name, age, avatar, avatarImage, difficulty }) {
  const profile = {
    id: uid(), name, age: age || null, avatar: avatar || AVATARS[profiles.list.length % AVATARS.length],
    avatarImage: avatarImage || null, difficulty: difficulty || 'auto',
  };
  profiles.list.push(profile);
  saveProfiles();
  writeJSON(dataKey(profile.id), emptyState(levelOf(profile)));
  return profile;
}

export function updateProfile(id, fields) {
  Object.assign(profiles.list.find((p) => p.id === id), fields);
  saveProfiles();
}

/** Löscht ein Kind mit allen Daten (das letzte Profil bleibt immer erhalten). */
export function deleteProfile(id) {
  if (profiles.list.length <= 1) return;
  if (profiles.active === id) activeDeleted = true; // ab jetzt nichts mehr speichern (App lädt neu)
  profiles.list = profiles.list.filter((p) => p.id !== id);
  localStorage.removeItem(dataKey(id));
  if (profiles.active === id) profiles.active = profiles.list[0].id;
  saveProfiles();
}

/** Wechselt das Kind. Die App wird neu geladen, damit nichts vom vorherigen Kind übrig bleibt. */
const SWITCHED = 'vokabeltrainer-switched';

export function switchProfile(id) {
  save();
  profiles.active = id;
  saveProfiles();
  try {
    sessionStorage.setItem(SWITCHED, String(Date.now()));
  } catch {
    // ohne sessionStorage wird nach dem Wechsel eben noch einmal gefragt
  }
  location.hash = '#/lernen';
  location.reload();
}

/** Wurde die App gerade wegen eines Kinderwechsels neu geladen? (Dann nicht noch einmal fragen.) */
export function justSwitched() {
  try {
    const at = Number(sessionStorage.getItem(SWITCHED));
    sessionStorage.removeItem(SWITCHED);
    return Date.now() - at < 10_000;
  } catch {
    return false;
  }
}

// ---------- Daten des aktiven Kindes ----------

function loadData(profile) {
  const data = readJSON(dataKey(profile.id));
  const base = emptyState(levelOf(profile));
  if (!data) return base;
  return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
}

export const db = loadData(activeProfile());
let activeDeleted = false;

export function save() {
  if (!activeDeleted) writeJSON(dataKey(profiles.active), db);
}

// Bittet den Browser, die Daten nicht automatisch zu löschen.
navigator.storage?.persist?.();

// ---------- Listen ----------

export function getList(id) {
  return db.lists.find((l) => l.id === id);
}

export function listsOf(subject) {
  return db.lists.filter((l) => l.subject === subject);
}

export function addList(name, subject) {
  const list = { id: uid(), name, subject, createdAt: Date.now() };
  db.lists.push(list);
  save();
  return list;
}

export function deleteList(id) {
  db.lists = db.lists.filter((l) => l.id !== id);
  db.cards = db.cards.filter((c) => c.listId !== id);
  db.sentences = db.sentences.filter((s) => s.listId !== id);
  save();
}

// ---------- Karten ----------

export function cardsOf(listIds) {
  const ids = new Set(listIds);
  return db.cards.filter((c) => ids.has(c.listId));
}

export function cardsOfSubject(subject) {
  return cardsOf(listsOf(subject).map((l) => l.id));
}

export function addCard(listId, term, translation, note = '', lesson = '') {
  const card = { id: uid(), listId, term, translation, note, lesson, createdAt: Date.now() + db.cards.length };
  db.cards.push(card);
  return card;
}

export function deleteCard(id) {
  db.cards = db.cards.filter((c) => c.id !== id);
  save();
}

export function resetProgress(cards) {
  for (const card of cards) {
    card.fwd = newState();
    card.rev = newState();
  }
  save();
}

// ---------- Beispielsätze (z. B. aus dem Schulbuch) ----------

export function sentencesOf(listIds) {
  const ids = new Set(listIds);
  return db.sentences.filter((s) => ids.has(s.listId));
}

/** @param {string[]} solutions eine oder mehrere richtige Übersetzungen */
export function addSentence(listId, prompt, solutions, lesson = '') {
  const sentence = { id: uid(), listId, prompt, solutions, lesson, correct: 0, wrong: 0, createdAt: Date.now() + db.sentences.length };
  db.sentences.push(sentence);
  return sentence;
}

export function deleteSentence(id) {
  db.sentences = db.sentences.filter((s) => s.id !== id);
  save();
}

// ---------- Lektionen ----------

/** Einheitliche Schreibweise: „3“ → „Lektion 3“ */
export function cleanLesson(text) {
  const t = String(text ?? '').trim();
  return /^\d+$/.test(t) ? `Lektion ${t}` : t;
}

/** Sortiert Lektionen natürlich („Lektion 2“ vor „Lektion 10“), Vokabeln ohne Lektion zuletzt. */
export function sortLessons(lessons) {
  return [...lessons].sort((a, b) => {
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    return a.localeCompare(b, 'de', { numeric: true });
  });
}

/** Alle Lektionen einer Liste ('' = Vokabeln ohne Lektion). */
export function lessonsOf(listId) {
  return sortLessons(new Set([...cardsOf([listId]), ...sentencesOf([listId])].map((c) => c.lesson ?? '')));
}

// ---------- Protokoll ----------

export function addLog(entry) {
  if (entry) db.logs.push(entry);
}

// ---------- Sicherung ----------

/** Sicherung aller Kinder (ohne Claude-Schlüssel) als Datei. */
export async function exportBackup() {
  save();
  const backup = {
    format: 'vokabeltrainer-2',
    profiles: profiles.list,
    data: Object.fromEntries(profiles.list.map((p) => [p.id, readJSON(dataKey(p.id))])),
  };
  const json = JSON.stringify(backup, null, 1);
  const name = `vokabeltrainer-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const fs = plugin('Filesystem');
  if (fs) {
    // In der App gibt es keine Downloads: Datei ablegen und über „Teilen“ sichern (Dateien, iCloud, Drive, Mail …)
    const { uri } = await fs.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
    try {
      await plugin('Share').share({ title: 'Vokabeltrainer-Sicherung', files: [uri] });
    } catch (e) {
      if (!/cancel/i.test(e?.message ?? '')) throw e; // Abbrechen ist kein Fehler
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Lädt eine Sicherung. Sicherung mit allen Kindern → ersetzt alle Kinder.
 * Ältere Sicherung (ein Kind) → ersetzt nur die Daten des aktiven Kindes.
 * @returns {boolean} true, wenn die App neu geladen werden muss
 */
export function importBackup(json) {
  const data = JSON.parse(json);
  if (data.format === 'vokabeltrainer-2' && Array.isArray(data.profiles)) {
    const kids = data.profiles.map(cleanProfile).filter(Boolean);
    if (!kids.length) throw new Error('Keine gültige Sicherung');
    for (const p of profiles.list) localStorage.removeItem(dataKey(p.id));
    for (const p of kids) writeJSON(dataKey(p.id), cleanData(data.data?.[p.id]));
    profiles.list = kids;
    profiles.active = kids[0].id;
    saveProfiles();
    return true;
  }
  if (!Array.isArray(data.lists) || !Array.isArray(data.cards)) throw new Error('Keine gültige Sicherung');
  for (const key of Object.keys(db)) delete db[key];
  Object.assign(db, cleanData(data));
  save();
  return false;
}

/** Kopiert eine Liste (mit Vokabeln und Sätzen, ohne Lernstand) zu einem anderen Kind. */
export function copyListToProfile(listId, profileId) {
  const list = getList(listId);
  const target = readJSON(dataKey(profileId)) ?? emptyState();
  target.sentences ??= [];
  const newList = { ...list, id: uid(), createdAt: Date.now() };
  target.lists.push(newList);
  for (const c of cardsOf([listId])) {
    target.cards.push({ id: uid(), listId: newList.id, term: c.term, translation: c.translation, note: c.note, lesson: c.lesson ?? '', createdAt: c.createdAt });
  }
  for (const x of sentencesOf([listId])) {
    target.sentences.push({ ...x, id: uid(), listId: newList.id, correct: 0, wrong: 0 });
  }
  writeJSON(dataKey(profileId), target);
}

// ---------- Beispieldaten ----------

export function insertSampleData() {
  const en = addList('Beispiel: Unit 1', 'english');
  for (const [t, d] of [
    ['house', 'Haus'], ['to go, went, gone', 'gehen'], ['friend', 'Freund, Freundin'],
    ['school', 'Schule'], ['to be happy', 'glücklich sein'], ['dog', 'Hund'],
    ['breakfast', 'Frühstück'], ['always', 'immer'], ['beautiful', 'schön'], ['to buy, bought, bought', 'kaufen'],
  ]) addCard(en.id, t, d);

  const la = addList('Beispiel: Lektion 1', 'latin');
  for (const [t, d] of [
    ['amicus, -i m.', 'Freund'], ['villa, -ae f.', 'Haus, Landhaus'], ['vocare, voco', 'rufen, nennen'],
    ['magnus, -a, -um', 'groß'], ['et', 'und'], ['non', 'nicht'], ['servus, -i m.', 'Sklave, Diener'],
    ['laborare, laboro', 'arbeiten'], ['hodie', 'heute'], ['ubi?', 'wo?'],
  ]) addCard(la.id, t, d);
  save();
}
