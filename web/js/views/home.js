// Startseite „Lernen“: Überblick pro Fach.
import { MASTERED_BOX, dueCount, weakestBox } from '../srs.js';
import { logsToday, streak } from '../stats.js';
import { activeProfile, cardsOfSubject, currentLevel, db, insertSampleData, listsOf, profiles } from '../store.js';
import { SUBJECTS, SUBJECT_IDS } from '../subjects.js';
import { esc, onAction } from '../ui.js';

export function renderHome(root) {
  const profile = activeProfile();
  const name = profile.name;
  const today = logsToday(db.logs);
  const todayText = today.length
    ? `Heute schon ${today.length} Abfragen, ${today.filter((l) => l.correct).length} richtig 💪`
    : 'Heute noch nichts geübt – los geht’s!';

  root.innerHTML = `
    <div class="row between">
      <h1>Lernen</h1>
      <a class="profile-chip" href="#/kinder" aria-label="Kind wechseln">
        <span class="avatar">${profile.avatar}</span>
        <span>${esc(name)}${profiles.list.length > 1 ? ' ⇄' : ''}</span>
      </a>
    </div>
    <section class="card hello">
      <div>
        <h2>Hallo ${esc(name)}!</h2>
        <p class="muted">${todayText}</p>
      </div>
      <div class="streak"><span>🔥</span><strong>${streak(db.logs)}</strong><small>Tage</small></div>
    </section>
    ${profile.age ? '' : `
      <section class="card info">
        Wie alt ist ${esc(name)}? Dann passt die App die Schwierigkeit an
        (jetzt: <strong>${currentLevel().label}</strong>). → <a href="#/einstellungen">Profil einrichten</a>
      </section>`}
    ${db.lists.length ? SUBJECT_IDS.map(subjectCard).join('') : emptyState()}
  `;

  onAction(root, {
    sample: () => {
      insertSampleData();
      renderHome(root);
    },
  });
}

function subjectCard(subjectId) {
  if (!listsOf(subjectId).length) return '';
  const subject = SUBJECTS[subjectId];
  const cards = cardsOfSubject(subjectId);
  const counts = dueCount(cards, subject.dirs);
  const mastered = cards.filter((c) => weakestBox(c, subject.dirs) >= MASTERED_BOX).length;

  return `
    <section class="card">
      <div class="row between">
        <h2>${subject.flag} ${subject.name}</h2>
        <span class="muted">${cards.length} Vokabeln</span>
      </div>
      <div class="badges">
        <div class="badge orange"><strong>${counts.due}</strong><small>fällig</small></div>
        <div class="badge blue"><strong>${counts.new}</strong><small>neu</small></div>
        <div class="badge green"><strong>${mastered}</strong><small>sitzen</small></div>
      </div>
      <a class="btn primary large" href="#/ueben/${subjectId}">📚 Vokabeln üben</a>
      <a class="btn large" href="#/saetze/${subjectId}">💬 Sätze übersetzen</a>
    </section>`;
}

function emptyState() {
  return `
    <section class="card center">
      <div class="emoji-big">📚</div>
      <h2>Noch keine Vokabeln</h2>
      <p class="muted">Lege im Bereich „Vokabeln“ eine Liste an oder importiere Vokabeln aus einem Foto oder einer PDF.</p>
      <button class="btn primary" data-action="sample">Beispielvokabeln laden</button>
    </section>`;
}
