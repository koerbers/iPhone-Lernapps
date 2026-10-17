// Tests für die Lernlogik. Ausführen mit:  node --test web/tests/
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ALMOST, CORRECT, WRONG, check, levenshtein } from '../js/answer.js';
import { parse } from '../js/parser.js';
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
    assert.deepEqual(round.map((c) => c.card.id).sort(), ['a', 'c']);
    const free = buildSession(cards, ['fwd'], { size: 10, maxNew: 1, fillWithWeak: true, now });
    assert.equal(free.length, 4);
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
