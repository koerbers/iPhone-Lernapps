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

/**
 * Wie parse(), versteht aber zusätzlich eingefügten Text ohne Trennzeichen, wie ihn die
 * iPhone-Texterkennung („Live Text“) aus einer zweispaltigen Liste kopiert:
 * - spaltenweise: erst alle Wörter der linken Spalte, dann alle der rechten
 * - abwechselnd: Wort, Übersetzung, Wort, Übersetzung …
 * Gewählt wird die Anordnung, bei der rechts am ehesten Deutsch steht.
 */
export function parseText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pairs = parse(text);
  if (pairs.length >= lines.length * 0.4 || lines.length < 4 || lines.length % 2) return pairs;

  const half = lines.length / 2;
  const blocks = lines.slice(0, half).map((l, i) => [l, lines[half + i]]);
  const alternating = [];
  for (let i = 0; i < lines.length; i += 2) alternating.push([lines[i], lines[i + 1]]);
  const germanRight = (list) => list.reduce((sum, [a, b]) => sum + germanWordScore(b) - germanWordScore(a), 0);
  const best = germanRight(blocks) >= germanRight(alternating) ? blocks : alternating;
  return best.map(([a, b]) => makePair(a, b)).filter(Boolean);
}

/** Wie deutsch sieht ein einzelnes Wort/eine Zeile aus? (Umlaute, großgeschriebene Nomen, Endungen) */
function germanWordScore(text) {
  let score = 0;
  if (/[äöüß]/i.test(text)) score += 2;
  if (/^\p{Lu}\p{Ll}/u.test(text)) score += 1; // deutsche Nomen sind großgeschrieben
  if (/(en|ung|chen|lich|ig|keit|heit)\b/i.test(text)) score += 1;
  if (/^to\s/i.test(text)) score -= 2; // englische Verben
  return score;
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
