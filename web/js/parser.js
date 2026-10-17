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
    return makePair(columns[0], columns.at(-1), columns.slice(1, -1).join(' '));
  }
  if (columns.length === 2) return makePair(columns[0], columns[1]);

  // 2. Trennzeichen innerhalb der Zeile
  for (const sep of INLINE_SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx >= 0) return makePair(line.slice(0, idx), line.slice(idx + sep.length));
  }

  // 3. Zwei Leerzeichen als letzte Möglichkeit
  const idx = line.indexOf('  ');
  if (idx >= 0) return makePair(line.slice(0, idx), line.slice(idx + 2));
  return null;
}

/** Baut ein Vokabelpaar aus Rohtext oder gibt null zurück, wenn es keins ist. */
export function makePair(term, translation, note = '') {
  const t = clean(term);
  const tr = clean(translation);
  if (!t || !tr) return null;
  if (HEADING.test(t)) return null;
  // Seitenzahlen o. Ä. ignorieren
  if (!/\p{L}/u.test(t) || !/\p{L}/u.test(tr)) return null;
  // Bei der Notiz keine Nummerierung entfernen („3. Pers. Sg.“)
  return { term: t, translation: tr, note: note.trim().replace(/[\s—–\-_|=~,;:]+$/, '') };
}

function clean(s) {
  return s
    .trim()
    // Aufzählungszeichen und Nummerierung am Anfang entfernen („1.“, „•“, „-“, „*“)
    .replace(/^([0-9]+[.)]\s*|[•·*\-–—]\s*)/, '')
    // Striche, Linien und Satzzeichen-Reste am Ende entfernen
    .replace(/[\s—–\-_|=~,;:]+$/, '')
    .trim();
}

/**
 * Korrigiert typische Lesefehler der Texterkennung bei Akzenten:
 * - Fremdwort: Die Texterkennung kennt keine lateinischen Längenzeichen (ā, ē, ō …) und liest
 *   sie als à, ä, ó … – daher alle Akzente entfernen („clàmàre“ → „clamare“).
 * - Deutsch: ó/ò → ö, á/à → ä, ú/ù → ü („plótzlich“ → „plötzlich“).
 */
export function fixOcrAccents(pair) {
  const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ı', 'i').normalize('NFC');
  const german = (s) =>
    s
      .replace(/[áàâ]/g, 'ä').replace(/[ÁÀÂ]/g, 'Ä')
      .replace(/[óòô]/g, 'ö').replace(/[ÓÒÔ]/g, 'Ö')
      .replace(/[úùû]/g, 'ü').replace(/[ÚÙÛ]/g, 'Ü')
      .replaceAll('ı', 'i');
  // In der Notiz stehen meist Stammformen („properō“, „tālis, tāle“) und Abkürzungen („Präp. m. Akk.“)
  const note = plain(pair.note ?? '').replace(/\bPrap\./g, 'Präp.');
  return { ...pair, term: plain(pair.term), translation: german(pair.translation), note };
}
