// Fächer und Abfragerichtungen.
// "fwd" = Fremdsprache → Deutsch, "rev" = Deutsch → Fremdsprache

// Ohne Prototyp: SUBJECTS['constructor'] o. Ä. aus der Adresse ergibt kein Fach
export const SUBJECTS = Object.assign(Object.create(null), {
  english: { id: 'english', name: 'Englisch', flag: '🇬🇧', dirs: ['fwd', 'rev'], ocrLang: 'eng+deu' },
  // Latein wird nur Latein → Deutsch abgefragt
  latin: { id: 'latin', name: 'Latein', flag: '🏛️', dirs: ['fwd'], ocrLang: 'lat+deu' },
});

export const SUBJECT_IDS = Object.keys(SUBJECTS);

export function dirLabel(subject, dir) {
  const name = SUBJECTS[subject].name;
  return dir === 'fwd' ? `${name} → Deutsch` : `Deutsch → ${name}`;
}

export function sourceLang(subject, dir) {
  return dir === 'fwd' ? SUBJECTS[subject].name : 'Deutsch';
}

export function targetLang(subject, dir) {
  return dir === 'fwd' ? 'Deutsch' : SUBJECTS[subject].name;
}

export function promptOf(card, dir) {
  return dir === 'fwd' ? card.term : card.translation;
}

export function answerOf(card, dir) {
  return dir === 'fwd' ? card.translation : card.term;
}
