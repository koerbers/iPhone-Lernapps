// Tests für mehrere Kinder: Schwierigkeit nach Alter und Übernahme alter Daten.
// Ausführen mit:  node --test web/tests/
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ALMOST, WRONG, check } from '../js/answer.js';
import { LEVELS, levelForAge, levelOf } from '../js/level.js';

/** Einfacher Ersatz für den Browserspeicher */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

let importCount = 0;
async function freshStore(storage) {
  globalThis.localStorage = storage;
  return import(`../js/store.js?fresh=${importCount++}`);
}

describe('Schwierigkeit nach Alter', () => {
  test('Alter → Stufe', () => {
    assert.equal(levelForAge(8), 'easy');
    assert.equal(levelForAge(10), 'easy');
    assert.equal(levelForAge(11), 'medium');
    assert.equal(levelForAge(12), 'medium');
    assert.equal(levelForAge(13), 'hard');
    assert.equal(levelForAge(null), 'medium');
  });
  test('von Hand gewählte Stufe hat Vorrang', () => {
    assert.equal(levelOf({ age: 9, difficulty: 'hard' }).id, 'hard');
    assert.equal(levelOf({ age: 9, difficulty: 'auto' }).id, 'easy');
  });
  test('Tippfehler: leicht großzügiger, schwer strenger', () => {
    // „Schuhle“ statt „Schule“ (1 Fehler, 6 Buchstaben)
    assert.equal(check('Schuhle', 'Schule', { typoBonus: LEVELS.easy.typoBonus }), ALMOST);
    assert.equal(check('Schuhle', 'Schule', { typoBonus: LEVELS.medium.typoBonus }), ALMOST);
    assert.equal(check('Schuhle', 'Schule', { typoBonus: LEVELS.hard.typoBonus }), WRONG);
    // kurzes Wort „dog“ → „dag“: nur bei leicht
    assert.equal(check('dag', 'dog', { typoBonus: LEVELS.easy.typoBonus }), ALMOST);
    assert.equal(check('dag', 'dog', { typoBonus: LEVELS.medium.typoBonus }), WRONG);
  });
});

describe('Mehrere Kinder', () => {
  test('alte Daten (ohne Profile) werden ins erste Profil übernommen', async () => {
    const legacy = { lists: [{ id: 'L', name: 'Latein', subject: 'latin' }], cards: [{ id: 'c', listId: 'L', term: 'et', translation: 'und' }], logs: [], settings: { name: 'Jannes', claudeKey: 'sk-ant-x', sessionSize: 30 } };
    const storage = fakeStorage({ 'vokabeltrainer-v1': JSON.stringify(legacy) });
    const store = await freshStore(storage);
    assert.equal(store.profiles.list.length, 1);
    assert.equal(store.activeProfile().name, 'Jannes');
    assert.equal(store.getClaudeKey(), 'sk-ant-x'); // Schlüssel gilt jetzt für alle Kinder
    assert.equal(store.db.cards.length, 1);
    assert.equal(store.db.settings.sessionSize, 30);
    assert.equal(store.db.settings.claudeKey, undefined);
    assert.equal(storage.getItem('vokabeltrainer-v1'), null);
  });

  test('jedes Kind hat eigene Daten; Liste lässt sich kopieren', async () => {
    const storage = fakeStorage();
    const store = await freshStore(storage);
    const first = store.activeProfile();
    const list = store.addList('Unit 1', 'english');
    store.addCard(list.id, 'dog', 'Hund');
    store.db.cards[0].fwd = { box: 4, due: 0, correct: 4, wrong: 0, last: null };
    store.save();

    const lia = store.addProfile({ name: 'Lia', age: 9 });
    store.copyListToProfile(list.id, lia.id);

    // Daten von Lia direkt aus dem Speicher lesen
    const liaData = JSON.parse(storage.getItem(`vokabeltrainer-data-${lia.id}`));
    assert.equal(liaData.lists.length, 1);
    assert.equal(liaData.cards[0].term, 'dog');
    assert.equal(liaData.cards[0].fwd, undefined); // eigener Lernstand: neu
    assert.equal(liaData.settings.sessionSize, LEVELS.easy.sessionSize); // Voreinstellung nach Alter

    // Das erste Kind ist unverändert
    const firstData = JSON.parse(storage.getItem(`vokabeltrainer-data-${first.id}`));
    assert.equal(firstData.cards[0].fwd.box, 4);
  });

  test('Löschen des aktiven Kindes überschreibt kein anderes Kind', async () => {
    const storage = fakeStorage();
    const store = await freshStore(storage);
    const first = store.activeProfile();
    const other = store.addProfile({ name: 'Lia', age: 9 });
    const before = storage.getItem(`vokabeltrainer-data-${other.id}`);
    store.addList('Liste von Kind 1', 'latin');
    store.deleteProfile(first.id);
    store.save(); // darf nichts mehr schreiben
    assert.equal(storage.getItem(`vokabeltrainer-data-${other.id}`), before);
    assert.equal(storage.getItem(`vokabeltrainer-data-${first.id}`), null);
  });
});

describe('Sicherheit', () => {
  test('manipulierte Sicherung: kein HTML/Code in Profilen und Daten', async () => {
    const store = await freshStore(fakeStorage());
    const evil = '<img src=x onerror=alert(1)>';
    store.importBackup(JSON.stringify({
      format: 'vokabeltrainer-2',
      profiles: [
        { id: 'a"><script>', name: 'X' },
        { id: 'ok', name: evil, age: '9<b>', avatar: evil, avatarImage: 'x" onerror="alert(1)', difficulty: 'constructor' },
      ],
      data: {
        ok: {
          lists: [{ id: 'L1', name: evil, subject: 'latin' }, { id: 'L2"', name: 'x', subject: 'latin' }, { id: 'L3', subject: '__proto__' }],
          cards: [{ id: 'c1', listId: 'L1', term: 'amo', translation: 'lieben', fwd: { box: '<b>', due: 0, correct: 1, wrong: 0 } }],
          logs: [{ date: 1, subject: 'latin', correct: 'yes' }],
          settings: { timerMinutes: '<b>', claudeKey: 'sk-evil' },
        },
      },
    }));
    assert.equal(store.profiles.list.length, 1);
    const kid = store.profiles.list[0];
    assert.equal(kid.age, null);
    assert.equal(kid.avatarImage, null);
    assert.equal(kid.difficulty, 'auto');
    assert.ok(!store.avatarHtml(kid).includes('<img'));
    assert.ok(!store.avatarHtml({ avatar: evil }).includes('<img'));
    const data = JSON.parse(globalThis.localStorage.getItem('vokabeltrainer-data-ok'));
    assert.deepEqual(data.lists.map((l) => l.id), ['L1']);
    assert.equal(data.cards[0].fwd.box, 0);
    assert.equal(data.logs[0].correct, false);
    assert.equal(data.settings.timerMinutes, 15);
    assert.equal(data.settings.claudeKey, undefined);
  });
});
