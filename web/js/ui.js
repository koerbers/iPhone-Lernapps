// Kleine Hilfsfunktionen für die Oberfläche.
import { MAX_BOX } from './srs.js';

/** Schützt Text vor HTML-Einschleusung (immer verwenden, wenn Text ins HTML kommt). */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Klick-Handler für alle Elemente mit data-action="name" innerhalb von root. */
export function onAction(root, handlers) {
  root.onclick = (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action];
    if (handler) {
      event.preventDefault();
      handler(el, event);
    }
  };
}

/** Zeigt, in welchem Fach der Lernkartei die Vokabel liegt. */
export function boxIndicator(box) {
  let cells = '';
  for (let i = 1; i <= MAX_BOX; i++) {
    cells += `<i class="${i <= box ? `on b${Math.min(box, 5)}` : ''}"></i>`;
  }
  const label = box === 0 ? 'neu' : `Fach ${box} von ${MAX_BOX}`;
  return `<span class="boxes" role="img" aria-label="${label}" title="${label}">${cells}</span>`;
}

export function percent(value) {
  return value == null ? '–' : `${Math.round(value * 100)} %`;
}

/** Liest englischen Text vor. */
export function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

export function speakButton(text) {
  if (!('speechSynthesis' in window)) return '';
  return `<button class="icon-btn" data-action="speak" data-text="${esc(text)}" aria-label="Vorlesen">🔊</button>`;
}

// ---------- Vollbild-Ebene für Übungsrunden ----------

const overlay = () => document.getElementById('overlay');

export function openOverlay() {
  overlay().hidden = false;
  document.body.classList.add('overlay-open');
  return overlay();
}

export function closeOverlay() {
  const el = overlay();
  el.hidden = true;
  el.innerHTML = '';
  el.onclick = null;
  document.body.classList.remove('overlay-open');
  window.dispatchEvent(new Event('hashchange')); // aktuelle Seite neu zeichnen
}

/** Kleines Dialogfenster mit Formular. Gibt die Formularwerte zurück oder null. */
export function formDialog(title, fieldsHtml, submitLabel = 'Sichern') {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `
      <form method="dialog" class="dialog-form">
        <h2>${esc(title)}</h2>
        ${fieldsHtml}
        <div class="row end">
          <button type="button" class="btn" value="cancel">Abbrechen</button>
          <button type="submit" class="btn primary" value="ok">${esc(submitLabel)}</button>
        </div>
      </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    dialog.querySelector('[value=cancel]').onclick = () => dialog.close('cancel');
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok';
      const values = Object.fromEntries(new FormData(form));
      dialog.remove();
      resolve(ok ? values : null);
    });
    dialog.showModal();
    dialog.querySelector('input, select, textarea')?.focus();
  });
}

export function resultScreen({ correct, total, missed }) {
  const ratio = total ? correct / total : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
  const message = ['Nicht aufgeben – die schweren Wörter kommen bald wieder.', 'Weiter so – Übung macht den Meister!', 'Gut gemacht!', 'Super gemacht!'][stars];
  return `
    <div class="result">
      <div class="stars" aria-label="${stars} von 3 Sternen">${'★'.repeat(stars)}<span class="dim">${'★'.repeat(3 - stars)}</span></div>
      <h2>${message}</h2>
      <p class="muted big">${correct} von ${total} beim ersten Versuch richtig</p>
      ${missed.length ? `
        <div class="card warn">
          <h3>Diese üben wir bald nochmal:</h3>
          <ul class="plain">${missed.map((m) => `<li>↻ ${esc(m)}</li>`).join('')}</ul>
        </div>` : ''}
      <button class="btn primary large" data-action="close">Fertig</button>
    </div>`;
}
