// Auswertungen für die Erfolgskontrolle.
import { addDays, startOfDay } from './srs.js';

export function logsToday(logs, now = Date.now()) {
  const today = startOfDay(now);
  return logs.filter((l) => startOfDay(l.date) === today);
}

/** Anzahl Tage in Folge, an denen geübt wurde (heute oder gestern muss dabei sein). */
export function streak(logs, now = Date.now()) {
  const days = new Set(logs.map((l) => startOfDay(l.date)));
  let day = startOfDay(now);
  if (!days.has(day)) {
    day = addDays(day, -1);
    if (!days.has(day)) return 0;
  }
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

export function accuracy(logs) {
  if (!logs.length) return null;
  return logs.filter((l) => l.correct).length / logs.length;
}

/** Richtig/falsch pro Tag für die letzten `days` Tage (ältester zuerst). */
export function daily(logs, days, now = Date.now()) {
  const today = startOfDay(now);
  const result = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = addDays(today, -offset);
    const entries = logs.filter((l) => startOfDay(l.date) === day);
    result.push({
      day,
      correct: entries.filter((l) => l.correct).length,
      wrong: entries.filter((l) => !l.correct).length,
    });
  }
  return result;
}
