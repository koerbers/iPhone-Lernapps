// Vokabeln üben: Auswahl der Listen/Richtung/Abfrageart und die Übungsrunde selbst.
import { CORRECT, WRONG, checkMeanings } from '../answer.js';
import { createSession, currentItem, recordAnswer } from '../session.js';
import { buildSession, dueCount, shuffle } from '../srs.js';
import { addLog, cardsOf, db, listsOf, save } from '../store.js';
import { SUBJECTS, answerOf, dirLabel, promptOf } from '../subjects.js';
import { closeOverlay, esc, onAction, openOverlay, resultScreen, speakButton, speakEnglish } from '../ui.js';

const MODES = {
  typing: '⌨️ Eintippen',
  choice: '🔘 Auswählen',
  flashcard: '🃏 Karteikarte',
};

// Auswahl pro Fach merken, solange die App offen ist
const choices = {};

export function renderPracticeSetup(root, subjectId) {
  const subject = SUBJECTS[subjectId];
  if (!subject) return (location.hash = '#/lernen');
  const lists = listsOf(subjectId);
  const c = (choices[subjectId] ??= { listIds: new Set(lists.map((l) => l.id)), dirChoice: 'both' });
  // neu angelegte Listen automatisch auswählen
  for (const l of lists) if (!c.known?.has(l.id)) c.listIds.add(l.id);
  c.known = new Set(lists.map((l) => l.id));

  const dirs = selectedDirs(subjectId, c.dirChoice);
  const cards = cardsOf([...c.listIds]);
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
        </label>`).join('')}
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
    if (t.name === 'dir') c.dirChoice = t.value;
    if (t.name === 'mode') {
      db.settings.mode = t.value;
      save();
    }
    renderPracticeSetup(root, subjectId);
  };

  onAction(root, {
    start: () => start(subjectId, cards, dirs, false),
    free: () => start(subjectId, cards, dirs, true),
  });
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
  });
}

// ---------- Übungsrunde ----------

function runSession(ctx) {
  const root = openOverlay();
  ctx.ui = {};
  prepare(ctx);
  draw(root, ctx);

  onAction(root, {
    quit: () => {
      save();
      closeOverlay();
    },
    close: () => closeOverlay(),
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
  addLog(recordAnswer(ctx.session, correct, Date.now(), details));
  save();
  prepare(ctx);
  draw(root, ctx);
  root.querySelector('#answer')?.focus();
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
    root.innerHTML = `<div class="session">${resultScreen({
      correct: session.firstTryCorrect,
      total: session.firstTryTotal,
      missed: session.missed.map((c) => `${c.term} – ${c.translation}`),
    })}</div>`;
    return;
  }

  const english = session.subject === 'english';
  const prompt = promptOf(item.card, item.dir);
  const answer = answerOf(item.card, item.dir);
  const progress = Math.round((session.index / session.queue.length) * 100);

  root.innerHTML = `
    <div class="session">
      <header class="session-bar">
        <button class="link" data-action="quit">Beenden</button>
        <div class="progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div style="width:${progress}%"></div></div>
        <span class="muted">${session.queue.length - session.index}</span>
      </header>
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
      <p class="muted center">Wusstest du es?</p>
      <div class="row">
        <button class="btn large bad" data-action="didntKnow">✗ Nein</button>
        <button class="btn large good" data-action="knew">✓ Ja</button>
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
    correct: '<h2 class="good-text">Richtig! 🎉</h2>',
    almost: '<h2 class="good-text">Fast richtig – kleiner Tippfehler 👍</h2>',
    wrong: '<h2 class="bad-text">Leider falsch</h2>',
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
    </div>`;
}

/** Grammatik/Notiz wird erst nach der Antwort aufgedeckt. */
function grammar(item, subject) {
  const note = item.card.note;
  if (!note) return '';
  const label = subject === 'latin' ? 'Grammatik' : 'Notiz';
  return `<p class="grammar">${label}: <strong>${esc(note)}</strong></p>`;
}
