// Speichert alle Daten im Browser des Geräts (localStorage).
// Wichtig: Die Daten liegen nur auf diesem Gerät. Über „Sicherung“ in den
// Einstellungen kann man sie als Datei exportieren und woanders importieren.
import { newState } from './srs.js';

const KEY = 'vokabeltrainer-v1';

const DEFAULT_SETTINGS = {
  name: '',
  sessionSize: 20,
  maxNew: 10,
  mode: 'typing',
  useAI: true,
  claudeKey: '',
};

function emptyState() {
  return { lists: [], cards: [], logs: [], settings: { ...DEFAULT_SETTINGS } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return { ...emptyState(), ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
  } catch {
    return emptyState();
  }
}

export const db = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    alert('Speichern fehlgeschlagen: ' + e.message);
  }
}

// Bittet den Browser, die Daten nicht automatisch zu löschen.
navigator.storage?.persist?.();

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

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

export function addCard(listId, term, translation, note = '') {
  const card = { id: uid(), listId, term, translation, note, createdAt: Date.now() + db.cards.length };
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

// ---------- Protokoll ----------

export function addLog(entry) {
  if (entry) db.logs.push(entry);
}

// ---------- Sicherung ----------

export function exportBackup() {
  const blob = new Blob([JSON.stringify({ ...db, settings: { ...db.settings, claudeKey: '' } }, null, 1)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vokabeltrainer-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.lists) || !Array.isArray(data.cards)) throw new Error('Keine gültige Sicherung');
  const key = db.settings.claudeKey;
  Object.assign(db, emptyState(), data);
  db.settings = { ...DEFAULT_SETTINGS, ...data.settings, claudeKey: key };
  save();
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
