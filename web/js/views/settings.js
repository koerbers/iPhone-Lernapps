// Einstellungen: Profil des Kindes, Kinder verwalten, Übungseinstellungen, KI-Schlüssel, Sicherung.
import { isConfigured, makeSentences } from '../ai.js';
import { levelOf } from '../level.js';
import {
  activeProfile, avatarHtml, db, deleteProfile, exportBackup, getClaudeKey, importBackup, insertSampleData, profiles,
  resetProgress, save, setClaudeKey, switchProfile,
} from '../store.js';
import { changeParentCode, hasParentCode, removeParentCode, requireParent, setupParentCode } from '../parent.js';
import { esc, onAction } from '../ui.js';
import { levelSummary, profileDialog } from './profiles.js';

export function renderSettings(root) {
  const s = db.settings;
  const profile = activeProfile();
  const level = levelOf(profile);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  root.innerHTML = `
    <h1>Einstellungen</h1>

    ${standalone ? '' : `
      <section class="card info">
        <h3>📲 Als App auf den Home-Bildschirm</h3>
        <p>In Safari unten auf <strong>Teilen</strong> (□↑) tippen und <strong>„Zum Home-Bildschirm“</strong> wählen.
        Dann startet der Vokabeltrainer wie eine echte App – auch ohne Internet.</p>
      </section>`}

    <section class="card">
      <div class="row between">
        <h3>${avatarHtml(profile)} ${esc(profile.name)}</h3>
        <button class="btn" data-action="editProfile">✏️ Bearbeiten</button>
      </div>
      <p>${profile.age ? `${profile.age} Jahre` : 'Alter nicht angegeben'} · Schwierigkeit: <strong>${esc(levelSummary(profile))}</strong></p>
      <p class="hint">${esc(level.description)}</p>
    </section>

    <section class="card">
      <h3>Üben (für ${esc(profile.name)})</h3>
      <label class="field">Abfragen pro Runde
        <select name="sessionSize">${[10, 15, 20, 25, 30, 40, 50].map((n) => `<option ${s.sessionSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label class="field">Neue Vokabeln pro Runde
        <select name="maxNew">${[0, 5, 10, 15, 20, 30].map((n) => `<option ${s.maxNew === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="hint">Fällige Vokabeln haben immer Vorrang. Neue kommen nur dazu, wenn noch Platz in der Runde ist.
      Für die Stufe „${level.label}“ empfohlen: ${level.sessionSize} Abfragen, ${level.maxNew} neue.
      ${s.sessionSize !== level.sessionSize || s.maxNew !== level.maxNew ? '<button class="link small" data-action="applyLevelDefaults">Übernehmen</button>' : ''}</p>
    </section>

    <section class="card">
      <h3>👨‍👩‍👧 Kinder</h3>
      <div class="list-group flat">
        ${profiles.list.map((p) => `
          <div class="list-row">
            ${avatarHtml(p)}
            <div class="grow">
              <strong>${esc(p.name)}</strong>${p.id === profile.id ? ' <span class="muted small">(aktiv)</span>' : ''}
              <div class="muted small">${p.age ? `${p.age} Jahre · ` : ''}${levelOf(p).label}</div>
            </div>
            ${p.id === profile.id ? '' : `<button class="btn" data-action="switch" data-id="${p.id}">Wechseln</button>`}
            ${profiles.list.length > 1 ? `<button class="icon-btn" data-action="deleteProfile" data-id="${p.id}" aria-label="${esc(p.name)} löschen">🗑</button>` : ''}
          </div>`).join('')}
      </div>
      <a class="btn" href="#/kinder">＋ Kind hinzufügen</a>
      <p class="hint">Jedes Kind hat eigene Listen, eigenen Lernstand, eigene Statistik und eigene Einstellungen.
      Listen lassen sich in der Vokabelliste für ein anderes Kind kopieren.</p>
    </section>

    <section class="card">
      <h3>🔒 Eltern-Code</h3>
      <p class="hint">Lernstand und Statistik zurücksetzen, Listen, Vokabeln oder Kinder löschen und eine Sicherung laden
      geht nur mit dem Eltern-Code. Nach richtiger Eingabe wird 5 Minuten lang nicht erneut gefragt.</p>
      <div class="row wrap">
        ${hasParentCode()
          ? '<button class="btn" data-action="changeCode">Code ändern</button><button class="btn" data-action="removeCode">Code entfernen</button>'
          : '<button class="btn primary" data-action="setCode">Code festlegen</button>'}
      </div>
      <p class="small">${hasParentCode() ? '✅ Eltern-Code ist eingerichtet' : 'Noch kein Code – er wird spätestens beim ersten Löschen festgelegt.'}</p>
    </section>

    <section class="card">
      <h3>🤖 Künstliche Intelligenz (Claude) – für alle Kinder</h3>
      <p class="hint">Die KI liest Vokabeln aus Fotos/PDFs (auch Handschrift) und bildet Übungssätze passend zum Alter.
      Dafür braucht es einen API-Schlüssel von
      <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (Abrechnung pro Nutzung: eine Satzrunde kostet weniger als 0,1 Cent, eine Handschrift-Seite ca. 1–2 Cent –
      am besten ein Ausgabenlimit setzen). Der Schlüssel bleibt nur auf diesem Gerät.</p>
      <label class="field">API-Schlüssel
        <input name="claudeKey" type="password" autocomplete="off" value="${esc(getClaudeKey())}" placeholder="sk-ant-…">
      </label>
      <div class="row">
        <button class="btn" data-action="saveKey">Speichern</button>
        <button class="btn" data-action="testAI">KI testen</button>
      </div>
      <p class="small" id="ai-status">${isConfigured() ? '✅ Schlüssel eingetragen' : 'Kein Schlüssel eingetragen – Vokabeln üben und Import per Texterkennung funktionieren trotzdem.'}</p>
    </section>

    <section class="card">
      <h3>💾 Sicherung</h3>
      <p class="hint">Alle Daten liegen nur in diesem Browser. Mach ab und zu eine Sicherung (alle Kinder in einer Datei) –
      damit kannst du die Vokabeln auch auf ein anderes Gerät (z. B. iPad oder PC) übertragen.</p>
      <div class="row wrap">
        <button class="btn" data-action="export">Sicherung speichern</button>
        <label class="btn file-btn">Sicherung laden<input type="file" name="backup" accept="application/json,.json"></label>
      </div>
      <p class="muted small">${esc(profile.name)}: ${db.cards.length} Vokabeln · ${db.logs.length} Abfragen gespeichert</p>
    </section>

    <section class="card">
      <div class="row wrap">
        <button class="btn" data-action="sample">Beispielvokabeln hinzufügen</button>
        <button class="btn bad" data-action="reset">Lernstand von ${esc(profile.name)} zurücksetzen</button>
      </div>
    </section>
  `;

  root.onchange = async (event) => {
    const t = event.target;
    if (t.name === 'sessionSize' || t.name === 'maxNew') s[t.name] = Number(t.value);
    if (t.name === 'backup' && t.files[0]) {
      if (!(await requireParent('Eine Sicherung laden (ersetzt Lernstand und Statistik)'))) {
        t.value = '';
        return;
      }
      try {
        const reload = importBackup(await t.files[0].text());
        alert('Sicherung geladen ✅');
        if (reload) {
          location.hash = '#/lernen';
          location.reload();
          return;
        }
      } catch (e) {
        alert('Das hat nicht geklappt: ' + e.message);
      }
      renderSettings(root);
    }
    save();
  };

  const status = (text) => (root.querySelector('#ai-status').textContent = text);
  const saveKey = () => setClaudeKey(root.querySelector('[name=claudeKey]').value.trim());

  onAction(root, {
    editProfile: async () => {
      if (await profileDialog(profile)) renderSettings(root);
    },
    applyLevelDefaults: () => {
      s.sessionSize = level.sessionSize;
      s.maxNew = level.maxNew;
      save();
      renderSettings(root);
    },
    switch: (el) => switchProfile(el.dataset.id),
    deleteProfile: async (el) => {
      const p = profiles.list.find((x) => x.id === el.dataset.id);
      if (!(await requireParent(`${p.name} löschen`))) return;
      if (!confirm(`${p.name} mit allen Vokabeln, Lernstand und Statistik löschen? Das lässt sich nicht rückgängig machen.`)) return;
      const wasActive = p.id === profile.id;
      deleteProfile(p.id);
      if (wasActive) {
        // Nicht switchProfile(): das würde vorher die Daten des gelöschten Kindes speichern
        location.hash = '#/lernen';
        location.reload();
      } else {
        renderSettings(root);
      }
    },
    saveKey: () => {
      saveKey();
      status(getClaudeKey() ? '✅ Schlüssel gespeichert' : 'Schlüssel entfernt');
    },
    testAI: async () => {
      saveKey();
      status('⏳ Teste …');
      try {
        const [sentence] = await makeSentences([{ term: 'dog', translation: 'Hund' }], 'english', 'fwd', 1);
        status(`✅ Claude funktioniert: „${sentence?.prompt ?? ''}“`);
      } catch (e) {
        status(`❌ ${e.message}`);
      }
    },
    export: async () => {
      try {
        await exportBackup();
      } catch (e) {
        alert('Sicherung fehlgeschlagen: ' + e.message);
      }
    },
    sample: () => {
      insertSampleData();
      renderSettings(root);
    },
    setCode: async () => {
      if (await setupParentCode()) renderSettings(root);
    },
    changeCode: async () => {
      if (await changeParentCode()) alert('Neuer Eltern-Code gespeichert ✅');
    },
    removeCode: async () => {
      if (await removeParentCode()) renderSettings(root);
    },
    reset: async () => {
      if (!(await requireParent(`Lernstand und Statistik von ${profile.name} zurücksetzen`))) return;
      if (confirm(`Lernstand von ${profile.name} zurücksetzen? Die Vokabeln bleiben erhalten, aber alle gelten wieder als neu und die Statistik wird gelöscht.`)) {
        resetProgress(db.cards);
        db.logs = [];
        save();
        renderSettings(root);
      }
    },
  });
}
