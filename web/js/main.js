// Einstieg der App: wählt anhand der Adresse (#/…) die passende Seite.
import { justSwitched } from './store.js';
import { renderHome } from './views/home.js';
import { renderImport } from './views/import.js';
import { renderListDetail, renderLists } from './views/lists.js';
import { renderPracticeSetup } from './views/practice.js';
import { renderSentenceSetup } from './views/sentences.js';
import { renderProfiles } from './views/profiles.js';
import { renderSettings } from './views/settings.js';
import { renderStats } from './views/stats.js';

const routes = [
  { pattern: /^#\/ueben\/(\w+)$/, tab: 'lernen', render: renderPracticeSetup },
  { pattern: /^#\/saetze\/(\w+)$/, tab: 'lernen', render: renderSentenceSetup },
  { pattern: /^#\/listen$/, tab: 'listen', render: renderLists },
  { pattern: /^#\/liste\/([\w.-]+)$/, tab: 'listen', render: renderListDetail },
  { pattern: /^#\/import(?:\/([\w.-]+))?$/, tab: 'listen', render: renderImport },
  { pattern: /^#\/erfolge$/, tab: 'erfolge', render: renderStats },
  { pattern: /^#\/einstellungen$/, tab: 'einstellungen', render: renderSettings },
  { pattern: /^#\/kinder$/, tab: 'lernen', render: renderProfiles },
  { pattern: /^.*$/, tab: 'lernen', render: renderHome },
];

function route() {
  if (!document.getElementById('overlay').hidden) return; // während einer Übungsrunde nichts wechseln
  const app = document.getElementById('app');
  const hash = location.hash || '#/lernen';
  const { pattern, tab, render } = routes.find((r) => r.pattern.test(hash));
  const params = hash.match(pattern).slice(1);
  app.onclick = app.onchange = app.oninput = null;
  render(app, ...params);
  for (const link of document.querySelectorAll('.tabbar a')) {
    link.classList.toggle('active', link.dataset.tab === tab);
  }
  window.scrollTo(0, 0);
}

// Mehrere Kinder teilen sich oft ein Gerät: bei jedem Start der App und nach längerer Pause erst fragen, wer lernt.
// Ausnahme: das Neuladen direkt nach dem Wechsel des Kindes (switchProfile setzt dafür einen Merker).
const PAUSE_MS = 15 * 60 * 1000;

function askWhoLearns() {
  if (!document.getElementById('overlay').hidden || location.hash.startsWith('#/import')) return;
  location.hash = '#/kinder';
}

// Beim Start ohne hashchange-Ereignis umleiten (sonst würde die Seite zweimal aufgebaut)
if (!justSwitched() && !location.hash.startsWith('#/import')) history.replaceState(null, '', '#/kinder');

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > PAUSE_MS) askWhoLearns();
});

window.addEventListener('hashchange', route);
route();

// Offline-Unterstützung
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
