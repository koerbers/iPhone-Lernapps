// Vergleicht eine eingetippte Antwort tolerant mit der Lösung.
// - Groß-/Kleinschreibung, Satzzeichen, Akzente sind egal.
// - ä/ae, ö/oe, ü/ue, ß/ss werden gleich behandelt.
// - Artikel (der/die/das, the/a) und „to“ vor englischen Verben sind optional.
// - Klammerinhalte sind optional: „(sich) freuen“ = „freuen“.
// - Bei mehreren Bedeutungen („Haus, Gebäude“) reicht eine davon.
// - Kleine Tippfehler ergeben „fast richtig“ (zählt als richtig).

export const CORRECT = 'correct';
export const ALMOST = 'almost';
export const WRONG = 'wrong';

const OPTIONAL_PREFIXES = [
  'to ', 'the ', 'a ', 'an ',
  'der ', 'die ', 'das ', 'den ', 'dem ', 'des ', 'ein ', 'eine ', 'einen ', 'sich ',
];

export function check(input, expected) {
  const given = split(input).map(normalize).filter(Boolean);
  const solutions = alternatives(expected);
  if (!given.length || !solutions.length) return WRONG;

  if (given.some((g) => solutions.includes(g))) return CORRECT;

  for (const g of given) {
    for (const s of solutions) {
      if (levenshtein(g, s) <= tolerance(s)) return ALMOST;
    }
  }
  return WRONG;
}

export function alternatives(expected) {
  const withParentheses = expected.replace(/[()]/g, ' ');
  const all = [
    ...split(expected).map(normalize),
    normalize(expected),
    ...split(withParentheses).map(normalize),
  ];
  return [...new Set(all.filter(Boolean))];
}

/** Trennt mehrere Bedeutungen. Kommas in Klammern zählen nicht als Trenner. */
export function split(text) {
  let t = text;
  for (const sep of [' oder ', ' or ', ';', '/', '|']) t = t.split(sep).join(',');
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of t) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function normalize(text) {
  let t = text.toLowerCase();
  t = t.replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
  t = t.normalize('NFD').replace(/\p{M}/gu, ''); // Akzente und Makrons (ā) entfernen
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  t = t.replaceAll('’', "'");
  t = t.replace(/[^\p{L}\p{N}']+/gu, ' ').trim().replace(/\s+/g, ' ');

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of OPTIONAL_PREFIXES) {
      if (t.startsWith(prefix) && t.length > prefix.length) {
        t = t.slice(prefix.length);
        changed = true;
      }
    }
  }
  return t;
}

export function tolerance(solution) {
  if (solution.length < 4) return 0;
  if (solution.length < 9) return 1;
  return 2;
}

export function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
