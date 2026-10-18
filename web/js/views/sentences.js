// Sätze übersetzen – zwei Quellen:
// - „Aus dem Buch“: Beispielsätze, die beim Import mit erkannt wurden (ohne KI, kostenlos).
//   Bewertung durch Vergleich mit der Lösung aus dem Buch; bei Abweichungen bewertet die KI
//   (falls eingerichtet) oder man schätzt selbst ein.
// - „Neue von der KI“: Claude bildet Sätze mit den eigenen Vokabeln und bewertet die Übersetzung.
import { gradeTranslation, isConfigured, makeSentences } from '../ai.js';
import { normalize, sentenceSimilarity } from '../answer.js';
import { priority, stateOf } from '../srs.js';
import { addLog, cardsOf, lessonsOf, listsOf, save, sentencesOf } from '../store.js';
import { SUBJECTS, sourceLang, targetLang } from '../subjects.js';
import { closeOverlay, esc, onAction, openOverlay, resultScreen, speakButton, speakEnglish } from '../ui.js';

const choices = {};

export function renderSentenceSetup(root, subjectId) {
  const subject = SUBJECTS[subjectId];
  if (!subject) return (location.hash = '#/lernen');
  const lists = listsOf(subjectId);
  const c = (choices[subjectId] ??= { listId: '', lesson: null, dir: 'fwd', count: 5, source: null });
  const lessons = c.listId ? lessonsOf(c.listId) : [];
  const hasLessons = lessons.some(Boolean);
  const ids = c.listId ? [c.listId] : lists.map((l) => l.id);
  const inLesson = (x) => c.lesson == null || (x.lesson ?? '') === c.lesson;
  const bookSentences = sentencesOf(ids).filter(inLesson);
  const allBook = sentencesOf(lists.map((l) => l.id)).length;
  c.source ??= allBook ? 'book' : 'ai';
  const ai = isConfigured();

  root.innerHTML = `
    <a class="back" href="#/lernen">‹ Lernen</a>
    <h1>💬 Sätze übersetzen</h1>
    <section class="card">
      <div class="segmented">
        <label><input type="radio" name="source" value="book" ${c.source === 'book' ? 'checked' : ''}><span>📖 Aus dem Buch</span></label>
        <label><input type="radio" name="source" value="ai" ${c.source === 'ai' ? 'checked' : ''}><span>🤖 Neue von der KI</span></label>
      </div>
      <label class="field">${c.source === 'book' ? 'Sätze aus' : 'Vokabeln aus'}
        <select name="list">
          <option value="">allen ${subject.name}-Listen</option>
          ${lists.map((l) => `<option value="${l.id}" ${c.listId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
        </select>
      </label>
      ${hasLessons ? `
        <label class="field">Lektion
          <select name="lesson">
            <option value="*">alle Lektionen</option>
            ${lessons.map((l) => `<option value="${esc(l)}" ${c.lesson === l ? 'selected' : ''}>${esc(l || 'ohne Lektion')}</option>`).join('')}
          </select>
        </label>` : ''}
      ${subjectId === 'english' ? `
        <div class="segmented">
          ${[['fwd', 'EN → DE'], ['rev', 'DE → EN']].map(([v, label]) => `
            <label><input type="radio" name="dir" value="${v}" ${c.dir === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>` : '<p>Latein → Deutsch</p>'}
      <label class="field">Anzahl Sätze
        <select name="count">${[3, 5, 8, 10].map((n) => `<option ${c.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      ${c.source === 'book' ? `<p class="muted">${bookSentences.length} Sätze aus dem Buch verfügbar</p>` : ''}
      <button class="btn primary large" data-action="start"
        ${(c.source === 'book' && !bookSentences.length) || (c.source === 'ai' && !ai) ? 'disabled' : ''}>▶︎ Los geht’s</button>
      <p class="hint">${c.source === 'book'
        ? 'Beispielsätze, die beim Import aus deinem Buch übernommen wurden – funktioniert ohne KI. Sätze, die du falsch hattest, kommen öfter dran.'
        : 'Die KI bildet neue Sätze mit deinen Vokabeln – bevorzugt mit denen, die noch nicht so gut sitzen.'}</p>
    </section>
    ${c.source === 'book' && !allBook ? `
      <section class="card info">
        Noch keine Sätze aus dem Buch. Importiere eine Buchseite mit Beispielsätzen (Vokabeln → Importieren) –
        die Sätze werden dabei automatisch mit übernommen.
      </section>` : ''}
    ${c.source === 'ai' && !ai ? `
      <section class="card warn">
        Für neue Sätze wird die KI (Claude) benötigt. Bitte in den <a href="#/einstellungen">Einstellungen</a> einen API-Schlüssel eintragen.
      </section>` : ''}
  `;

  root.onchange = (event) => {
    const t = event.target;
    if (t.name === 'list') {
      c.listId = t.value;
      c.lesson = null;
      renderSentenceSetup(root, subjectId);
    }
    if (t.name === 'lesson') c.lesson = t.value === '*' ? null : t.value;
    if (t.name === 'dir') c.dir = t.value;
    if (t.name === 'count') c.count = Number(t.value);
    if (t.name === 'source') c.source = t.value;
    if (t.name === 'lesson' || t.name === 'source') renderSentenceSetup(root, subjectId);
  };

  onAction(root, {
    start: () => {
      const dir = subjectId === 'latin' ? 'fwd' : c.dir;
      if (c.source === 'book') {
        const exercises = pickBookSentences(bookSentences, c.count).map((x) => bookExercise(x, dir));
        return runRound({ subject: subjectId, dir, exercises });
      }
      const cards = cardsOf(ids).filter(inLesson);
      const words = pickWords(cards, dir, 12);
      if (!words.length) return alert('Diese Liste enthält noch keine Vokabeln.');
      runRound({ subject: subjectId, dir, words, count: c.count });
    },
  });
}

/** Wählt Vokabeln für die Sätze: bereits geübte, schwache Vokabeln bevorzugt (mit etwas Zufall). */
export function pickWords(cards, dir, max) {
  const practiced = cards.filter((c) => stateOf(c, dir).box > 0);
  const pool = practiced.length >= 4 ? practiced : cards;
  return pool
    .map((card) => ({ card, score: priority(stateOf(card, dir)) + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ card }) => ({ term: card.term, translation: card.translation }));
}

/** Sätze aus dem Buch auswählen: falsch beantwortete und neue bevorzugt, mit Zufall. */
export function pickBookSentences(sentences, count) {
  return sentences
    .map((x) => ({ x, score: Math.random() * 2 + (x.wrong ?? 0) * 1.5 - (x.correct ?? 0) * 0.7 + (x.correct || x.wrong ? 0 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ x }) => x);
}

/** Übung aus einem Buchsatz. Deutsch → Fremdsprache: Die deutsche Übersetzung wird zur Aufgabe. */
function bookExercise(sentence, dir) {
  const solutions = dir === 'fwd' ? sentence.solutions : [sentence.prompt];
  return {
    prompt: dir === 'fwd' ? sentence.prompt : sentence.solutions[0],
    solution: solutions.join(' / '),
    solutions,
    sentence,
  };
}

// ---------- Runde ----------

function runRound(round) {
  const root = openOverlay();
  const st = {
    exercises: round.exercises ?? [], index: 0, loading: !round.exercises, error: null,
    grade: null, selfCheck: false, correct: 0, missed: [], answer: '',
  };

  const draw = () => {
    root.innerHTML = `<div class="session">${body(round, st)}</div>`;
  };

  async function load() {
    st.loading = true;
    st.error = null;
    draw();
    try {
      st.exercises = await makeSentences(round.words, round.subject, round.dir, round.count);
      if (!st.exercises.length) st.error = 'Es wurden keine Sätze erstellt.';
    } catch (e) {
      st.error = e.message;
    }
    st.loading = false;
    draw();
  }

  function record(correct, exercise) {
    if (exercise.sentence) exercise.sentence[correct ? 'correct' : 'wrong'] = (exercise.sentence[correct ? 'correct' : 'wrong'] ?? 0) + 1;
    if (correct) st.correct += 1;
    else st.missed.push(`${exercise.prompt} → ${exercise.solution}`);
    addLog({ date: Date.now(), subject: round.subject, dir: round.dir, kind: 'sentence', correct, prompt: exercise.prompt });
    save();
  }

  onAction(root, {
    quit: () => closeOverlay(),
    close: () => closeOverlay(),
    retry: () => load(),
    speak: (el) => speakEnglish(el.dataset.text),
    check: async () => {
      const exercise = st.exercises[st.index];
      st.answer = root.querySelector('#answer').value.trim();
      if (!st.answer) return;
      if (normalize(st.answer) === normalize(exercise.solution)) {
        st.grade = { correct: true, feedback: 'Perfekt – genau wie die Musterlösung!', correctedTranslation: exercise.solution };
        record(true, exercise);
        return draw();
      }
      if (exercise.solutions) {
        // Satz aus dem Buch: mit der Lösung aus dem Buch vergleichen
        const similarity = Math.max(...exercise.solutions.map((x) => sentenceSimilarity(st.answer, x)));
        if (similarity >= 0.9) {
          st.grade = {
            correct: true,
            feedback: similarity === 1 ? 'Perfekt – genau wie im Buch!' : 'Richtig – nur kleine Abweichungen vom Buch.',
            correctedTranslation: exercise.solution,
          };
          record(true, exercise);
          return draw();
        }
        if (!isConfigured()) {
          st.selfCheck = true; // ohne KI: Lösung zeigen und selbst einschätzen
          return draw();
        }
      }
      st.loading = true;
      draw();
      try {
        st.grade = await gradeTranslation(exercise, st.answer, round.subject, round.dir);
        record(st.grade.correct, exercise);
      } catch {
        st.selfCheck = true; // KI nicht erreichbar → selbst einschätzen
      }
      st.loading = false;
      draw();
    },
    selfYes: () => {
      record(true, st.exercises[st.index]);
      advance();
    },
    selfNo: () => {
      record(false, st.exercises[st.index]);
      advance();
    },
    next: () => advance(),
  });

  function advance() {
    st.index += 1;
    st.grade = null;
    st.selfCheck = false;
    st.answer = '';
    draw();
    root.querySelector('#answer')?.focus();
  }

  if (round.exercises) draw();
  else load();
}

function body(round, st) {
  const bar = (title) => `
    <header class="session-bar">
      <button class="link" data-action="quit">Beenden</button>
      <strong>${title}</strong>
      <span></span>
    </header>`;

  if (!st.loading && !st.error && !st.exercises.length) {
    return `${bar('')}<div class="card warn center"><p>Keine Sätze gefunden.</p><button class="btn" data-action="close">Zurück</button></div>`;
  }
  if (st.loading && !st.exercises.length) {
    return `${bar('')}<div class="center pad"><div class="spinner"></div><p>Sätze werden erstellt …</p></div>`;
  }
  if (st.error && !st.exercises.length) {
    return `${bar('')}
      <div class="card warn center">
        <h2>Das hat nicht geklappt</h2>
        <p>${esc(st.error)}</p>
        <button class="btn primary" data-action="retry">Nochmal versuchen</button>
      </div>`;
  }
  if (st.index >= st.exercises.length) {
    return resultScreen({
      correct: st.correct,
      total: st.exercises.length,
      missed: st.missed,
      thumbs: { up: st.correct, down: st.exercises.length - st.correct },
    });
  }

  const exercise = st.exercises[st.index];
  const english = round.subject === 'english';
  let lower;
  if (st.grade) {
    const g = st.grade;
    lower = `
      <div class="feedback ${g.correct ? 'good' : 'warn'}">
        <div class="thumb">${g.correct ? '👍' : '👎'}</div>
        <h2 class="${g.correct ? 'good-text' : 'warn-text'}">${g.correct ? 'Richtig!' : 'Noch nicht ganz'}</h2>
        <p>${esc(g.feedback)}</p>
        ${g.correct ? '' : `<p><strong>So wäre es richtig:</strong><br>${esc(g.correctedTranslation)}</p>`}
        <p class="muted">${exercise.sentence ? 'So steht es im Buch' : 'Musterlösung'}: ${esc(exercise.solution)}</p>
      </div>
      <button class="btn primary large" data-action="next">Weiter</button>`;
  } else if (st.selfCheck) {
    lower = `
      <div class="feedback">
        <p><strong>${exercise.sentence ? 'So steht es im Buch:' : 'Musterlösung:'}</strong></p>
        ${(exercise.solutions ?? [exercise.solution]).map((x) => `<p class="big">${esc(x)}</p>`).join('')}
        <p class="muted">Vergleiche mit deiner Übersetzung – war sie (sinngemäß) richtig?</p>
      </div>
      <div class="row">
        <button class="btn large bad" data-action="selfNo">👎 Nein</button>
        <button class="btn large good" data-action="selfYes">👍 Ja</button>
      </div>`;
  } else {
    lower = `<button class="btn primary large" data-action="check" ${st.loading ? 'disabled' : ''}>${st.loading ? 'Wird geprüft …' : 'Prüfen'}</button>`;
  }

  return `
    ${bar(`Satz ${st.index + 1} von ${st.exercises.length}`)}
    <p class="muted">Übersetze von ${sourceLang(round.subject, round.dir)} ins ${targetLang(round.subject, round.dir)}e:</p>
    <div class="prompt-card left">
      <div class="sentence">${esc(exercise.prompt)}</div>
      ${english && round.dir === 'fwd' ? speakButton(exercise.prompt) : ''}
    </div>
    <textarea id="answer" class="answer-input" rows="3" placeholder="Deine Übersetzung"
      autocapitalize="sentences" spellcheck="false" ${st.grade || st.selfCheck || st.loading ? 'disabled' : ''}>${esc(st.answer)}</textarea>
    ${lower}`;
}
