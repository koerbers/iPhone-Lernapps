// Vergleicht eine eingetippte Antwort tolerant mit der Lösung.
// - Groß-/Kleinschreibung, Satzzeichen, Akzente sind egal.
// - ä/ae, ö/oe, ü/ue, ß/ss werden gleich behandelt.
// - Artikel (der/die/das, the/a), Personalpronomen (er/sie/es …) und „to“ vor englischen Verben sind optional.
// - Klammerinhalte sind optional: „(sich) freuen“ = „freuen“.
// - Bei mehreren Bedeutungen („Haus, Gebäude“) reicht eine davon. checkMeanings() meldet
//   zusätzlich, welche Bedeutungen noch fehlen (die werden später nochmal abgefragt).
// - Kleine Tippfehler ergeben „fast richtig“ (zählt als richtig).

export const CORRECT = 'correct';
export const ALMOST = 'almost';
export const WRONG = 'wrong';

const OPTIONAL_PREFIXES = [
  'to ', 'the ', 'a ', 'an ',
  'der ', 'die ', 'das ', 'den ', 'dem ', 'des ', 'ein ', 'eine ', 'einen ', 'sich ',
  'pl ', 'subst ', // Abkürzungen aus Schulbüchern: „Pl. die Eltern“, „Subst. der Grieche“
  // Personalpronomen: „er (sie, es) ist“ = „ist“ = „sie ist“ = „es ist“
  'ich ', 'du ', 'er ', 'sie ', 'es ', 'wir ', 'ihr ',
];

export function check(input, expected, options) {
  return checkMeanings(input, expected, options).result;
}

/**
 * Prüft eine Antwort Bedeutung für Bedeutung.
 * @returns {{result: string, meanings: string[], matched: number[], missing: string[]}}
 *   meanings = alle Bedeutungen der Lösung, matched = Nummern der genannten Bedeutungen,
 *   missing = Bedeutungen, die nicht genannt wurden
 * @param {{typoBonus?: number}} [options] typoBonus: mehr (+1) oder weniger (-1) Tippfehler erlaubt – je nach Alter
 */
export function checkMeanings(input, expected, { typoBonus = 0 } = {}) {
  const meanings = split(expected);
  const variants = meanings.map(alternatives);
  const whole = normalize(expected);
  const given = split(input).map(normalize).filter(Boolean);
  const outcome = (result, matched) => ({
    result,
    meanings,
    matched: [...matched],
    missing: meanings.filter((_, i) => !matched.has(i)),
  });
  if (!given.length || !meanings.length) return outcome(WRONG, new Set());

  // Genau richtig: alles zusammen, egal mit welchen Satzzeichen („schau, schaut“ = „Schau! Schaut!“)
  if (whole && (normalize(input) === whole || given.includes(whole))) return outcome(CORRECT, new Set(meanings.keys()));
  const matched = new Set();
  for (const g of given) {
    variants.forEach((v, i) => {
      if (v.includes(g)) matched.add(i);
    });
  }
  if (matched.size) return outcome(CORRECT, matched);

  // Kleiner Tippfehler
  for (const g of given) {
    variants.forEach((v, i) => {
      if (v.some((s) => levenshtein(g, s) <= tolerance(s, typoBonus))) matched.add(i);
    });
  }
  return outcome(matched.size ? ALMOST : WRONG, matched);
}

/**
 * Wie ähnlich ist eine Satzübersetzung einer Musterlösung? (0 … 1)
 * Klammern in der Lösung sind Varianten: „Dort ist (befindet sich) Davus.“ passt zu
 * „Dort ist Davus“ und „Dort befindet sich Davus“. Die Wortstellung darf abweichen.
 */
export function sentenceSimilarity(answer, solution) {
  const a = sentenceWords(answer);
  if (!a.length) return 0;
  let best = 0;
  for (const variant of sentenceVariants(solution)) {
    const b = sentenceWords(variant);
    if (!b.length) continue;
    if ([...a].sort().join(' ') === [...b].sort().join(' ')) return 1; // gleiche Wörter, andere Reihenfolge
    const x = a.join(' ');
    const y = b.join(' ');
    best = Math.max(best, 1 - levenshtein(x, y) / Math.max(x.length, y.length));
  }
  return best;
}

function sentenceVariants(solution) {
  return [
    solution.replace(/\([^)]*\)/g, ' '), // ohne Klammerinhalt
    solution.replace(/[()]/g, ' '), // mit Klammerinhalt
    solution.replace(/(\S+)\s*\(([^)]*)\)/g, '$2'), // Klammerinhalt statt des Wortes davor
  ];
}

function sentenceWords(text) {
  let t = text.toLowerCase();
  for (const [from, to] of [['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['ß', 'ss']]) t = t.replaceAll(from, to);
  t = t.normalize('NFD').replace(/\p{M}/gu, '');
  return t.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
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

/**
 * Trennt mehrere Bedeutungen an Komma, Semikolon, Schrägstrich, „oder“ sowie nach ! und ?
 * („Schau! Schaut!“ → „Schau“, „Schaut“). Kommas in Klammern zählen nicht als Trenner.
 */
export function split(text) {
  let t = text.replace(/[!?]+(?=\s|$)/g, ',');
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

export function tolerance(solution, typoBonus = 0) {
  let base = 2;
  if (solution.length < 4) base = 0;
  else if (solution.length < 9) base = 1;
  // Leicht: auch kurze Wörter dürfen einen Tippfehler haben; schwer: einer weniger
  return Math.max(0, base + typoBonus - (solution.length < 3 ? 1 : 0));
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
