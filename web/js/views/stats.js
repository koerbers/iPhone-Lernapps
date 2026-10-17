// Erfolgskontrolle: Wie viel wurde geübt, wie gut sitzen die Vokabeln, welche sind schwierig?
import { MASTERED_BOX, MAX_BOX, stateOf, totalWrong, weakestBox } from '../srs.js';
import { accuracy, daily, logsToday, streak } from '../stats.js';
import { cardsOfSubject, db } from '../store.js';
import { SUBJECTS, SUBJECT_IDS } from '../subjects.js';
import { boxIndicator, esc, onAction, percent } from '../ui.js';

let filter = 'all';

export function renderStats(root) {
  const subjects = filter === 'all' ? SUBJECT_IDS : [filter];
  const logs = db.logs.filter((l) => subjects.includes(l.subject));
  const cards = subjects.flatMap((s) => cardsOfSubject(s).map((card) => ({ card, dirs: SUBJECTS[s].dirs })));

  const weekAgo = Date.now() - 7 * 86_400_000;
  const lastWeek = logs.filter((l) => l.date >= weekAgo && l.kind === 'vocab');
  const mastered = cards.filter(({ card, dirs }) => weakestBox(card, dirs) >= MASTERED_BOX).length;
  const sentences = logs.filter((l) => l.kind === 'sentence');

  root.innerHTML = `
    <h1>Erfolge</h1>
    <div class="segmented">
      ${[['all', 'Alle'], ...SUBJECT_IDS.map((s) => [s, SUBJECTS[s].name])].map(([v, label]) => `
        <label><input type="radio" name="filter" value="${v}" ${filter === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}
    </div>

    <div class="tiles">
      ${tile('Serie', `${streak(logs)} 🔥`, 'Tage in Folge geübt')}
      ${tile('Heute', logsToday(logs).length, 'Abfragen')}
      ${tile('Trefferquote', percent(accuracy(lastWeek)), 'letzte 7 Tage')}
      ${tile('Sitzen', `${mastered} / ${cards.length}`, `Vokabeln ab Fach ${MASTERED_BOX}`)}
    </div>

    <section class="card">
      <h3>Geübt in den letzten 14 Tagen</h3>
      ${activityChart(daily(logs, 14))}
    </section>

    <section class="card">
      <h3>Lernkartei – wie gut sitzen die Vokabeln?</h3>
      ${boxChart(cards)}
      <p class="hint">Fach 1 = gerade falsch oder frisch gelernt, Fach 6 = sitzt richtig gut.</p>
    </section>

    ${sentences.length ? `
      <section class="card">
        <h3>Satzübersetzungen</h3>
        <div class="tiles">
          ${tile('Übersetzt', sentences.length, 'Sätze')}
          ${tile('Richtig', percent(accuracy(sentences)), 'aller Sätze')}
        </div>
      </section>` : ''}

    ${troubleWords(cards)}
  `;

  root.onchange = (event) => {
    if (event.target.name === 'filter') {
      filter = event.target.value;
      renderStats(root);
    }
  };

  // Antippen eines Balkens zeigt die genauen Zahlen
  onAction(root, {
    bar: (el) => {
      const caption = el.closest('.chart').querySelector('.chart-caption');
      caption.textContent = el.dataset.info;
      el.closest('svg').querySelectorAll('.bar-hit').forEach((b) => b.classList.toggle('active', b === el));
    },
  });
}

function tile(title, value, subtitle) {
  return `
    <div class="tile">
      <small class="muted">${title}</small>
      <strong>${value}</strong>
      <small class="muted">${subtitle}</small>
    </div>`;
}

// ---------- Diagramme (SVG, ohne Bibliothek) ----------

function activityChart(days) {
  const W = 340;
  const H = 150;
  const top = 12;
  const bottom = 22;
  const plotH = H - top - bottom;
  const max = Math.max(5, ...days.map((d) => d.correct + d.wrong));
  const slot = W / days.length;
  const barW = Math.min(16, slot * 0.6);
  const y = (v) => (v / max) * plotH;

  const bars = days.map((d, i) => {
    const x = i * slot + (slot - barW) / 2;
    const date = new Date(d.day).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    const hC = y(d.correct);
    const hW = y(d.wrong);
    const gap = hC && hW ? 2 : 0; // 2px Abstand zwischen den Teilen
    const base = top + plotH;
    const info = `${date}: ${d.correct} richtig, ${d.wrong} falsch`;
    return `
      <g>
        ${hC ? `<rect class="seg-good" x="${x}" y="${base - hC}" width="${barW}" height="${hC}" rx="2"/>` : ''}
        ${hW ? `<rect class="seg-bad" x="${x}" y="${base - hC - gap - hW}" width="${barW}" height="${hW}" rx="2"/>` : ''}
        ${i % 2 === days.length % 2 ? '' : `<text class="axis" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${date}</text>`}
        <rect class="bar-hit" data-action="bar" data-info="${info}" x="${i * slot}" y="0" width="${slot}" height="${H}"><title>${info}</title></rect>
      </g>`;
  }).join('');

  return `
    <div class="chart">
      <div class="legend"><span><i class="dot good"></i>Richtig</span><span><i class="dot bad"></i>Falsch</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Richtige und falsche Antworten pro Tag">
        <line class="grid" x1="0" x2="${W}" y1="${top}" y2="${top}"/>
        <text class="axis" x="${W}" y="${top - 2}" text-anchor="end">${max}</text>
        <line class="baseline" x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}"/>
        ${bars}
      </svg>
      <p class="chart-caption muted small">Tippe auf einen Tag für die genauen Zahlen.</p>
    </div>`;
}

function boxChart(cards) {
  const counts = new Array(MAX_BOX + 1).fill(0);
  for (const { card, dirs } of cards) {
    for (const d of dirs) counts[Math.min(stateOf(card, d).box, MAX_BOX)] += 1;
  }
  const W = 340;
  const H = 140;
  const top = 16;
  const bottom = 20;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...counts);
  const slot = W / counts.length;
  const barW = Math.min(28, slot * 0.6);

  const bars = counts.map((n, box) => {
    const h = (n / max) * plotH;
    const x = box * slot + (slot - barW) / 2;
    const label = box === 0 ? 'neu' : `Fach ${box}`;
    const info = `${label}: ${n} Karten`;
    return `
      <g>
        ${h ? `<rect class="seg-main" x="${x}" y="${top + plotH - h}" width="${barW}" height="${h}" rx="3"/>` : ''}
        ${n ? `<text class="value" x="${x + barW / 2}" y="${top + plotH - h - 4}" text-anchor="middle">${n}</text>` : ''}
        <text class="axis" x="${x + barW / 2}" y="${H - 5}" text-anchor="middle">${box === 0 ? 'neu' : box}</text>
        <rect class="bar-hit" data-action="bar" data-info="${info}" x="${box * slot}" y="0" width="${slot}" height="${H}"><title>${info}</title></rect>
      </g>`;
  }).join('');

  return `
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Anzahl Karten pro Fach der Lernkartei">
        <line class="baseline" x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}"/>
        ${bars}
      </svg>
      <p class="chart-caption muted small"></p>
    </div>`;
}

function troubleWords(cards) {
  const trouble = cards
    .map(({ card, dirs }) => ({ card, wrong: totalWrong(card, dirs), box: weakestBox(card, dirs) }))
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.box - b.box)
    .slice(0, 10);
  if (!trouble.length) return '';
  return `
    <section class="card">
      <h3>Sorgenkinder – diese Vokabeln waren oft falsch</h3>
      <div class="list-group flat">
        ${trouble.map(({ card, wrong, box }) => `
          <div class="list-row">
            <div class="grow">
              <strong>${esc(card.term)}</strong>
              <div class="muted small">${esc(card.translation)}</div>
            </div>
            <span class="bad-text small"><strong>${wrong}× falsch</strong></span>
            ${boxIndicator(box)}
          </div>`).join('')}
      </div>
    </section>`;
}
