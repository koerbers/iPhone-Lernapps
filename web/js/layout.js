// Erkennt Vokabeltabellen anhand der Position der Wörter auf der Seite.
//
// Typischer Aufbau einer Schulbuchseite:
//   Latein      | Grammatik (m, f, Adv.) | Deutsch                        | Merkhilfe (🇩🇪 Gaudi)
//   gaudēre     |                        | sich freuen                    | Gaudi
//   est         | 3. Pers. Sg.           | er (sie, es) ist               |
//               |                        | Ibi Dāvus est.   ← Beispielsatz, wird ignoriert
//
// Vorgehen:
// 1. Wörter zu Zeilen zusammenfassen (gleiche Höhe auf der Seite).
// 2. In jeder Zeile Wortgruppen bilden (große Lücke = neue Spalte).
// 3. Spalten finden: linke Kanten, die in vielen Zeilen vorkommen.
// 4. Erste Spalte = Fremdwort. Übersetzung = die Spalte, die am häufigsten zusammen mit
//    einem Fremdwort vorkommt. Spalten dazwischen = Notiz, Spalten rechts davon = Merkhilfen (ignoriert).
// 5. Zeilen ohne Fremdwort (Beispielsätze, Fortsetzungen) werden übersprungen.
// Wortgruppen, die nicht an einer Spaltenkante beginnen, sind meist Störungen
// (Tabellenlinien, Flaggen, durchscheinende Rückseite) und werden verworfen.
import { makePair } from './parser.js';


/**
 * @param {{text: string, x0: number, x1: number, y0: number, y1: number, confidence?: number}[]} words
 * @param {number} pageWidth
 * @returns {{term: string, translation: string, note: string}[] | null} null, wenn keine Tabelle erkannt wurde
 */
export function tableToPairs(words, pageWidth) {
  const rows = toRows(words);
  if (rows.length < 3) return null;

  const lineHeight = median(rows.flat().map((w) => w.y1 - w.y0));
  const rowSegments = rows.map((row) => toSegments(row, lineHeight * 1.2));
  const columns = findColumns(rowSegments, pageWidth);
  if (columns.length < 2) return null;

  // Jede Zeile: Text pro Spalte
  const tolerance = pageWidth * 0.025;
  const table = rowSegments.map((segments, r) => {
    const cells = new Array(columns.length).fill('');
    for (const seg of segments) {
      const col = columnOf(seg.x0, columns, pageWidth);
      if (Math.abs(seg.x0 - columns[col]) > tolerance) continue; // keine Spaltenkante → Störung
      cells[col] = cells[col] ? `${cells[col]} ${seg.text}` : seg.text;
    }
    return { cells, center: mid({ y0: Math.min(...rows[r].map((w) => w.y0)), y1: Math.max(...rows[r].map((w) => w.y1)) }) };
  });

  // Übersetzungsspalte: muss oft zusammen mit einem Fremdwort belegt sein. Gibt es mehrere
  // solche Spalten (z. B. Stammformen „parentis m“ und Bedeutung „der Vater“), gewinnt die
  // Spalte, die am deutschesten aussieht.
  const counts = columns.map((_, c) => (c === 0 ? 0 : table.filter(({ cells }) => cells[0] && cells[c]).length));
  const maxCount = Math.max(...counts);
  if (maxCount < 2) return null;
  let translationCol = 1;
  let bestScore = -1;
  for (let c = 1; c < columns.length; c++) {
    if (counts[c] < maxCount * 0.6) continue;
    const score = table.filter(({ cells }) => cells[0] && looksGerman(cells[c])).length;
    if (score > bestScore) {
      bestScore = score;
      translationCol = c;
    }
  }

  const pairs = [];
  table.forEach(({ cells, center }, r) => {
    if (!cells[0]) return;
    let translation = cells[translationCol];
    let noteCells = cells.slice(1, translationCol);
    // Schräg fotografiert: Die Übersetzung steht manchmal etwas tiefer in der nächsten Zeile
    const next = table[r + 1];
    if (!translation && next && !next.cells[0] && next.center - center < lineHeight * 1.6) {
      translation = next.cells[translationCol];
      noteCells = noteCells.map((c, i) => c || next.cells[i + 1]);
    }
    if (!translation) return;
    const pair = makePair(cells[0], translation, noteCells.filter(Boolean).join(' '));
    if (pair) pairs.push(pair);
  });
  return pairs;
}

/** Fasst Wörter zu Zeilen zusammen (Wörter mit ähnlicher Höhe auf der Seite). */
export function toRows(words) {
  // Die Sicherheit der Texterkennung ist bei fetter Schrift unzuverlässig, daher wird nicht danach gefiltert.
  const usable = words.filter((w) => /[\p{L}\p{N}]/u.test(w.text));
  if (!usable.length) return [];
  const lineHeight = median(usable.map((w) => w.y1 - w.y0));
  const sorted = [...usable].sort((a, b) => mid(a) - mid(b));

  const rows = [];
  for (const w of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row.center - mid(w)) < lineHeight * 0.55) {
      row.words.push(w);
      row.center = row.words.reduce((s, x) => s + mid(x), 0) / row.words.length;
    } else {
      rows.push({ center: mid(w), words: [w] });
    }
  }
  return rows.map((r) => r.words.sort((a, b) => a.x0 - b.x0));
}

/** Teilt eine Zeile an großen Lücken in Wortgruppen. */
function toSegments(row, gap) {
  const segments = [];
  for (const w of row) {
    const last = segments.at(-1);
    if (last && w.x0 - last.x1 < gap) {
      last.text += ` ${w.text}`;
      last.x1 = Math.max(last.x1, w.x1);
    } else {
      segments.push({ text: w.text, x0: w.x0, x1: w.x1 });
    }
  }
  return segments;
}

/** Linke Kanten, an denen in vielen Zeilen eine Wortgruppe beginnt. */
function findColumns(rowSegments, pageWidth) {
  const tolerance = pageWidth * 0.02;
  const starts = rowSegments.flat().map((s) => s.x0).sort((a, b) => a - b);
  const clusters = [];
  for (const x of starts) {
    const c = clusters.at(-1);
    if (c && x - c.at(-1) < tolerance) c.push(x);
    else clusters.push([x]);
  }
  const minCount = Math.max(3, Math.round(rowSegments.length * 0.12));
  return clusters
    .filter((c) => c.length >= minCount)
    .map((c) => densestPoint(c, pageWidth * 0.008));
}

/** Die Stelle, an der die meisten Einträge (fast) genau beginnen – Störungen liegen meist daneben. */
function densestPoint(values, radius) {
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const count = values.filter((x) => Math.abs(x - v) <= radius).length;
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

function columnOf(x, columns, pageWidth) {
  const tolerance = pageWidth * 0.025;
  let index = 0;
  columns.forEach((left, i) => {
    if (x >= left - tolerance) index = i;
  });
  return index;
}

const GERMAN_WORDS = /(^|[\s(,;])(der|die|das|den|dem|des|ein|eine|einen|einer|sich|und|nicht|zu|mit|von|auf|für|aus|nach|oder|auch|er|sie|es|wir|ihr|ich|du|wie|was|wo|wer|sein|haben|werden)(?=[\s),;]|$)/i;

function looksGerman(text) {
  return Boolean(text) && (GERMAN_WORDS.test(text) || /[äöüß]/i.test(text));
}

function mid(w) {
  return (w.y0 + w.y1) / 2;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
