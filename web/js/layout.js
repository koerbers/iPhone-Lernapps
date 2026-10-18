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
// 5. Zeilen ohne Fremdwort: Fortsetzung der Bedeutung (wenn die vorige mit Komma endet)
//    oder Beispielsatz (Fremdsprache) mit Übersetzung(en) darunter (Deutsch).
// Wortgruppen, die nicht an einer Spaltenkante beginnen, sind meist Störungen
// (Tabellenlinien, Flaggen, durchscheinende Rückseite) und werden verworfen.
import { makePair } from './parser.js';


/**
 * Nur die Vokabelpaare einer Seite.
 * @returns {{term: string, translation: string, note: string}[] | null} null, wenn keine Tabelle erkannt wurde
 */
export function tableToPairs(words, pageWidth) {
  return tableToContent(words, pageWidth)?.pairs ?? null;
}

/**
 * Vokabelpaare und Beispielsätze einer Seite.
 * @param {{text: string, x0: number, x1: number, y0: number, y1: number, confidence?: number}[]} words
 * @param {number} pageWidth
 * @returns {{pairs: object[], sentences: {prompt: string, solutions: string[]}[]} | null}
 */
export function tableToContent(words, pageWidth) {
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
  const sentences = [];
  let lastPair = null; // zuletzt erkannte Vokabel
  let lastRaw = ''; // ihre Bedeutung, wie sie auf der Seite steht (vor dem Aufräumen)
  let pending = null; // Beispielsatz im Aufbau
  let skipNext = false;
  const flush = () => {
    const sentence = pending && makeSentence(pending);
    if (sentence) sentences.push(sentence);
    pending = null;
  };

  table.forEach(({ cells, center }, r) => {
    if (skipNext) {
      skipNext = false; // schon als (tiefer stehende) Übersetzung verwendet
      return;
    }
    if (cells[0]) {
      flush();
      let translation = cells[translationCol];
      let noteCells = cells.slice(1, translationCol);
      // Schräg fotografiert: Die Übersetzung steht manchmal etwas tiefer in der nächsten Zeile
      const next = table[r + 1];
      if (!translation && next && !next.cells[0] && next.center - center < lineHeight * 1.6) {
        translation = next.cells[translationCol];
        noteCells = noteCells.map((c, i) => c || next.cells[i + 1]);
        skipNext = Boolean(translation);
      }
      lastPair = null;
      if (!translation) return;
      const pair = makePair(cells[0], translation, noteCells.filter(Boolean).join(' '));
      if (pair) {
        pairs.push(pair);
        lastPair = pair;
        lastRaw = translation;
      }
      return;
    }

    const text = cells[translationCol];
    if (!text || !lastPair) return;

    // Bedeutung geht in der nächsten Zeile weiter: „sich bemühen (um),“ → „streben nach“
    if (!pending && /,\s*$/.test(lastRaw)) {
      const more = makePair('x', text);
      if (more) lastPair.translation = `${lastPair.translation}, ${more.translation}`;
      const extraNote = cells.slice(1, translationCol).filter(Boolean).join(' ');
      if (extraNote) lastPair.note = [lastPair.note, extraNote].filter(Boolean).join(' ');
      lastRaw = text;
      return;
    }

    // Beispielsatz: erst die Fremdsprache, darunter die deutsche(n) Übersetzung(en).
    // Direkt nach einem fremdsprachigen Satz wird eine Übersetzung erwartet (Deutsch, außer die Zeile
    // ist eindeutig fremdsprachig); sonst beginnt ein neuer Satz (außer die Zeile ist eindeutig Deutsch).
    // Umgebrochener fremdsprachiger Satz: „… quoque adesse“ / „debes.“ (Übersetzungen beginnen groß)
    const lastPrompt = pending?.prompt.at(-1);
    if (pending && !pending.solutions.length && !/[.!?]\s*$/.test(lastPrompt) && /^\p{Ll}/u.test(text)) {
      pending.prompt.push(text);
      return;
    }
    const score = germanScore(text);
    // Nach einer Übersetzung reicht ein schwächeres Signal für eine weitere Übersetzung.
    const threshold = !pending ? 1.5 : pending.solutions.length ? 1 : -1.5;
    const german = pending && !pending.solutions.length ? score > threshold : score >= threshold;
    if (!german) {
      if (pending?.solutions.length) flush();
      pending ??= { prompt: [], solutions: [] };
      pending.prompt.push(text);
    } else if (pending) {
      const last = pending.solutions.at(-1);
      if (last && !/[.!?]\s*$/.test(last)) pending.solutions[pending.solutions.length - 1] = `${last} ${text}`;
      else pending.solutions.push(text);
    }
  });
  flush();
  return { pairs, sentences };
}

function makeSentence({ prompt, solutions }) {
  const text = prompt.join(' ').replace(/\s+/g, ' ').trim();
  const sols = solutions.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => /\p{L}/u.test(t));
  if (!sols.length || text.split(' ').length < 2 || !/\p{L}/u.test(text)) return null;
  return { prompt: text, solutions: sols };
}

const GERMAN_LINE_WORDS = new Set(
  ('der die das den dem des ein eine einen einem einer eines und ist sind war waren hat haben nicht kein keine ' +
    'auch sich auf aus mit nach von vor zu zum zur bei für hinter über unter dort hier da jetzt schon noch immer ' +
    'sehr aber denn weil dass wenn wie was wer wo warum er sie wir ihr ich du uns euch ihn ihm mein dein sein ' +
    'seine ihre heute oft viel viele alle wird werden kann können will wollen muss soll')
    .split(' '),
);
const LATIN_LINE_WORDS = new Set(
  ('et est sunt non ibi iam sed nam cum ad quod quid ubi tum etiam neque atque nec ac ut si nunc tandem semper ' +
    'quoque autem enim ergo itaque sic tam iterum statim subito diu vos nos tu ego me te se eum eam id ea ' +
    'post ante per inter sub apud ab ex de pro sine propter contra')
    .split(' '),
);

/** Grobe Einschätzung, ob eine Zeile Deutsch ist (sonst: Fremdsprache). */
export function isGermanLine(text) {
  return germanScore(text) > 0;
}

/** > 0: eher Deutsch, < 0: eher Fremdsprache */
function germanScore(text) {
  let score = 0;
  // ä/ö/ü sprechen für Deutsch – aber die Texterkennung liest ā auch mal als ä („Dävus“)
  if (/[äöüß]/i.test(text)) score += 1;
  // Lateinische Längenzeichen liest die Texterkennung als à, á, ó …
  // (aber auch „ó“ statt „ö“ in deutschen Wörtern, daher nicht zu stark gewichten)
  if (/[àáâãèéêìíîòóôùúûāēīōū]/i.test(text)) score -= 2;
  for (const raw of text.toLowerCase().split(/[^\p{L}]+/u)) {
    if (!raw) continue;
    if (GERMAN_LINE_WORDS.has(raw)) score += 1;
    if (LATIN_LINE_WORDS.has(raw)) score -= 1;
    if (/(ibus|orum|arum|que|unt|ant)$/.test(raw) && raw.length > 4) score -= 0.5;
  }
  return score;
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
