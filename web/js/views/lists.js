// Vokabellisten: Übersicht, einzelne Liste, Vokabeln bearbeiten.
import { MASTERED_BOX, stateOf, weakestBox } from '../srs.js';
import {
  addCard, addList, addSentence, cardsOf, cleanLesson, db, deleteCard, deleteList, deleteSentence, getList, lessonsOf,
  activeProfile, copyListToProfile, listsOf, profiles, resetProgress, save, sentencesOf,
} from '../store.js';
import { requireParent } from '../parent.js';
import { SUBJECTS, SUBJECT_IDS, dirLabel } from '../subjects.js';
import { boxIndicator, esc, formDialog, onAction } from '../ui.js';

export function renderLists(root) {
  root.innerHTML = `
    <div class="row between">
      <h1>Vokabeln</h1>
    </div>
    <div class="row">
      <a class="btn primary" href="#/import">📷 Importieren</a>
      <button class="btn" data-action="newList">＋ Neue Liste</button>
    </div>
    ${db.lists.length ? '' : `
      <section class="card center">
        <div class="emoji-big">📚</div>
        <p class="muted">Noch keine Listen. Importiere Vokabeln aus einem Foto oder einer PDF – oder lege eine leere Liste an.</p>
      </section>`}
    ${SUBJECT_IDS.map((sid) => {
      const lists = listsOf(sid).sort((a, b) => b.createdAt - a.createdAt);
      if (!lists.length) return '';
      return `
        <h2 class="section-title">${SUBJECTS[sid].flag} ${SUBJECTS[sid].name}</h2>
        <div class="list-group">${lists.map((l) => listRow(l, sid)).join('')}</div>`;
    }).join('')}
  `;

  onAction(root, {
    newList: async () => {
      const list = await newListDialog();
      if (list) location.hash = `#/liste/${list.id}`;
    },
  });
}

function listRow(list, sid) {
  const cards = cardsOf([list.id]);
  const mastered = cards.filter((c) => weakestBox(c, SUBJECTS[sid].dirs) >= MASTERED_BOX).length;
  const pct = cards.length ? Math.round((mastered / cards.length) * 100) : 0;
  return `
    <a class="list-row" href="#/liste/${list.id}">
      <div class="grow">
        <strong>${esc(list.name)}</strong>
        <div class="row between muted small">
          <span>${cards.length} Vokabeln${sentencesOf([list.id]).length ? ` · ${sentencesOf([list.id]).length} Sätze` : ''}</span>
          <span>${pct} % sitzen</span>
        </div>
        <div class="progress thin"><div style="width:${pct}%"></div></div>
      </div>
      <span class="chevron">›</span>
    </a>`;
}

export async function newListDialog() {
  const values = await formDialog('Neue Liste', `
    <label class="field">Name <input name="name" required placeholder="z. B. Unit 3 oder Lektion 12"></label>
    <label class="field">Fach
      <select name="subject">${SUBJECT_IDS.map((s) => `<option value="${s}">${SUBJECTS[s].flag} ${SUBJECTS[s].name}</option>`).join('')}</select>
    </label>`, 'Anlegen');
  if (!values?.name?.trim()) return null;
  return addList(values.name.trim(), values.subject);
}

// ---------- Eine Liste ----------

export function renderListDetail(root, listId) {
  const list = getList(listId);
  if (!list) return (location.hash = '#/listen');
  const subject = SUBJECTS[list.subject];
  const cards = cardsOf([listId]).sort((a, b) => a.createdAt - b.createdAt);
  const lessons = lessonsOf(listId);
  const hasLessons = !(lessons.length === 1 && lessons[0] === '');
  const row = (c) => `
        <button class="list-row" data-action="edit" data-id="${c.id}" data-search="${esc(`${c.term} ${c.translation}`.toLowerCase())}">
          <div class="grow left">
            <strong>${esc(c.term)}</strong>
            <div class="muted">${esc(c.translation)}</div>
          </div>
          ${boxIndicator(weakestBox(c, subject.dirs))}
        </button>`;
  // Mit Lektionen: eine aufklappbare Gruppe pro Lektion
  const body = !cards.length
    ? '<p class="muted pad">Noch keine Vokabeln.</p>'
    : hasLessons
      ? lessons.map((lesson) => {
          const inLesson = cards.filter((c) => (c.lesson ?? '') === lesson);
          return `
            <details class="lesson-group" open>
              <summary>${esc(lesson || 'ohne Lektion')} <span class="muted">${inLesson.length}</span></summary>
              <div class="list-group">${inLesson.map(row).join('')}</div>
            </details>`;
        }).join('')
      : `<div class="list-group">${cards.map(row).join('')}</div>`;
  const sentences = sentencesOf([listId]).sort((a, b) => a.createdAt - b.createdAt);

  root.innerHTML = `
    <a class="back" href="#/listen">‹ Vokabeln</a>
    <h1>${esc(list.name)}</h1>
    <p class="muted">${subject.flag} ${subject.name} · ${cards.length} Vokabeln</p>
    <div class="row wrap">
      <button class="btn primary" data-action="add">＋ Vokabel</button>
      <a class="btn" href="#/import/${listId}">📷 Importieren</a>
      <button class="btn" data-action="addSentence">＋ Satz</button>
      <button class="btn" data-action="rename">✏️ Umbenennen</button>
      ${profiles.list.length > 1 ? '<button class="btn" data-action="copyToChild">📋 Für anderes Kind</button>' : ''}
    </div>
    <input class="search" type="search" placeholder="Vokabel suchen">
    ${body}
    ${sentences.length ? `
      <details class="lesson-group">
        <summary>📝 Beispielsätze <span class="muted">${sentences.length}</span></summary>
        <div class="list-group">
          ${sentences.map((x) => `
            <button class="list-row" data-action="editSentence" data-id="${x.id}" data-search="${esc(`${x.prompt} ${x.solutions.join(' ')}`.toLowerCase())}">
              <div class="grow left">
                <strong>${esc(x.prompt)}</strong>
                <div class="muted">${esc(x.solutions.join(' / '))}</div>
                ${x.lesson ? `<small class="muted">📑 ${esc(x.lesson)}</small>` : ''}
              </div>
            </button>`).join('')}
        </div>
      </details>` : ''}
    <div class="row wrap danger-zone">
      <button class="btn" data-action="reset">Lernstand zurücksetzen</button>
      <button class="btn bad" data-action="deleteList">Liste löschen</button>
    </div>
  `;

  const searchInput = root.querySelector('.search');
  searchInput.oninput = () => {
    const q = searchInput.value.trim().toLowerCase();
    for (const el of root.querySelectorAll('[data-search]')) el.hidden = !el.dataset.search.includes(q);
    // Beim Suchen alle Lektionen aufklappen
    if (q) for (const group of root.querySelectorAll('.lesson-group')) group.open = true;
  };

  onAction(root, {
    add: async () => {
      if (await cardDialog(list)) renderListDetail(root, listId);
    },
    copyToChild: async () => {
      const others = profiles.list.filter((p) => p.id !== activeProfile().id);
      const values = await formDialog('Liste kopieren', `
        <p>„${esc(list.name)}“ mit allen Vokabeln und Sätzen kopieren für:</p>
        <label class="field">Kind
          <select name="profile">${others.map((p) => `<option value="${esc(p.id)}">${esc(p.avatar)} ${esc(p.name)}</option>`).join('')}</select>
        </label>
        <p class="hint">Das andere Kind startet mit eigenem Lernstand – alle Vokabeln gelten dort als neu.</p>`, 'Kopieren');
      if (!values) return;
      copyListToProfile(list.id, values.profile);
      alert(`Kopiert ✅ – „${list.name}“ ist jetzt auch bei ${others.find((p) => p.id === values.profile).name}.`);
    },
    addSentence: async () => {
      if (await sentenceDialog(list)) renderListDetail(root, listId);
    },
    editSentence: async (el) => {
      if (await sentenceDialog(list, db.sentences.find((x) => x.id === el.dataset.id))) renderListDetail(root, listId);
    },
    edit: async (el) => {
      if (await cardDialog(list, db.cards.find((c) => c.id === el.dataset.id))) renderListDetail(root, listId);
    },
    rename: async () => {
      const v = await formDialog('Liste umbenennen', `<label class="field">Name <input name="name" required value="${esc(list.name)}"></label>`);
      if (v?.name?.trim()) {
        list.name = v.name.trim();
        save();
        renderListDetail(root, listId);
      }
    },
    reset: async () => {
      if (!(await requireParent('Den Lernstand dieser Liste zurücksetzen'))) return;
      if (confirm('Lernstand dieser Liste zurücksetzen? Alle Vokabeln gelten danach wieder als neu.')) {
        resetProgress(cardsOf([listId]));
        renderListDetail(root, listId);
      }
    },
    deleteList: async () => {
      if (!(await requireParent(`Die Liste „${list.name}“ löschen`))) return;
      if (confirm(`Liste „${list.name}“ mit allen Vokabeln löschen?`)) {
        deleteList(listId);
        location.hash = '#/listen';
      }
    },
  });
}

/** Dialog zum Anlegen/Bearbeiten einer Vokabel. Gibt true zurück, wenn sich etwas geändert hat. */
export async function cardDialog(list, card) {
  const subject = SUBJECTS[list.subject];
  const stats = card
    ? `<div class="muted small">${subject.dirs.map((d) => {
        const s = stateOf(card, d);
        return `${dirLabel(list.subject, d)}: Fach ${s.box} · ${s.correct}× richtig · ${s.wrong}× falsch`;
      }).join('<br>')}</div>`
    : '';
  const values = await formDialog(card ? 'Vokabel bearbeiten' : 'Neue Vokabel', `
    <label class="field">${subject.name}
      <input name="term" required autocapitalize="off" autocorrect="off" value="${esc(card?.term)}"
        placeholder="${list.subject === 'latin' ? 'z. B. amicus, -i m.' : 'z. B. to go, went, gone'}">
    </label>
    <label class="field">Deutsch
      <input name="translation" required value="${esc(card?.translation)}" placeholder="z. B. Freund">
      <small class="muted">Mehrere Bedeutungen mit Komma trennen – bei der Abfrage reicht eine davon.</small>
    </label>
    <label class="field">${list.subject === 'latin' ? 'Grammatik / Notiz' : 'Notiz'} (optional) <input name="note" value="${esc(card?.note)}"></label>
    <label class="field">Lektion (optional)
      <input name="lesson" list="lesson-options" value="${esc(card?.lesson)}" placeholder="z. B. Lektion 3">
      <datalist id="lesson-options">${lessonsOf(list.id).filter(Boolean).map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
    </label>
    ${card ? `<label class="check-row"><input type="checkbox" name="delete"> <span>Diese Vokabel löschen</span></label>` : ''}
    ${stats}`);
  if (!values) return false;
  if (card && values.delete) {
    if (!(await requireParent(`Die Vokabel „${card.term}“ löschen`))) return false;
    deleteCard(card.id);
    return true;
  }
  const term = values.term.trim();
  const translation = values.translation.trim();
  if (!term || !translation) return false;
  const lesson = cleanLesson(values.lesson);
  if (card) Object.assign(card, { term, translation, note: values.note.trim(), lesson });
  else addCard(list.id, term, translation, values.note.trim(), lesson);
  save();
  return true;
}

/** Dialog zum Anlegen/Bearbeiten eines Beispielsatzes. */
async function sentenceDialog(list, sentence) {
  const subject = SUBJECTS[list.subject];
  const values = await formDialog(sentence ? 'Satz bearbeiten' : 'Neuer Satz', `
    <label class="field">Satz auf ${subject.name}
      <input name="prompt" required autocapitalize="off" autocorrect="off" value="${esc(sentence?.prompt)}" placeholder="z. B. Ibi Davus est.">
    </label>
    <label class="field">Übersetzung(en)
      <textarea name="solutions" rows="3" required placeholder="z. B. Dort ist Davus.">${esc(sentence?.solutions.join('\n'))}</textarea>
      <small class="muted">Mehrere richtige Übersetzungen: eine pro Zeile.</small>
    </label>
    <label class="field">Lektion (optional)
      <input name="lesson" list="sentence-lessons" value="${esc(sentence?.lesson)}" placeholder="z. B. Lektion 3">
      <datalist id="sentence-lessons">${lessonsOf(list.id).filter(Boolean).map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
    </label>
    ${sentence ? '<label class="check-row"><input type="checkbox" name="delete"> <span>Diesen Satz löschen</span></label>' : ''}`);
  if (!values) return false;
  if (sentence && values.delete) {
    if (!(await requireParent('Den Satz löschen'))) return false;
    deleteSentence(sentence.id);
    return true;
  }
  const prompt = values.prompt.trim();
  const solutions = values.solutions.split('\n').map((x) => x.trim()).filter(Boolean);
  if (!prompt || !solutions.length) return false;
  const lesson = cleanLesson(values.lesson);
  if (sentence) Object.assign(sentence, { prompt, solutions, lesson });
  else addSentence(list.id, prompt, solutions, lesson);
  save();
  return true;
}
