// Schwierigkeitsstufen – automatisch nach dem Alter des Kindes oder von Hand eingestellt.
// Sie bestimmen, wie streng geprüft wird und wie schwer Übungssätze und Antwortmöglichkeiten sind.

export const LEVELS = Object.assign(Object.create(null), {
  easy: {
    id: 'easy',
    label: 'Leicht',
    ages: 'bis 10 Jahre',
    description: 'Großzügig bei Tippfehlern, Tipp-Knopf (erster Buchstabe), leichte Antwortmöglichkeiten, kurze Sätze im Präsens.',
    typoBonus: 1, // mehr Tippfehler erlaubt
    hint: true, // „💡 Tipp“ zeigt den Anfang der Lösung
    similarDistractors: false, // beim Auswählen: zufällige falsche Antworten
    sentenceMatch: 0.85, // Buchsätze: ab dieser Ähnlichkeit richtig
    defaultDir: 'fwd', // Englisch: erst Englisch → Deutsch
    sessionSize: 10,
    maxNew: 5,
    sentenceStyle:
      'sehr kurze, einfache Hauptsätze mit 4 bis 8 Wörtern, nur im Präsens, nur ganz einfache Grundwörter',
    grading: 'Sei sehr großzügig und ermutigend. Kleine Fehler bei Endungen oder Wortstellung machen die Übersetzung nicht falsch, wenn der Sinn stimmt.',
  },
  medium: {
    id: 'medium',
    label: 'Mittel',
    ages: '11–12 Jahre',
    description: 'Normale Toleranz, kurze Sätze mit einfachen Nebensätzen und den gängigen Zeitformen.',
    typoBonus: 0,
    hint: false,
    similarDistractors: false,
    sentenceMatch: 0.9,
    defaultDir: 'both',
    sessionSize: 20,
    maxNew: 10,
    sentenceStyle:
      'kurze Sätze mit 5 bis 12 Wörtern, Präsens und einfache Vergangenheit, gelegentlich ein Nebensatz mit und/aber/weil',
    grading: 'Bewerte fair: Der Sinn muss stimmen, Zeitform und Person sollten passen. Kleine Rechtschreibfehler machen die Antwort nicht falsch.',
  },
  hard: {
    id: 'hard',
    label: 'Schwer',
    ages: 'ab 13 Jahren',
    description: 'Strenger bei Tippfehlern, ähnliche Antwortmöglichkeiten, längere Sätze mit Nebensätzen und verschiedenen Zeitformen.',
    typoBonus: -1, // weniger Tippfehler erlaubt
    hint: false,
    similarDistractors: true, // beim Auswählen: ähnlich aussehende falsche Antworten
    sentenceMatch: 0.95,
    defaultDir: 'both',
    sessionSize: 25,
    maxNew: 15,
    sentenceStyle:
      'abwechslungsreiche Sätze mit 8 bis 16 Wörtern, verschiedene Zeitformen, Nebensätze und typische Konstruktionen der Klassenstufe',
    grading: 'Bewerte genau: Zeitform, Person, Fall und Wortbedeutung müssen stimmen. Rechtschreibfehler werden erwähnt.',
  },
});

/** Stufe passend zum Alter (ohne Alter: mittel). */
export function levelForAge(age) {
  if (!age) return 'medium';
  if (age <= 10) return 'easy';
  if (age <= 12) return 'medium';
  return 'hard';
}

/** Die Stufe eines Profils: von Hand gewählt oder automatisch nach Alter. */
export function levelOf(profile) {
  const id = profile?.difficulty && profile.difficulty !== 'auto' ? profile.difficulty : levelForAge(profile?.age);
  return LEVELS[id] ?? LEVELS.medium;
}
