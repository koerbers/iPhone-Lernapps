// Lernkartei nach dem Leitner-Prinzip:
// - Richtig beantwortet → Karte rückt ein Fach weiter und kommt erst nach längerer Pause wieder.
// - Falsch beantwortet → Karte fällt zurück in Fach 1 und ist sofort wieder fällig.
// - Karten, die schon oft falsch waren, kommen auch nach richtigen Antworten früher wieder.

export const MAX_BOX = 6;
export const MASTERED_BOX = 5; // ab diesem Fach „sitzt“ eine Vokabel

/** Pause in Tagen, nachdem eine Karte in das jeweilige Fach gerückt ist. */
export const INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32 };

const DAY = 86_400_000;

export function newState() {
  return { box: 0, due: 0, correct: 0, wrong: 0, last: null };
}

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Liefert den neuen Lernstand nach einer Antwort. */
export function review(state, correct, now = Date.now()) {
  const next = { ...state, last: now };
  if (correct) {
    next.correct += 1;
    next.box = Math.min(Math.max(state.box, 0) + 1, MAX_BOX);
    const base = INTERVAL_DAYS[next.box] ?? 1;
    // Je öfter eine Vokabel falsch war, desto kürzer die Pause.
    const penalty = 1 / (1 + 0.2 * next.wrong);
    const days = Math.max(1, Math.round(base * penalty));
    next.due = addDays(startOfDay(now), days);
  } else {
    next.wrong += 1;
    next.box = 1;
    next.due = now;
  }
  return next;
}

export function isDue(state, now = Date.now()) {
  return state.box === 0 || state.due <= now;
}

export function errorRate(state) {
  const total = state.correct + state.wrong;
  return total > 0 ? state.wrong / total : 0;
}

/** Je höher, desto dringender sollte die Karte abgefragt werden. */
export function priority(state, now = Date.now()) {
  const overdueDays = Math.max(0, (now - state.due) / DAY);
  return 2 + (MAX_BOX - state.box) + errorRate(state) * 4 + Math.min(overdueDays, 10) * 0.3;
}

export function stateOf(card, dir) {
  return card[dir] ?? newState();
}

/** Niedrigstes Fach über die abgefragten Richtungen. */
export function weakestBox(card, dirs) {
  return Math.min(...dirs.map((d) => stateOf(card, d).box));
}

export function totalWrong(card, dirs) {
  return dirs.reduce((sum, d) => sum + stateOf(card, d).wrong, 0);
}

/**
 * Stellt die Abfragen für eine Übungsrunde zusammen.
 * Fällige Karten (dringendste zuerst) haben Vorrang, dann kommen neue dazu.
 * Mit fillWithWeak wird bis zur Rundengröße mit den schwächsten Karten aufgefüllt.
 */
export function buildSession(cards, dirs, { size = 20, maxNew = 10, fillWithWeak = false, now = Date.now() } = {}) {
  const all = cards.flatMap((card) => dirs.map((dir) => ({ card, dir, state: stateOf(card, dir) })));
  const byPriority = (a, b) => priority(b.state, now) - priority(a.state, now);

  const due = all.filter((c) => c.state.box > 0 && c.state.due <= now).sort(byPriority);
  const fresh = all.filter((c) => c.state.box === 0).sort((a, b) => a.card.createdAt - b.card.createdAt);

  let picked = due.slice(0, size);
  const freeSlots = Math.max(0, size - picked.length);
  picked = picked.concat(fresh.slice(0, Math.min(maxNew, freeSlots)));

  if (fillWithWeak && picked.length < size) {
    const taken = new Set(picked.map((c) => c.card.id + c.dir));
    const weak = all.filter((c) => !taken.has(c.card.id + c.dir)).sort(byPriority);
    picked = picked.concat(weak.slice(0, size - picked.length));
  }

  return spreadApart(shuffle(picked));
}

export function dueCount(cards, dirs, now = Date.now()) {
  let due = 0;
  let fresh = 0;
  for (const card of cards) {
    for (const dir of dirs) {
      const s = stateOf(card, dir);
      if (s.box === 0) fresh += 1;
      else if (s.due <= now) due += 1;
    }
  }
  return { due, new: fresh };
}

export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Verhindert, dass dieselbe Vokabel direkt hintereinander in beiden Richtungen kommt. */
function spreadApart(items) {
  const result = [];
  const pending = [...items];
  while (pending.length) {
    const lastId = result.at(-1)?.card.id;
    let idx = pending.findIndex((c) => c.card.id !== lastId);
    if (idx < 0) idx = 0;
    result.push(pending.splice(idx, 1)[0]);
  }
  return result;
}
