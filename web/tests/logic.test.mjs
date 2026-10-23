// Tests für die Lernlogik. Ausführen mit:  node --test web/tests/
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ALMOST, CORRECT, WRONG, check, checkMeanings, levenshtein, sentenceSimilarity } from '../js/answer.js';
import { fixLatinInfinitive, fixOcrAccents, parse, parseText } from '../js/parser.js';
import { isGermanLine, tableToContent, tableToPairs } from '../js/layout.js';
import { createSession, currentItem, recordAnswer } from '../js/session.js';
import { MAX_BOX, buildSession, isDue, newState, priority, review, startOfDay, addDays } from '../js/srs.js';
import { streak } from '../js/stats.js';

describe('Antwortprüfung', () => {
  test('genau richtig', () => assert.equal(check('Haus', 'Haus'), CORRECT));
  test('Groß/klein und Satzzeichen egal', () => assert.equal(check('  haus! ', 'Haus'), CORRECT));
  test('eine von mehreren Bedeutungen reicht', () => {
    assert.equal(check('Landhaus', 'Haus, Landhaus'), CORRECT);
    assert.equal(check('nennen', 'rufen; nennen'), CORRECT);
  });
  test('Umlaute dürfen ausgeschrieben werden', () => {
    assert.equal(check('Fruehstueck', 'Frühstück'), CORRECT);
    assert.equal(check('gross', 'groß'), CORRECT);
  });
  test('Artikel und „to“ sind optional', () => {
    assert.equal(check('go', 'to go'), CORRECT);
    assert.equal(check('der Hund', 'Hund'), CORRECT);
    assert.equal(check('Freund', 'der Freund'), CORRECT);
  });
  test('Klammern sind optional', () => {
    assert.equal(check('freuen', '(sich) freuen'), CORRECT);
    assert.equal(check('sich freuen', '(sich) freuen'), CORRECT);
  });
  test('Makrons bei Latein egal', () => assert.equal(check('amare', 'amāre'), CORRECT));
  test('kleiner Tippfehler = fast richtig', () => {
    assert.equal(check('Schuhle', 'Schule'), ALMOST);
    assert.equal(check('beautifull', 'beautiful'), ALMOST);
  });
  test('falsch bleibt falsch', () => {
    assert.equal(check('Katze', 'Hund'), WRONG);
    assert.equal(check('', 'Hund'), WRONG);
    assert.equal(check('et', 'ut'), WRONG); // kurze Wörter: kein Tippfehler-Bonus
  });
  test('meldet genannte und fehlende Bedeutungen', () => {
    const c = checkMeanings('Herrin', 'die Herrin, die Dame');
    assert.equal(c.result, CORRECT);
    assert.deepEqual(c.missing, ['die Dame']);
    assert.deepEqual(checkMeanings('Herrin, Dame', 'die Herrin, die Dame').missing, []);
    assert.deepEqual(checkMeanings('warten', 'warten (auf), erwarten').missing, ['erwarten']);
    assert.equal(check('Eltern', 'der Vater, die Mutter; Pl. die Eltern'), CORRECT);
  });
  test('Personalpronomen sind optional: „er (sie, es) ist“', () => {
    for (const answer of ['er ist', 'sie ist', 'es ist', 'ist', 'er/sie/es ist']) {
      assert.equal(check(answer, 'er (sie, es) ist, befindet sich'), CORRECT, answer);
    }
    assert.deepEqual(checkMeanings('sie ist, befindet sich', 'er (sie, es) ist, befindet sich').missing, []);
    assert.equal(check('sind', 'sie sind, befinden sich'), CORRECT);
    assert.equal(check('ist da', 'er (sie, es) ist da'), CORRECT);
    assert.equal(check('ihr', 'ihr'), CORRECT); // „vos – ihr“ bleibt abfragbar
    assert.equal(check('wir', 'ihr'), WRONG);
  });
  test('Satzzeichen und Groß/klein egal: „Schau! Schaut!“', () => {
    for (const answer of ['schau, schaut', 'Schau! Schaut!', 'schau schaut', 'SCHAU; schaut', 'schaut!']) {
      assert.equal(check(answer, 'Schau! Schaut!'), CORRECT, answer);
    }
    assert.deepEqual(checkMeanings('schau, schaut', 'Schau! Schaut!').missing, []);
    assert.deepEqual(checkMeanings('schau', 'Schau! Schaut!').missing, ['Schaut']);
    assert.equal(check('warum', 'warum?'), CORRECT);
    assert.equal(check('Er ist da.', 'er (sie, es) ist da'), CORRECT);
  });
  test('Levenshtein', () => {
    assert.equal(levenshtein('kitten', 'sitting'), 3);
    assert.equal(levenshtein('', 'abc'), 3);
  });
});

describe('Vokabel-Erkennung', () => {
  test('Trennzeichen in der Zeile', () => {
    const pairs = parse('house – Haus\nto go - gehen\nfriend = Freund');
    assert.deepEqual(pairs.map((p) => p.term), ['house', 'to go', 'friend']);
    assert.deepEqual(pairs.map((p) => p.translation), ['Haus', 'gehen', 'Freund']);
  });
  test('Spalten aus der Texterkennung', () => {
    const pairs = parse('amicus, -i m.\tFreund\nvilla, -ae f.\t\tHaus, Landhaus');
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0].term, 'amicus, -i m.');
    assert.equal(pairs[1].translation, 'Haus, Landhaus');
  });
  test('drei Spalten → Mitte wird Notiz', () => {
    const [p] = parse('vocare\tvoco, vocavi\trufen');
    assert.deepEqual(p, { term: 'vocare', translation: 'rufen', note: 'voco, vocavi' });
  });
  test('Überschriften und Zahlen werden ignoriert', () => {
    const pairs = parse('Lektion 3\n12\t13\nUnit 5 - Vocabulary\nLektion 4\tVokabeln\n1. dog – Hund');
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].term, 'dog');
  });
  test('Wörter wie „page“ oder „unit“ bleiben Vokabeln', () => {
    assert.deepEqual(parse('page – Seite\nunit = Einheit').map((p) => p.term), ['page', 'unit']);
  });
});

describe('Eingefügter Text (iPhone-Texterkennung)', () => {
  const expected = ['welcome=willkommen', 'workshop=Werkstatt', 'my=mein', 'to listen=hören, zuhören'];
  const show = (pairs) => pairs.map((p) => `${p.term}=${p.translation}`);
  test('spaltenweise: erst Englisch, dann Deutsch', () => {
    assert.deepEqual(show(parseText('welcome\nworkshop\nmy\nto listen\nwillkommen\nWerkstatt\nmein\nhören, zuhören')), expected);
  });
  test('abwechselnd: Wort, Übersetzung, …', () => {
    assert.deepEqual(show(parseText('welcome\nwillkommen\nworkshop\nWerkstatt\nmy\nmein\nto listen\nhören, zuhören')), expected);
  });
  test('mit Trennzeichen wie bisher', () => {
    assert.deepEqual(show(parseText('house – Haus\ndog = Hund')), ['house=Haus', 'dog=Hund']);
  });
});

describe('Texterkennung aufräumen', () => {
  test('Akzente', () => {
    assert.deepEqual(fixOcrAccents({ term: 'clàmàre', translation: 'plótzlich', note: 'Práp. m. Akk.' }), {
      term: 'clamare', translation: 'plötzlich', note: 'Präp. m. Akk.',
    });
    assert.equal(fixOcrAccents({ term: 'properare', translation: 'eilen', note: 'properó' }).note, 'propero');
  });
});

describe('Vokabeltabelle (Schulbuchseite)', () => {
  // Wörter wie von der Texterkennung: Spalten bei x = 60 (Latein), 450 (Grammatik), 920 (Deutsch), 1840 (Merkhilfe)
  let y = 0;
  const words = [];
  const row = (...cells) => {
    y += 60;
    for (const [x, text] of cells) {
      let cx = x;
      for (const part of text.split(' ')) {
        words.push({ text: part, x0: cx, x1: cx + part.length * 18, y0: y, y1: y + 30, confidence: 90 });
        cx += part.length * 18 + 12;
      }
    }
  };
  row([60, 'gaudere'], [920, 'sich freuen'], [1840, 'Gaudi']);
  row([60, 'equus'], [450, 'm'], [920, 'das Pferd']);
  row([60, 'est'], [450, '3. Pers. Sg.'], [920, 'er ist']);
  row([920, 'Ibi Davus est.']); // Beispielsatz
  row([920, 'Dort ist Davus.']);
  row([60, 'servus'], [450, 'm'], [920, 'der Sklave'], [1300, 'MEM']); // Störung mitten in der Zeile
  row([290, 'mE'], [560, 'MEM']); // Störungen aus Tabellenlinien
  row([60, 'tandem'], [450, 'Adv.'], [920, 'endlich']);
  row([60, 'videre'], [920, 'sehen'], [1840, 'Video']);

  test('Spalten, Notizen, Beispielsätze und Merkhilfen', () => {
    assert.deepEqual(tableToPairs(words, 2200), [
      { term: 'gaudere', translation: 'sich freuen', note: '' },
      { term: 'equus', translation: 'das Pferd', note: 'm' },
      { term: 'est', translation: 'er ist', note: '3. Pers. Sg.' },
      { term: 'servus', translation: 'der Sklave', note: 'm' },
      { term: 'tandem', translation: 'endlich', note: 'Adv.' },
      { term: 'videre', translation: 'sehen', note: '' },
    ]);
  });

  test('Stammformen-Spalte wird nicht mit der Übersetzung verwechselt', () => {
    const w = [];
    [['parens', 'parentis mf', 'der Vater, die Mutter'], ['currere', 'curro, cucurri', 'laufen, eilen'],
      ['pater', 'patris m', 'der Vater'], ['mons', 'montis m', 'der Berg']].forEach(([a, b, c], i) => {
      for (const [x, text] of [[60, a], [500, b], [970, c]]) {
        let cx = x;
        for (const part of text.split(' ')) {
          w.push({ text: part, x0: cx, x1: cx + part.length * 18, y0: i * 60, y1: i * 60 + 30 });
          cx += part.length * 18 + 12;
        }
      }
    });
    assert.deepEqual(tableToPairs(w, 2200)[0], { term: 'parens', translation: 'der Vater, die Mutter', note: 'parentis mf' });
  });

  test('Übersetzung etwas tiefer als das Wort (schräges Foto)', () => {
    const w = [
      ...['equus', 'servus', 'videre'].flatMap((t, i) => [
        { text: t, x0: 60, x1: 160, y0: i * 60, y1: i * 60 + 30 },
        { text: 'xx', x0: 920, x1: 980, y0: i * 60, y1: i * 60 + 30 },
      ]),
      { text: 'audere', x0: 60, x1: 180, y0: 200, y1: 230 },
      { text: 'wagen', x0: 920, x1: 1020, y0: 222, y1: 252 },
    ];
    assert.deepEqual(tableToPairs(w, 2200).at(-1), { term: 'audere', translation: 'wagen', note: '' });
  });
});

describe('Beispielsätze aus dem Buch', () => {
  let y = 0;
  const words = [];
  const row = (...cells) => {
    y += 60;
    for (const [x, text] of cells) {
      let cx = x;
      for (const part of text.split(' ')) {
        words.push({ text: part, x0: cx, x1: cx + part.length * 18, y0: y, y1: y + 30 });
        cx += part.length * 18 + 12;
      }
    }
  };
  row([60, 'est'], [450, '3. Pers. Sg.'], [920, 'er ist']);
  row([920, 'Ibi Dàvus est.']);
  row([920, 'Dort ist Davus.']);
  row([60, 'studere'], [450, 'studeo'], [920, 'sich bemühen (um),']);
  row([450, 'm. Dat.'], [920, 'streben nach']);
  row([920, 'Libertati studeo.']);
  row([920, 'Ich bemühe mich um die Freiheit.']);
  row([920, 'Ich strebe nach Freiheit.']);
  row([60, 'adesse'], [920, 'helfen']);
  row([920, 'Tibi adsum; tu quidem mihi quoque adesse']);
  row([920, 'debes.']);
  row([920, 'Ich helfe dir; du musst auch mir helfen.']);
  row([60, 'videre'], [450, 'video'], [920, 'sehen']);
  row([60, 'equus'], [450, 'm'], [920, 'das Pferd']);
  const content = tableToContent(words, 2200);

  test('Sätze mit einer oder mehreren Übersetzungen', () => {
    assert.deepEqual(content.sentences, [
      { prompt: 'Ibi Dàvus est.', solutions: ['Dort ist Davus.'] },
      { prompt: 'Libertati studeo.', solutions: ['Ich bemühe mich um die Freiheit.', 'Ich strebe nach Freiheit.'] },
      { prompt: 'Tibi adsum; tu quidem mihi quoque adesse debes.', solutions: ['Ich helfe dir; du musst auch mir helfen.'] },
    ]);
  });

  test('Bedeutung geht in der nächsten Zeile weiter', () => {
    const studere = content.pairs.find((p) => p.term === 'studere');
    assert.equal(studere.translation, 'sich bemühen (um), streben nach');
    assert.equal(studere.note, 'studeo m. Dat.');
    assert.deepEqual(content.pairs.map((p) => p.term), ['est', 'studere', 'adesse', 'videre', 'equus']);
  });

  test('Deutsch oder Fremdsprache?', () => {
    for (const t of ['Dort ist (befindet sich) Davus.', 'Scorpus steht vor Incitatus.', 'Das Volk hórt nicht auf zu schreien.', 'Verschont uns!']) {
      assert.ok(isGermanLine(t), t);
    }
    for (const t of ['Ibi Dávus est.', 'Scorpus ante Incitatum stat.', 'Libertati studeo.', 'Parcite nobis!', 'Nam Davus non adest.']) {
      assert.ok(!isGermanLine(t), t);
    }
  });

  test('Satzvergleich: Klammern als Varianten, Wortstellung und kleine Fehler egal', () => {
    assert.equal(sentenceSimilarity('Dort ist Davus', 'Dort ist (befindet sich) Davus.'), 1);
    assert.equal(sentenceSimilarity('dort befindet sich davus', 'Dort ist (befindet sich) Davus.'), 1);
    assert.equal(sentenceSimilarity('Davus ist dort', 'Dort ist (befindet sich) Davus.'), 1);
    assert.ok(sentenceSimilarity('Das Volk hoert nicht auf zu schrein', 'Das Volk hört nicht auf zu schreien.') >= 0.9);
    assert.ok(sentenceSimilarity('Das Volk schreit', 'Das Volk hört nicht auf zu schreien.') < 0.9);
  });
});

describe('Lernkartei', () => {
  const now = new Date(2026, 9, 17, 15, 0).getTime();

  test('richtig → ein Fach weiter, spätere Wiederholung', () => {
    const s1 = review(newState(), true, now);
    assert.equal(s1.box, 1);
    assert.equal(s1.due, addDays(startOfDay(now), 1));
    const s2 = review(s1, true, now);
    assert.equal(s2.box, 2);
    assert.ok(s2.due > s1.due);
  });
  test('falsch → zurück in Fach 1 und sofort fällig', () => {
    const s = review({ box: 5, due: now, correct: 5, wrong: 0, last: null }, false, now);
    assert.equal(s.box, 1);
    assert.equal(s.wrong, 1);
    assert.ok(isDue(s, now));
  });
  test('oft falsche Vokabeln kommen früher wieder', () => {
    const easy = { box: 3, due: now, correct: 3, wrong: 0, last: null };
    const hard = { box: 3, due: now, correct: 3, wrong: 5, last: null };
    assert.ok(review(hard, true, now).due < review(easy, true, now).due);
    assert.ok(priority(hard, now) > priority(easy, now));
  });
  test('höchstes Fach ist begrenzt', () => {
    const s = review({ box: MAX_BOX, due: now, correct: 9, wrong: 0, last: null }, true, now);
    assert.equal(s.box, MAX_BOX);
  });
  test('Runde: fällige zuerst, neue begrenzt', () => {
    const cards = [
      { id: 'a', createdAt: 1, fwd: { box: 2, due: now - 1000, correct: 2, wrong: 1, last: null } },
      { id: 'b', createdAt: 2, fwd: { box: 3, due: now + 1e9, correct: 3, wrong: 0, last: null } },
      { id: 'c', createdAt: 3 },
      { id: 'd', createdAt: 4 },
    ];
    const round = buildSession(cards, ['fwd'], { size: 10, maxNew: 1, now });
    const ids = round.map((c) => c.card.id).sort();
    assert.equal(ids.length, 2);
    assert.equal(ids[0], 'a'); // die fällige Karte ist immer dabei
    assert.ok(['c', 'd'].includes(ids[1])); // dazu eine zufällige neue
    const free = buildSession(cards, ['fwd'], { size: 10, maxNew: 1, fillWithWeak: true, now });
    assert.equal(free.length, 4);
  });
});

describe('Zufall', () => {
  test('neue Vokabeln kommen aus dem ganzen Vorrat, nicht nur vom Anfang', () => {
    const cards = Array.from({ length: 300 }, (_, i) => ({ id: `k${i}`, createdAt: i }));
    const seen = new Set();
    for (let r = 0; r < 20; r++) {
      for (const c of buildSession(cards, ['fwd'], { size: 10, maxNew: 10 })) seen.add(Number(c.card.id.slice(1)));
    }
    assert.ok(Math.max(...seen) > 150, 'auch Vokabeln aus der zweiten Hälfte');
  });
});

describe('Übungsrunde', () => {
  test('falsche Vokabel kommt in derselben Runde wieder, zählt aber nur einmal', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, createdAt: i, term: id, translation: id.toUpperCase() }));
    const session = createSession('english', cards.map((card) => ({ card, dir: 'fwd' })));
    const logs = [];
    logs.push(recordAnswer(session, false)); // a falsch
    assert.equal(session.queue.length, 6);
    assert.equal(session.queue[4].card.id, 'a'); // nach 3 anderen Karten
    while (currentItem(session)) logs.push(recordAnswer(session, true));
    assert.equal(session.firstTryTotal, 5);
    assert.equal(session.firstTryCorrect, 4);
    assert.equal(logs.filter(Boolean).length, 5);
    assert.equal(cards[0].fwd.box, 1);
    assert.deepEqual(session.missed.map((c) => c.id), ['a']);
  });
});

describe('Weitere Bedeutungen', () => {
  const make = () => ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, createdAt: i, term: id, translation: 'x, y' }));

  test('nur eine Bedeutung genannt → später nach einer weiteren fragen', () => {
    const cards = make();
    const session = createSession('latin', cards.map((card) => ({ card, dir: 'fwd' })));
    recordAnswer(session, true, Date.now(), { given: ['x'], missing: ['y'] });
    assert.equal(cards[0].fwd.box, 1); // zählt als richtig
    assert.equal(session.queue.length, 6);
    assert.deepEqual(session.queue[4], { card: cards[0], dir: 'fwd', attempt: 1, moreOf: ['x'] });
    // Die Nachfrage beeinflusst die Lernkartei nicht und wird bei falscher Antwort nicht wiederholt
    while (currentItem(session) !== session.queue[4]) recordAnswer(session, true);
    assert.equal(recordAnswer(session, false), null);
    assert.equal(session.queue.length, 6);
    assert.equal(cards[0].fwd.box, 1);
  });

  test('alle Bedeutungen genannt oder Deutsch → Englisch: keine Nachfrage', () => {
    const cards = make();
    const s1 = createSession('english', cards.map((card) => ({ card, dir: 'fwd' })));
    recordAnswer(s1, true, Date.now(), { given: ['x', 'y'], missing: [] });
    assert.equal(s1.queue.length, 5);
    const s2 = createSession('english', cards.map((card) => ({ card, dir: 'rev' })));
    recordAnswer(s2, true, Date.now(), { given: ['x'], missing: ['y'] });
    assert.equal(s2.queue.length, 5);
  });
});

describe('Statistik', () => {
  test('Serie zählt Tage in Folge', () => {
    const now = Date.now();
    const logs = [0, 1, 2].map((d) => ({ date: addDays(now, -d) }));
    assert.equal(streak(logs, now), 3);
  });
  test('Serie ist 0 nach einer Pause', () => {
    const now = Date.now();
    assert.equal(streak([{ date: addDays(now, -3) }], now), 0);
  });
});

test('Latein: „violave“ wird zu „violare“, echte Wörter auf -ve bleiben', () => {
  const fix = (term, translation) => fixLatinInfinitive({ term, translation, note: '' }).term;
  assert.equal(fix('violave', 'verletzen, beleidigen'), 'violare');
  assert.equal(fix('audive', 'hören'), 'audire');
  assert.equal(fix('taceve', 'schweigen'), 'tacere');
  assert.equal(fix('violave, violo', 'verletzen'), 'violare, violo');
  assert.equal(fix('cave', 'hüte dich'), 'cave');
  assert.equal(fix('grave', 'schwer'), 'grave');
  assert.equal(fix('navve', 'das Schiff'), 'navve');
  assert.equal(fix('servave', 'der Garten'), 'servave'); // Substantiv als Bedeutung: nicht ändern
  assert.equal(fix('servave', 'retten, bewahren'), 'servare');
});

test('„to like“: mögen / gern haben in jeder Form', () => {
  for (const solution of ['mögen, gern haben', 'gern haben, mögen', 'mögen, etw. gern haben', 'gernhaben; mögen']) {
    for (const answer of ['mögen', 'gern haben', 'gernhaben', 'mögen, gern haben', 'mögen gern haben', 'gern haben mögen', 'Mögen; gern haben!']) {
      assert.equal(check(answer, solution), CORRECT, `${answer} → ${solution}`);
    }
  }
  assert.deepEqual(checkMeanings('mögen gern haben', 'gern haben, mögen').missing, []);
  assert.equal(check('hassen', 'mögen, gern haben'), WRONG);
  assert.equal(check('gern', 'mögen, gern haben'), WRONG);
  assert.equal(check('mögen hassen', 'mögen, gern haben'), WRONG);
  assert.equal(check('like', 'to like sth.'), CORRECT);
});
