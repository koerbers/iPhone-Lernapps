// Eine laufende Übungsrunde.
// - Falsch beantwortete Vokabeln werden in derselben Runde nach ein paar anderen Karten noch einmal abgefragt.
// - Hat eine Vokabel mehrere Bedeutungen und wurde nur ein Teil genannt, zählt das als richtig.
//   Nach ein paar anderen Karten wird dann nach einer weiteren Bedeutung gefragt („moreOf“).
import { review, stateOf } from './srs.js';
import { promptOf } from './subjects.js';

export const MAX_REPEATS_PER_ROUND = 2;
export const REPEAT_GAP = 3;

export function createSession(subject, candidates) {
  return {
    subject,
    queue: candidates.map((c) => ({ card: c.card, dir: c.dir, attempt: 0 })),
    index: 0,
    firstTryCorrect: 0,
    firstTryTotal: 0,
    missed: [],
  };
}

export function currentItem(session) {
  return session.queue[session.index] ?? null;
}

/**
 * Verbucht eine Antwort. Nur die erste Antwort einer Runde verändert die Lernkartei.
 * @param {{given?: string[], missing?: string[]}} [details] beim Eintippen: genannte und fehlende Bedeutungen
 * Gibt einen Protokolleintrag zurück (oder null bei Wiederholungen).
 */
export function recordAnswer(session, correct, now = Date.now(), details = {}) {
  const item = currentItem(session);
  if (!item) return null;
  let log = null;

  if (item.attempt === 0) {
    session.firstTryTotal += 1;
    if (correct) session.firstTryCorrect += 1;
    else if (!session.missed.includes(item.card)) session.missed.push(item.card);
    item.card[item.dir] = review(stateOf(item.card, item.dir), correct, now);
    log = {
      date: now,
      subject: session.subject,
      dir: item.dir,
      kind: 'vocab',
      correct,
      prompt: promptOf(item.card, item.dir),
    };
  }

  const later = Math.min(session.index + 1 + REPEAT_GAP, session.queue.length);
  if (!correct && !item.moreOf && item.attempt < MAX_REPEATS_PER_ROUND) {
    session.queue.splice(later, 0, { card: item.card, dir: item.dir, attempt: item.attempt + 1 });
  } else if (correct && !item.moreOf && item.dir === 'fwd' && details.missing?.length) {
    // Nur ein Teil der Bedeutungen genannt → später nach einer weiteren fragen
    session.queue.splice(later, 0, { card: item.card, dir: item.dir, attempt: item.attempt + 1, moreOf: details.given ?? [] });
  }

  session.index += 1;
  return log;
}
