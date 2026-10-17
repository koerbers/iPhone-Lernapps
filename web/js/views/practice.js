// Vokabeln üben: Auswahl der Listen/Richtung/Abfrageart und die Übungsrunde selbst.
import { CORRECT, WRONG, checkMeanings } from '../answer.js';
import { createSession, currentItem, recordAnswer } from '../session.js';
import { buildSession, dueCount, shuffle } from '../srs.js';
import { addLog, cardsOf, db, getList, lessonsOf, listsOf, save } from '../store.js';
import { SUBJECTS, answerOf, dirLabel, promptOf } from '../subjects.js';
import { closeOverlay, esc, onAction, openOverlay, resultScreen, speakButton, speakEnglish } from '../ui.js';
import { cardDialog } from './lists.js';

// Timer: mindestens 15 Minuten (vorgelegt), in 5-Minuten-Schritten mehr
const MIN_TIMER = 15;
const MAX_TIMER = 120;

const MODES = {
  typing: '⌨️ Eintippen',
  choice: '🔘 Auswählen',
  flashcard: '🃏 Karteikarte',
};

// Auswahl pro Fach merken, solange die App offen ist
const choices = {};

/** Schlüssel für eine Lektion einer Liste */
const lessonKey = (listId, lesson) => `${listId}␟${lesson ?? ''}`;

export function renderPracticeSetup(root, subjectId) {
  const subject = SUBJECTS[subjectId];
  if (!subject) return (location.hash = '#/lernen');
  const lists = listsOf(subjectId);
  // lessonOff: abgewählte Lektionen (neue Lektionen sind automatisch ausgewählt)
  const c = (choices[subjectId] ??= { listIds: new Set(lists.map((l) => l.id)), lessonOff: new Set(), dirChoice: 'both' });
  // neu angelegte Listen automatisch auswählen
  for (const l of lists) if (!c.known?.has(l.id)) c.listIds.add(l.id);
  c.known = new Set(lists.map((l) => l.id));

  const dirs = selectedDirs(subjectId, c.dirChoice);
  const cards = cardsOf([...c.listIds]).filter((card) => !c.lessonOff.has(lessonKey(card.listId, card.lesson)));
  const counts = dueCount(cards, dirs);

  root.innerHTML = `
    <a class="back" href="#/lernen">‹ Lernen</a>
    <h1>${subject.flag} ${subject.name} üben</h1>

    <section class="card">
      <h3>Listen</h3>
      ${lists.map((l) => `
        <label class="check-row">
          <input type="checkbox" data-list="${l.id}" ${c.listIds.has(l.id) ? 'checked' : ''}>
          <span>${esc(l.name)}</span>
          <span class="muted">${cardsOf([l.id]).length}</span>
        </label>
        ${c.listIds.has(l.id) ? lessonChips(l.id, c) : ''}`).join('')}
    </section>

    <section class="card">
      <h3>Richtung</h3>
      ${subjectId === 'english' ? `
        <div class="segmented">
          ${[['both', 'Beide'], ['fwd', 'EN → DE'], ['rev', 'DE → EN']].map(([v, label]) => `
            <label><input type="radio" name="dir" value="${v}" ${c.dirChoice === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>` : '<p>Latein → Deutsch</p>'}
    </section>

    <section class="card">
      <h3>Abfrageart</h3>
      <div class="segmented">
        ${Object.entries(MODES).map(([v, label]) => `
          <label><input type="radio" name="mode" value="${v}" ${db.settings.mode === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      </div>
    </section>

    <section class="card">
      <label class="check-row">
        <input type="checkbox" name="timerOn" ${db.settings.timerOn ? 'checked' : ''}>
        <span>⏱ Mit Timer lernen</span>
      </label>
      ${db.settings.timerOn ? `
        <div class="stepper">
          <button class="icon-btn" data-action="timerMinus" ${db.settings.timerMinutes <= MIN_TIMER ? 'disabled' : ''} aria-label="5 Minuten weniger">−</button>
          <strong>${db.settings.timerMinutes} Minuten</strong>
          <button class="icon-btn" data-action="timerPlus" ${db.settings.timerMinutes >= MAX_TIMER ? 'disabled' : ''} aria-label="5 Minuten mehr">＋</button>
        </div>
        <p class="hint">Es kommen so lange Vokabeln, bis die Zeit um ist – bei Bedarf auch nochmal welche, die schon dran waren.</p>` : ''}
    </section>

    <section class="card">
      <div class="badges">
        <div class="badge orange"><strong>${counts.due}</strong><small>fällig</small></div>
        <div class="badge blue"><strong>${counts.new}</strong><small>neu</small></div>
      </div>
      <button class="btn primary large" data-action="start" ${cards.length ? '' : 'disabled'}>▶︎ Fällige Vokabeln üben</button>
      <button class="btn large" data-action="free" ${cards.length ? '' : 'disabled'}>💪 Freies Training (schwächste zuerst)</button>
      <p class="hint">Richtig beantwortete Vokabeln kommen erst nach einer Pause wieder (1, 2, 4, 8, 16, 32 Tage).
      Falsche Vokabeln kommen sofort wieder dran – auch noch in derselben Runde.</p>
    </section>
  `;

  root.onchange = (event) => {
    const t = event.target;
    if (t.dataset.list) t.checked ? c.listIds.add(t.dataset.list) : c.listIds.delete(t.dataset.list);
    if (t.dataset.lesson) t.checked ? c.lessonOff.delete(t.dataset.lesson) : c.lessonOff.add(t.dataset.lesson);
    if (t.name === 'dir') c.dirChoice = t.value;
    if (t.name === 'mode') {
      db.settings.mode = t.value;
      save();
    }
    if (t.name === 'timerOn') {
      db.settings.timerOn = t.checked;
      save();
    }
    renderPracticeSetup(root, subjectId);
  };

  onAction(root, {
    lessonsAll: (el) => {
      for (const lesson of lessonsOf(el.dataset.listId)) c.lessonOff.delete(lessonKey(el.dataset.listId, lesson));
      renderPracticeSetup(root, subjectId);
    },
    lessonsNone: (el) => {
      for (const lesson of lessonsOf(el.dataset.listId)) c.lessonOff.add(lessonKey(el.dataset.listId, lesson));
      renderPracticeSetup(root, subjectId);
    },
    timerMinus: () => {
      db.settings.timerMinutes = Math.max(MIN_TIMER, db.settings.timerMinutes - 5);
      save();
      renderPracticeSetup(root, subjectId);
    },
    timerPlus: () => {
      db.settings.timerMinutes = Math.min(MAX_TIMER, db.settings.timerMinutes + 5);
      save();
      renderPracticeSetup(root, subjectId);
    },
    start: () => start(subjectId, cards, dirs, false),
    free: () => start(subjectId, cards, dirs, true),
  });
}

/** Lektionen einer Liste zum An- und Abwählen (nur wenn die Liste Lektionen hat). */
function lessonChips(listId, c) {
  const lessons = lessonsOf(listId);
  if (lessons.length === 1 && lessons[0] === '') return '';
  const listCards = cardsOf([listId]);
  return `
    <div class="lessons">
      ${lessons.map((lesson) => {
        const key = lessonKey(listId, lesson);
        const count = listCards.filter((card) => (card.lesson ?? '') === lesson).length;
        return `
          <label class="chip">
            <input type="checkbox" data-lesson="${esc(key)}" ${c.lessonOff.has(key) ? '' : 'checked'}>
            <span>${esc(lesson || 'ohne Lektion')} <small>${count}</small></span>
          </label>`;
      }).join('')}
      <span class="lesson-tools">
        <button class="link small" data-action="lessonsAll" data-list-id="${listId}">alle</button> ·
        <button class="link small" data-action="lessonsNone" data-list-id="${listId}">keine</button>
      </span>
    </div>`;
}

function selectedDirs(subjectId, dirChoice) {
  if (subjectId !== 'english') return ['fwd'];
  return dirChoice === 'both' ? ['fwd', 'rev'] : [dirChoice];
}

function start(subjectId, cards, dirs, fillWithWeak) {
  const candidates = buildSession(cards, dirs, {
    size: db.settings.sessionSize,
    maxNew: db.settings.maxNew,
    fillWithWeak,
  });
  if (!candidates.length) {
    if (confirm('Alles erledigt! 🎉 Gerade ist keine Vokabel fällig.\n\nMöchtest du trotzdem frei trainieren?')) {
      start(subjectId, cards, dirs, true);
    }
    return;
  }
  // Falsche Antwortmöglichkeiten für „Auswählen“
  const pool = cardsOf(listsOf(subjectId).map((l) => l.id));
  const distractors = Object.fromEntries(dirs.map((d) => [d, [...new Set(pool.map((card) => answerOf(card, d)))]]));

  runSession({
    session: createSession(subjectId, candidates),
    mode: db.settings.mode,
    distractors,
    cards,
    dirs,
    startedAt: Date.now(),
    endsAt: db.settings.timerOn ? Date.now() + db.settings.timerMinutes * 60_000 : null,
    thumbs: { up: 0, down: 0 },
  });
}

// ---------- Übungsrunde ----------

function runSession(ctx) {
  const root = openOverlay();
  ctx.ui = {};
  prepare(ctx);
  draw(root, ctx);
  if (ctx.endsAt) ctx.ticker = setInterval(() => updateTimer(root, ctx), 1000);
  const stop = () => {
    clearInterval(ctx.ticker);
    save();
    closeOverlay();
  };

  onAction(root, {
    quit: stop,
    close: stop,
    speak: (el) => speakEnglish(el.dataset.text),
    dontKnow: () => {
      ctx.ui.result = WRONG;
      draw(root, ctx);
    },
    check: () => {
      const input = root.querySelector('#answer');
      if (!input.value.trim()) return input.focus();
      const item = currentItem(ctx.session);
      const c = checkMeanings(input.value, answerOf(item.card, item.dir));
      const named = c.matched.map((i) => c.meanings[i]);
      ctx.ui.input = input.value;
      if (item.moreOf) {
        // Gesucht ist eine Bedeutung, die noch nicht genannt wurde
        const fresh = named.filter((m) => !item.moreOf.includes(m));
        ctx.ui.result = fresh.length ? c.result : WRONG;
        ctx.ui.repeated = !fresh.length && c.result !== WRONG;
      } else {
        ctx.ui.result = c.result;
        ctx.ui.given = named;
        ctx.ui.missing = c.result === WRONG ? [] : c.missing;
      }
      draw(root, ctx);
      root.querySelector('[data-action=next]')?.focus();
    },
    pick: (el) => {
      if (ctx.ui.picked != null) return;
      const item = currentItem(ctx.session);
      ctx.ui.picked = Number(el.dataset.index);
      ctx.ui.result = ctx.ui.choices[ctx.ui.picked] === answerOf(item.card, item.dir) ? CORRECT : WRONG;
      draw(root, ctx);
    },
    editCard: async () => {
      // Lesefehler (z. B. „jam“ statt „iam“) direkt beim Üben korrigieren
      const item = currentItem(ctx.session);
      const list = getList(item.card.listId);
      if (list && (await cardDialog(list, item.card))) draw(root, ctx);
    },
    reveal: () => {
      ctx.ui.revealed = true;
      draw(root, ctx);
    },
    next: () => next(root, ctx, ctx.ui.result !== WRONG, { given: ctx.ui.given, missing: ctx.ui.missing }),
    override: () => next(root, ctx, true),
    knew: () => next(root, ctx, true),
    didntKnow: () => next(root, ctx, false),
  });

  root.onsubmit = (event) => {
    event.preventDefault();
    root.querySelector('[data-action=check]')?.click();
  };
  root.querySelector('#answer')?.focus();
}

function next(root, ctx, correct, details = {}) {
  ctx.thumbs[correct ? 'up' : 'down'] += 1;
  addLog(recordAnswer(ctx.session, correct, Date.now(), details));
  save();
  if (ctx.endsAt) {
    if (Date.now() >= ctx.endsAt) {
      // Zeit um: nach dieser Vokabel ist Schluss
      ctx.timeUp = true;
      ctx.session.queue.splice(ctx.session.index);
      clearInterval(ctx.ticker);
    } else if (!currentItem(ctx.session)) {
      refill(ctx);
    }
  }
  prepare(ctx);
  draw(root, ctx);
  root.querySelector('#answer')?.focus();
}

/** Mit Timer: Gehen die Vokabeln aus, bevor die Zeit um ist, kommen weitere dazu. */
function refill(ctx) {
  const { session } = ctx;
  const seen = new Set(session.queue.map((item) => item.card));
  const recent = new Set(session.queue.slice(-5).map((item) => item.card));
  let more = buildSession(ctx.cards, ctx.dirs, { size: db.settings.sessionSize, maxNew: db.settings.maxNew, fillWithWeak: true });
  // Gerade erst abgefragte Vokabeln nicht sofort wieder (außer es gibt nicht genug andere)
  if (more.filter((c) => !recent.has(c.card)).length >= 3) more = more.filter((c) => !recent.has(c.card));
  // Schon in dieser Runde abgefragt → nur Übung, verändert die Lernkartei nicht nochmal
  session.queue.push(...more.map((c) => ({ card: c.card, dir: c.dir, attempt: seen.has(c.card) ? 1 : 0 })));
}

function remainingText(ctx) {
  const ms = Math.max(0, ctx.endsAt - Date.now());
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Aktualisiert nur die Timer-Anzeige (kein Neuzeichnen, damit Eingaben erhalten bleiben). */
function updateTimer(root, ctx) {
  const el = root.querySelector('#timer');
  const bar = root.querySelector('.session-bar .progress > div');
  if (!el) return;
  if (Date.now() >= ctx.endsAt) {
    el.textContent = '⏱ Zeit um!';
    el.classList.add('done');
    root.querySelector('#time-up-hint')?.removeAttribute('hidden');
  } else {
    el.textContent = `⏱ ${remainingText(ctx)}`;
  }
  if (bar) bar.style.width = `${timerProgress(ctx)}%`;
}

function timerProgress(ctx) {
  return Math.min(100, Math.round(((Date.now() - ctx.startedAt) / (ctx.endsAt - ctx.startedAt)) * 100));
}

function prepare(ctx) {
  ctx.ui = {};
  const item = currentItem(ctx.session);
  if (item && ctx.mode === 'choice') {
    const answer = answerOf(item.card, item.dir);
    const wrong = shuffle((ctx.distractors[item.dir] ?? []).filter((a) => a !== answer)).slice(0, 3);
    ctx.ui.choices = shuffle([...wrong, answer]);
  }
}

function draw(root, ctx) {
  const { session } = ctx;
  const item = currentItem(session);
  if (!item) {
    clearInterval(ctx.ticker);
    root.innerHTML = `<div class="session">${resultScreen({
      correct: session.firstTryCorrect,
      total: session.firstTryTotal,
      missed: session.missed.map((c) => `${c.term} – ${c.translation}`),
      thumbs: ctx.thumbs,
      timeUp: ctx.timeUp,
      minutes: ctx.timeUp ? db.settings.timerMinutes : Math.max(1, Math.round((Date.now() - ctx.startedAt) / 60_000)),
    })}</div>`;
    return;
  }

  const english = session.subject === 'english';
  const prompt = promptOf(item.card, item.dir);
  const answer = answerOf(item.card, item.dir);
  const progress = ctx.endsAt ? timerProgress(ctx) : Math.round((session.index / session.queue.length) * 100);
  const timeIsUp = ctx.endsAt && Date.now() >= ctx.endsAt;

  root.innerHTML = `
    <div class="session">
      <header class="session-bar">
        <button class="link" data-action="quit">Beenden</button>
        <div class="progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div style="width:${progress}%"></div></div>
        ${ctx.endsAt
          ? `<span id="timer" class="timer ${timeIsUp ? 'done' : ''}">${timeIsUp ? '⏱ Zeit um!' : `⏱ ${remainingText(ctx)}`}</span>`
          : `<span class="muted">${session.queue.length - session.index}</span>`}
      </header>
      ${ctx.endsAt ? `<p id="time-up-hint" class="again" ${timeIsUp ? '' : 'hidden'}>Zeit um – das ist die letzte Vokabel!</p>` : ''}
      <p class="muted center">${dirLabel(session.subject, item.dir)}</p>
      ${item.moreOf ? '<p class="again">↻ Noch eine Bedeutung!</p>' : item.attempt > 0 ? '<p class="again">↻ Noch einmal!</p>' : ''}
      <div class="prompt-card">
        <div class="prompt">${esc(prompt)}</div>
        ${english && item.dir === 'fwd' ? speakButton(prompt) : ''}
        ${item.moreOf ? `<div class="muted">Du kennst schon: <strong>${esc(item.moreOf.join(', '))}</strong><br>Nenne eine weitere Bedeutung!</div>` : ''}
      </div>
      ${modeArea(ctx, item, answer, english)}
    </div>`;
}

function modeArea(ctx, item, answer, english) {
  const { result } = ctx.ui;
  const speakAnswer = english && item.dir === 'rev' ? speakButton(answer) : '';

  if (ctx.mode === 'choice') {
    return `
      <div class="choices">
        ${ctx.ui.choices.map((choice, i) => {
          let cls = '';
          if (ctx.ui.picked != null) {
            if (choice === answer) cls = 'right';
            else if (i === ctx.ui.picked) cls = 'wrong';
            else cls = 'dim';
          }
          return `<button class="btn choice ${cls}" data-action="pick" data-index="${i}">${esc(choice)}</button>`;
        }).join('')}
      </div>
      ${result ? feedback(ctx, item, answer, speakAnswer) + '<button class="btn primary large" data-action="next">Weiter</button>' : ''}`;
  }

  if (ctx.mode === 'flashcard') {
    if (!ctx.ui.revealed) return '<button class="btn primary large" data-action="reveal">Aufdecken</button>';
    return `
      <div class="revealed">${esc(answer)} ${speakAnswer}</div>
      ${grammar(item, ctx.session.subject)}
      <p class="center"><button class="link small" data-action="editCard">✏️ Vokabel korrigieren</button></p>
      <p class="muted center">Wusstest du es?</p>
      <div class="row">
        <button class="btn large bad" data-action="didntKnow">👎 Nein</button>
        <button class="btn large good" data-action="knew">👍 Ja</button>
      </div>`;
  }

  // Eintippen
  return `
    <form class="answer-form" autocomplete="off">
      <input id="answer" class="answer-input" type="text" placeholder="Deine Antwort" value="${esc(ctx.ui.input ?? '')}"
        autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${result ? 'disabled' : ''}>
    </form>
    ${result ? `
      ${feedback(ctx, item, answer, speakAnswer)}
      <div class="row">
        ${result === WRONG ? '<button class="btn large" data-action="override">Ich hatte recht</button>' : ''}
        <button class="btn primary large" data-action="next">Weiter</button>
      </div>` : `
      <div class="row">
        <button class="btn large" data-action="dontKnow">Weiß ich nicht</button>
        <button class="btn primary large" data-action="check">Prüfen</button>
      </div>`}`;
}

function feedback(ctx, item, answer, speakAnswer) {
  const { result, missing = [], repeated } = ctx.ui;
  const title = {
    correct: '<div class="thumb">👍</div><h2 class="good-text">Richtig!</h2>',
    almost: '<div class="thumb">👍</div><h2 class="good-text">Fast richtig – kleiner Tippfehler</h2>',
    wrong: '<div class="thumb">👎</div><h2 class="bad-text">Leider falsch</h2>',
  }[result];

  let solution = '';
  if (item.moreOf) {
    solution = `${repeated ? '<p>Die hattest du schon genannt – gesucht war eine andere.</p>' : ''}
      <p>Alle Bedeutungen: <strong>${esc(answer)}</strong></p>`;
  } else if (result === WRONG || result === 'almost') {
    solution = `<p class="big">Lösung: <strong>${esc(answer)}</strong></p>`;
  } else if (missing.length && item.dir === 'fwd') {
    solution = `<p>Weitere Bedeutungen: <strong>${esc(missing.join(', '))}</strong><br>
      <span class="muted small">Die fragen wir gleich nochmal ab.</span></p>`;
  } else if (missing.length) {
    solution = `<p>Vollständig: <strong>${esc(answer)}</strong></p>`;
  }

  return `
    <div class="feedback ${result === WRONG ? 'bad' : 'good'}">
      ${title}
      ${solution}
      ${grammar(item, ctx.session.subject)}
      ${speakAnswer}
      <p><button class="link small" data-action="editCard">✏️ Vokabel korrigieren</button></p>
    </div>`;
}

/** Grammatik/Notiz wird erst nach der Antwort aufgedeckt. */
function grammar(item, subject) {
  const note = item.card.note;
  if (!note) return '';
  const label = subject === 'latin' ? 'Grammatik' : 'Notiz';
  return `<p class="grammar">${label}: <strong>${esc(note)}</strong></p>`;
}
