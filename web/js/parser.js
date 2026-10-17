// Erkennt Vokabelpaare in erkanntem Text (ohne KI).
// Funktioniert gut mit typischen Vokabellisten:
//   house – Haus
//   amicus, -i m.    Freund
//   to go = gehen
// Spalten aus Fotos werden von der Texterkennung mit Tabulator getrennt.

// Überschriften wie „Lektion 4 – Vokabeln“ oder „Unit 5 - Vocabulary“
// (aber echte Vokabeln wie „page – Seite“ bleiben erhalten)
const HEADING = /^((lektion|unit|lesson|kapitel|chapter|step|seite|page)\s*\d+|vokabeln|vocabulary|wortschatz)$/i;

const INLINE_SEPARATORS = [' – ', ' — ', ' - ', ' = ', ' : ', ': ', ' -> ', ' → ', ' ; '];

export function parse(text) {
  return text.split(/\r?\n/).map(parseLine).filter(Boolean);
}

export function parseLine(rawLine) {
  const line = rawLine.replaceAll('|', '\t').trim();
  if (line.length < 3) return null;

  // 1. Spalten (Tabulator oder viele Leerzeichen)
  const columns = line
    .replace(/\s{3,}/g, '\t')
    .split('\t')
    .map((c) => c.trim())
    .filter(Boolean);

  if (columns.length >= 3) {
    return make(columns[0], columns.at(-1), columns.slice(1, -1).join(' '));
  }
  if (columns.length === 2) return make(columns[0], columns[1]);

  // 2. Trennzeichen innerhalb der Zeile
  for (const sep of INLINE_SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx >= 0) return make(line.slice(0, idx), line.slice(idx + sep.length));
  }

  // 3. Zwei Leerzeichen als letzte Möglichkeit
  const idx = line.indexOf('  ');
  if (idx >= 0) return make(line.slice(0, idx), line.slice(idx + 2));
  return null;
}

function make(term, translation, note = '') {
  const t = clean(term);
  const tr = clean(translation);
  if (!t || !tr) return null;
  if (HEADING.test(t)) return null;
  // Seitenzahlen o. Ä. ignorieren
  if (!/\p{L}/u.test(t) || !/\p{L}/u.test(tr)) return null;
  return { term: t, translation: tr, note: clean(note) };
}

function clean(s) {
  // Aufzählungszeichen und Nummerierung am Anfang entfernen („1.“, „•“, „-“)
  return s.trim().replace(/^([0-9]+[.)]\s*|[•·*\-–]\s+)/, '').trim();
}
