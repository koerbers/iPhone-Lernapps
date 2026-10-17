// Einstellungen: Name, Rundengröße, KI-Schlüssel, Sicherung.
import { isConfigured, makeSentences } from '../ai.js';
import { db, exportBackup, importBackup, insertSampleData, resetProgress, save } from '../store.js';
import { esc, onAction } from '../ui.js';

export function renderSettings(root) {
  const s = db.settings;
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
      <label class="field">Vorname <input name="name" value="${esc(s.name)}" placeholder="Wer lernt?"></label>
      <label class="field">Abfragen pro Runde
        <select name="sessionSize">${[10, 15, 20, 25, 30, 40, 50].map((n) => `<option ${s.sessionSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label class="field">Neue Vokabeln pro Runde
        <select name="maxNew">${[0, 5, 10, 15, 20, 30].map((n) => `<option ${s.maxNew === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="hint">Fällige Vokabeln haben immer Vorrang. Neue kommen nur dazu, wenn noch Platz in der Runde ist.</p>
    </section>

    <section class="card">
      <h3>🤖 Künstliche Intelligenz (Claude)</h3>
      <p class="hint">Die KI liest Vokabeln aus Fotos/PDFs und bildet Übungssätze. Dafür braucht es einen API-Schlüssel von
      <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (Abrechnung pro Nutzung, wenige Cent pro Runde –
      am besten ein Ausgabenlimit setzen). Der Schlüssel bleibt nur auf diesem Gerät.</p>
      <label class="field">API-Schlüssel
        <input name="claudeKey" type="password" autocomplete="off" value="${esc(s.claudeKey)}" placeholder="sk-ant-…">
      </label>
      <div class="row">
        <button class="btn" data-action="saveKey">Speichern</button>
        <button class="btn" data-action="testAI">KI testen</button>
      </div>
      <p class="small" id="ai-status">${isConfigured() ? '✅ Schlüssel eingetragen' : 'Kein Schlüssel eingetragen – Vokabeln üben und Import per Texterkennung funktionieren trotzdem.'}</p>
    </section>

    <section class="card">
      <h3>💾 Sicherung</h3>
      <p class="hint">Alle Daten liegen nur in diesem Browser. Mach ab und zu eine Sicherung – damit kannst du die Vokabeln
      auch auf ein anderes Gerät (z. B. iPad oder PC) übertragen.</p>
      <div class="row wrap">
        <button class="btn" data-action="export">Sicherung speichern</button>
        <label class="btn file-btn">Sicherung laden<input type="file" name="backup" accept="application/json,.json"></label>
      </div>
      <p class="muted small">${db.cards.length} Vokabeln · ${db.logs.length} Abfragen gespeichert</p>
    </section>

    <section class="card">
      <div class="row wrap">
        <button class="btn" data-action="sample">Beispielvokabeln hinzufügen</button>
        <button class="btn bad" data-action="reset">Gesamten Lernstand zurücksetzen</button>
      </div>
    </section>
  `;

  root.onchange = async (event) => {
    const t = event.target;
    if (t.name === 'name') s.name = t.value.trim();
    if (t.name === 'sessionSize' || t.name === 'maxNew') s[t.name] = Number(t.value);
    if (t.name === 'backup' && t.files[0]) {
      try {
        importBackup(await t.files[0].text());
        alert('Sicherung geladen ✅');
      } catch (e) {
        alert('Das hat nicht geklappt: ' + e.message);
      }
      renderSettings(root);
    }
    save();
  };

  const status = (text) => (root.querySelector('#ai-status').textContent = text);
  const saveKey = () => {
    s.claudeKey = root.querySelector('[name=claudeKey]').value.trim();
    save();
  };

  onAction(root, {
    saveKey: () => {
      saveKey();
      status(s.claudeKey ? '✅ Schlüssel gespeichert' : 'Schlüssel entfernt');
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
    export: () => exportBackup(),
    sample: () => {
      insertSampleData();
      renderSettings(root);
    },
    reset: () => {
      if (confirm('Wirklich alles zurücksetzen? Die Vokabeln bleiben erhalten, aber alle gelten wieder als neu und die Statistik wird gelöscht.')) {
        resetProgress(db.cards);
        db.logs = [];
        save();
        renderSettings(root);
      }
    },
  });
}
